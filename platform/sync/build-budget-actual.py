#!/usr/bin/env python3
"""
Build Budget vs Actual — POET (26-002)   [Internal ops job-cost tracker]
=======================================================================
Parses the "Budget vs Actual" sheet of POET's Turnover Budget workbook and
writes platform/data/budget-actual-poet.js (window.PF_BUDGET_ACTUAL_POET = {...}),
which the per-project Budget vs Actual view (under Project Management) reads.

This is FINANCIAL data — it belongs in the project record's financial area under
Project Management, NEVER in the field-facing fo-projects view.

SOURCE (real, no fabrication):
  SharePoint:
    04 - Project Management/02 - Projects/26-002 - POET Projects - POET/
      26-0330 POET Turnover Budget.xlsm   sheet "Budget vs Actual"
  Structure (confirmed live 2026-06-17):
    Row 1: Name: | POET Bioprocessing | Job #: | 26-002
    Row 2: Location: | (Project Location)
    Row 3/4: header band -> A "Cost Code" B "Description" C "Budget" (Precon Budget)
             D "Actual Costs" E "Variance" F "Vendor or Supplier" G "Notes"
    Rows 5..~133: detail. Category header rows carry the category name (col A or B)
             with the category subtotal in C/D/E. Cost-code line rows carry a code
             in col A (e.g. 5051) and description in col B.
    Rows ~138..151: a clean summary band (per-category + grand total).
             Row "Total Construction Contract" = grand total (Budget/Actual/Variance).

Rules:
  - Variance is RECOMPUTED = budget - actual (do not trust the sheet's stored value).
  - Skip blank/zero-only filler rows sensibly, but KEEP real budgeted lines even when
    actual is zero (a $500 budgeted, $0 actual line is real and must show).
  - NEVER fabricate. Blank stays blank.

Invoice links (clickable supporting docs for actual-cost lines):
  Resolved from the POET project folder (Invoicing / Vendors). A line gets a SPECIFIC
  invoice link only when a document is reasonably matched (vendor name / amount).
  Where no specific doc is matched, the line gets a link to the relevant invoice/vendor
  FOLDER so the user can still pull one up. If nothing is found, NO link is emitted.
  Matched 2026-06-17:
    - 5710 Reprographics  $271.46  -> "Order Success _ FedEx Office.pdf" (exact $271.46 total)
  Folder fallbacks: Invoicing folder; Vendors folder.

Reuses Graph auth + drive patterns from build-project-record.py
(token via /home/aiciv/tools/pf_email.py _token(); SP_DRIVE_ID from /home/aiciv/.env).
Thread caps set BEFORE openpyxl import (this box ~300 pid limit; solved-box-gotchas).

Usage:
  python3 build-budget-actual.py            # writes data/budget-actual-poet.js
  python3 build-budget-actual.py --dump     # print assembled record, no write
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

# --- shared, project-agnostic parser (extracted 2026-07-30) ---
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from budget_actual_parser import parse_budget_actual as _shared_parse  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "budget-actual-poet.js")

PROJECT_NUMBER = "26-002"
PROJECT_NAME = "POET Biosciences"
SP_PROJECT_FOLDER = "04 - Project Management/02 - Projects/26-002 - POET Projects - POET"
BUDGET_FILE = f"{SP_PROJECT_FOLDER}/26-0330 POET Turnover Budget.xlsm"
BUDGET_SHEET = "Budget vs Actual"

# Invoicing / Vendors folders (for clickable supporting docs)
INVOICING_FOLDER = f"{SP_PROJECT_FOLDER}/02 - Project Management/Invoicing"
VENDORS_FOLDER = f"{SP_PROJECT_FOLDER}/02 - Project Management/Vendors"

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- Graph helpers (pattern from build-project-record.py) ----------------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def get_item_by_path(token, path):
    """Return driveItem metadata (incl webUrl) for a folder/file path, or None."""
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}"
    try:
        return gget(token, url)
    except urllib.error.HTTPError:
        return None


def download_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(req).read()


def weburl(token, path):
    """webUrl for a folder/file, or '' if not found."""
    item = get_item_by_path(token, path)
    if item and item.get("webUrl"):
        return item["webUrl"]
    return ""


# ---------------- value helpers ----------------
def _txt(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s.upper() in ("N/A", "NA", "TBD"):
        return ""
    return s


def _num(v):
    """Return a float for a numeric/dollar cell, or None if not numeric.
    Blank cells -> None (rendered blank, never 0)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s == "":
        return None
    s2 = s.replace("$", "").replace(",", "").strip()
    # parenthesised negatives e.g. (1,082.85)
    neg = False
    if s2.startswith("(") and s2.endswith(")"):
        neg = True
        s2 = s2[1:-1]
    try:
        f = float(s2)
        return -f if neg else f
    except ValueError:
        return None


def _round2(x):
    return None if x is None else round(x + 0.0, 2)


# ---------------- parse ----------------
# Cost-code line rows have a numeric code in col A (e.g. "5051", "5710").
CODE_RX = re.compile(r"^=?\d{3,4}$")  # some cells are typed "=5110" -> normalize

