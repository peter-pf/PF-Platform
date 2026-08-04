#!/usr/bin/env python3
"""
Build Budget vs Actual — ALL PROJECTS (generalized, QuickBooks-INDEPENDENT)
==========================================================================
For every active/completed project, locate its Turnover Budget workbook on
SharePoint via Microsoft Graph, parse the "Budget vs Actual" sheet with the
SHARED formula-graph parser (sync/budget_actual_parser.py), and write ONE
unified feed:

    platform/data/budget-actuals.js  ->  window.PF_BUDGET_ACTUALS = {
      "26-017": { job, name, grand_total, actuals_by_group, groups, status, ... },
      "26-013": { ... },
      ...
      "_meta": { generated, source, jobs, ok_count, missing:[...],
                 unmatched_actuals:[...] }
    }

The portal overlays each project's ACTUAL onto the standard cost-code template
by (normalized group title + cost_code), so "Actual Cost to Date" / "Project
Profit" populate for ALL jobs. FAIL CLOSED: a job with no resolvable workbook
gets status!='ok' and NO fabricated numbers -> the portal shows a dash.

SOLE SOURCE = each project's Turnover Budget .xlsm. NO QuickBooks. NEVER fabricate.

jobnum -> workbook resolution (no manual manifest needed):
  1. List children of the ACTIVE parent  "04 - Project Management/02 - Projects/"
     and match the child folder whose name STARTS WITH "<job> " (or "<job>-").
  2. If not found, list "001 - Completed Projects/<year>/" for a matching child
     (year derived from the "YY-" prefix; tries 20YY and 20YY-1).
  3. Inside the matched folder, find the single file matching "*Turnover Budget*.xlsm".
     0 or >1 matches -> status 'ambiguous'/'no-workbook' (honest, never guess).
  An optional override manifest (sync/turnover-budget-manifest.json) can pin a
  folder/file for any job the listing can't disambiguate.

Usage:
  python3 build-budget-actuals.py                # write data/budget-actuals.js
  python3 build-budget-actuals.py --dump         # print, no write
  python3 build-budget-actuals.py --only 26-017  # one/few jobs (repeatable)
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas ~300 pid limit) ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import re
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from budget_actual_parser import parse_budget_actual, leaf_actuals_by_code, _norm_title  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "budget-actuals.js")
PROJECT_MASTER = os.path.join(DATA_DIR, "project-master.json")
MANIFEST = os.path.join(HERE, "turnover-budget-manifest.json")

ACTIVE_PARENT = "04 - Project Management/02 - Projects"
# Completed projects are nested UNDER the active parent, in year subfolders
# (confirmed live 2026-07-30): "<ACTIVE_PARENT>/001 - Completed Projects/<year>".
COMPLETED_PARENT = "04 - Project Management/02 - Projects/001 - Completed Projects"
BUDGET_SHEET = "Budget vs Actual"
TURNOVER_RX = re.compile(r"turnover\s*budget", re.I)

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- Graph helpers ----------------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def list_children(token, path):
    """Return the list of child driveItems for a folder path, or [] if missing.
    Handles paging."""
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/children?$top=200"
    items = []
    try:
        while url:
            data = gget(token, url)
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
    except urllib.error.HTTPError:
        return []
    return items


def download_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(req).read()


# ---------------- resolver ----------------
def _year_candidates(job):
    m = re.match(r"^(\d{2})-", job)
    if not m:
        return []
    yy = int(m.group(1))
    y = 2000 + yy
    return [str(y), str(y - 1), str(y + 1)]


def _folder_matches(child_name, job):
    n = child_name.strip()
    return n.startswith(job + " ") or n.startswith(job + "-") or n == job


def resolve_workbook(token, job, manifest):
    """Return (folder_path, file_path, source, status). status in
    ok|no-folder|no-workbook|ambiguous. Never guesses a filename."""
    # 0. manifest override
    if job in manifest:
        m = manifest[job]
        folder = m.get("folder", "")
        f = m.get("file", "")
        if folder and f:
            return folder, f"{folder}/{f}", "manifest", "ok"

    # 1. active parent
    folder = None
    src = None
    for child in list_children(token, ACTIVE_PARENT):
        if child.get("folder") and _folder_matches(child.get("name", ""), job):
            folder = f"{ACTIVE_PARENT}/{child['name']}"
            src = "active"
            break

    # 2. completed parent (per year)
    if not folder:
        for yr in _year_candidates(job):
            yr_parent = f"{COMPLETED_PARENT}/{yr}"
            for child in list_children(token, yr_parent):
                if child.get("folder") and _folder_matches(child.get("name", ""), job):
                    folder = f"{yr_parent}/{child['name']}"
                    src = f"completed/{yr}"
                    break
            if folder:
                break

    if not folder:
        return None, None, None, "no-folder"

    # 3. find the Turnover Budget workbook inside the folder
    matches = [c for c in list_children(token, folder)
               if c.get("file") and TURNOVER_RX.search(c.get("name", ""))
               and c.get("name", "").lower().endswith((".xlsm", ".xlsx"))]
    if len(matches) == 0:
        return folder, None, src, "no-workbook"
    if len(matches) == 1:
        return folder, f"{folder}/{matches[0]['name']}", src, "ok"
    # >1 workbooks: a project can carry the BASE Turnover Budget PLUS a change-order
    # variant (e.g. "26-0709 POET Turnover Budget w add'l Bin CO.xlsm" — an ADDITIONAL
    # BIN CHANGE ORDER that added scope/budget). The CURRENT live budget is the variant
    # the invoice-coding workflow WRITES TO, which is the MOST-RECENTLY-MODIFIED file —
    # NOT the base file (the earlier base name-fix read the STALE 26-0330 for POET and
    # showed pre-invoice actuals + a possibly-wrong budget). MOST-RECENT WINS (same
    # class of fix as the drill-down ledger resolver). We tie-break deterministically
    # (mtime desc, then created desc, then name desc so a later date prefix like 26-0709
    # beats 26-0330) and mark 'ok-multi' so the audit surfaces every multi-file job.
    def _mtime(c):
        return c.get("lastModifiedDateTime") or ""
    def _ctime(c):
        fsi = c.get("fileSystemInfo") or {}
        return fsi.get("createdDateTime") or c.get("createdDateTime") or ""
    ranked = sorted(matches, key=lambda c: (_mtime(c), _ctime(c), c.get("name", "")),
                    reverse=True)
    chosen = ranked[0]
    # Return "ok" (all downstream budget/actual gates accept it) — the chosen file IS
    # a valid current workbook. Multi-file jobs are surfaced separately by
    # audit_multi_workbook() so a human can eyeball which variant was picked.
    return folder, f"{folder}/{chosen['name']}", src, "ok"


def audit_multi_workbook(token, job, manifest):
    """Return None if the job has 0 or 1 Turnover Budget workbook, else a dict
    {job, folder, count, chosen, chosen_mtime, others:[{name,mtime}...]} showing every
    candidate and which one resolve_workbook() picks (most-recently-modified). Used to
    audit the POET-class multi-file risk without changing the resolver's status."""
    if job in manifest:
        return None  # explicit manifest override — not a heuristic-resolved multi case
    folder = None
    for child in list_children(token, ACTIVE_PARENT):
        if child.get("folder") and _folder_matches(child.get("name", ""), job):
            folder = f"{ACTIVE_PARENT}/{child['name']}"
            break
    if not folder:
        for yr in _year_candidates(job):
            yr_parent = f"{COMPLETED_PARENT}/{yr}"
            for child in list_children(token, yr_parent):
                if child.get("folder") and _folder_matches(child.get("name", ""), job):
                    folder = f"{yr_parent}/{child['name']}"
                    break
            if folder:
                break
    if not folder:
        return None
    matches = [c for c in list_children(token, folder)
               if c.get("file") and TURNOVER_RX.search(c.get("name", ""))
               and c.get("name", "").lower().endswith((".xlsm", ".xlsx"))]
    if len(matches) <= 1:
        return None
    def _mt(c):
        return c.get("lastModifiedDateTime") or ""
    ranked = sorted(matches, key=lambda c: (_mt(c), c.get("name", "")), reverse=True)
    chosen = ranked[0]
    return {
        "job": job, "folder": folder, "count": len(matches),
        "chosen": chosen.get("name", ""), "chosen_mtime": _mt(chosen),
        "others": [{"name": c.get("name", ""), "mtime": _mt(c)} for c in ranked[1:]],
    }


