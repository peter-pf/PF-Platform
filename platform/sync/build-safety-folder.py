#!/usr/bin/env python3
"""Build data/safety-folder.js -- per-project SharePoint "06 - Safety" folder webUrl.

WHY (Brad 2026-08-12): the Safety card's "Site Specific Safety Plan (SSSP)" field should be a
clickable link to each project's Site-Specific Safety Plan folder. That folder lives in the
FIELD OPERATIONS area (NOT the "04 - Project Management" area the submittal/prelim syncs use):
    05 - Field Operations/01 - Projects/<project>/06 - Safety
Project folders there are named with the FULL project name (e.g.
"26-013 - Park & Poplar - Old Town - Westfield, IN"), so we match by the "NN-NNN" number
PREFIX. This sync captures each project's "06 - Safety" folder webUrl so the portal can render
a clickable "Site Specific Safety Plan (SSSP)" folder button. A project with no such folder
gets NO entry, and the portal renders the link gracefully blank (never a broken href).

FEASIBILITY CONFIRMED (2026-08-12): the Field Ops path resolves on the SAME SP_DRIVE_ID as the
existing syncs. Probe found 12 project folders under "05 - Field Operations/01 - Projects";
both 26-013 (Park & Poplar) and 26-002 (POET) have a "06 - Safety" subfolder with a valid webUrl.

FOLDER LOCATION (example):
    05 - Field Operations/01 - Projects/
        26-013 - Park & Poplar - Old Town - Westfield, IN/06 - Safety

Mirrors build-pf-design-submittal-folder.py's folder-webUrl technique (list_children_by_path +
the driveItem's own webUrl), just pointed at the Field Ops path. DEDICATED data file
(data/safety-folder.js, window.PF_SAFETY_FOLDER) so this concern stays on its own cadence.

Reuses the Graph token + env loader from /home/aiciv/tools/pf_email.py, exactly like
build-pf-design-submittal-folder.py / build-shop-dwg-info.py / build-garbin-prelim.py.

Usage:
    python3 build-safety-folder.py            # writes data/safety-folder.js
    python3 build-safety-folder.py --dump     # print resolved data to stdout, no write
    python3 build-safety-folder.py --only 26-013   # restrict to one project number
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
OUT_JS = os.path.join(DATA_DIR, "safety-folder.js")

# The Field Operations projects base (DIFFERENT area than the 04 - Project Management syncs).
PROJECTS_BASE = "05 - Field Operations/01 - Projects"
# The safety folder under each Field Ops project. Matched case-insensitively, tolerant of an
# optional numeric prefix + spacing ("06 - Safety" / "06-Safety" / "Safety").
SAFETY_FOLDER_RE = re.compile(r"^(?:\d{2}\s*-\s*)?safety\b", re.I)

# Only real project folders start with an "NN-NNN" number (skip "001 - Completed Jobs",
# templates, and any non-project folders).
PROJNUM_RE = re.compile(r"^(\d{2}-\d{3})\b")

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- Graph helpers (pattern from build-pf-design-submittal-folder.py) --------
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
    folder that may not exist for a given project."""
    try:
        return list_children_by_path(token, path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def resolve_projects(token, only=None):
    """Enumerate Field Ops project folders and yield (project_number, folder_name). The
    folder name carries the FULL project name; we key by the NN-NNN number prefix."""
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


def resolve_safety_folder(token, folder):
    """For one Field Ops project folder, find the "06 - Safety" folder and return its webUrl.

    Returns {found, webUrl, folder_name, path}. found=False when the project folder has no
    child matching SAFETY_FOLDER_RE (e.g. no safety subfolder yet).
    """
    result = {"found": False, "webUrl": "", "folder_name": "", "path": ""}
    kids = try_list_children_by_path(token, f"{PROJECTS_BASE}/{folder}")
    if kids is None:
        return result  # project folder not found under Field Ops
    for c in kids:
        if not c.get("folder"):
            continue
        name = str(c.get("name", ""))
        if SAFETY_FOLDER_RE.search(name):
            result.update(
                found=True,
                webUrl=c.get("webUrl", "") or "",
                folder_name=name,
                path=f"{folder}/{name}",
            )
            return result
    return result


def build(token, only=None, verbose=True):
    projects = {}
    report = []  # (projnum, status, detail)
    for projnum, folder in resolve_projects(token, only=only):
        res = resolve_safety_folder(token, folder)
        if not res["found"]:
            report.append((projnum, "no-safety-folder", "no '06 - Safety' folder under Field Ops project"))
            continue
        projects[projnum] = {
            "folder_url": res["webUrl"],
            "folder_name": res["folder_name"],
            "source_path": res["path"],
        }
        report.append((projnum, "ok", res["path"]))

    data = {
        "projects": projects,
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": "SharePoint 05 - Field Operations/01 - Projects/<project>/06 - Safety (folder webUrl)",
            "note": "folder_url is the driveItem webUrl of the project's '06 - Safety' folder (Field Ops area); projects without one get no entry (portal renders the SSSP link gracefully blank). Project folders are matched by the NN-NNN number prefix (folder names carry the full project name).",
            "project_count": len(projects),
        },
    }
    if verbose:
        print("Safety (06 - Safety) folder sync:")
        for projnum, status, detail in report:
            print(f"  {projnum}: {status}  {detail}")
        print(f"  -> {len(projects)} project(s) populated")
    return data


def write_js(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-safety-folder.py -- do not edit by hand.\n")
        f.write("// Per-project SharePoint '06 - Safety' folder webUrl (Field Operations area).\n")
        f.write("// Source: '05 - Field Operations/01 - Projects/<project>/06 - Safety' driveItem webUrl.\n")
        f.write("// Read by the Safety card's 'Site Specific Safety Plan (SSSP)' folder link (window.PF_SAFETY_FOLDER).\n")
        f.write("window.PF_SAFETY_FOLDER = ")
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
