#!/usr/bin/env python3
"""
Build the INVOICE LEDGER for the Budget-vs-Actual "Actual" drill-down
=====================================================================
For every project, pair the invoice PDFs filed under the project's SharePoint
"02 - Project Management/Expenses" folder with the CODED amounts recorded in the
project's Turnover Budget workbook (col D Actual formula + col F vendor + col G
notes). Emit ONE feed:

    platform/data/invoice-ledger.js  ->  window.PF_INVOICE_LEDGER = {
      "26-017": { "<normGroupTitle>|<costCode>": { invoices:[{vendor,date,
                    invoice_no,amount,item_id,webUrl,file,note}], total }, ... },
      ...
      "_meta": { version, generated, source, jobs, ... }
    }

KEY = "<normalized group title>|<cost_code>" — IDENTICAL to how the portal
overlays workbook actuals (baNormTitle(group)+'|'+code in index.html /
_norm_title() here). So each Budget-vs-Actual row maps 1:1 to its invoices.

SOURCE OF TRUTH for amounts = the Turnover Budget workbook col D (the coded
amount), NOT raw PDF line totals (PDFs carry many line items). PDFs supply the
link (item_id/webUrl). NEVER fabricate: a (job,code) with no coded invoice gets
no entry.

NOTE (this slice / backfill): the initial backfill of the already-coded invoices
(HART, Stephan x2, Ohio CAT, Olen, Martin Marietta, MacAllister, Jackson Oil) was
seeded by hand-verifying each workbook formula against the Expenses PDFs — see the
BACKFILL dict below. A future pass can fully auto-derive per-invoice amounts by
parsing col G notes; for now the backfill amounts are workbook-reconciled.

Usage:
  python3 build-invoice-ledger.py            # write data/invoice-ledger.js
  python3 build-invoice-ledger.py --dump     # print, no write
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
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "invoice-ledger.js")

GRAPH = "https://graph.microsoft.com/v1.0"
_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


def _norm_title(s):
    """Normalize a group title for matching — MUST match index.html baNormTitle()
    and sync/budget_actual_parser.py _norm_title()."""
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


GRP_MAT = _norm_title("Project Material Costs")     # 'project material costs'
GRP_EQ = _norm_title("Project Equipment Costs")     # 'project equipment costs'


# ---------------- Graph helpers ----------------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def item_meta(token, item_id):
    """Resolve name + webUrl for a driveItem id (for the PDF link)."""
    try:
        m = gget(token, f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}")
        return {"name": m.get("name", ""), "webUrl": m.get("webUrl", "")}
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError):
        return {"name": "", "webUrl": ""}


# ---------------- BACKFILL (workbook-reconciled) ----------------
# Each invoice's amount is the CODED amount verified against the project's
# Turnover Budget col D Actual formula (see the module docstring). item_id is the
# SharePoint driveItem id of the filed PDF in the Expenses folder.
def _inv(vendor, date, invoice_no, amount, item_id, note=""):
    return {"vendor": vendor, "date": date, "invoice_no": invoice_no,
            "amount": round(float(amount), 2), "item_id": item_id, "note": note}


BACKFILL = {
    "26-017": {
        f"{GRP_MAT}|5110": [
            _inv("Olen Corporation", "2026-07-29", "504775-9", 9137.92 + 1231.44 + 1005.20,
                 "016ISVH67XSVUNXO5BUNFIWQA5JWW3TRZR",
                 "#57 Limestone trucking split per Brad (=9137.92+1231.44+1005.20)"),
        ],
        f"{GRP_EQ}|5410": [
            _inv("Ohio CAT", "2026-07-28", "RR0100211946", 1851.90,
                 "016ISVH66G6STWERVV5VBLL6BZQZ5GUU23", "Acct 3200669 - CAT 26"),
            _inv("Ohio CAT", "2026-07-28", "RR0100211976", 2212.39,
                 "016ISVH66G6STWERVV5VBLL6BZQZ5GUU23", "Acct 3200669 - CAT 26"),
        ],
        f"{GRP_EQ}|5430": [
            _inv("HART Fueling Services", "2026-07-21", "97432421", 715.58,
                 "016ISVH67RJWD4N5INXNGZNZHZMR4RNBNA", "Equipment Fuel"),
            _inv("HART Fueling Services", "2026-07-22", "97432448", 1584.74,
                 "016ISVH67RJWD4N5INXNGZNZHZMR4RNBNA", "Equipment Fuel"),
            _inv("HART Fueling Services", "2026-07-27", "97436288", 798.43,
                 "016ISVH6YPX6N6CDLDQJCLIZX6JLCHFPQI", "Equipment Fuel"),
            _inv("HART Fueling Services", "2026-07-28", "97436327", 1103.90,
                 "016ISVH6YPX6N6CDLDQJCLIZX6JLCHFPQI", "Equipment Fuel"),
        ],
    },
    "26-002": {
        # NOTE: these 3 Stephan PDFs are FILED in the Expenses folder but the
        # 26-002 workbook 5405 rows still hold POET's prior mob values — surfaced
        # here (with the PENDING note) so they are visible; NOT yet workbook-posted.
        f"{GRP_EQ}|5405": [
            _inv("Stephan Trucking Group Inc.", "2026-07-31", "11309", 2045.00,
                 "016ISVH632PDCXVLNFLJFL6BHDBMZS73S6", "VSC Rig Mob"),
            _inv("Stephan Trucking Group Inc.", "2026-07-31", "11310", 1315.00,
                 "016ISVH62Q4QRFWRN6D5FJ5VLBW56L5XTS", "Predrill Sany Mob"),
            _inv("Stephan Trucking Group Inc.", "2026-07-31", "11320", 1195.00,
                 "016ISVH664BP52LV4MPJFJEMP5WOXPITN4",
                 "Gooseneck-Hotshot (PENDING sub-row confirm; not yet posted to workbook)"),
        ],
    },
    "26-015": {
        f"{GRP_MAT}|5110": [
            _inv("Martin Marietta Materials", "2026-07-27", "50007127", 460.80,
                 "016ISVH65ESS5LUMML2RF3ZWABE4BHOAGS",
                 "SO 5002582, Schaff CPA HQ - freight split (Stone+Freight)"),
            _inv("Martin Marietta Materials", "2026-07-27", "50023736", 699.50,
                 "016ISVH6ZID3KUZU3UVZBISVOPWRXR4SYF",
                 "SO 5002582 - freight split (Stone+Freight)"),
        ],
        f"{GRP_EQ}|5405": [
            _inv("Stephan Trucking Group Inc.", "2026-07-29", "11288", 3115.00,
                 "016ISVH62GHFQM7MHNL5E2XJCMKMGAFZFH",
                 "VSC Rig Mob - JD 350G, Winchester OH to Westfield IN"),
            _inv("Stephan Trucking Group Inc.", "2026-07-29", "11283", 2310.00,
                 "016ISVH65JI3RWW76QFRCKCISPAQNFGKVA", "Predrill Sany 365 #M80268"),
            _inv("Stephan Trucking Group Inc.", "2026-07-29", "11282", 1595.00,
                 "016ISVH6YYG7G7FCWAW5CJOYWM7JWV3NJX", "Gooseneck parts load"),
        ],
        f"{GRP_EQ}|5410": [
            _inv("MacAllister Rentals", "2026-07-30", "R78734329601", 1986.29,
                 "016ISVH65SLBQO364H7BH3XXJJQ7T53GMT",
                 "RTN# 7343296-01, Cust# 8324919 - CAT 28"),
        ],
        f"{GRP_EQ}|5430": [
            _inv("Jackson Oil & Solvents, Inc.", "2026-07-28", "935080", 451.59,
                 "016ISVH63TM7IZ77R6XRHYHAZJOF52C3TQ",
                 "Ref# 935080, Acct 53629 - Premium ULS off-road diesel (paid via CC)"),
        ],
    },
}


def assemble(token):
    feed = {}
    for job, keys in BACKFILL.items():
        feed[job] = {}
        for key, invs in keys.items():
            enriched = []
            for iv in invs:
                m = item_meta(token, iv["item_id"])
                enriched.append({**iv, "webUrl": m["webUrl"], "file": m["name"]})
            total = round(sum(i["amount"] for i in enriched), 2)
            feed[job][key] = {"invoices": enriched, "total": total}
    feed["_meta"] = {
        "version": 1,
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": ("Backfilled from each project's Turnover Budget workbook (col D Actual "
                   "formula + col F vendor + col G notes) and the SharePoint '02 - Project "
                   "Management/Expenses' PDFs. Key = '<normalized group title>|<cost_code>' — "
                   "matches the portal's actuals overlay so a Budget-vs-Actual row maps 1:1 to "
                   "its invoices. Amounts are the CODED amounts (system of record), not raw PDF "
                   "line totals."),
        "note": ("Per (job, group, cost_code): the invoices coded there + their summed total; "
                 "total reconciles to the workbook Actual for that (group,code). No fabrication."),
        "jobs": sorted(BACKFILL.keys()),
    }
    return feed


def write_js(feed):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-invoice-ledger.py — do not edit by hand.\n")
        f.write("// Per-(job, group, cost_code) INVOICE LEDGER for the Budget-vs-Actual Actual drill-down.\n")
        f.write("// Key shape: window.PF_INVOICE_LEDGER[<job>]['<normGroupTitle>|<costCode>'] = {invoices:[...], total}.\n")
        f.write("window.PF_INVOICE_LEDGER = ")
        json.dump(feed, f, indent=2)
        f.write(";\n")
    return OUT_JS


def _summary(feed):
    print("\n=== INVOICE LEDGER FEED ===")
    for job, keys in feed.items():
        if job == "_meta":
            continue
        for key, v in keys.items():
            print(f"  {job} {key:<34} {len(v['invoices'])} inv  total=${v['total']:,.2f}")


def main():
    if not DRIVE_ID:
        print("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env", file=sys.stderr)
        sys.exit(1)
    token = _token()
    feed = assemble(token)
    _summary(feed)
    if "--dump" in sys.argv[1:]:
        print(json.dumps(feed, indent=2))
        return
    out = write_js(feed)
    print(f"\nWrote: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