# A row is a same-sheet ROLL-UP when its budget formula sums/adds OTHER rows of
# THIS sheet (e.g. "=SUM(C56:C61)", "=C63+C68+C71+C78", "=C55"). A LEAF row pulls
# its value from another sheet or a literal (e.g. "='OH Calcs'!G31", "=0").
ROLLUP_RX = re.compile(r"^=(SUM\(C\d|C\d+[+\-]|C\d+$)", re.I)
# A SUB-rollup uses SUM of a contiguous leaf range, e.g. "=SUM(C56:C61)".
SUMRANGE_RX = re.compile(r"^=SUM\(C\d+:C\d+\)$", re.I)
# Extract the same-sheet C-row references a formula points at.
CREF_RX = re.compile(r"C(\d+)")


def _norm_code(a):
    a = (a or "").strip()
    if a.startswith("="):
        a = a[1:].strip()
    return a


def parse_budget_actual(token):
    """Parse POET's Budget vs Actual sheet via the SHARED project-agnostic parser
    (sync/budget_actual_parser.py). Kept as a thin wrapper so the rest of this
    POET builder (invoice-link resolution, summary, writer) is unchanged and the
    emitted data/budget-actual-poet.js stays byte-compatible."""
    raw = download_path(token, BUDGET_FILE)
    rec = _shared_parse(raw, sheet_name=BUDGET_SHEET,
                        default_job=PROJECT_NUMBER, default_name=PROJECT_NAME)
    # Preserve the original file label this builder always emitted.
    rec["source_file"] = "26-0330 POET Turnover Budget.xlsm"
    return rec


# ---------------- invoice links ----------------
def resolve_invoices(token, record):
    """Attach a supporting-document link to actual-cost lines where determinable.

    Strategy (never fabricate):
      1. SPECIFIC file match (vendor/amount) -> link the file's webUrl, match='file'.
      2. Otherwise, link the relevant FOLDER (Invoicing/Vendors) so the user can pull
         a doc -> match='folder'.
      3. If neither folder resolves -> no link.
    Only ACTUAL-cost lines (actual not None and != 0) get a link; budgeted-but-unspent
    lines get none (no cost incurred yet -> no invoice).
    """
    invoicing_url = weburl(token, INVOICING_FOLDER)
    vendors_url = weburl(token, VENDORS_FOLDER)

    # Verified specific-file matches (label normalized by cost_code).
    # FedEx Office order total == $271.46 == 5710 Reprographics actual. Exact match.
    fedex_path = f"{VENDORS_FOLDER}/Order Success _ FedEx Office.pdf"
    fedex_url = weburl(token, fedex_path)

    SPECIFIC = {}
    if fedex_url:
        SPECIFIC["5710"] = {
            "url": fedex_url,
            "label": "FedEx Office order ($271.46)",
            "how": "Exact amount match: FedEx Office order total $271.46 = 5710 Reprographics actual $271.46",
        }

    matched = []
    for grp in record["groups"]:
        for row in grp["rows"]:
            # roll-up sub-header rows are not invoiceable cost lines
            if row.get("is_subtotal"):
                row["invoice"] = None
                continue
            actual = row.get("actual")
            if actual is None or actual == 0:
                row["invoice"] = None
                continue
            code = row.get("cost_code", "")
            spec = SPECIFIC.get(code)
            if spec:
                row["invoice"] = {"url": spec["url"], "label": spec["label"], "match": "file"}
                matched.append({"cost_code": code, "description": row["description"],
                                "actual": actual, "match": "file",
                                "doc": spec["label"], "how": spec["how"]})
                continue
            # folder fallback: invoicing for PF-billing-adjacent, vendors otherwise.
            # We point cost lines at the Invoicing folder primarily (it holds payment
            # records); fall back to Vendors if Invoicing didn't resolve.
            url = invoicing_url or vendors_url
            if url:
                folder_label = "Invoicing folder" if invoicing_url else "Vendors folder"
                row["invoice"] = {"url": url, "label": folder_label, "match": "folder"}
                matched.append({"cost_code": code, "description": row["description"],
                                "actual": actual, "match": "folder",
                                "doc": folder_label,
                                "how": "No discrete vendor invoice file in folder; linked to folder so user can pull one"})
            else:
                row["invoice"] = None
                matched.append({"cost_code": code, "description": row["description"],
                                "actual": actual, "match": "none",
                                "doc": "", "how": "No invoice file or folder resolved -> no link"})
    record["_invoice_match_log"] = matched
    record["_invoice_folders"] = {"invoicing": invoicing_url, "vendors": vendors_url}
    return record


# ---------------- assemble + write ----------------
def assemble(token):
    record = parse_budget_actual(token)
    record = resolve_invoices(token, record)
    record["project_number"] = PROJECT_NUMBER
    record["generated"] = datetime.now(timezone.utc).isoformat() + "Z"
    record["data_note"] = (
        "Internal job-cost tracker. Parsed from the POET Turnover Budget workbook "
        "(sheet 'Budget vs Actual'). Variance recomputed = Budget - Actual. Blanks "
        "stay blank (never fabricated). Actual-cost lines link to a supporting vendor "
        "invoice where matched, otherwise to the Invoicing/Vendors folder. Once "
        "QuickBooks is connected, actuals will flow in automatically (QB export); until "
        "then this reflects the PM-maintained Turnover Budget."
    )
    return record


