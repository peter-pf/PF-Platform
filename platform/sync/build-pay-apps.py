#!/usr/bin/env python3
"""Build data/pay-apps.js -- per-project SharePoint "Invoicing" pay-app files (PA #NN).

WHY (Brad 2026-09-08): the Pay Applications section (formerly "Project Invoicing") should
auto-populate ONE ROW per pay application that has actually been created for the project. Pay
apps are saved in each project's Invoicing folder under Project Management:
    04 - Project Management/02 - Projects/<project>/02 - Project Management/Invoicing
and are named "PA #01", "PA #02", and so on (tolerant of "PA #1" / "PA#01" / "PA 01", any
suffix/extension). This sync lists the pay-app FILES in each project's Invoicing folder,
captures each one's PA number/label + filename + webUrl (a link) + last-modified date, and
writes them (sorted ascending by PA number) so the portal can render one clickable row per pay
app. A project with no Invoicing folder or no PA files (e.g. 26-013 Park & Poplar, not started)
gets NO entry / an empty array, and the portal renders no extra rows (just the header/section).

FOLDER LOCATION (example, from Brad's message):
    04 - Project Management/02 - Projects/
        26-013 - Park & Poplar - OldTown/02 - Project Management/Invoicing
Project folders are matched by the NN-NNN number PREFIX (folder names carry the full project
name). The "02 - Project Management" subfolder + "Invoicing" leaf are matched case-insensitively,
tolerant of an optional numeric prefix / minor spacing.

This is a DEDICATED, independently-runnable sync (data/pay-apps.js, window.PF_PAY_APPS) so the
pay-app concern stays on its own cadence -- mirrors build-shop-dwg-info.py / build-safety-folder.py.

Reuses the Graph token + env loader from /home/aiciv/tools/pf_email.py, exactly like
build-safety-folder.py / build-shop-dwg-info.py / build-garbin-prelim.py / sp-sync.py.

Usage:
    python3 build-pay-apps.py            # writes data/pay-apps.js
    python3 build-pay-apps.py --dump     # print resolved data to stdout, no write
    python3 build-pay-apps.py --only 26-013   # restrict to one project number
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas) ---
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

# --- reuse the Graph token helper + env loader from pf_email.py ---
sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "pay-apps.js")

PROJECTS_BASE = "04 - Project Management/02 - Projects"
# The Project Management subfolder under each project (tolerant of the "02 - " numeric prefix).
PM_FOLDER_RE = re.compile(r"^(?:\d{2}\s*-\s*)?project\s*management\b", re.I)
# The Invoicing leaf under Project Management (tolerant of an optional numeric prefix).
INVOICING_FOLDER_RE = re.compile(r"^(?:\d{2}\s*-\s*)?invoic(?:e|ing)s?\b", re.I)

# A pay-app FILE inside the Invoicing folder. Brad: "Usually saved PA #01, PA #02, and so on."
# Be tolerant of: "PA #01", "PA #1", "PA#01", "PA 01", "PA-01", optional suffix + any extension.
# Capture the numeric PA number so we can sort ascending and label consistently.
PAYAPP_FILE_RE = re.compile(r"\bPA\s*#?\s*[-_]?\s*(\d{1,3})\b", re.I)

# Only real project folders start with an "NN-NNN" number. Skip the completed-projects roll-up
# folder, the template placeholder, and any non-project folders.
PROJNUM_RE = re.compile(r"^(\d{2}-\d{3})\b")

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- Graph helpers (pattern from build-shop-dwg-info.py) ----------------
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
    """Like list_children_by_path but returns None (not raise) on 404 -- used to probe for a
    folder that may not exist for a given project (fail-soft per-project)."""
    try:
        return list_children_by_path(token, path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def resolve_projects(token, only=None):
    """Enumerate project folders and yield (project_number, folder_name). The folder name
    carries the FULL project name; we key by the NN-NNN number prefix."""
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


def _find_subfolder(kids, rx):
    """First child folder whose name matches rx, or None."""
    for c in (kids or []):
        if c.get("folder") and rx.search(str(c.get("name", ""))):
            return c
    return None


def resolve_pay_apps(token, folder):
    """For one project folder, locate .../02 - Project Management/Invoicing and list the
    PA #NN pay-app files. Returns {found_folder, folder_url, path, pay_apps:[...]}.

    found_folder=False when the project has no Project Management or no Invoicing folder.
    pay_apps=[] when the Invoicing folder exists but holds no PA-matching files.
    """
    result = {"found_folder": False, "folder_url": "", "path": "", "pay_apps": []}

    # Step 1: project -> "02 - Project Management"
    proj_kids = try_list_children_by_path(token, f"{PROJECTS_BASE}/{folder}")
    if proj_kids is None:
        return result
    pm = _find_subfolder(proj_kids, PM_FOLDER_RE)
    if pm is None:
        return result
    pm_name = str(pm.get("name", ""))

    # Step 2: Project Management -> "Invoicing"
    pm_kids = try_list_children_by_path(token, f"{PROJECTS_BASE}/{folder}/{pm_name}")
    if pm_kids is None:
        return result
    inv = _find_subfolder(pm_kids, INVOICING_FOLDER_RE)
    if inv is None:
        return result
    inv_name = str(inv.get("name", ""))

    result["found_folder"] = True
    result["folder_url"] = inv.get("webUrl", "") or ""
    result["path"] = f"{folder}/{pm_name}/{inv_name}"

    # Step 3: list Invoicing children, keep FILES matching the PA pattern.
    inv_kids = try_list_children_by_path(token, f"{PROJECTS_BASE}/{folder}/{pm_name}/{inv_name}")
    if inv_kids is None:
        return result
    for it in inv_kids:
        if it.get("folder"):
            continue  # only files are pay apps
        name = str(it.get("name", ""))
        m = PAYAPP_FILE_RE.search(name)
        if not m:
            continue
        num_i = int(m.group(1))
        result["pay_apps"].append({
            "num": f"{num_i:02d}",          # zero-padded label, e.g. "01"
            "num_int": num_i,               # for sorting
            "name": name,                   # full filename (e.g. "PA #01 - Park & Poplar.pdf")
            "url": it.get("webUrl", "") or "",
            "modified": (it.get("lastModifiedDateTime", "") or ""),
        })

    # Sort ascending by PA number, then drop the sort-only helper key.
    result["pay_apps"].sort(key=lambda r: r["num_int"])
    for r in result["pay_apps"]:
        r.pop("num_int", None)
    return result


def build(token, only=None, verbose=True):
    projects = {}
    report = []  # (projnum, status, detail)
    for projnum, folder in resolve_projects(token, only=only):
        res = resolve_pay_apps(token, folder)
        if not res["found_folder"]:
            report.append((projnum, "no-invoicing-folder",
                           "no '02 - Project Management/Invoicing' folder"))
            continue
        if not res["pay_apps"]:
            # Folder exists but no pay apps yet (e.g. project not started). Record nothing so
            # the portal shows no extra rows -- but note it in the report for visibility.
            report.append((projnum, "empty", f'{res["path"]}  (0 pay apps)'))
            continue
        projects[projnum] = res["pay_apps"]
        labels = ", ".join(f'PA #{p["num"]}' for p in res["pay_apps"])
        report.append((projnum, "ok", f'{res["path"]}  [{len(res["pay_apps"])}: {labels}]'))

    data = {
        "projects": projects,
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": "SharePoint 04 - Project Management/02 - Projects/<project>/02 - Project Management/Invoicing (PA #NN files)",
            "note": "projects maps NN-NNN -> ascending list of pay apps [{num,name,url,modified}]. Projects with no Invoicing folder or no PA files are absent (portal renders no extra rows). Matched by NN-NNN prefix; PA files matched by 'PA #NN'.",
            "project_count": len(projects),
        },
    }
    if verbose:
        print("Pay Applications (Invoicing PA #NN) sync:")
        for projnum, status, detail in report:
            print(f"  {projnum}: {status}  {detail}")
        n_apps = sum(len(v) for v in projects.values())
        print(f"  -> {len(projects)} project(s) with pay apps, {n_apps} pay app file(s) total")
    return data


def write_js(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-pay-apps.py -- do not edit by hand.\n")
        f.write("// Per-project SharePoint pay-app files (PA #NN) from the Invoicing folder.\n")
        f.write("// Source: '04 - Project Management/02 - Projects/<project>/02 - Project Management/Invoicing'.\n")
        f.write("// Read by the Pay Applications section (auto-rows, one per pay app). window.PF_PAY_APPS.\n")
        f.write("window.PF_PAY_APPS = ")
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
