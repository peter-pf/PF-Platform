# SOW — Per-Row Vendor/Supplier, Notes, and Actual on Budget vs Actual

**Status:** BUILT on branch `vendor-notes-columns-20260804` (NO deploy — devops routes deploy).
**Date:** 2026-08-04. **Author:** pf-backend-agent (Peter).
**Directive:** Brad — show each project's Turnover Budget Vendor/Supplier (col F) and
Notes (col G) as columns on the portal Budget vs Actual table, and break out the
per-row ACTUAL (col D) so a cost code appearing on multiple rows (e.g. 5405 VSC Rig /
Predrill / Fall Off) shows each sub-line's own actual aligned with its own budget.

## Scope delivered
1. **Vendor/Supplier + Notes columns** — mirror Excel col F/G per line item, shown
   verbatim (HTML-escaped), long notes wrap, financials table scrolls horizontally.
2. **Per-row Actual** — col D captured per `row_key` so multi-row cost codes break out
   per line (variance per line works automatically: budget − actual per row).
3. **Budget-staleness independence** — vendor/notes are plain text; per-row actual is
   recovered by EVALUATING the arithmetic sum formulas (`=1050+3230`) that the
   invoice-coding workflow enters, so a job whose col C/D formula cache is stale
   (e.g. 26-002 after openpyxl coding) still yields correct per-row actuals. Existing
   KV budget is PRESERVED (never overwritten with $0) on such jobs.
4. **GREEN-ONLY actual gate** (Brad, `feedback-portal-actuals-green-only`) — a col-D
   value becomes a portal actual ONLY when the cell carries the green booked-actual
   fill (a real invoice was received + coded). YELLOW (FFFF00) placeholders and any
   non-green / no-fill are SKIPPED (blank actual). Fail-safe: ambiguous → exclude.
5. **POST-preserve fix** — an office "Save Budget" no longer drops vendor/notes.

## Data model (KV `project_budget_v1:<num>`, unchanged key/row_key)
Row entry extended `{budget, cost_code}` → `{budget, cost_code, vendor, notes, actual}`.
Backward compatible: rows without the new fields render blank. row_key = `g<gi>_r<ri>`.

## Files changed
- `platform/sync/budget_actual_parser.py` — arithmetic-formula evaluator
  `_eval_arith_formula` (literal-only, injection-safe), GREEN fill gate
  `_is_booked_green` (theme 9 / tint≈0.8 or RGB E2EFDA family; excludes FFFF00 +
  all others), leaf actual recovered-from-formula + green-gated. Parser already read
  col F/G.
- `platform/sync/dryrun_budget_column.py` — carry vendor/notes/actual in the budget
  payload; new budget-independent `workbook_leaf_meta` + `map_meta` and `kv_meta_rows`
  for vendor/notes/actual even on non-writable (stale-budget) jobs.
- `platform/sync/write_budget_column.py` — `_merge_row` field-wise merge (a blank
  workbook F/G/actual never blanks a hand-entered value; budget preserved when
  incoming payload has no budget); PASS 2 vendor/notes/actual-only for stale jobs;
  `verify_meta` proves budgets unchanged.
- `platform/index.html` — `baRenderTable`: vendor/notes from `savedRows[rowKey]`;
  per-row actual wins over daemon (group,code) lump, consuming the daemon slot so a
  same-code fallback row doesn't get the lump; drill-down + budget input UNTOUCHED.
  `baGrandTotals` + group/grand dash logic mirror per-row-wins. CSS: `.ba-table-wrap`
  overflow-x, `.ba-table` min-width 880px, vendor/notes wrap.
- `platform/functions/api/project-budget.js` — POST per-row merge preserves existing
  vendor/notes on a budget save.

## Daemon-feed interaction (flagged, not silently changed)
`PF_BUDGET_ACTUALS` (hourly daemon, summed by (group,code)) remains a FALLBACK for
rows without a per-row KV actual. Per-row KV actual WINS when present. Single-row cost
codes are unchanged. Cadence note: per-row actuals refresh on a SYNC RUN
(dryrun → write_budget_column.py), not on the hourly daemon — re-run the sync to
refresh per-row actuals after new invoice coding.

## Verification (2026-08-04)
- 31/31 jobs written + verified, 0 fail, 31 backups. All budgets UNCHANGED vs go-live
  (POET $314,457.68, Schaff $60,258.92, Molto $192,386.03, Granary $277,359.95,
  Park&Poplar $354,195.06, Southwark $255,859.16 — all exact).
