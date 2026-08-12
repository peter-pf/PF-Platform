#!/usr/bin/env python3
"""Build data/pf-design-submittal.js -- the SharePoint "Approved Shop Dwgs" folder webUrl per project.

WHY (Brad 2026-08-12, TASK B repoint): once submittals are approved/reviewed, the file is
saved to the project's "Approved Shop Dwgs" folder under "03 - Engineering & Design". The
portal's Engineering & Design > PF Design Submittal subsection needs a clickable link that
opens that folder from SharePoint. This sync finds the "Approved Shop Dwgs" folder under
each project's "03 - Engineering & Design" and captures its webUrl so the portal can render
a clickable "Approved Shop Dwgs Folder" link. A project with no such folder simply gets NO
entry, and the portal renders the link gracefully blank (never a broken href).

REPOINT NOTE: Stage 1 originally targeted a "PF Design Submittal" folder that does NOT exist
under any project (0 populated). The real, existing target folder is "Approved Shop Dwgs"
(seen under every project's E&D during Stage 1's enumeration). The data file name +
window.PF_DESIGN_SUBMITTAL global are KEPT (so the auth.js RBAC map + portal feed plumbing
stay unchanged); only the folder the sync matches, plus the portal link label, changed.

FOLDER LOCATION (example):
    04 - Project Management/02 - Projects/
        26-016 - Filager Campus - Graybach/03 - Engineering & Design/Approved Shop Dwgs

DATA SOURCE DECISION (flagged): this is a DEDICATED file (data/pf-design-submittal.js),
independently runnable, mirroring build-shop-dwg-info.py exactly (same folder-webUrl
technique: grab the driveItem's own webUrl for a folder). Keeping it decoupled from the
Shop Dwg Info and Garbin prelim syncs keeps each concern on its own cadence.

Reuses the Graph token + env loader from /home/aiciv/tools/pf_email.py, exactly like
build-shop-dwg-info.py / build-garbin-prelim.py / sp-sync.py.

Usage:
    python3 build-pf-design-submittal-folder.py            # writes data/pf-design-submittal.js
    python3 build-pf-design-submittal-folder.py --dump     # print resolved data to stdout, no write
    python3 build-pf-design-submittal-folder.py --only 26-016   # restrict to one project number
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
OUT_JS = os.path.join(DATA_DIR, "pf-design-submittal.js")

PROJECTS_BASE = "04 - Project Management/02 - Projects"
ENG_BASE = "03 - Engineering & Design"
# The folder we look for under "03 - Engineering & Design". Matched case-insensitively,
# tolerant of the close naming variant "Approved Shop Drawings" (vs the abbreviated
# "Approved Shop Dwgs" that projects actually use). "Dwg"/"Dwgs"/"Drawing"/"Drawings"
# all accepted; optional trailing 's'.
PFDS_FOLDER_RE = re.compile(r"approved\s*shop\s*(dwgs?|drawings?)\b", re.I)

# Only real project folders start with an "NN-NNN" number. Skip the completed-projects
# roll-up folder, the template placeholder, and any non-project folders.
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
    """Like list_children_by_path but returns None (not raise) on 404 -- used to probe
    for a folder that may not exist for a given project."""
    try:
        return list_children_by_path(token, path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


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


def resolve_pfds_folder(token, folder):
    """For one project folder, find the "Approved Shop Dwgs" folder under
    '03 - Engineering & Design' and return its webUrl (or None if absent).

    Returns a dict: {found: bool, webUrl, folder_name, path} -- found=False when the
    project has no Engineering & Design folder OR no Approved Shop Dwgs subfolder.
    """
    result = {"found": False, "webUrl": "", "folder_name": "", "path": ""}
    eng_kids = try_list_children_by_path(token, f"{PROJECTS_BASE}/{folder}/{ENG_BASE}")
    if eng_kids is None:
        return result  # no Engineering & Design folder at all
    for c in eng_kids:
        if not c.get("folder"):
            continue
        name = str(c.get("name", ""))
        if PFDS_FOLDER_RE.search(name):
            result.update(
                found=True,
                webUrl=c.get("webUrl", "") or "",
                folder_name=name,
                path=f"{folder}/{ENG_BASE}/{name}",
            )
            return result
    return result


def build(token, only=None, verbose=True):
    projects = {}
    report = []  # (projnum, status, detail)
    for projnum, folder in resolve_projects(token, only=only):
        res = resolve_pfds_folder(token, folder)
        if not res["found"]:
            report.append((projnum, "no-approved-shop-dwgs-folder", "no 'Approved Shop Dwgs' folder under E&D"))
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
            "source": "SharePoint 04 - Project Management/02 - Projects/<project>/03 - Engineering & Design/Approved Shop Dwgs (folder webUrl)",
            "note": "folder_url is the driveItem webUrl of the project's 'Approved Shop Dwgs' folder; projects without one get no entry (portal renders the link gracefully blank).",
            "project_count": len(projects),
        },
    }
    if verbose:
        print("Approved Shop Dwgs folder sync:")
        for projnum, status, detail in report:
            print(f"  {projnum}: {status}  {detail}")
        print(f"  -> {len(projects)} project(s) populated")
    return data


def write_js(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-pf-design-submittal-folder.py -- do not edit by hand.\n")
        f.write("// Per-project SharePoint 'Approved Shop Dwgs' folder webUrl (Engineering & Design).\n")
        f.write("// Source: '03 - Engineering & Design/Approved Shop Dwgs' driveItem webUrl.\n")
        f.write("// Read by the Engineering & Design 'Approved Shop Dwgs Folder' link (window.PF_DESIGN_SUBMITTAL global kept for RBAC/feed plumbing continuity).\n")
        f.write("window.PF_DESIGN_SUBMITTAL = ")
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
