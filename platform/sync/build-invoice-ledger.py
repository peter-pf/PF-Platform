#!/usr/bin/env python3
"""
Build the INVOICE LEDGER for the Budget-vs-Actual "Actual" drill-down — ALL PROJECTS
====================================================================================
For EVERY project (auto-discovered exactly like build-budget-actuals.py), parse the
project's Turnover Budget "Budget vs Actual" sheet with the SHARED parser and emit,
per (group, cost_code), the coded invoice line(s) behind that Actual:

    platform/data/invoice-ledger.js  ->  window.PF_INVOICE_LEDGER = {
      "26-017": { "<normGroupTitle>|<costCode>": { invoices:[{vendor,date,
                    invoice_no,amount,item_id,webUrl,file,note}], total }, ... },
      ...
      "_meta": { version, generated, source, jobs, ... }
    }

KEY = "<normalized group title>|<cost_code>" — IDENTICAL to how the portal overlays
workbook actuals (baNormTitle(group)+'|'+code in index.html / _norm_title() in the
shared parser). So each Budget-vs-Actual row maps 1:1 to its invoice line.

WHAT CHANGED (2026-09-10, Stage 1 all-projects rebuild):
  The prior build shipped a HAND-maintained BACKFILL dict covering only 3 projects
  (26-002/26-015/26-017). The drill-down was therefore clickable on just those 3.
  This build AUTO-DERIVES the ledger for ALL discovered projects straight from each
  workbook's col-F (vendor) + col-G (notes) + col-D (Actual amount) on the GREEN
  booked-actual leaf rows — the SAME rows the portal overlays. Brad: "consistent
  across all projects."

SOURCE OF TRUTH for amounts = the workbook col-D Actual (the coded amount, system of
record), reconciled by the shared parser (green-only gate + repeated-(group,code) SUM).
NEVER fabricate: a (job,code) with no GREEN booked actual gets no entry.

PDF links: deriving each invoice's SharePoint PDF requires the Expenses-folder
item_ids (Stage 2 invoice-PDF filing). This build populates vendor / invoice_no /
amount / note / date for ALL projects and leaves webUrl/file/item_id EMPTY where the
PDF is not (yet) resolvable. The drill-down cell is still clickable everywhere there
is a coded actual; the modal shows the invoice detail, with the PDF link appearing
once Stage 2 files the item_ids. A per-project override map (INVOICE_PDF_OVERRIDES)
can pin known item_ids so their PDF link is live immediately (seeded from the prior
hand-verified backfill so no PDF link regresses).

Usage:
  python3 build-invoice-ledger.py               # write data/invoice-ledger.js
  python3 build-invoice-ledger.py --dump        # print, no write
  python3 build-invoice-ledger.py --only 26-017 # one/few jobs (repeatable)
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas ~300 pid limit) ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import re
import sys
import json
import importlib.util
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from budget_actual_parser import parse_budget_actual, _norm_title  # noqa: E402

# Reuse the ALL-PROJECTS discovery + workbook resolver from build-budget-actuals.py
# (module name has hyphens -> load by path). This guarantees the ledger covers the
# SAME projects/workbooks the actuals overlay uses — no drift between the two feeds.
_bba_spec = importlib.util.spec_from_file_location(
    "_bba", os.path.join(HERE, "build-budget-actuals.py"))
_bba = importlib.util.module_from_spec(_bba_spec)
_bba_spec.loader.exec_module(_bba)

GRAPH = "https://graph.microsoft.com/v1.0"
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
OUT_JS = os.path.join(DATA_DIR, "invoice-ledger.js")

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- col-G note -> invoice number / date extraction ----------------
# col-G notes are free text but reliably carry "INV <num>" / "Invoice <num>" and
# often a MM/DD/YY(YY) date. We extract BEST-EFFORT (never fail the row): the whole
# note is always preserved so nothing is lost even when the regex misses.
_INV_RX = re.compile(r"(?:INV(?:OICE)?\.?\s*#?\s*)([A-Z0-9][A-Z0-9\-]{2,})", re.I)
_DATE_RX = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b")


def _norm_date(s):
    """MM/DD/YY or MM/DD/YYYY -> YYYY-MM-DD (best effort); '' if unparseable."""
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _extract_invoice_nos(note):
    """Return a list of distinct invoice numbers referenced in the note (order-preserving)."""
    seen = []
    for m in _INV_RX.finditer(note or ""):
        num = m.group(1).strip().rstrip(".,;)")
        if num and num.upper() not in ("NO", "NUM", "NUMBER") and num not in seen:
            seen.append(num)
    return seen


def _extract_date(note):
    m = _DATE_RX.search(note or "")
    return _norm_date(m.group(1)) if m else ""


# ---------------- known PDF item_id overrides (seeded from prior backfill) --------
# (job, group_norm, code) -> { invoice_no: item_id }. Seeded from the prior
# hand-verified 3-project backfill so those PDF links stay live. Stage 2 will
# populate the rest automatically from the Expenses folder.
GRP_MAT = _norm_title("Project Material Costs")
GRP_EQ = _norm_title("Project Equipment Costs")

INVOICE_PDF_OVERRIDES = {
    ("26-017", GRP_MAT, "5110"): {"504775-9": "016ISVH67XSVUNXO5BUNFIWQA5JWW3TRZR"},
    ("26-017", GRP_EQ, "5410"): {"RR0100211946": "016ISVH66G6STWERVV5VBLL6BZQZ5GUU23",
                                 "RR0100211976": "016ISVH66G6STWERVV5VBLL6BZQZ5GUU23"},
    ("26-017", GRP_EQ, "5430"): {"97432421": "016ISVH67RJWD4N5INXNGZNZHZMR4RNBNA",
                                 "97432448": "016ISVH67RJWD4N5INXNGZNZHZMR4RNBNA",
                                 "97436288": "016ISVH6YPX6N6CDLDQJCLIZX6JLCHFPQI",
                                 "97436327": "016ISVH6YPX6N6CDLDQJCLIZX6JLCHFPQI"},
    ("26-002", GRP_EQ, "5405"): {"11309": "016ISVH632PDCXVLNFLJFL6BHDBMZS73S6",
                                 "11310": "016ISVH62Q4QRFWRN6D5FJ5VLBW56L5XTS"},
    ("26-015", GRP_MAT, "5110"): {"50007127": "016ISVH65ESS5LUMML2RF3ZWABE4BHOAGS",
                                  "50023736": "016ISVH6ZID3KUZU3UVZBISVOPWRXR4SYF"},
    ("26-015", GRP_EQ, "5405"): {"11288": "016ISVH62GHFQM7MHNL5E2XJCMKMGAFZFH",
                                 "11283": "016ISVH65JI3RWW76QFRCKCISPAQNFGKVA",
                                 "11282": "016ISVH6YYG7G7FCWAW5CJOYWM7JWV3NJX"},
    ("26-015", GRP_EQ, "5410"): {"R78734329601": "016ISVH65SLBQO364H7BH3XXJJQ7T53GMT"},
    ("26-015", GRP_EQ, "5430"): {"935080": "016ISVH63TM7IZ77R6XRHYHAZJOF52C3TQ"},
}

_item_meta_cache = {}


def item_meta(token, item_id):
    """Resolve name + webUrl for a driveItem id (for the PDF link). Cached."""
    if not item_id:
        return {"name": "", "webUrl": ""}
    if item_id in _item_meta_cache:
        return _item_meta_cache[item_id]
    try:
        req = urllib.request.Request(
            f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}",
            headers={"Authorization": f"Bearer {token}"})
        m = json.loads(urllib.request.urlopen(req).read())
        out = {"name": m.get("name", ""), "webUrl": m.get("webUrl", "")}
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError):
        out = {"name": "", "webUrl": ""}
    _item_meta_cache[item_id] = out
    return out


# ---------------- per-job ledger ----------------
def build_one(token, job, name, manifest):
    """Return { '<normGroupTitle>|<code>': {invoices:[...], total} } for one job,
    auto-derived from the workbook's GREEN booked-actual leaf rows. Empty dict if
    the workbook is unresolvable or carries no booked actuals (never fabricate)."""
    folder, wbpath, src, status = _bba.resolve_workbook(token, job, manifest)
    if status != "ok" or not wbpath:
        return {}, status
    try:
        raw = _bba.download_path(token, wbpath)
        rec = parse_budget_actual(raw, default_job=job, default_name=name)
    except (ValueError, urllib.error.HTTPError, urllib.error.URLError, KeyError) as e:
        return {}, f"parse-error:{str(e)[:60]}"

    keys = {}
    for g in rec.get("groups", []):
        gt = _norm_title(g.get("title", ""))
        for row in g.get("rows", []):
            if row.get("is_subtotal"):
                continue
            code = (row.get("cost_code") or "").strip()
            actual = row.get("actual")
            vendor = (row.get("vendor") or "").strip()
            note = (row.get("notes") or "").strip()
            # A ledger line = a REAL coded invoice: booked-green leaf row with a code
            # AND a non-zero actual. A $0.00 booked cell (budget-band placeholder with
            # no invoice yet) is NOT an invoice — skip it so the drill-down cell is
            # only clickable where money was actually coded. If a row is non-zero but
            # carries no vendor/note it is still a real coded cost, so keep it (the
            # amount is authoritative); we just can't attribute a vendor.
            if not code or actual is None or abs(actual) < 0.005:
                continue
            inv_nos = _extract_invoice_nos(note)
            invoice_no = ", ".join(inv_nos) if inv_nos else ""
            date = _extract_date(note)
            # PDF item_id override (seeded backfill); pick the first matching inv#.
            item_id = ""
            ovr = INVOICE_PDF_OVERRIDES.get((job, gt, code), {})
            for inv in inv_nos:
                if inv in ovr:
                    item_id = ovr[inv]
                    break
            entry = {
                "vendor": vendor,
                "date": date,
                "invoice_no": invoice_no,
                "amount": round(float(actual), 2),
                "item_id": item_id,
                "note": note,
            }
            key = f"{gt}|{code}"
            # A (group,code) can REPEAT (e.g. 5405 x3, 5110 split) — SUM into a list,
            # mirroring the overlay's per-(group,code) SUM so total == overlaid actual.
            keys.setdefault(key, []).append(entry)

    # Enrich item_id -> webUrl/file, compute totals.
    out = {}
    for key, invs in keys.items():
        enriched = []
        for iv in invs:
            m = item_meta(token, iv["item_id"]) if iv["item_id"] else {"name": "", "webUrl": ""}
            enriched.append({**iv, "webUrl": m["webUrl"], "file": m["name"]})
        total = round(sum(i["amount"] for i in enriched), 2)
        out[key] = {"invoices": enriched, "total": total}
    return out, status


def assemble(token, only=None):
    manifest = _bba.load_manifest()
    jobs = _bba.load_jobs(token)
    if only:
        jobs = [(j, n) for (j, n) in jobs if j in only]
    feed = {}
    covered = []          # jobs with >=1 coded invoice line
    empty = []            # jobs resolved but no booked-green actuals
    unresolved = []       # jobs with no workbook
    for job, name in jobs:
        print(f"  ledger {job} {name}...", file=sys.stderr)
        keys, status = build_one(token, job, name, manifest)
        if keys:
            feed[job] = keys
            covered.append(job)
        elif status == "ok":
            empty.append(job)
        else:
            unresolved.append({"job": job, "status": status})
    feed["_meta"] = {
        "version": 2,
        "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": ("AUTO-DERIVED for ALL projects from each Turnover Budget workbook "
                   "(sheet 'Budget vs Actual', col-F vendor + col-G notes + col-D "
                   "GREEN booked-actual amount) via MS Graph. Key = "
                   "'<normalized group title>|<cost_code>' — matches the portal's "
                   "actuals overlay so each Budget-vs-Actual row maps 1:1 to its "
                   "invoice line. Amounts are the CODED actuals (system of record), "
                   "not raw PDF line totals."),
        "note": ("Per (job, group, cost_code): the coded invoice line(s) + summed "
                 "total; total reconciles to the portal's overlaid Actual for that "
                 "(group,code). invoice_no/date extracted best-effort from col-G; the "
                 "full note is always kept. PDF webUrl present only where an Expenses "
                 "item_id is known (seeded overrides); Stage 2 fills the rest. No "
                 "fabrication — a (job,code) with no GREEN booked actual gets no entry."),
        "jobs_covered": sorted(covered),
        "jobs_covered_count": len(covered),
        "jobs_resolved_no_actuals": sorted(empty),
        "jobs_unresolved": unresolved,
    }
    return feed


def write_js(feed):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-invoice-ledger.py — do not edit by hand.\n")
        f.write("// ALL-PROJECTS per-(job, group, cost_code) INVOICE LEDGER for the "
                "Budget-vs-Actual Actual drill-down.\n")
        f.write("// Auto-derived from each project's '*Turnover Budget*.xlsm' "
                "(col-F vendor + col-G notes + col-D green actual).\n")
        f.write("// Key shape: window.PF_INVOICE_LEDGER[<job>]['<normGroupTitle>|<costCode>'] "
                "= {invoices:[...], total}.\n")
        f.write("window.PF_INVOICE_LEDGER = ")
        json.dump(feed, f, indent=2)
        f.write(";\n")
    return OUT_JS


def _summary(feed):
    meta = feed["_meta"]
    print(f"\n=== INVOICE LEDGER FEED — {meta['jobs_covered_count']} projects with coded invoices ===")
    for job in sorted(feed.keys()):
        if job == "_meta":
            continue
        keys = feed[job]
        lines = sum(len(v["invoices"]) for v in keys.values())
        tot = sum(v["total"] for v in keys.values())
        print(f"  {job}: {len(keys):>2} coded lines / {lines:>2} invoices  ledger total=${tot:,.2f}")
    print(f"\n  covered: {meta['jobs_covered_count']} | resolved-but-no-booked-actual: "
          f"{len(meta['jobs_resolved_no_actuals'])} | unresolved: {len(meta['jobs_unresolved'])}")


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
    print(f"build-invoice-ledger — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
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