- Per-row 5405 breakout in KV: 26-002 = 4280/3385/2465/500; 26-017 = 2855/2490/1470/
  (g4_r4 None = unbooked/not-green); 26-015 = 3115/2310/1595 with Stephan Trucking
  vendor+notes per line and g4_r4 booked $0.
- Green gate proven: synthetic green→pull, yellow FFFF00→blank, no-fill→blank; real
  POET yellow cell D96 (`=250*20` placeholder) correctly excluded.
- JS: full inline script `node --check` OK. Python: all sync files compile.

## Re-run to refresh
`source /home/aiciv/.env` then `python3 sync/dryrun_budget_column.py` then
`python3 sync/write_budget_column.py --execute` (MERGE, per-project backups). Portal
reads KV live — vendor/notes/actual appear WITHOUT deploy; only the index.html UI
columns/CSS need the deploy.

## Amendment — POET wrong-file resolver fix + all-jobs yellow audit (2026-08-04, HOLD-deploy)

**Trigger (Brad):** POET 26-002 5405 actuals reported as $4,280/$3,385/$2,465 were the
PRE-INVOICE values from the STALE base file `26-0330 POET Turnover Budget.xlsm`. The
resolver's `_is_base` heuristic preferred the base filename over the change-order
variant `26-0709 POET Turnover Budget w add'l Bin CO.xlsm` (the CURRENT file the
invoice-coding writes to). Same class as the drill-down ledger base-name bug.

### Resolver fix (`build-budget-actuals.py resolve_workbook`)
Multi-workbook branch now picks **MOST-RECENTLY-MODIFIED** (mtime desc, then created,
then name desc), returning status `ok`. Added `audit_multi_workbook()` to surface every
job with >1 Turnover Budget file and which variant is chosen.

### Multi-workbook audit (all 42 jobs)
ONLY 26-002 POET has >1 file (count=2). Now resolves to `26-0709 ... w add'l Bin CO.xlsm`
(mod 2026-08-04) over `26-0330` (mod 2026-06-18). No other job affected.

### POET actuals — CORRECTED
From the right file, 5405 = **$6,325 / $4,700 / $3,660** (green cells) with Stephan
Trucking vendor + INV 11309/11310/11320 notes per line. Written to KV via PASS 2
(vendor/notes/actual only; budget preserved). 26-015/26-017 budgets unchanged.

### POET BUDGET — FLAGGED, NOT corrected (needs Brad)
The current `26-0709` file's col C budget is a STALE formula cache (84 formula cells,
0 cached) — openpyxl cannot read its budget. So the live KV budget **$314,457.68 is
from the OLD 26-0330 file** and is likely WRONG (the "w add'l Bin CO" adds scope). We
did NOT overwrite it (fail-closed, never fabricate). **Action for Brad:** open+save
`26-0709` in Excel to recalc the cache, then re-run the sync to write the correct POET
budget. Until then the $314,457.68 is a KNOWN-SUSPECT carryover.

### GREEN-only gate now covers the DAEMON SUMMED FEED too
`build-budget-actuals.py` imports the SAME green-gated `parse_budget_actual` +
`leaf_actuals_by_code` (which skips `actual is None`), so `PF_BUDGET_ACTUALS`
(data/budget-actuals.js) now EXCLUDES yellow. Both the per-row pull AND the summed
fallback exclude yellow — no leak path.

### All-jobs YELLOW audit (26 cells across 14 jobs — ALL now excluded)
Material (non-zero) placeholders that previously could leak as fake actuals, now gated
out: 25-015 Stadium $7,700/$450/$655.76; 26-001 WPAFB $12,000; 26-002 POET $5,000;
26-015 Schaff $10,000/$2,222; 26-014 TPS $9,050; 26-007 Madison $6,098; 26-017 Molto
$2,000/$1,320; 25-2002 Habitat $1,500; 26-003 Canopy $800.54; 26-004 ONB $286.33 (rest
$0). Rebuilt feed verified: every one reads None/0 in data/budget-actuals.js.

### What's needed to make clean actuals LIVE
`PF_BUDGET_ACTUALS` is served from the DEPLOYED static `platform/data/budget-actuals.js`
→ **needs a deploy**. Rebuilt (green-gated) + staged, NOT deployed. The
budget_actuals_daemon has a STOP sentinel (`.budget-actuals-daemon-STOP`, since 7/30)
so it will NOT auto-deploy/race; when unblocked it uses the same fixed parser so it
keeps producing green-gated output. Combine with the POET fix = one corrected-actuals
deploy (devops routes it). Per-row vendor/notes/actual in KV are already LIVE (no deploy).
