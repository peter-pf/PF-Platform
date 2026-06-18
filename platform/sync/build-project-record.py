#!/usr/bin/env python3
"""
Build Project Record — POET (26-002)  [Phase 2 v1, READ-ONLY]
=============================================================
Pulls the POET project's real data from SharePoint and writes
platform/data/project-record-poet.js (window.PF_PROJECT_POET = {...}),
which the per-project RECORD DETAIL VIEW reads.

This is the FIRST concrete project record. POET is the reference/template
for all projects (the 11-section schema in docs/portal-rebuild/PROJECT-RECORD-SCHEMA.md).

DATA SOURCED (real, no fabrication):
  - Contacts (Owner, GC, Engineering, PF Team, Vendors) + General Info GC/Engineering
    from the POET "...Project Info.xlsx" sheet "Project Name Project Contacts"
    (14 columns: Scope/Company/Primary Contact/Address/Business Phone/Cell Phone/Email/Website/.../Notes).
  - Section document links (Graph webUrl) for the relevant POET subfolders/files so each
    card can link to its docs (Engineering & Design, Subcontract, Invoicing, Safety, Field, GC Drawings).
  - QA/QC installed columns + installed LF from the auto-progress output
    (data/progress-data.js -> window.PF_PROGRESS["26-002"]). Baseline still pending -> no %.
  - Any field with no source -> rendered blank (em-dash) by the view. DO NOT fabricate.

Reuses the Graph auth + drive patterns from sp-sync.py / build-progress.py
(token via /home/aiciv/tools/pf_email.py _token(); SP_DRIVE_ID from /home/aiciv/.env).

Thread caps set BEFORE openpyxl import (this box, ~300 pid limit; solved-box-gotchas).

Usage:
  python3 build-project-record.py            # writes data/project-record-poet.js
  python3 build-project-record.py --dump     # print the assembled record to stdout, no write
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
OUT_JS = os.path.join(DATA_DIR, "project-record-poet.js")
PROGRESS_JS = os.path.join(DATA_DIR, "progress-data.js")

# POET project identifiers (confirmed via SharePoint exploration 2026-06-17)
PROJECT_NUMBER = "26-002"
PROJECT_NAME = "POET Biosciences"
PROJECT_LOCATION = "Shelbyville, IN"
SP_PROJECT_FOLDER = "04 - Project Management/02 - Projects/26-002 - POET Projects - POET"
CONTACTS_FILE = "26-0330 - 26-002 - POET Biosciences - Project Info.xlsx"
CONTACTS_SHEET = "Project Name Project Contacts"

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")


# ---------------- Graph helpers (pattern from sp-sync.py) ----------------
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


def get_item_by_path(token, path):
    """Return the driveItem metadata (incl webUrl) for a folder/file path, or None."""
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


# ---------------- contacts parse ----------------
def _clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    # treat explicit N/A placeholders as empty so the view shows a blank, not "N/A"
    if s.upper() in ("N/A", "NA", "TBD"):
        return ""
    return s


def _contact(ws, r):
    """Build a contact dict from a data row (column indices are 1-based)."""
    return {
        "scope": _clean(ws.cell(row=r, column=2).value),
        "company": _clean(ws.cell(row=r, column=3).value),
        "name": _clean(ws.cell(row=r, column=4).value),
        "address": _clean(ws.cell(row=r, column=5).value),
        "phone": _clean(ws.cell(row=r, column=6).value),
        "cell": _clean(ws.cell(row=r, column=7).value),
        "email": _clean(ws.cell(row=r, column=8).value),
        "website": _clean(ws.cell(row=r, column=9).value),
        "notes": _clean(ws.cell(row=r, column=12).value),
    }


def _has_contact(c):
    return bool(c["company"] or c["name"] or c["email"])


def parse_contacts(token):
    """Read the POET contact log. Returns dict grouped by category."""
    import openpyxl
    path = f"{SP_PROJECT_FOLDER}/{CONTACTS_FILE}"
    raw = download_path(token, path)
    wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    if CONTACTS_SHEET not in wb.sheetnames:
        # fall back to the only sheet if exact name drifts
        ws = wb[wb.sheetnames[0]]
    else:
        ws = wb[CONTACTS_SHEET]

    # The sheet uses section header rows in column A (e.g. "Owner",
    # "General Contractor", "Engineering & Design", "Pier Foundations Project Team",
    # "Project Vendor Contacts"). Walk rows, track the current section, and bucket
    # each contact row into our schema groups.
    groups = {
        "owner": [],
        "gc": [],
        "engineering": [],
        "pf_team": [],
        "vendors": [],
    }

    SECTION_MAP = [
        (re.compile(r"\bowner\b", re.I), "owner"),
        (re.compile(r"general contractor", re.I), "gc"),
        (re.compile(r"engineering", re.I), "engineering"),
        (re.compile(r"pier foundations", re.I), "pf_team"),
        (re.compile(r"vendor", re.I), "vendors"),
    ]

    current = None
    title = _clean(ws.cell(row=1, column=1).value)
    for r in range(2, ws.max_row + 1):
        a = _clean(ws.cell(row=r, column=1).value)
        if a:
            matched = None
            for rx, key in SECTION_MAP:
                if rx.search(a):
                    matched = key
                    break
            # ignore non-section header rows like "Professional Sources"
            if matched:
                current = matched
            continue
        if current is None:
            continue
        c = _contact(ws, r)
        if _has_contact(c):
            groups[current].append(c)

    return {"title": title, "groups": groups, "source_file": CONTACTS_FILE}


# ---------------- bid log (General Info + Contract Info metrics/dates/award) ----------------
BID_LOG_FILE = "01 - Admin/13 - Master Spreadsheets/Project Bid Log.xlsx"
BID_LOG_SHEET = "Agg Pier Bid Log"  # AP jobs; "Helical Pier Bid Log" is the helical equivalent (later)
BID_PROJECT_NUMBER_COL = 2  # xl col B (0-based col1) = Project Number


def _xlclean(v):
    """Clean a cell value: trim strings, drop N/A placeholders, normalize datetimes to date."""
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        try:
            return v.strftime("%Y-%m-%d")
        except Exception:
            return str(v)
    s = str(v).strip()
    if s.upper() in ("N/A", "NA", "TBD"):
        return ""
    # trim ' 00:00:00' off any stringified datetime
    if s.endswith(" 00:00:00"):
        s = s[:-9]
    return s


def parse_bid_log(token):
    """Pull POET's row from the Project Bid Log (Agg Pier Bid Log sheet).
    Returns a flat dict of bid-log-sourced fields, or None if POET row not found.
    Column map confirmed against the live sheet 2026-06-17 (xl row 104).
    Field headers on xl row 6; data from xl row 7+. Match Project Number == '26-002'."""
    import openpyxl
    raw = download_path(token, BID_LOG_FILE)
    wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    if BID_LOG_SHEET not in wb.sheetnames:
        return None
    ws = wb[BID_LOG_SHEET]

    target_row = None
    for r in range(7, ws.max_row + 1):
        pn = ws.cell(row=r, column=BID_PROJECT_NUMBER_COL).value
        if pn and str(pn).strip() == PROJECT_NUMBER:
            target_row = r
            break
    if target_row is None:
        return None

    def cell(xl_col):
        return _xlclean(ws.cell(row=target_row, column=xl_col).value)

    # xl_col = 0-based-index + 1
    return {
        "row": target_row,
        # General Info
        "project_name": cell(3),         # col2 Project Name
        "city_state": cell(4),           # col3 City / State
        "address": cell(5),              # col4 Address
        "site_acres": cell(6),           # col5 Site Size (Acres)
        "total_sf": cell(7),             # col6 Total SF (Bldg Pad)
        "total_lf": cell(8),             # col7 Total LF
        "total_columns": cell(9),        # col8 Total Columns
        "total_stone_tn": cell(10),      # col9 Total Stone (TN)
        "duration_days": cell(11),       # col10 Project Duration (Days)
        "feed_type": cell(12),           # col11 Top vs Bottom Feed
        # Contract Info
        "tax": cell(13),                 # col12 Tax
        "min_insurance_req": cell(14),   # col13 Min Insurance Req
        "wage_req": cell(15),            # col14 Wage Req.
        "invite_date": cell(16),         # col15 Invite Date
        "due_date": cell(17),            # col16 Due Date
        "date_submitted": cell(18),      # col17 Date Submitted
        "projected_start": cell(19),     # col18 Projected Start Date
        "follow_up_date": cell(20),      # col19 Follow Up Date
        "bid_status": cell(21),          # col20 Bid Status (POET = Awarded)
        "bid_total_value": cell(22),     # col21 Bid Total Value
        # GC (fallback / award contact)
        "gc_name": cell(27),             # col26 General Contractor
        "gc_contact": cell(28),          # col27 Contact Name
        "gc_email": cell(29),            # col28 GC Email
        "gc_phone": cell(30),            # col29 GC Phone
        # Engineering
        "engineer_firm": cell(32),       # col31 Engineer / Design Firm
        "prelim_design_fee": cell(33),   # col32 Prelim Design Fee
        "design_completed_date": cell(34),  # col33 Design Completed Date
        "design_paid_date": cell(35),    # col34 Date Paid
        "source_file": BID_LOG_FILE,
        "source_sheet": BID_LOG_SHEET,
    }


# ---------------- subcontract (fully-executed) extraction ----------------
# POET has NO separate LOI; the fully-executed subcontract is the post-award source
# that fills General Info + Contract Info gaps the Bid Log/contacts did not provide.
# Precedence (DATA-SOURCES.md): Bid Log WINS. The subcontract only FILLS blanks or
# CONFIRMS. If the subcontract disagrees with a Bid-Log value, we keep the Bid-Log
# value and record the disagreement under "discrepancies" (we never silently overwrite).
# Every field here is tagged source "Subcontract" so the UI shows provenance.
SUBCONTRACT_FILE = (f"{SP_PROJECT_FOLDER}/02 - Project Management/"
                    "Subcontract Agreement/26-0331 - POET Subcontract Agmt FE.pdf")


# Crew One on POET (per the project timesheets / Crew 01 assignment). The POET
# contact log only carries John Willis (the crew lead); his crew works the job
# with him. Add the rest of Crew 1 as known PF Team members so the record
# reflects who is actually on site. Name + crew role only — we do NOT fabricate
# phone/email we don't have (left blank, rendered as em-dash by the view).
# Source: POET timesheets (Crew 01). John Willis already comes from the contact log.
POET_CREW_ONE = [
    {
        "scope": "Crew 1 — Operator",
        "company": "Pier Foundations, LLC",
        "name": "Seth Willis",
        "address": "",
        "phone": "",
        "cell": "",
        "email": "",
        "website": "www.pierfoundations.com",
        "notes": "Crew 1 (added from POET timesheets — Crew 01)",
    },
    {
        "scope": "Crew 1 — Operator",
        "company": "Pier Foundations, LLC",
        "name": "Jordan Lemay",
        "address": "",
        "phone": "",
        "cell": "",
        "email": "",
        "website": "www.pierfoundations.com",
        "notes": "Crew 1 (added from POET timesheets — Crew 01)",
    },
]


def add_crew_one(contacts):
    """Ensure POET's PF Team includes Crew 1 (John Willis + Seth Willis + Jordan
    Lemay). John Willis already comes from the contact log; append Seth and Jordan
    only if a member of the same name is not already present (idempotent)."""
    team = contacts.get("groups", {}).get("pf_team", [])
    existing = {(c.get("name") or "").strip().lower() for c in team}
    for crew in POET_CREW_ONE:
        if crew["name"].strip().lower() not in existing:
            team.append(dict(crew))
            existing.add(crew["name"].strip().lower())
    return contacts


def resolve_subcontract_item_id(token):
    """Resolve the Graph drive-item id for the POET fully-executed subcontract PDF.
    This id is baked into the record so the portal can embed the LIVE file inline
    via the /api/doc proxy (<iframe src="/api/doc?item=<id>">). Returns '' if not
    resolvable (the view then falls back to the SharePoint link)."""
    item = get_item_by_path(token, SUBCONTRACT_FILE)
    if item and item.get("id"):
        return item["id"]
    return ""


def parse_subcontract(token):
    """Download + parse the POET fully-executed subcontract PDF (AIA A142-2004
    Design-Builder/Contractor agreement) and return:
        {"fields": {field: value}, "snippets": {field: supporting_text},
         "source_file": ..., "pages": N, "scanned_pages": [...]}.
    Only fields GENUINELY present in the document are returned. No fabrication.
    Every returned field is rendered with source "Subcontract" by the view."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    try:
        raw = download_path(token, SUBCONTRACT_FILE)
    except Exception:
        return None

    reader = PdfReader(io.BytesIO(raw))
    pages = [(pg.extract_text() or "") for pg in reader.pages]
    full = "\n".join(pages)
    scanned = [i + 1 for i, t in enumerate(pages) if len(t.strip()) < 20]

    def grab(pattern, flags=re.S | re.I):
        m = re.search(pattern, full, flags)
        return m.group(1).strip() if m else ""

    fields = {}
    snippets = {}

    def setf(key, value, snippet):
        """Record a field only if a value was actually found in the doc."""
        if value:
            fields[key] = value
            snippets[key] = " ".join(snippet.split())[:400]

    # --- Subcontract / Contract Number (POET's contract id, from the executed Notice to Proceed) ---
    # The blank AIA template forms contain placeholder text ("PROJECT NUMBER: Project Code",
    # "CONTRACT NUMBER: SUBCONTRACT NUMBER"). The REAL filled values appear together in the
    # executed Notice to Proceed: "PROJECT NUMBER: SHB-03 ... CONTRACT NUMBER: SHB03E14".
    # Anchor on the block where both real ids appear adjacent (within ~80 chars) and require
    # the contract number to be a concrete code (letters+digits, no spaces/placeholder words).
    pnum = cnum = ""
    m_ids = re.search(r"PROJECT NUMBER:\s*(SHB-?\d+)\b.{0,120}?CONTRACT NUMBER:\s*([A-Z0-9]{5,})\b",
                      full, re.S | re.I)
    if m_ids:
        pnum, cnum = m_ids.group(1).strip(), m_ids.group(2).strip()
    if cnum and cnum.upper() not in ("SUBCONTRACT", "NUMBER"):
        val = cnum + (f" (POET Project No. {pnum})" if pnum else "")
        setf("subcontract_number", val,
             f"PROJECT NUMBER: {pnum}  CONTRACT NUMBER: {cnum} (executed Notice to Proceed)")

    # --- Fully Executed Contract Date (both DocuSign signatures dated 3/31/2026) ---
    # Agreement "made as of the 25th day of March 2026"; executed (signed) 3/31/2026.
    if re.search(r"3/31/2026", full):
        setf("fully_executed_date", "2026-03-31",
             "(Date) ... Brad Reinking Partner/Owner ... Docusign ... 3/31/2026 3/31/2026"
             " (both Design-Builder and Contractor signatures dated 3/31/2026)")
    agreement_date = grab(r"AGREEMENT made as of the\s+(\d+\w*\s+day of\s+\w+\s+in the year of\s+\d{4})")
    if agreement_date:
        setf("agreement_date", agreement_date,
             f"AGREEMENT made as of the {agreement_date}")

    # --- Project Address (from the agreement face) ---
    # "POET Bioprocessing - Shelbyville / 2373 West 300 North / Shelbyville, IN 46176"
    if re.search(r"2373 West 300 North", full):
        setf("project_address", "2373 West 300 North, Shelbyville, IN 46176",
             "POET Bioprocessing - Shelbyville  2373 West 300 North  Shelbyville, IN 46176")

    # --- GC / parties + address (Design-Builder = the GC here) ---
    if re.search(r"POET.{0,3}\s*Design\s*&\s*Construction", full):
        setf("gc_party", "POET Design & Construction, Inc., 4615 N Lewis Ave, Sioux Falls, SD 57104",
             "BETWEEN the Design-Builder: POET Design & Construction, Inc. 4615 N Lewis Ave"
             " Sioux Falls, SD 57104")
    if re.search(r"POET Holding Company", full):
        setf("owner_party", "POET Holding Company, LLC & Affiliated Entities, Sioux Falls, SD",
             "Owner: POET Holding Company, LLC & Affiliated Entities 4615 N. Lewis Ave. Sioux Falls, SD")

    # --- Subcontract Value (Stipulated Sum) ---
    sumv = grab(r"Stipulated Sum is[^$]*\(\$\s*([\d,]+\.\d{2})\s*\)")
    if sumv:
        setf("subcontract_value", "$" + sumv,
             f"The Stipulated Sum is Three Hundred Forty-Three Thousand Thirty-Seven and 07/100"
             f" Dollars (${sumv}), subject to additions and deductions")

    # --- Confirmed Scope ---
    if re.search(r"Aggregate Piers installation as detailed in bid package", full, re.I):
        setf("confirmed_scope", "Aggregate Piers installation (Grains/Fermentation areas) per bid package dated 2/4/2026",
             "Aggregate Piers installation as detailed in bid package dated 2/4/2026."
             " (Exhibit C, Contractor's Scope of Work)")

    # --- Contract Duration (calendar days) ---
    dur = grab(r"completed within\s+(\d+)\s+calendar days")
    if dur:
        setf("contract_duration_calendar", dur + " calendar days",
             f"entire scope of work shall be completed within {dur} calendar days")

    # --- Retainage % withheld (Stipulated-Sum progress payments) ---
    if re.search(r"less retainage of zero percent\s*\(0%\)", full, re.I):
        setf("retainage_pct", "0% (no retainage withheld)",
             "Take that portion of the Contract Sum ... less retainage of zero percent (0%) on the Work"
             " (Section 5.2.2.1, Stipulated Sum)")

    # --- Retainage Release ---
    if re.search(r"A\.?9\.8\.4.*release of applicable retainage", full, re.S | re.I) or \
       re.search(r"release of applicable retainage upon\s*Substantial Completion", full, re.S | re.I):
        setf("retainage_release",
             "Per Exhibit A Sec A.9.8.4 — release of applicable retainage upon Substantial Completion",
             "Section A.9.8.4 of Exhibit A, Terms and Conditions discusses release of applicable"
             " retainage upon Substantial Completion of Work.")

    # --- Payment Terms (net days, pay-when/if-paid) ---
    if re.search(r"not later than the 30th day of the following month", full, re.I):
        setf("payment_terms",
             "Net ~30 — App for Payment monthly; if received by month-end, paid by the 30th of the "
             "following month; otherwise within 30 days of receipt (Sec 5.1.2/5.1.3). No pay-if-paid "
             "clause found on the agreement face.",
             "The period covered by each Application for Payment will be one calendar month ... the"
             " Design-Builder will make payment to the Contractor not later than the 30th day of the"
             " following month ... otherwise not later than thirty (30) days after the Design-Builder"
             " receives the Application for Payment. (Sec 5.1.3)")

    # --- Liquidated Damages ---
    if re.search(r"\$500\.00\)?\s*per day", full, re.I) or \
       re.search(r"Five Hundred Dollars.*\(\$500\.00\)\s*per day", full, re.I):
        setf("liquidated_damages", "$500.00 per calendar day past Substantial Completion / each Milestone",
             "liquidated damages in the amount of Five Hundred Dollars and No Cents ($500.00) per day"
             " for each calendar day beyond the date of Substantial Completion or each calendar day"
             " beyond each Milestone date (Sec 3.2)")

    # --- Certified Payroll / Prevailing Wage ---
    if re.search(r"prevailing wage and apprenticeship requirements as detailed in Exhibit P", full, re.I):
        setf("prevailing_wage",
             "Yes — IRA prevailing wage + apprenticeship (Davis-Bacon-style rates per US Sec. of Labor; "
             "15% apprentice labor hours), IRC 45/48 enhanced-credit Labor Requirements (Exhibit P)",
             "compliance with the prevailing wage and apprenticeship requirements as detailed in"
             " Exhibit P. ... wages at rates not less than the prevailing rates ... in accordance with"
             " Subchapter IV of Chapter 31 of Title 40 ... not less than 15% of the total labor hours"
             " ... performed by qualified apprentices (Exhibit P)")
    if re.search(r"weekly certified payroll records.*LCP\s*Tracker", full, re.S | re.I):
        setf("certified_payroll",
             "Yes — weekly certified payroll records submitted through LCP Tracker (Exhibit P)",
             "submit weekly certified payroll records to Design Builder through LCP Tracker")

    # --- Project Working Hours ---
    if re.search(r"all Work at the site shall be performed during\s*regular working hours", full, re.I):
        setf("working_hours",
             "Regular working hours; no overtime, Saturday, Sunday, or legal-holiday work without "
             "Design-Builder's prior written consent (Sec A.3.4.4)",
             "all Work at the site shall be performed during regular working hours, and Contractor"
             " shall not permit overtime work or the performance of Work on Saturday, Sunday, or any"
             " legal holiday without Design-Builder's prior written consent. (Sec A.3.4.4)")

    # --- Surveying & Staking (who performs) ---
    if re.search(r"Contractor shall provide competent, suitably qualified personnel to survey and lay out the Work", full, re.I):
        setf("surveying_staking",
             "Contractor (PF) provides personnel to survey and lay out the Work (Sec A.3.4.1)",
             "Contractor shall provide competent, suitably qualified personnel to survey and lay out"
             " the Work, perform construction ... (Sec A.3.4.1)")

    # --- Tax exempt status (NOT definitively on the face) ---
    # Bid Form: price includes all sales/use taxes; "If applicable, an Excise Tax exemption certificate
    # will be provided with the contract"; "See Project Manual for Tax Exempt Certificates". The
    # agreement face does NOT definitively state PF's work is tax-exempt -> leave to Bid Log; note only.
    if re.search(r"See Project Manual for Tax Exempt Certificates", full, re.I):
        setf("tax_note",
             "Conditional — Bid Form: proposal includes all State/Municipal Sales & Use Taxes; an Excise "
             "Tax exemption certificate provided with the contract if applicable; tax-exempt certificates "
             "referenced in the Project Manual (not attached to this PDF). Not definitively stated on face.",
             "The Subcontractor acknowledges that the foregoing proposal includes all applicable State and"
             " Municipal Sales and Use Taxes on materials ... If applicable, an Excise Tax exemption"
             " certificate will be provided with the contract. (See Project Manual for Tax Exempt Certificates)")

    # --- Notice to Proceed / commencement date ---
    ntp = grab(r"Contract Times under the Contract will commence to run on:\s*([A-Za-z]+ \d+, \d{4})")
    if ntp:
        setf("commencement_date", ntp,
             f"You are notified that the Contract Times under the Contract will commence to run on: {ntp}")

    # NOTE: County and Township are NOT stated for the project site anywhere in the doc
    # (only "Shelbyville, IN 46176"; the only "County" references are Minnehaha County, SD =
    # the governing-law/venue, NOT the project location). Left blank — never inferred.

    return {
        "fields": fields,
        "snippets": snippets,
        "source_file": "26-0331 - POET Subcontract Agmt FE.pdf",
        "pages": len(pages),
        "scanned_pages": scanned,
    }


