# SRS — Metadata Sheet as the Single Source per Project (PM / Financial / Contract / Engineering)

**Module:** metadata-projectmgmt
**Status:** STEP 1 (columns) PENDING — workbook locked (HTTP 423) at write time; STEP 2 read-wiring READY; STEP 3 write-back pattern documented.
**Scope:** TEST WORKBOOKS ONLY (`PETER TEST - Bidding Metadata.xlsx`). Production untouched.
**Date:** 2026-07-18

---

## 1. Purpose

Derek wants ONE source per project so the portal (office and field logins) reads a
single flat sheet instead of a separate Project Master workbook. This extends the flat
`Agg Pier Metadata` tab with the project-management, financial, contract, and
engineering fields, folding in the data that used to live in
`PETER TEST - PF Project Master.xlsx`, then wires the portal to READ them.

## 2. Sources

| Source | Item | Shape | What it feeds |
|---|---|---|---|
| `PETER TEST - Bidding Metadata.xlsx` — tab `Agg Pier Metadata` | `016ISVH66XMEC5VHR24BD2SER5BIH2PMJL` | row 1 = category bands, row 2 = field headers, rows 3+ = one project/row | the sheet being EXTENDED + the portal READ source |
| `PETER TEST - PF Project Master.xlsx` — tab `Project Dashboard` | `016ISVH63AII5Q2GCARZFLRNWRE4TC4XCS` | **TRANSPOSED**: row 2 = project numbers across columns; col B = attribute labels down the rows | General Info, LOI/NOI Date, Prelim Completed By |
| same — tabs `2026 / 2025 WIP & Completed Projects` | same item | header row 3, one project per row | Financials, Contract Status, GC contacts, Scheduled Completion |

Drive (all): `b!ogeNU-bvwUevFyKNf9PvlnJJzsEhnrxMv1zdx5x3u8NS2DUHVpM_Q7YocCSzzqgA`.

## 3. Columns Added (STEP 1)

**42 new columns appended after the existing 45 (cols AT..CI), in 6 new category bands.**
Appended (not inserted) so NO existing column index shifts — the price FORMULAS
(`=Z3/I3` …) and every data-validation range (`E3:E43` …) stay valid. Existing 45
columns, data, dropdowns, formats, and formulas are UNTOUCHED.

| Band | Columns (format) | Source |
|---|---|---|
| **CONTRACT** | Contract Status (text), Subcontract Value ($), LOI / NOI Date (date), Fully Executed Contract Date (date — *structural, blank*), Prelim Completed By (text), Work % Complete (%), Scheduled Completion (date) | WIP + Dashboard |
| **FINANCIALS** | Paid ($), Unpaid ($), Projected PA #1 Income ($), Invoice Due By Date (text — free-text "20th"), Retain % (%), Retainage Amount ($), Retainage Submitted (text), Retain Paid (Yes/No dropdown) | WIP |
| **PROJECT TEAM** | Project Manager, Field Operation Mgr, Operator 2, Operator 3, Equipment, Precon / Estimating (all text) | Dashboard |
| **SITE** | County, Township, Project Scope, Column Diameter (text), Estimated Spoils (CY) (num, 1-dec) | Dashboard |
| **GC CONTACTS** | GC Address (text), GC PM Name (text), GC PM Phone (phone), GC PM Email (text), GC Super Name (text), GC Super Phone (phone), GC Super Email (text) | WIP |
| **ENG / SUBMITTALS** | Release Date to Start Submittals, Items Needed for Submittal Completion, Submittals Received from Engineer, Submittals Sent to GC, Submittals Approved & Returned, Submittals & Shop Dwgs Saved, Submittals & Shop Dwgs Sent to GC, Shop Drawings Ready for Pickup, Docs Sent to Surveyor / Layout (dates/text — *all structural, blank*) | none (see §5) |

### Columns SKIPPED as duplicates (already in the sheet)
Project Name, Address, City / State, Total LF, Total Columns, Total Stone (TN) (≈Estimated
Stone), Top vs. Bottom Feed, General Contractor, Projected Start Date, Invite Date, Due
Date, Project Duration (Days) (≈Contract Duration), Award Date, GC Email, GC Phone,
Bidding GCs, Awarded GC. These were deliberately excluded from the add list.