# ---------------- per-job build ----------------
def build_one(token, job, name, manifest):
    folder, wbpath, src, status = resolve_workbook(token, job, manifest)
    base = {"job": job, "name": name, "status": status,
            "source_folder": folder or "", "source_file": (wbpath or ""),
            "source_kind": src or ""}
    if status != "ok" or not wbpath:
        base["actuals_by_group"] = {}
        base["grand_total"] = {"budget": None, "actual": None, "variance": None}
        return base, []

    try:
        raw = download_path(token, wbpath)
        rec = parse_budget_actual(raw, sheet_name=BUDGET_SHEET,
                                  default_job=job, default_name=name)
    except (ValueError, urllib.error.HTTPError, urllib.error.URLError, KeyError) as e:
        base["status"] = "parse-error"
        base["error"] = str(e)[:200]
        base["actuals_by_group"] = {}
        base["grand_total"] = {"budget": None, "actual": None, "variance": None}
        return base, []

    by_group, _flat = leaf_actuals_by_code(rec)
    base["status"] = "ok" if rec.get("has_cached_values") else "no-cached-values"
    base["name"] = rec.get("name") or name
    base["location"] = rec.get("location", "")
    base["grand_total"] = rec.get("grand_total", {})
    base["actuals_by_group"] = by_group
    # NOTE: we intentionally DO NOT ship the full per-project `groups` in the feed —
    # the portal overlays actuals onto the standard template by (group,code), so the
    # workbook's own row tree is not needed client-side and would ~3x the feed size.
    # (A future "render per-project table from workbook groups" phase can add it back
    # behind a flag.)
    base["source_file"] = wbpath.split("/")[-1]

    # unmatched actuals: leaf lines with a NON-ZERO actual but NO cost_code (can't
    # be overlaid onto a template row keyed by code) -> surfaced, never dropped.
    unmatched = []
    for g in rec.get("groups", []):
        for row in g.get("rows", []):
            if row.get("is_subtotal"):
                continue
            a = row.get("actual")
            if a and not (row.get("cost_code") or "").strip():
                unmatched.append({"job": job, "group": g.get("title", ""),
                                  "description": row.get("description", ""),
                                  "actual": a})
    return base, unmatched


