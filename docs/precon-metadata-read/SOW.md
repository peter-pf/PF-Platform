# SOW — Precon Pipeline: ap Metadata-Sheet Reader

**Date:** 2026-07-18 · **Status:** DONE + DEPLOYED (TEST) · **Branch:** website-build-20260609

## Work Performed

Edited `platform/sync/build-precon-pipeline.py`:

1. Added ap metadata source constants: `AP_META_DRIVE`, `AP_META_ITEM`,
   `AP_META_TAB="Agg Pier Metadata"`, `AP_META_HEADER_ROW=2`, `AP_META_SOURCE`.
2. Added `STAGE_TO_BUCKET` (Stage cell → bucket), `META_HEADER_RENAME`
   (Contact Name → Contact Name2), `DERIVED_PRICES` (per-unit price formulas).
3. Reduced `SHEETS` to hp only (`Helical Pier Bid Log`). ap is built separately.
4. Added functions:
   - `download_ap_metadata()` — Graph pull of the TEST metadata workbook.
   - `meta_ordered_headers(ws)` — row-2 headers in sheet order, with rename.
   - `stage_to_bucket_meta(stage)` — Stage → (bucket, defaulted_flag); blank/unknown
     → actively_bidding (logged).
   - `build_ap_from_metadata()` — reads rows 3+, buckets by Stage COLUMN, emits the
     same record shape (convenience keys + `fields` + `columns`), derives per-unit
     prices with a divide-by-zero/missing guard, carries the 10 new fields.
5. `main()` now builds ap from the metadata sheet, then runs the section-based
   `extract()` for hp only; `source` string documents both.
6. Output-file header comment updated to describe the split (ap=Stage column,
   hp=section).

Left UNTOUCHED: the hp code path (`extract`, `section_to_bucket`, `is_section_header`),
the TEST/LIVE bid-log pointer comment, all UI.

## Build

`cd platform/sync && OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
NUMEXPR_NUM_THREADS=1 python3 build-precon-pipeline.py` → wrote
`platform/data/precon-pipeline.js`.

## Verification (real, not assumed)

- ap bucketed by Stage COLUMN — per-bucket counts:
  actively_bidding 3 / budget_pricing 5 / feasibility_review 0 / submitted_bids 6 /
  awarded 21 / not_awarded 6 = **41**.
- **"Test" project (no number, GC Franke Construction) → submitted_bids** (its Stage
  cell = "Submitted Bids"), proving the Stage COLUMN drives the bucket (NOT
  actively_bidding). ✔
- Field keys match the UI: spot-checked Project Name, Bid Status, Bid Total Value,
  General Contractor, **Contact Name2**, GC Phone, Due Date all present; raw
  "Contact Name" absent from both fields and columns.ap.
- Derived prices verified: POET DDG = $75,000 / 6,479 SF → **Price Per SF $11.58**;
  Granary → $3.91/SF, $20.93/LF, $21,746.67/day, $241.81/col. 6 rows with a blank
  Bid Total or SF correctly emit blank price (guard holds, no div error).
- New fields present in columns.ap with correct types (Award Date/Feasibility Date =
  date; Hot/Sent to Garbin/Feasibility Verdict/etc = text).
- hp unchanged: 30 projects, 33 columns, its own Contact Name2 intact.

## Deploy

`./deploy.sh` with fork-guard. Verified canonical env=production + live root 401 gate.
(See memory note for exact deploy evidence.)

## Restore reminder (not this task's action)

When write-back testing finishes, Corey restores the LIVE bid-log id for hp and
re-points ap's metadata source to the production metadata sheet, then re-syncs +
redeploys.