def write_js(record):
    # Strip the internal log keys from the shipped data file (keep it lean + clean).
    clean = {k: v for k, v in record.items() if not k.startswith("_")}
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-budget-actual.py — do not edit by hand.\n")
        f.write("// POET (26-002) Budget vs Actual — internal job-cost tracker.\n")
        f.write("// Source: 26-0330 POET Turnover Budget.xlsm, sheet 'Budget vs Actual'.\n")
        f.write("// Variance recomputed = Budget - Actual. Blanks stay blank.\n")
        f.write("window.PF_BUDGET_ACTUAL_POET = ")
        json.dump(clean, f, indent=2)
        f.write(";\n")
    return OUT_JS


def _fmt(x):
    return "" if x is None else f"{x:,.2f}"


def _summary(record):
    print(f"Budget vs Actual — {record['name']} (Job {record['job']})  "
          f"location={record['location'] or '(blank)'}")
    print(f"Source: {record['source_file']} / {record['source_sheet']}")
    sum_b = sum_a = sum_v = 0.0          # sum of CATEGORY SUBTOTALS
    leaf_b = leaf_a = 0.0                # sum of LEAF lines only (true reconcile)
    print("\nGROUPS:")
    for g in record["groups"]:
        st = g["subtotal"]
        print(f"\n  == {g['title']} ==  subtotal  Budget {_fmt(st['budget'])}  "
              f"Actual {_fmt(st['actual'])}  Variance {_fmt(st['variance'])}  "
              f"({len(g['rows'])} lines)")
        if st["budget"] is not None:
            sum_b += st["budget"]
        if st["actual"] is not None:
            sum_a += st["actual"]
        if st["variance"] is not None:
            sum_v += st["variance"]
        for row in g["rows"]:
            if not row.get("is_subtotal"):
                leaf_b += row["budget"] or 0.0
                leaf_a += row["actual"] or 0.0
            inv = row.get("invoice")
            tag = ""
            if inv:
                tag = f"   [INV {inv['match']}: {inv['label']}]"
            marker = "  +" if row.get("is_subtotal") else "   "
            print(f"   {marker}{row['cost_code']:>5}  {row['description'][:36]:<36} "
                  f"B {_fmt(row['budget']):>12}  A {_fmt(row['actual']):>12}  "
                  f"V {_fmt(row['variance']):>12}{tag}")
    gt = record["grand_total"]
    print("\nGRAND TOTAL (from summary band):")
    print(f"  {gt.get('label','Total')}:  Budget {_fmt(gt['budget'])}  "
          f"Actual {_fmt(gt['actual'])}  Variance {_fmt(gt['variance'])}")
    print("\nRECONCILE:")
    print(f"  sum of category subtotals:  Budget {_fmt(round(sum_b,2))}  "
          f"Actual {_fmt(round(sum_a,2))}  Variance {_fmt(round(sum_v,2))}")
    print(f"  sum of LEAF lines only:     Budget {_fmt(round(leaf_b,2))}  "
          f"Actual {_fmt(round(leaf_a,2))}")
    if gt["budget"] is not None:
        db = round(sum_b - gt["budget"], 2)
        da = round(sum_a - (gt["actual"] or 0), 2)
        lb = round(leaf_b - gt["budget"], 2)
        la = round(leaf_a - (gt["actual"] or 0), 2)
        ok = abs(db) < 0.05 and abs(da) < 0.05
        print(f"  category-subtotals vs grand total: Budget {db:+.2f}  Actual {da:+.2f}"
              f"  -> {'RECONCILES' if ok else 'CHECK'}")
        print(f"  leaf-sum vs grand total:           Budget {lb:+.2f}  Actual {la:+.2f}"
              f"  -> {'RECONCILES' if abs(lb) < 0.05 and abs(la) < 0.05 else 'CHECK'}")
    print("\nINVOICE MATCH LOG:")
    for m in record["_invoice_match_log"]:
        print(f"  [{m['match']:>6}] {m['cost_code']} {m['description'][:32]:<32} "
              f"actual {_fmt(m['actual'])}  -> {m['doc']}  ({m['how'][:60]})")
    print(f"\nInvoice folders: invoicing={'OK' if record['_invoice_folders']['invoicing'] else 'MISS'} "
          f"vendors={'OK' if record['_invoice_folders']['vendors'] else 'MISS'}")


def main():
    dump = "--dump" in sys.argv[1:]
    if not DRIVE_ID:
        print("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env", file=sys.stderr)
        sys.exit(1)
    print(f"build-budget-actual (POET) — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
          file=sys.stderr)
    token = _token()
    record = assemble(token)
    _summary(record)
    if dump:
        clean = {k: v for k, v in record.items() if not k.startswith("_")}
        print(json.dumps(clean, indent=2))
        return
    out = write_js(record)
    print(f"\nWrote: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