# ---------------- assemble + write ----------------
JOB_PREFIX_RX = re.compile(r"^(\d{2}-\d{3,4})\b")


def _jobs_from_folders(token):
    """AUTO-DISCOVER every project by listing the SharePoint Projects folders.
    Any folder whose name starts with a 'YY-NNN' job number is a project —
    active ones under 02 - Projects, completed ones under 001 - Completed
    Projects/<year>. A brand-new project's folder is picked up automatically
    with ZERO per-project setup. Returns [(job, name_guess), ...] de-duped."""
    found = {}  # job -> name guess (from folder: "<job> - <Name> - <GC>")

    def scan(parent):
        for c in list_children(token, parent):
            if not c.get("folder"):
                continue
            nm = c.get("name", "").strip()
            m = JOB_PREFIX_RX.match(nm)
            if not m:
                continue
            job = m.group(1)
            # name guess = the middle segment "<job> - <Name> - <GC>"
            parts = [p.strip() for p in nm.split(" - ")]
            name = parts[1] if len(parts) >= 2 else nm
            found.setdefault(job, name)

    scan(ACTIVE_PARENT)
    for yr in ("2025", "2026", str(datetime.now(timezone.utc).year),
               str(datetime.now(timezone.utc).year - 1)):
        scan(f"{COMPLETED_PARENT}/{yr}")
    return sorted(found.items())


def load_jobs(token=None):
    """Prefer live SharePoint auto-discovery (covers brand-new projects with no
    setup). Fall back to project-master.json only if the listing fails/empty so a
    Graph hiccup never silently drops the whole feed."""
    if token is not None:
        try:
            jobs = _jobs_from_folders(token)
            if jobs:
                return jobs
        except (urllib.error.HTTPError, urllib.error.URLError):
            pass
    with open(PROJECT_MASTER) as f:
        d = json.load(f)
    out = []
    for p in d.get("projects", []):
        num = str(p.get("project_number") or "").strip()
        if re.match(r"^\d{2}-\d{3}$", num):
            out.append((num, str(p.get("name") or "").strip()))
    return out


