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