### Formatting conventions applied (mirrors the sheet)
- Dollars: `$#,##0.00` · Dates: `m/d/yyyy` · Phones: `(###) ###-####` · Quantities: `#,##0.0`
  · Percentages: `0%` · Retain Paid: `Yes/No` list dropdown.
- Category band (row 1): solid fill, white bold 10pt, center/center, merged.
- Field header (row 2): fill `EEF2F6`, bold `1c1f23` 9pt, center/center, wrap, thin border.

## 4. Population (by Project Number match)

Matched metadata `Project Number` ↔ Dashboard column header ↔ WIP `Project #`.
**22 projects** received PM data: 25-014, 25-015, 25-026, 25-027, 26-001..26-018.
Bidding-stage rows without a project number are left BLANK (expected — most of the sheet).
NOTHING is fabricated; blank where the source is absent.

## 5. Grounding note — Engineering/Submittals dates are BLANK on purpose

The Project Master `Project Dashboard` Contract-Info (rows 27-40) and Engineering
(rows 41-56) sections do NOT hold dates for most fields. They hold **responsibility
labels** — e.g. Bid Invite Date = "FA Wilhelm", Fully Executed Contract Date = "Flaherty
& Collins", Submittals Received from Engineering = "Garbin", Docs Sent to Surveyor =
"MLS", Sent to Print = "FedEx". Writing those into date columns would FABRICATE dates.
Therefore `Fully Executed Contract Date` and all nine ENG/SUBMITTALS columns are added as
**structure only (blank)**, to be populated when a real date source exists. Only
`LOI / NOI Date` and `Prelim Completed By` carry trustworthy Dashboard values.

## 6. Lock behavior (STEP 1 outcome)

The write is a Graph `PUT` of the whole workbook. If the workbook is open, Graph returns
**HTTP 423**; the script fails closed (writes nothing) and exits 42 with a clear
"PENDING until closed" message. On 2026-07-18 the write hit 423 (Derek had it open), so
STEP 1 is PENDING — re-run `sync/add-projectmgmt-columns.py` once the workbook is closed.

## 7. Read wiring (STEP 2)

`sync/build-precon-pipeline.py` builds `ap` from the metadata sheet **generically**:
`meta_ordered_headers()` iterates EVERY row-2 header, and `columns.ap` = every emitted
key typed by `column_type()`. So the 42 new columns flow through into each project's
`fields` dict AND into `columns.ap` automatically once they exist in the sheet — no
per-column code. The wide table (`PF_PRECON.columns[disc]`) and detail cards render any
column generically, so added columns are additive/safe (no `index.html` change).

`column_type()` was extended for the folded-in columns (typed by EXACT header to avoid
false hits): dollars → `money`; `Work % Complete` / `Retain %` / `Estimated Spoils (CY)`
→ `num`; real date columns whose header lacks the word "date" (Scheduled Completion,
Submittals *…*, Docs Sent to Surveyor / Layout) → `date`; `Invoice Due By Date` forced to
`text` (source is "20th", not a date). `fmt_cell` gained a `num` path (`fmt_num`:
`%`-headers render as whole-percent, quantities to 1 decimal). The renderer already
supports `num` (`wideColSortKind`: `num` sorts as money).

**Regeneration + deploy of `data/precon-pipeline.js` with the new columns is PENDING on
STEP 1** (the builder reads the live sheet; until the 42 columns are written, the payload
is unchanged). Deploy via `./deploy.sh --docs-done` (data sync) with the fork-guard, then
verify canonical env=production + root HTTP 401.

## 8. Write-back foundation (STEP 3)

See SOW §"Field-level write-back". The existing `tools/writeback_stage.py` (portal Stage
move → metadata `Stage` cell) generalizes to any of the new fields: match the row by
Project Number (or the client's `ng_` hash), write the ONE mapped cell, skip on 423.

## 9. Non-goals

- No production workbook changes; no switch away from TEST.
- Portal EDIT surfaces for the new fields are a LATER phase (this lays the read + the
  write-back pattern only).
- No fabricated dates for the responsibility-label fields.