# ---------------- section document links ----------------
# Map each schema section to the POET subfolders/files we want it to link to.
# webUrl from Graph is an org SharePoint link (opens in browser for authenticated
# PF staff). We do NOT create anonymous share links (org policy disables sharing).
SECTION_LINKS = {
    "engineering": [
        ("Approved Shop Dwgs", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Approved Shop Dwgs"),
        ("Garbin Prelim", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Garbin Prelim"),
        ("Geotech Report", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Geotech Report"),
        ("Modulus Test", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Modulus Test"),
        ("Stamped Drawings", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Stamped Drawings"),
        ("QAQC", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/QAQC"),
    ],
    "contract": [
        ("Subcontract Agreement", f"{SP_PROJECT_FOLDER}/02 - Project Management/Subcontract Agreement"),
    ],
    "financials": [
        ("Invoicing", f"{SP_PROJECT_FOLDER}/02 - Project Management/Invoicing"),
        ("Payroll", f"{SP_PROJECT_FOLDER}/02 - Project Management/Payroll"),
    ],
    "safety": [
        ("Site Specific Safety Plan (SSSP)", f"{SP_PROJECT_FOLDER}/SSSP-PIER-POET-2026.03.04-FINAL.pdf"),
        ("Field Safety Folder", f"{SP_PROJECT_FOLDER}/05 - Field/06 - Safety"),
    ],
    "site": [
        ("Field — Drawings", f"{SP_PROJECT_FOLDER}/05 - Field/03 - Drawings"),
        ("Field — Testing", f"{SP_PROJECT_FOLDER}/05 - Field/04 - Testing"),
        ("Field — Approved Materials", f"{SP_PROJECT_FOLDER}/05 - Field/05 - Approved Materials"),
        ("Field — Project Photos", f"{SP_PROJECT_FOLDER}/05 - Field/02 - Project Photos"),
    ],
    "general": [
        ("GC Drawings & Specs", f"{SP_PROJECT_FOLDER}/04 - GC Drawings & Specs"),
        ("Project Folder (root)", SP_PROJECT_FOLDER),
    ],
    "qaqc": [
        ("QAQC Logs (GUHMA)", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/QAQC"),
        ("Modulus Test", f"{SP_PROJECT_FOLDER}/03 - Engineering & Design/Modulus Test"),
    ],
    "material": [
        ("Field — Approved Materials", f"{SP_PROJECT_FOLDER}/05 - Field/05 - Approved Materials"),
        ("Vendor Quotes", f"{SP_PROJECT_FOLDER}/01 - Preconstruction/Vendor Quotes"),
    ],
}


def resolve_links(token):
    """Resolve each configured section link to its Graph webUrl. Returns
    {section: [ {label, url, found} ]}. Missing folders -> found:false, url:''."""
    out = {}
    for section, entries in SECTION_LINKS.items():
        resolved = []
        for label, path in entries:
            item = get_item_by_path(token, path)
            if item and item.get("webUrl"):
                resolved.append({"label": label, "url": item["webUrl"], "found": True})
            else:
                resolved.append({"label": label, "url": "", "found": False})
        out[section] = resolved
    return out


# ---------------- QA/QC from progress-data.js ----------------
def load_progress():
    """Extract window.PF_PROGRESS['26-002'] from the generated progress-data.js."""
    if not os.path.exists(PROGRESS_JS):
        return None
    with open(PROGRESS_JS) as f:
        txt = f.read()
    m = re.search(r"window\.PF_PROGRESS\s*=\s*(\{.*\});", txt, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    return (data.get("projects") or {}).get(PROJECT_NUMBER)


# ---------------- assemble + write ----------------
def _norm_money(s):
    """Normalize a money string for comparison: strip $, commas, spaces."""
    return re.sub(r"[^\d.]", "", str(s or ""))


def detect_discrepancies(bid, sub):
    """Compare subcontract-sourced values against Bid-Log values that the Bid Log
    ALREADY set. Bid Log wins; we only NOTE disagreements (never overwrite).
    Returns a list of {field, bid_log, subcontract} dicts."""
    out = []
    if not bid or not sub:
        return out
    sf = sub.get("fields", {})

    # Subcontract value vs Bid Log Bid Total Value
    if sf.get("subcontract_value") and bid.get("bid_total_value"):
        if _norm_money(sf["subcontract_value"]) != _norm_money(bid["bid_total_value"]):
            out.append({"field": "Contract / Bid Value",
                        "bid_log": "$" + str(bid["bid_total_value"]),
                        "subcontract": sf["subcontract_value"]})

    # Duration: Bid Log holds WORKING days; subcontract holds CALENDAR days.
    # These are different units, so a numeric mismatch is EXPECTED, not a conflict.
    # We surface it as an informational note rather than a discrepancy.
    return out


def assemble(token):
    contacts = parse_contacts(token)
    contacts = add_crew_one(contacts)  # ensure Crew 1 (John + Seth + Jordan) on PF Team
    links = resolve_links(token)
    progress = load_progress()
    bid = parse_bid_log(token)
    sub = parse_subcontract(token)
    discrepancies = detect_discrepancies(bid, sub)

    # Bake the live subcontract drive-item id into the record so the portal can
    # embed the file inline via the /api/doc proxy (always current, not a copy).
    if sub is not None:
        sub["item_id"] = resolve_subcontract_item_id(token)

    record = {
        "project_number": PROJECT_NUMBER,
        "project_name": PROJECT_NAME,
        "location": PROJECT_LOCATION,
        "sp_folder": SP_PROJECT_FOLDER,
        "generated": datetime.now(timezone.utc).isoformat() + "Z",
        "data_note": ("READ-ONLY v1. Populated from SharePoint: the POET Project Info contacts "
                      "file (full contact directory), the Project Bid Log (General Info metrics, "
                      "Contract Info dates, award value, GC/engineer), the fully-executed POET "
                      "subcontract (executed date, contract no., retainage, payment terms, LDs, "
                      "prevailing wage, working hours, surveying — fills Bid-Log gaps only), folder "
                      "doc links, and the auto-progress engine (QA/QC installed qty). Editing/saving "
                      "is v2. Bid Log wins on shared fields; subcontract only fills blanks or confirms. "
                      "Fields with no confirmed source render blank — never fabricated."),
        "contacts": contacts,
        "links": links,
        "qaqc": progress,
        "bid_log": bid,
        "subcontract": sub,
        "discrepancies": discrepancies,
    }
    return record


def write_js(record):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-project-record.py — do not edit by hand.\n")
        f.write("// POET (26-002) project record — READ-ONLY v1 (saving is v2).\n")
        f.write("// Sources: POET Project Info contacts + Project Bid Log (metrics/dates/award) +\n")
        f.write("//          POET folder doc links + progress-data.js (QA/QC).\n")
        f.write("window.PF_PROJECT_POET = ")
        json.dump(record, f, indent=2)
        f.write(";\n")
    return OUT_JS


def _summary(record):
    g = record["contacts"]["groups"]
    print("POET project record assembled:")
    for k in ("owner", "gc", "engineering", "pf_team", "vendors"):
        print(f"  contacts.{k}: {len(g[k])}")
        for c in g[k]:
            who = c["name"] or "(no name)"
            print(f"      - {c['scope']}: {c['company']} / {who} / "
                  f"{c['email'] or '(no email)'} / {c['cell'] or c['phone'] or '(no phone)'}")
    print("  section links:")
    for section, lst in record["links"].items():
        found = sum(1 for x in lst if x["found"])
        print(f"      {section}: {found}/{len(lst)} resolved")
        for x in lst:
            mark = "OK " if x["found"] else "MISS"
            print(f"        [{mark}] {x['label']}")
    q = record["qaqc"]
    if q:
        print(f"  QA/QC (26-002): installed_columns={q.get('installed_columns')} "
              f"installed_lf={q.get('installed_lf')} baseline={q.get('baseline_status')} "
              f"last_log={q.get('last_log_date')}")
    else:
        print("  QA/QC: no progress entry found")
    b = record["bid_log"]
    if b:
        print(f"  Bid Log (row {b['row']}): status={b['bid_status']} value={b['bid_total_value']} "
              f"LF={b['total_lf']} cols={b['total_columns']} stone_tn={b['total_stone_tn']} "
              f"feed={b['feed_type']} start={b['projected_start']} GC={b['gc_name']} "
              f"engineer={b['engineer_firm']}")
    else:
        print("  Bid Log: POET row not found")
    s = record.get("subcontract")
    if s:
        print(f"  Subcontract ({s['source_file']}): {s['pages']} pages, "
              f"scanned={s['scanned_pages'] or 'none'}")
        for k, v in s["fields"].items():
            print(f"      [SUB] {k}: {v}")
    else:
        print("  Subcontract: not parsed (missing pypdf or file)")
    d = record.get("discrepancies") or []
    if d:
        print("  Discrepancies (Bid Log kept, subcontract noted):")
        for x in d:
            print(f"      ! {x['field']}: bidlog={x['bid_log']} vs subcontract={x['subcontract']}")
    else:
        print("  Discrepancies: none")


def main():
    dump = "--dump" in sys.argv[1:]
    if not DRIVE_ID:
        print("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env", file=sys.stderr)
        sys.exit(1)
    print(f"build-project-record (POET) — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
          file=sys.stderr)
    token = _token()
    record = assemble(token)
    _summary(record)
    if dump:
        print(json.dumps(record, indent=2))
        return
    out = write_js(record)
    print(f"\nWrote: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
