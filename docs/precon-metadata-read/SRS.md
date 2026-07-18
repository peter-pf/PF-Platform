# SRS — Precon Pipeline: ap Reads Stage from the FLAT Metadata Sheet

**Status:** IMPLEMENTED + DEPLOYED (2026-07-18) — TEST WORKBOOKS ONLY
**Module:** `platform/sync/build-precon-pipeline.py` → `platform/data/precon-pipeline.js`
**Scope:** ap (Agg Pier) discipline only. hp (Helical) is UNCHANGED.

## Purpose

Rewire the Agg Pier (`ap`) half of the preconstruction pipeline so it reads from the
new FLAT metadata sheet and buckets each project by the **Stage COLUMN** (one project
per row), replacing the old section-heading logic. This is the "portal reads Stage
from the metadata sheet" half of the write-back project (the other half writes Stage
back into that sheet). Helical (`hp`) continues to read the section-based Helical bid
log exactly as before.

## Source (TEST — do not point at production)

- File: **PETER TEST - Bidding Metadata.xlsx**
- Drive: `b!ogeNU-bvwUevFyKNf9PvlnJJzsEhnrxMv1zdx5x3u8NS2DUHVpM_Q7YocCSzzqgA`
- Item: `016ISVH66XMEC5VHR24BD2SER5BIH2PMJL`
- Tab: `Agg Pier Metadata`
- Layout: row 1 = colored CATEGORY bands (ignored), **row 2 = field headers**,
  **rows 3+ = one project per row**. Read with openpyxl `data_only=True`.
- 45 columns.

hp source unchanged: `PETER TEST - Project Bid Log.xlsx`
(item `016ISVH63P6E5TKIHTZZHIVNYR2VMJMP62`, "Helical Pier Bid Log" sheet). TEST id
preserved as-is; the LIVE bid-log id remains in the restore comment untouched.

## Functional Requirements

1. **Stage COLUMN → bucket** (replaces `section_to_bucket` for ap):
   | Stage cell | bucket |
   |---|---|
   | Actively Bidding | actively_bidding |
   | Budget Pricing | budget_pricing |
   | Feasibility Review | feasibility_review |
   | Submitted Bids | submitted_bids |
   | Awarded | awarded |
   | Not Awarded | not_awarded |
   | blank / unknown | actively_bidding (logged as DEFAULTED) |

2. **Record shape unchanged.** Each ap job emits the SAME shape the section path did:
   convenience keys (`number`, `name`, `city_state`, `gc`, `value`, `due_date`,
   `invite_date`, `completed`, `record`) + a `fields` dict + a per-discipline
   `columns` schema. `window.PF_PRECON` remains `{ap:{bucket:[...]}, hp:{...},
   columns:{ap:[...],hp:[...]}, generated, source, source_url, uncategorized}`.

3. **Field mapping (metadata header → portal field key):** pass through 1:1 EXCEPT
   - metadata **"Contact Name"** is emitted as **"Contact Name2"** (the key the portal
     UI reads).

4. **Derived per-unit prices.** Price Per SF/LF/Day/Column are FORMULAS in the sheet,
   so `data_only` returns None. Derive in the builder:
   - Price Per SF = Bid Total Value / Total SF (Bldg Pad)
   - Price Per LF = Bid Total Value / Total LF
   - Price Per Day = Bid Total Value / Project Duration (Days)
   - Price Per Column = Bid Total Value / Total Columns
   Guard: numerator missing OR denominator missing/zero → blank (never a div error).

5. **New fields carried forward** into `fields` AND `columns.ap` (available going
   forward): Hot (text), Award Date (date), Bidding GCs (text), Awarded GC (text),
   Sent to Garbin (text), Feasibility Verdict (text), Geotech / Engineer of Record
   (text), Feasibility Basis (text), Projected Pier Depth (text), Feasibility Date
   (date). Types come from the shared `column_type()` (any header containing "date" →
   date; money headers → money; else text).

6. **jobId stability.** The portal derives the id client-side: `num_<number>` for a
   real project number, else `ng_<djb2 of name.lower()+'|'+gc.lower()>`. The builder
   does NOT compute ids; it emits `number`, `name`, `gc` identically to the section
   path, so ids stay stable (write-back + pipeline-state overrides match on them).

7. **hp unchanged.** Helical keeps the section-based bid-log code path. Output still
   contains both ap and hp.

## Non-Goals / Constraints

- STAY ON TEST WORKBOOKS. No bid-log pointer moved toward production; no suggestion to
  switch off test.
- Data-only change to the pipeline output; no UI (index.html) changes required — the
  wide table iterates `columns[disc]` generically and the detail cards render any
  column not already surfaced as a highlight, so new columns are additive/safe.
