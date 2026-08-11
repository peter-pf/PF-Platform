#!/usr/bin/env python3
"""
Build Garbin Prelim data  ->  platform/data/garbin-prelim.js
==============================================================
For every active project under SharePoint

    04 - Project Management/02 - Projects/<project folder>/
        03 - Engineering & Design/Garbin Prelim/<AP Preliminary Design Summary ...>.xlsx

this reads the "Prelim Design Summary" tab and extracts the six values the portal's
Engineering & Design section displays:

    - LF               (Grand Total LF)
    - total_columns    (Grand Total COL)
    - nominal_dia_ft   (Nominal Diameter, RAW feet  -> frontend x12 -> inches)
    - bearing_psf      (Bearing Capacity, psf)
    - stone_tn         (Stone Required, tons)
    - webUrl           (clickable "open the workbook" link)

Output: platform/data/garbin-prelim.js
    window.PF_GARBIN_PRELIM = { projects: { "26-002": {...}, ... }, meta: {...} };

WHY window.PF_GARBIN_PRELIM (not PF_GARBIN):
    index.html already uses window.PF_GARBIN for the per-bid "sent to Garbin"
    checkbox flags (KV-backed feature flags). Reusing that name would collide, so
    this Garbin-Prelim design data gets its own distinct global.

READ DISCIPLINE (no fabrication):
    - Values are LABEL-ANCHORED, not row-hardcoded: for each target we scan column R
      for the label (e.g. "Stone Required:") and read column T on the SAME row, with
      column U as the unit. This survives row shifts across projects. If a project's
      layout differs (a label missing), that value is left null (frontend shows blank)
      and the miss is reported in the run summary + baked into the entry's "missing"
      list. Nothing is invented.

FOLDER RESOLUTION + OLD EXCLUSION:
    - Enumerate the project folders, take the leading "NN-NNN" as the project number.
    - Look for "<folder>/03 - Engineering & Design/Garbin Prelim".
    - Use the current Excel directly IN that folder. Any "OLD"/"old" SUBFOLDER is
      DISREGARDED (superseded workbooks live there). If several .xlsx sit directly in
      the folder, prefer one whose name contains "Preliminary Design Summary", else the
      most-recently-modified.
    - Projects with no Garbin Prelim folder / no Excel simply get NO entry (the
      frontend renders nothing for them, gracefully).

Reuses the Graph token + env loader from /home/aiciv/tools/pf_email.py, exactly like
build-project-record.py / sp-sync.py.

Thread caps are set BEFORE openpyxl import (this box, ~300 pid limit; solved-box-gotchas).

Usage:
    python3 build-garbin-prelim.py            # writes data/garbin-prelim.js
    python3 build-garbin-prelim.py --dump     # print extracted data to stdout, no write
    python3 build-garbin-prelim.py --only 26-002   # restrict to one project number
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas) ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import io
import re
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

# --- reuse the Graph token helper + env loader from pf_email.py ---
sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "garbin-prelim.js")

PROJECTS_BASE = "04 - Project Management/02 - Projects"
ENG_SUBPATH = "03 - Engineering & Design/Garbin Prelim"
EXTRACT_TAB = "Prelim Design Summary"

# Only real project folders start with an "NN-NNN" number. Skip the completed-projects
# roll-up folder, the template placeholder, and any non-project folders.
PROJNUM_RE = re.compile(r"^(\d{2}-\d{3})\b")

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")

# Label-anchored targets. Each = (output_key, label_regex_on_col_R). We scan column R
# for the label and read column T (value) + column U (unit) on the SAME row.
TARGETS = [
    ("total_columns", re.compile(r"grand\s*total\s*col", re.I)),
    ("lf",            re.compile(r"grand\s*total\s*lf", re.I)),
    ("nominal_dia",   re.compile(r"nominal\s*diameter", re.I)),
    ("bearing",       re.compile(r"bearing\s*capacity", re.I)),
    ("stone",         re.compile(r"stone\s*required", re.I)),
]

R_COL = 18  # column R (1-based)
T_COL = 20  # column T (value)
U_COL = 21  # column U (unit)


# ---------------- Graph helpers (pattern from build-project-record.py) ----------------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def list_children_by_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/children"
    items = []
    while url:
        data = gget(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def try_list_children_by_path(token, path):
    """Like list_children_by_path but returns None (not raise) on 404 -- used to probe
    for a folder that may not exist for a given project."""
    try:
        return list_children_by_path(token, path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def download_item_content(token, item_id):
    url = f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(req).read()


# ---------------- value helpers ----------------
def _num(v):
    """Coerce a cell value to a JSON-friendly number (int when whole), else None."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return int(f) if f == int(f) else f
    s = str(v).strip().replace(",", "")
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except ValueError:
        return None


def _unit(v):
    return ("" if v is None else str(v).strip())


