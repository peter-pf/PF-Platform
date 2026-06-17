#!/usr/bin/env python3
"""
Auto Percent-Complete from GUHMA column logs (build-progress.py)
================================================================
For each active in-field PF project, pull its GUHMA .guh logs from SharePoint,
parse per-column installed depth, and compute installed columns + installed
linear feet. Compare against the approved-submittal design baseline
(sync/progress-baselines.json) to produce per-project % complete.

LF % is the headline metric and drives the active->complete flip.

Design source of truth: docs/auto-progress/DESIGN.md (Brad + Jonathan sign-off
2026-06-17). Reuses the Graph auth + drive navigation patterns from sp-sync.py.

Output: platform/data/progress-data.js  (window.PF_PROGRESS = {...})

Field rules (Jonathan):
  - Installed columns = count of UNIQUE column numbers (Info1), not file count.
  - Installed LF = sum of per-column MAX depth in feet (Tiefe m x 3.28084).
  - Redrills COUNT: a re-drilled column adds its footage AGAIN to the LF total.
    (Detected as multiple .guh files for the same column number on the SAME or
     different day. Each distinct LOG of a column contributes its own max depth.)
  - False start (0.0 then full install): counted ONCE at final installed depth.
    A redrill is a real second probe to depth; a false start is an aborted probe
    (negligible depth). We treat a log whose max depth is < FALSE_START_FT as a
    false start and drop it IF the column has another real log; otherwise keep it.
  - Mislabel number-fit check (283/383 rule): flag any column number that sits
    outside the day's working number range or duplicates a prior day's column.
    Flags are reported for Jonathan, NOT auto-corrected (verification protocol).
  - Roll ALL mobilizations / all daily folders into the ONE project total.

Thread caps (this box, ~300 pid limit) are set at process start before any
heavy import. unzip binary is not installed; .guh are plain text (no unzip here).

Usage:
  python3 build-progress.py            # all active projects in baselines
  python3 build-progress.py --project 26-007   # one project
  python3 build-progress.py --dump-columns 26-007  # per-column detail to stdout
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas) ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime

# ---------------- config / paths ----------------
HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
BASELINES_PATH = os.path.join(HERE, "progress-baselines.json")
OUT_JS = os.path.join(DATA_DIR, "progress-data.js")

M_TO_FT = 3.28084

# A .guh whose max depth (ft) is below this is treated as a false start /
# aborted probe when the same column has another, deeper log. Madison's real
# columns are 15-25 ft; a probe under 3 ft never reached design and is an abort.
FALSE_START_FT = 3.0

# Where projects live in SharePoint (confirmed by exploration 2026-06-17):
SP_PROJECTS_ROOT = "04 - Project Management/02 - Projects"


def _load_env():
    env_path = os.path.expanduser("~/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


_load_env()

TENANT_ID = os.environ.get("AZURE_TENANT_ID", "")
CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("AZURE_CLIENT_SECRET", "")
DRIVE_ID = os.environ.get("SP_DRIVE_ID", "")

GRAPH = "https://graph.microsoft.com/v1.0"


# ---------------- Graph helpers (pattern from sp-sync.py) ----------------
def get_token():
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "scope": "https://graph.microsoft.com/.default",
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
    }).encode()
    req = urllib.request.Request(
        f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return json.loads(urllib.request.urlopen(req).read())["access_token"]


def _graph_get_json(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def list_children_by_path(token, path):
    """List children of a folder addressed by drive-relative path."""
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/children"
    items = []
    while url:
        data = _graph_get_json(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def list_children_by_id(token, item_id):
    url = f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}/children"
    items = []
    while url:
        data = _graph_get_json(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def download_item(token, item_id):
    url = f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(req).read()


# ---------------- .guh discovery + parse ----------------
def find_guh_files(token, project_folder_name):
    """Recursively walk a project folder, return list of .guh file items found
    under ANY 'QAQC' folder. Each item: {id, name, parent_date_folder}.

    We only descend into a project's QAQC subtree(s) so we never pick up .guh
    that might live elsewhere. We tag each .guh with the name of the dated
    folder it sits in (for the mislabel day-range check)."""
    base = f"{SP_PROJECTS_ROOT}/{project_folder_name}"
    try:
        top = list_children_by_path(token, base)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"cannot list project folder '{project_folder_name}': {e}")

    guh = []

    def walk(item_id, day_folder, depth):
        # guard against pathological depth
        if depth > 8:
            return
        for it in list_children_by_id(token, item_id):
            name = it["name"]
            if "folder" in it:
                # the dated QAQC subfolder becomes the "day folder" label
                next_day = day_folder
                if day_folder is None:
                    next_day = name  # first level under QAQC = the daily folder
                walk(it["id"], next_day, depth + 1)
            else:
                if name.lower().endswith(".guh"):
                    guh.append({
                        "id": it["id"],
                        "name": name,
                        "day_folder": day_folder,
                    })

    # find QAQC folder(s) anywhere in the tree, then walk them
    def find_qaqc(item_id, depth):
        if depth > 6:
            return
        for it in list_children_by_id(token, item_id):
            if "folder" in it:
                if it["name"].strip().upper() == "QAQC":
                    walk(it["id"], None, 0)
                else:
                    find_qaqc(it["id"], depth + 1)

    for it in top:
        if "folder" in it:
            if it["name"].strip().upper() == "QAQC":
                walk(it["id"], None, 0)
            else:
                find_qaqc(it["id"], 1)

    return guh


def parse_guh(raw_bytes):
    """Parse a .guh (latin-1, CRLF). Return (column_number:str, max_depth_ft:float,
    max_buckets:int, date:str) or None if unparseable.

    Header Info1 = column number. DATA rows are 14 semicolon fields:
      idx0=Date(DD.MM.YYYY HH:MM:SS), idx1=Tiefe(depth m), idx6=Buckets_Man.
    """
    text = raw_bytes.decode("latin-1")
    # normalize line ends for reading only
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    col = None
    # Test probes (Info1 like 'tp1'/'tp2', or filenames '..._tp1.guh') are NOT
    # production columns and must be excluded from count + LF. Detected below.
    in_data = False
    max_depth_m = 0.0
    max_buckets = 0
    date = ""
    for ln in lines:
        s = ln.strip()
        if not in_data:
            if s.startswith("Info1="):
                col = s.split("=", 1)[1].strip()
            if s == "[DATA]":
                in_data = True
            continue
        # in DATA
        if not s or s.startswith("["):
            continue
        parts = s.split(";")
        if len(parts) < 7:
            continue
        # depth
        try:
            d = float(parts[1])
        except (ValueError, IndexError):
            continue
        if d > max_depth_m:
            max_depth_m = d
        # buckets
        try:
            b = int(float(parts[6]))
            if b > max_buckets:
                max_buckets = b
        except (ValueError, IndexError):
            pass
        # date (first token of field 0)
        if not date and parts[0]:
            date = parts[0].split(" ")[0]
    if col is None:
        return None
    col_clean = str(col).strip()
    # Exclude test probes (not production columns).
    cl = col_clean.lower()
    if cl.startswith("tp") or "test" in cl or "probe" in cl:
        return {"col": col_clean, "depth_ft": 0.0, "buckets": 0,
                "date": date, "is_test_probe": True}
    return {
        "col": col_clean,
        "is_test_probe": False,
        "depth_ft": round(max_depth_m * M_TO_FT, 2),
        "buckets": max_buckets,
        "date": date,
    }


def _col_num(col_str):
    """Extract leading integer from a column label like '213a' -> 213.
    Used only for the mislabel day-range check; the LF/count math keeps the
    full distinct label."""
    num = ""
    for ch in str(col_str):
        if ch.isdigit():
            num += ch
        else:
            break
    return int(num) if num else None


# ---------------- per-project compute ----------------
def compute_project(token, project_folder_name, dump_columns=False):
    guh_items = find_guh_files(token, project_folder_name)
    if not guh_items:
        return {"error": "no .guh files found", "guh_count": 0}

    # logs: list of dicts per .guh
    logs = []
    test_probes = []
    for gi in guh_items:
        fname = gi["name"]
        raw = download_item(token, gi["id"])
        parsed = parse_guh(raw)
        if parsed is None:
            continue
        parsed["file"] = fname
        parsed["day_folder"] = gi["day_folder"]
        # filename backstop for test probes (e.g. 18_5_tp1.guh)
        flow = fname.lower()
        if parsed.get("is_test_probe") or "_tp" in flow or "test" in flow:
            test_probes.append(fname)
            continue
        logs.append(parsed)

    # group logs by column number
    by_col = {}
    for lg in logs:
        by_col.setdefault(lg["col"], []).append(lg)

    # Apply false-start rule: if a column has multiple logs and some are below
    # FALSE_START_FT while others are real, drop the aborted ones. Remaining
    # logs after this are treated as real installs/redrills (each counts toward LF).
    installed_lf = 0.0
    installed_cols = 0
    redrill_count = 0
    false_starts = 0
    last_date = ""
    col_detail = []

    for col, lgs in by_col.items():
        real = [l for l in lgs if l["depth_ft"] >= FALSE_START_FT]
        aborted = [l for l in lgs if l["depth_ft"] < FALSE_START_FT]
        if not real:
            # all logs are shallow: keep the single deepest as the install (edge case)
            real = [max(lgs, key=lambda l: l["depth_ft"])]
            aborted = [l for l in lgs if l not in real]
        false_starts += len(aborted)
        # each real log contributes its max depth to LF (redrills count again)
        col_lf = sum(l["depth_ft"] for l in real)
        installed_lf += col_lf
        installed_cols += 1
        if len(real) > 1:
            redrill_count += (len(real) - 1)
        for l in lgs:
            if l["date"] > last_date:
                last_date = l["date"]
        col_detail.append({
            "col": col,
            "logs": len(lgs),
            "real_logs": len(real),
            "aborted_logs": len(aborted),
            "max_depth_ft": round(max(l["depth_ft"] for l in real), 2),
            "lf": round(col_lf, 2),
        })

    # ---- mislabel number-fit check (283/383 rule) ----
    # For each day folder, compute the numeric range of columns worked that day.
    # Flag any column whose number sits well outside its day's range, OR a column
    # number that appears in more than one day folder (possible duplicate/mislabel).
    day_cols = {}   # day_folder -> set of numeric col
    col_days = {}   # numeric col -> set of day_folders
    for lg in logs:
        n = _col_num(lg["col"])
        if n is None:
            continue
        df = lg["day_folder"] or "(unknown)"
        day_cols.setdefault(df, []).append(n)
        col_days.setdefault(n, set()).add(df)

    mislabel_flags = []
    # duplicate-across-days
    for n, days in col_days.items():
        if len(days) > 1:
            mislabel_flags.append({
                "type": "col-in-multiple-day-folders",
                "col": n,
                "day_folders": sorted(days),
            })
    # out-of-range within a day (outside [min-gap, max+gap] of that day's block)
    for df, nums in day_cols.items():
        if len(nums) < 4:
            continue
        snums = sorted(nums)
        lo, hi = snums[0], snums[-1]
        span = hi - lo
        gap = max(50, span * 0.5)
        for n in set(nums):
            if n < lo - gap or n > hi + gap:
                mislabel_flags.append({
                    "type": "col-outside-day-range",
                    "col": n,
                    "day_folder": df,
                    "day_range": [lo, hi],
                })

    result = {
        "guh_count": len(guh_items),
        "parsed_logs": len(logs),
        "test_probes_excluded": len(test_probes),
        "installed_columns": installed_cols,
        "installed_lf": round(installed_lf, 1),
        "redrill_logs": redrill_count,
        "false_start_logs": false_starts,
        "last_log_date": last_date,
        "mislabel_flags": mislabel_flags,
    }
    if dump_columns:
        result["columns"] = sorted(col_detail, key=lambda c: _col_num(c["col"]) or 0)
    return result


# ---------------- baseline + output ----------------
def load_baselines():
    if not os.path.exists(BASELINES_PATH):
        raise RuntimeError(f"baselines file missing: {BASELINES_PATH}")
    with open(BASELINES_PATH) as f:
        return json.load(f)


def pct(num, den):
    if not den:
        return None
    return round(100.0 * num / den, 1)


def build(project_filter=None, dump_columns=False):
    baselines = load_baselines()
    token = get_token()
    out = {
        "generated": datetime.utcnow().isoformat() + "Z",
        "source": "GUHMA .guh logs from SharePoint 04 - Project Management/02 - Projects/{proj}/.../QAQC",
        "false_start_threshold_ft": FALSE_START_FT,
        "projects": {},
    }

    projects = baselines.get("projects", {})
    for proj_num, cfg in projects.items():
        if project_filter and proj_num != project_filter:
            continue
        folder = cfg.get("sp_folder")
        entry = {
            "project_number": proj_num,
            "name": cfg.get("name", ""),
            "baseline_status": cfg.get("baseline_status", "confirmed"),
            "design_columns": cfg.get("design_columns"),
            "design_lf": cfg.get("design_lf"),
            "source_note": cfg.get("source_note", ""),
        }
        if cfg.get("baseline_status") == "pending":
            # still pull installed numbers so the field work is visible
            entry["note"] = "baseline pending - design totals not yet confirmed"
        if not folder:
            entry["error"] = "no sp_folder configured"
            out["projects"][proj_num] = entry
            continue
        print(f"  {proj_num} ({folder}): scanning .guh ...", file=sys.stderr)
        try:
            comp = compute_project(token, folder, dump_columns=dump_columns)
        except Exception as e:
            entry["error"] = str(e)
            out["projects"][proj_num] = entry
            continue
        entry.update(comp)
        entry["pct_columns"] = pct(comp.get("installed_columns"), cfg.get("design_columns"))
        entry["pct_lf"] = pct(comp.get("installed_lf"), cfg.get("design_lf"))
        out["projects"][proj_num] = entry

    return out


def write_js(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-progress.py — do not edit by hand.\n")
        f.write("// Source: GUHMA .guh logs from SharePoint. Baseline: sync/progress-baselines.json.\n")
        f.write("// LF % is the headline completion metric (drives active->complete flip).\n")
        f.write("window.PF_PROGRESS = ")
        json.dump(data, f, indent=2)
        f.write(";\n")
    print(f"  Wrote: {OUT_JS}", file=sys.stderr)


def main():
    args = sys.argv[1:]
    project_filter = None
    dump_columns = False
    write = True
    if "--project" in args:
        i = args.index("--project")
        project_filter = args[i + 1]
    if "--dump-columns" in args:
        i = args.index("--dump-columns")
        project_filter = args[i + 1]
        dump_columns = True
        write = False  # dump mode = inspection, don't overwrite the js

    print(f"PF build-progress — {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC", file=sys.stderr)
    data = build(project_filter=project_filter, dump_columns=dump_columns)

    if dump_columns:
        print(json.dumps(data, indent=2))
        return
    if write:
        write_js(data)
    # human summary to stdout
    for pn, e in data["projects"].items():
        if e.get("error"):
            print(f"{pn} {e.get('name','')}: ERROR {e['error']}")
            continue
        print(f"{pn} {e.get('name','')}: "
              f"cols {e.get('installed_columns')}/{e.get('design_columns')} "
              f"({e.get('pct_columns')}%)  "
              f"LF {e.get('installed_lf')}/{e.get('design_lf')} "
              f"({e.get('pct_lf')}%)  "
              f"[baseline={e.get('baseline_status')}, redrills={e.get('redrill_logs')}, "
              f"false_starts={e.get('false_start_logs')}, flags={len(e.get('mislabel_flags',[]))}]")


if __name__ == "__main__":
    main()
