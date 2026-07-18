# SOW — Metadata Sheet PM/Financial/Contract/Engineering Fields + Read Wiring + Write-Back Pattern

**Module:** metadata-projectmgmt · **Date:** 2026-07-18 · **Scope:** TEST workbooks only.

---

## Deliverables

### STEP 1 — Add columns to `Agg Pier Metadata` (script)
- **File:** `platform/sync/add-projectmgmt-columns.py`
- Downloads fresh copies of the metadata + Project Master TEST workbooks via Graph.
- Appends 42 new columns (cols AT..CI) in 6 new category bands AFTER the existing 45.
  Appending preserves all existing indices → price formulas + data-validation ranges stay
  valid. Existing columns/data/dropdowns/formats/formulas untouched.
- Populates by Project Number match (Dashboard transposed read-down-column; WIP row read).
- Applies the sheet's formatting conventions ($, dates, phones, quantities, %, Yes/No
  dropdown for Retain Paid).
- **Fails closed on HTTP 423** (workbook open) — writes nothing, exits 42, prints PENDING.
- Idempotent-safe: skips any header that already exists (`if header in existing`).
- Run: `OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 python3 add-projectmgmt-columns.py`
  (`--dry-run` to preview without writing).

**STATUS: PENDING — hit HTTP 423 on 2026-07-18 (Derek had the workbook open). Re-run when closed.**
Dry-run verified: 42 columns, 22 projects populated, 0 accidental duplicates.

### STEP 2 — Read wiring (builder)
- **File:** `platform/sync/build-precon-pipeline.py`
  - `column_type()` extended: exact-match `money` set (Subcontract Value, Paid, Unpaid,
    Projected PA #1 Income, Retainage Amount); `num` set (Work % Complete, Retain %,
    Estimated Spoils (CY)); `date` set for real dates whose header lacks "date" (Scheduled
    Completion, Submittals *…*, Docs Sent to Surveyor / Layout); `text` override for
    Invoice Due By Date (free-text source).
  - `fmt_cell` + new `fmt_num` handle the `num` type; both metadata + hp call sites pass
    the header through for percent detection.
- New columns flow into `fields` + `columns.ap` automatically (builder is column-agnostic).
- Renderer already supports `num` (verified `index.html` `wideColSortKind`).
- **Regenerate `data/precon-pipeline.js` + deploy is PENDING on STEP 1** (builder reads
  the live sheet; nothing new to emit until the columns are written). Verified the builder
  runs clean today: ap 41 / 45 cols, hp 30 / 33 cols, POET DDG Price Per SF $11.58 —
  identical to live, no regression.
- Deploy (when STEP 1 done): `./deploy.sh --docs-done` with fork-guard; verify canonical
  env=production + root HTTP 401.

### STEP 3 — Field-level write-back pattern (documented)
Generalizes `tools/writeback_stage.py`.

**How the Stage write-back works today**
1. Read portal overrides from Cloudflare KV key `pipeline_state_v1` (namespace
   `6c8bd3b9bf3a464ca8d1a5d939231858`) → `{ jobId: {status, meta} }`.
2. Download the metadata workbook via Graph; build `jobid → row` index using the SAME
   client-side id derivation the portal uses:
   `num_<number>` (lowercased) if a number exists, else `ng_<djb2(name|gc)>`.
3. For each override, map `status → Stage label`, compare to the current Stage cell, and
   write ONLY if different (idempotent). Save + `PUT`; on HTTP 423, log SKIP and leave the
   change pending.

**Generalizing to any field (edit surface = later phase)**
The portal edit of any new field posts `{ jobId, field, value }` to KV (or an edits KV
key, e.g. `field_edits_v1`). A `writeback_field.py` (same skeleton as
`writeback_stage.py`) would:
1. Read the edits KV.
2. Build the `jobid → row` index the identical way (match by Project Number / `ng_` hash).
3. Resolve `field → column` via a FIELD_TO_COLUMN map keyed by the metadata header
   (row-2 header text → column letter, looked up live so it survives column moves).
4. Coerce the value to the column's type (money/num → float, date → datetime, phone/text
   → as-is) using the column's `number_format`, write the ONE mapped cell, and skip
   cleanly on HTTP 423 (log the pending change) — never a partial workbook.
5. Idempotent: only write when the target cell differs.

**Guardrails (carry over from Stage write-back):** TEST workbook only; whole-workbook PUT;
fail closed on 423; write the minimum cells; never fabricate; keep the row in place (only
the cell changes).

---

## Verification evidence

| Item | Evidence |
|---|---|
| Dry-run column plan | 42 added (AT..CI), 6 bands, 22 projects populated, 0 dupes |
| 423 lock handling | live write returned HTTP 423 → exit 42, nothing written |
| Builder still correct | ap 41/45, hp 30/33, POET DDG Price Per SF $11.58 (no regression) |
| `num` renderer support | `index.html` `wideColSortKind('num') → 'money'` (line ~13205) |
| Grounding | ENG/SUBMITTALS date fields left blank (Dashboard rows hold responsibility labels, not dates) |

## Definition of Done
- [ ] STEP 1 columns written (re-run script once workbook is unlocked)
- [x] STEP 2 builder read-wiring in place + typed (columns flow through automatically)
- [ ] STEP 2 data regen + deploy (PENDING on STEP 1)
- [x] STEP 3 write-back pattern documented (SRS + this SOW)
- [x] Committed to `website-build-20260609`