# ---------------- Excel extraction (label-anchored col R -> col T) ----------------
def extract_from_workbook(raw_bytes):
    """Return (values_dict, missing_list). values_dict has the raw numbers keyed by
    output key; missing_list names any target whose label was not found. NO fabrication:
    a target that is not found is simply absent from values_dict (and listed in missing)."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
    if EXTRACT_TAB not in wb.sheetnames:
        # layout differs -- report the tab miss; caller treats as fully-missing.
        return {}, {}, [f"tab:{EXTRACT_TAB}"]
    ws = wb[EXTRACT_TAB]

    # Build a label->row index by scanning column R once.
    values = {}
    units = {}
    missing = []
    for key, rx in TARGETS:
        found_row = None
        for r in range(1, ws.max_row + 1):
            label = ws.cell(row=r, column=R_COL).value
            if label is not None and rx.search(str(label)):
                found_row = r
                break
        if found_row is None:
            missing.append(key)
            continue
        val = _num(ws.cell(row=found_row, column=T_COL).value)
        unit = _unit(ws.cell(row=found_row, column=U_COL).value)
        if val is None:
            missing.append(key)
            continue
        values[key] = val
        units[key] = unit
    return values, units, missing


def build_entry(values, units, missing, webUrl, source_file, item_id):
    """Assemble the per-project portal entry from extracted raw numbers.
    nominal_dia is stored RAW in feet (frontend multiplies x12 -> inches).
    Only keys actually extracted are populated; the rest are null (frontend -> blank)."""
    entry = {
        "lf": values.get("lf"),
        "total_columns": values.get("total_columns"),
        # RAW nominal diameter in FEET; the frontend converts x12 and labels "(in)".
        "nominal_dia_ft": values.get("nominal_dia"),
        "bearing_psf": values.get("bearing"),
        "stone_tn": values.get("stone"),
        "webUrl": webUrl or "",
        "source_file": source_file,
        "item_id": item_id,
        "tabs": ["Prelim Design Summary", "Design Notes"],
        "units": {  # units as READ from the workbook (col U), for verification/provenance
            "lf": units.get("lf", ""),
            "total_columns": units.get("total_columns", ""),
            "nominal_dia_ft": units.get("nominal_dia", ""),
            "bearing_psf": units.get("bearing", ""),
            "stone_tn": units.get("stone", ""),
        },
        "missing": missing,
    }
    return entry


# ---------------- per-project resolution ----------------
def pick_prelim_excel(children):
    """From the direct children of a 'Garbin Prelim' folder, choose the current Excel.
    - Ignore SUBFOLDERS entirely (this excludes any OLD/old folder -- superseded files).
    - Prefer a file whose name contains 'Preliminary Design Summary'; else the most
      recently modified .xlsx. Returns the chosen driveItem, or None."""
    xlsx = [c for c in children
            if not c.get("folder") and str(c.get("name", "")).lower().endswith((".xlsx", ".xlsm"))]
    if not xlsx:
        return None
    preferred = [c for c in xlsx if "preliminary design summary" in str(c.get("name", "")).lower()]
    pool = preferred or xlsx

    def _mtime(c):
        return c.get("lastModifiedDateTime", "") or ""
    pool.sort(key=_mtime, reverse=True)
    return pool[0]


def resolve_projects(token, only=None):
    """Enumerate project folders and yield (project_number, folder_name)."""
    children = list_children_by_path(token, PROJECTS_BASE)
    for it in children:
        if not it.get("folder"):
            continue
        name = str(it.get("name", ""))
        m = PROJNUM_RE.match(name)
        if not m:
            continue
        projnum = m.group(1)
        if only and projnum != only:
            continue
        yield projnum, name


def build(token, only=None, verbose=True):
    projects = {}
    report = []  # (projnum, status, detail)
    for projnum, folder in resolve_projects(token, only=only):
        gp_path = f"{PROJECTS_BASE}/{folder}/{ENG_SUBPATH}"
        kids = try_list_children_by_path(token, gp_path)
        if kids is None:
            report.append((projnum, "no-folder", "no Garbin Prelim folder"))
            continue
        chosen = pick_prelim_excel(kids)
        if chosen is None:
            report.append((projnum, "no-excel", "Garbin Prelim folder present but no .xlsx in it"))
            continue
        item_id = chosen.get("id", "")
        webUrl = chosen.get("webUrl", "")
        src_name = chosen.get("name", "")
        try:
            raw = download_item_content(token, item_id)
        except Exception as e:  # noqa: BLE001
            report.append((projnum, "download-error", f"{src_name}: {e}"))
            continue
        try:
            values, units, missing = extract_from_workbook(raw)
        except Exception as e:  # noqa: BLE001
            report.append((projnum, "parse-error", f"{src_name}: {e}"))
            continue
        entry = build_entry(values, units, missing, webUrl, src_name, item_id)
        projects[projnum] = entry
        status = "ok" if not missing else f"ok (missing: {','.join(missing)})"
        report.append((projnum, status, src_name))

    data = {
        "projects": projects,
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": "SharePoint 03 - Engineering & Design/Garbin Prelim/<AP Preliminary Design Summary>.xlsx, tab 'Prelim Design Summary'",
            "extraction": "label-anchored col R -> value col T (unit col U)",
            "note": "nominal_dia_ft is RAW feet; frontend x12 -> inches. OLD subfolders disregarded.",
            "project_count": len(projects),
        },
    }
    if verbose:
        print("Garbin Prelim sync:")
        for projnum, status, detail in report:
            print(f"  {projnum}: {status}  {detail}")
        print(f"  -> {len(projects)} project(s) populated")
    return data


def write_js(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-garbin-prelim.py -- do not edit by hand.\n")
        f.write("// Garbin Prelim design values per project (Engineering & Design section).\n")
        f.write("// Source: SharePoint '03 - Engineering & Design/Garbin Prelim' AP Preliminary\n")
        f.write("// Design Summary workbook, tab 'Prelim Design Summary'. Label-anchored reads.\n")
        f.write("// Distinct global from window.PF_GARBIN (the per-bid sent-to-Garbin flags).\n")
        f.write("window.PF_GARBIN_PRELIM = ")
        json.dump(data, f, indent=2)
        f.write(";\n")
    return OUT_JS


def main():
    only = None
    dump = False
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--dump":
            dump = True
        elif a == "--only" and i + 1 < len(args):
            only = args[i + 1]
            i += 1
        i += 1

    if not DRIVE_ID:
        print("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env", file=sys.stderr)
        return 2
    token = _token()
    data = build(token, only=only)
    if dump:
        print(json.dumps(data, indent=2))
        return 0
    path = write_js(data)
    print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
