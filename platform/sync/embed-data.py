#!/usr/bin/env python3
"""
embed-data.py — Embeds live JSON data into index.html as JavaScript variables.

Cloudflare Pages serves index.html for ALL routes (SPA mode), so fetch() to
load .json files won't work. Instead, we inline the data as JS globals.

Usage:
    python3 platform/sync/embed-data.py

Reads from: platform/data/*.json
Writes to:  platform/index.html (injects after login script tag)
"""

import json
import os
import sys
from pathlib import Path

# Resolve paths relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
PLATFORM_DIR = SCRIPT_DIR.parent
DATA_DIR = PLATFORM_DIR / "data"
INDEX_HTML = PLATFORM_DIR / "index.html"

INJECTION_MARKER = "// ---- LIVE DATA FROM SHAREPOINT ----"
INJECTION_END = "// ---- END LIVE DATA ----"


def load_json(filename):
    """Load a JSON file from the data directory."""
    path = DATA_DIR / filename
    if not path.exists():
        print(f"  WARNING: {filename} not found, using empty data")
        return {}
    with open(path) as f:
        return json.load(f)


def build_data_script():
    """Build the <script> tag containing all live data as JS variables."""
    # Load all data files
    bid_log = load_json("bid-log.json")
    project_master = load_json("project-master.json")
    estimate_template = load_json("estimate-template.json")
    bd_master = load_json("bd-master.json")
    sync_meta = load_json("sync-meta.json")

    # Extract sub-arrays
    bids = bid_log.get("bids", [])
    stone_costs = bid_log.get("stone_costs", [])
    fy_goals = bid_log.get("fy_goals", {})
    projects = project_master.get("projects", [])
    cost_codes = project_master.get("cost_codes", [])
    kpis = project_master.get("kpis", {})
    line_items = estimate_template.get("line_items", [])
    oh_items = estimate_template.get("oh_items", [])
    contacts = bd_master.get("contacts", [])
    sheet_names = bd_master.get("sheet_names", [])

    lines = [
        f"<script>",
        f"{INJECTION_MARKER}",
        f"var LIVE_BIDS = {json.dumps(bids, separators=(',', ':'))};",
        f"var LIVE_STONE_COSTS = {json.dumps(stone_costs, separators=(',', ':'))};",
        f"var LIVE_FY_GOALS = {json.dumps(fy_goals, separators=(',', ':'))};",
        f"var LIVE_PROJECTS = {json.dumps(projects, separators=(',', ':'))};",
        f"var LIVE_COST_CODES = {json.dumps(cost_codes, separators=(',', ':'))};",
        f"var LIVE_KPIS = {json.dumps(kpis, separators=(',', ':'))};",
        f"var LIVE_ESTIMATE = {json.dumps(line_items, separators=(',', ':'))};",
        f"var LIVE_OH_ITEMS = {json.dumps(oh_items, separators=(',', ':'))};",
        f"var LIVE_BD = {json.dumps(contacts, separators=(',', ':'))};",
        f"var LIVE_BD_SHEETS = {json.dumps(sheet_names, separators=(',', ':'))};",
        f"var LIVE_SYNC_META = {json.dumps(sync_meta, separators=(',', ':'))};",
        f"{INJECTION_END}",
        f"</script>",
    ]

    return "\n".join(lines)


def inject_data(html, data_script):
    """Inject (or replace) data script block into HTML."""
    # Check if already injected — replace existing block
    if INJECTION_MARKER in html:
        # Find the <script> tag containing the marker and remove it
        start_marker = f"<script>\n{INJECTION_MARKER}"
        end_marker = f"{INJECTION_END}\n</script>"
        start_idx = html.find(start_marker)
        end_idx = html.find(end_marker)
        if start_idx != -1 and end_idx != -1:
            end_idx += len(end_marker)
            html = html[:start_idx] + data_script + html[end_idx:]
            print("  Replaced existing data block")
            return html

    # First injection — insert after login script close tag
    login_script_end = "</script>\n\n<!-- SIDEBAR -->"
    idx = html.find(login_script_end)
    if idx == -1:
        print("  ERROR: Could not find login script insertion point")
        sys.exit(1)

    insertion_point = idx + len("</script>")
    html = html[:insertion_point] + "\n\n" + data_script + "\n" + html[insertion_point:]
    print("  Injected new data block after login script")
    return html


def main():
    print("embed-data.py — Embedding live data into index.html")
    print(f"  Data dir: {DATA_DIR}")
    print(f"  Target:   {INDEX_HTML}")

    if not INDEX_HTML.exists():
        print(f"  ERROR: {INDEX_HTML} not found")
        sys.exit(1)

    # Read current HTML
    html = INDEX_HTML.read_text()

    # Build data script
    data_script = build_data_script()

    # Count records
    bid_log = load_json("bid-log.json")
    project_master = load_json("project-master.json")
    bd_master = load_json("bd-master.json")
    print(f"  Bids: {len(bid_log.get('bids', []))}")
    print(f"  Projects: {len(project_master.get('projects', []))}")
    print(f"  BD contacts: {len(bd_master.get('contacts', []))}")

    # Inject into HTML
    html = inject_data(html, data_script)

    # Write back
    INDEX_HTML.write_text(html)
    print(f"  Written: {INDEX_HTML}")
    print("  Done.")


if __name__ == "__main__":
    main()
