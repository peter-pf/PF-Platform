#!/usr/bin/env python3
"""
Shared Budget-vs-Actual parser  (project-AGNOSTIC)
==================================================
Extracted from build-budget-actual.py (the POET-only builder) so BOTH the POET
builder and the generalized build-budget-actuals.py driver parse identically.

The parse is the proven FORMULA-GRAPH classifier: two openpyxl loads
(data_only=True for evaluated values + data_only=False for formulas). It
classifies each detail row as:
  - MAJOR CATEGORY : a same-sheet roll-up whose refs are THEMSELVES roll-ups
                     (rollup-of-rollups). Opens a group; its subtotal is NOT
                     added to the leaf sum (it IS the sum of its leaves).
  - SUB-ROLLUP     : =SUM(Cx:Cy) etc. Shown as an indented sub-header. NOT summed.
  - LEAF           : a real cost line (code + description + money). The ONLY rows
                     summed. Budget/Actual read from the evaluated values.

Rules (never fabricate):
  - Variance is RECOMPUTED = Budget - Actual (never trusts the stored E cell).
  - Blanks stay blank (None -> rendered em-dash by the portal).
  - A formula cell with NO cached value (workbook never Excel-saved) reads as
    None -> the caller flags a null grand total rather than inventing a number.

Thread caps are the CALLER's responsibility (set BEFORE importing openpyxl;
solved-box-gotchas ~300 pid limit). This module imports openpyxl lazily inside
parse_budget_actual so a caller that set the caps first is honored.
"""

import io
import re

# Cost-code line rows have a numeric code in col A (e.g. "5051", "5710");
# some cells are typed "=5110" -> normalized.
CODE_RX = re.compile(r"^=?\d{3,4}$")

# A row is a same-sheet ROLL-UP when its budget formula sums/adds OTHER rows of
# THIS sheet (e.g. "=SUM(C56:C61)", "=C63+C68+C71", "=C55"). A LEAF pulls its
# value from another sheet or a literal (e.g. "='OH Calcs'!G31", "=0").
ROLLUP_RX = re.compile(r"^=(SUM\(C\d|C\d+[+\-]|C\d+$)", re.I)
CREF_RX = re.compile(r"C(\d+)")


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
    neg = False
    if s2.startswith("(") and s2.endswith(")"):  # parenthesised negative
        neg = True
        s2 = s2[1:-1]
    try:
        f = float(s2)
        return -f if neg else f
    except ValueError:
        return None


def _round2(x):
    return None if x is None else round(x + 0.0, 2)


def _norm_code(a):
    a = (a or "").strip()
    if a.startswith("="):
        a = a[1:].strip()
    return a