def load_manifest():
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def assemble(token, only=None):
    manifest = load_manifest()
    jobs = load_jobs(token)
    if only:
        jobs = [(j, n) for (j, n) in jobs if j in only]
    projects = {}
    all_unmatched = []
    missing = []
    ok_count = 0
    for job, name in jobs:
        print(f"  resolving {job} {name}...", file=sys.stderr)
        rec, unmatched = build_one(token, job, name, manifest)
        projects[job] = rec
        all_unmatched.extend(unmatched)
        if rec["status"] == "ok":
            ok_count += 1
        else:
            missing.append({"job": job, "name": name, "status": rec["status"],
                            "file": rec.get("source_file", "")})
    feed = dict(projects)
    feed["_meta"] = {
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "Turnover Budget workbooks (sheet 'Budget vs Actual') via MS Graph. QuickBooks-independent.",
        "jobs": len(jobs),
        "ok_count": ok_count,
        "missing": missing,
        "unmatched_actuals": all_unmatched,
        "note": ("Per-project ACTUAL costs parsed from each Turnover Budget workbook. "
                 "Overlaid onto the standard cost-code template by (group title + cost "
                 "code). Variance recomputed = Budget - Actual. Blanks stay blank; a job "
                 "with no resolvable workbook shows a dash (never a fabricated 0)."),
    }
    return feed


def write_js(feed):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-budget-actuals.py — do not edit by hand.\n")
        f.write("// ALL-PROJECTS Budget vs Actual (QuickBooks-independent).\n")
        f.write("// Source: each project's '*Turnover Budget*.xlsm', sheet 'Budget vs Actual'.\n")
        f.write("// Overlaid onto the cost-code template by (group title + cost code).\n")
        f.write("window.PF_BUDGET_ACTUALS = ")
        json.dump(feed, f, indent=2)
        f.write(";\n")
    return OUT_JS


def _summary(feed):
    meta = feed["_meta"]
    print(f"\n=== BUDGET ACTUALS FEED — {meta['ok_count']}/{meta['jobs']} jobs OK ===")
    for job, rec in feed.items():
        if job == "_meta":
            continue
        gt = rec.get("grand_total", {})
        ga = gt.get("actual")
        gb = gt.get("budget")
        codes = sum(len(v) for v in rec.get("actuals_by_group", {}).values())
        print(f"  {job} {rec.get('name','')[:28]:<28} status={rec['status']:<16} "
              f"budget={_m(gb)} actual={_m(ga)}  ({codes} coded-actual lines)  "
              f"[{rec.get('source_file','')}]")
    if meta["missing"]:
        print("\n  MISSING / not-ok:")
        for m in meta["missing"]:
            print(f"    {m['job']} {m['name'][:30]:<30} -> {m['status']}")
    if meta["unmatched_actuals"]:
        print(f"\n  UNMATCHED ACTUALS (non-zero actual, no cost code) — {len(meta['unmatched_actuals'])}:")
        for u in meta["unmatched_actuals"]:
            print(f"    {u['job']} [{u['group'][:20]}] {u['description'][:34]:<34} {_m(u['actual'])}")


def _m(x):
    return "—" if x is None else f"${x:,.2f}"


def main():
    args = sys.argv[1:]
    dump = "--dump" in args
    only = None
    if "--only" in args:
        only = set()
        i = 0
        while i < len(args):
            if args[i] == "--only" and i + 1 < len(args):
                only.add(args[i + 1])
                i += 2
            else:
                i += 1
    if not DRIVE_ID:
        print("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env", file=sys.stderr)
        sys.exit(1)
    print(f"build-budget-actuals — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
          file=sys.stderr)
    token = _token()
    feed = assemble(token, only=only)
    _summary(feed)
    if dump:
        print(json.dumps(feed, indent=2))
        return
    out = write_js(feed)
    print(f"\nWrote: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