def parse_budget_actual(raw_bytes, sheet_name="Budget vs Actual",
                        default_job="", default_name=""):
    """Parse a Turnover Budget workbook's Budget-vs-Actual sheet from raw bytes.

    Args:
      raw_bytes:   the .xlsm/.xlsx file content (bytes).
      sheet_name:  worksheet name (default "Budget vs Actual").
      default_job / default_name: fallbacks if the sheet header is blank.

    Returns a dict:
      { job, name, location, groups:[{title, rows:[...], subtotal}],
        grand_total:{label,budget,actual,variance},
        source_sheet, has_cached_values }
    Raises ValueError if the sheet is absent.

    NOTE: caller must set thread caps BEFORE this runs (openpyxl imported here).
    """
    import openpyxl  # lazy; caller sets thread caps first
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True, keep_vba=False)
    wbf = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=False, keep_vba=False)
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"sheet '{sheet_name}' not found (have: {wb.sheetnames})")
    ws = wb[sheet_name]
    wsf = wbf[sheet_name]

    def cell(r, c):
        return ws.cell(row=r, column=c).value

    def fmla(r, c):
        v = wsf.cell(row=r, column=c).value
        return str(v) if v is not None else ""

    # ---- header (Name / Job # / Location) ----
    job = _txt(cell(1, 4)) or default_job
    name = _txt(cell(1, 2)) or default_name
    location = _txt(cell(2, 2))
    if location.lower() in ("project location", ""):
        location = ""

    # ---- find the detail header row + the summary band ----
    header_row = None
    for r in range(1, min(ws.max_row, 12) + 1):
        if _txt(cell(r, 1)).lower() == "cost code":
            header_row = r
            break
    if header_row is None:
        header_row = 4

    summary_row = None
    for r in range(header_row + 1, ws.max_row + 1):
        if _txt(cell(r, 3)).lower().startswith("estimating budget"):
            summary_row = r
            break
    detail_end = (summary_row - 1) if summary_row else ws.max_row

    # ---- classify via the FORMULA GRAPH ----
    rows_meta = {}
    for r in range(header_row + 1, detail_end + 1):
        cf = fmla(r, 3).replace(" ", "")
        is_rollup = bool(ROLLUP_RX.match(cf))
        refs = [int(x) for x in CREF_RX.findall(cf)] if cf.startswith("=") else []
        refs = [x for x in refs if header_row < x <= detail_end]
        rows_meta[r] = {"cf": cf, "is_rollup": is_rollup, "refs": refs}

    rollup_rows = {r for r, m in rows_meta.items() if m["is_rollup"]}

    # MAJOR CATEGORY = a rollup row whose refs are ALL themselves rollups.
    major_rows = set()
    for r in rollup_rows:
        child_refs = rows_meta[r]["refs"]
        if child_refs and all(c in rollup_rows for c in child_refs):
            major_rows.add(r)

    groups = []
    cur = None
    had_cached = False  # did we see ANY numeric evaluated value? (Excel-saved check)

    def flush():
        nonlocal cur
        if cur is not None:
            groups.append(cur)
        cur = None

    for r in range(header_row + 1, detail_end + 1):
        a_raw = _txt(cell(r, 1))
        a = _norm_code(a_raw)
        b = _txt(cell(r, 2))
        budget = _num(cell(r, 3))
        actual = _num(cell(r, 4))
        vendor = _txt(cell(r, 6))
        notes = _txt(cell(r, 7))
        is_code = bool(CODE_RX.match(a_raw))
        m = rows_meta[r]
        if budget is not None or actual is not None:
            had_cached = True

        if not a and not b and budget is None and actual is None:
            continue  # spacer

        if r in major_rows:
            flush()
            title = b or a or "(Category)"
            cur = {
                "title": title,
                "rows": [],
                "subtotal": {
                    "budget": _round2(budget),
                    "actual": _round2(actual),
                    "variance": _round2((budget or 0.0) - (actual or 0.0)),
                },
            }
            continue

        if cur is None:
            cur = {"title": "(Uncategorized)", "rows": [],
                   "subtotal": {"budget": None, "actual": None, "variance": None}}

        # SUB-ROLLUP (rollup but not major): sub-header. Not summed.
        if m["is_rollup"]:
            cur["rows"].append({
                "cost_code": a if is_code else "",
                "description": b or a,
                "budget": _round2(budget),
                "actual": _round2(actual),
                "variance": _round2((budget or 0.0) - (actual or 0.0)),
                "vendor": vendor,
                "notes": notes,
                "is_subtotal": True,
            })
            continue

        # LEAF cost line. Skip pure-noise.
        if (budget in (None, 0)) and (actual in (None, 0)) and not b:
            continue
        variance = None
        if budget is not None or actual is not None:
            variance = _round2((budget or 0.0) - (actual or 0.0))
        cur["rows"].append({
            "cost_code": a if is_code else "",
            "description": b,
            "budget": _round2(budget),
            "actual": _round2(actual),
            "variance": variance,
            "vendor": vendor,
            "notes": notes,
            "is_subtotal": False,
        })
    flush()

    groups = [g for g in groups
              if g["rows"] or any(v not in (None, 0) for v in g["subtotal"].values())]

    # ---- grand total from the summary band ("Total Construction Contract") ----
    grand = {"budget": None, "actual": None, "variance": None, "label": ""}
    if summary_row:
        for r in range(summary_row, ws.max_row + 1):
            lbl = _txt(cell(r, 2))
            if lbl.lower().startswith("total construction contract"):
                gb = _num(cell(r, 3))
                ga = _num(cell(r, 4))
                grand = {
                    "label": lbl,
                    "budget": _round2(gb),
                    "actual": _round2(ga),
                    "variance": _round2((gb or 0.0) - (ga or 0.0)),
                }
                break

    return {
        "job": job,
        "name": name,
        "location": location,
        "groups": groups,
        "grand_total": grand,
        "source_sheet": sheet_name,
        "has_cached_values": had_cached,
    }


def leaf_actuals_by_code(record):
    """Flatten a parsed record into { normalized_group_title: { cost_code: actual } }
    for the LEAF rows only (is_subtotal False, has a cost_code, actual not None).
    Used by the portal overlay to place each workbook Actual onto the matching
    template row (match on group-title + cost_code). Also returns a flat
    { cost_code: actual } and the list of leaves with a code but NO actual match
    would be handled by the caller; here we only emit what the workbook HAS."""
    by_group = {}
    flat = {}
    for g in record.get("groups", []):
        gt = _norm_title(g.get("title", ""))
        for row in g.get("rows", []):
            if row.get("is_subtotal"):
                continue
            code = (row.get("cost_code") or "").strip()
            actual = row.get("actual")
            if not code or actual is None:
                continue
            by_group.setdefault(gt, {})[code] = actual
            # flat map: if a code repeats across groups, sum (portal matches by group anyway)
            flat[code] = round((flat.get(code, 0.0) + actual), 2)
    return by_group, flat


def _norm_title(s):
    """Normalize a group title for matching (lowercase, collapse ws, strip punct)."""
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()
