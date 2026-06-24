# PF Dashboard — Spec (Phase: PF Dashboard build)

**Source:** PF Project Master.xlsx → "PF Dashboard" tab. Brad (2026-06-17): "all of the categories in this tab are what I want to show in the PF Project Dashboard." Tracked with a **weekly / monthly / annual toggle** so we can see how each metric is tracking across weeks, months, or annually.

## Structure
Each metric row shows: **Quantity** (Actual vs Goal), **$ Amount** (Actual vs Budget), and a **Delta** (actual − goal/budget). Periods run across columns (the sheet is laid out month-by-month for 2026). The portal version adds a period toggle: **Weekly · Monthly · Annual**.

## The 16 metrics (in order)
| # | Metric | Qty (Actual/Goal) | $ (Actual/Budget) | Likely source |
|---|--------|:--:|:--:|---|
| 1 | Bid Invites Received | ✓ | — | Bid Log (Invite Date) |
| 2 | Garbin Prelims Completed | ✓ | — | Bid Log (Design Completed Date) / project Eng folder |
| 3 | Bids Sent | ✓ | ✓ | Bid Log (Date Submitted + Bid Total Value) |
| 4 | Projects Awarded (LOI) | ✓ | ✓ | Bid Log (Bid Status=Awarded; LOI date) + value |
| 5 | Contracts Fully Executed | ✓ | ✓ | Project record (executed contract date) + subcontract value |
| 6 | Projects Completed | ✓ | ✓ | Auto-progress (LF=100%) + project value |
| 7 | Projects Billed | ✓ | ✓ | **Financials** (invoicing) |
| 8 | Monthly Income | — | ✓ | **Financials** (cashflow) |
| 9 | Project Expenses | — | ✓ | **Financials** (job cost / cashflow) |
| 10 | Avg Project Profit Margin | — | % | derived (income − project expenses) |
| 11 | Non Project Expenses | — | ✓ | **Financials** (overhead) |
| 12 | Net Monthly Income | — | ✓ | derived |
| 13 | Net Monthly Margin | — | % | derived |
| 14 | Month End Chase Balance | — | ✓ | **Financials** (Chase Cking Cashflow tab) |
| 15 | Month End State Bank Balance | — | ✓ | **Financials** (State Bank Cashflow tab) |
| 16 | Total PF Cash @ Month End | — | ✓ | derived (14 + 15) |

## What Peter can already source (no help needed)
Metrics 1–6: derivable from the **Bid Log** (invite/submit/award/design dates, status, value), the **project records** (executed date), and the **auto-progress engine** (completion). These can be computed per period directly.

## What needs Brad's walkthrough (he offered to show where)
Metrics 7–16 (the financial side): Projects Billed, Monthly Income, Project/Non-Project Expenses, margins, and the Chase/State Bank/Total cash balances. Sources are the **PF Financials Budget** workbook (Chase Cking Cashflow + State Bank Cashflow tabs) and invoicing — need Brad to show exactly which cells/tabs feed each, and whether to read them live or have them entered.

## Open questions for Brad
1. **Goals/Budgets:** where do the per-metric Goal and Budget targets come from (the sheet has them filled per month) — a config we maintain, or pulled from a planning tab?
2. **Weekly granularity:** the sheet tracks monthly. For the Weekly view, do bid/award/completion counts roll up by week from their dates (yes, derivable), and do the financial/cash metrics simply show the latest or a weekly snapshot?
3. **Annual:** sum the quantities + dollars across the year, with annual goals/budgets — confirm.

## Build notes
- New panel `pf-dashboard` (currently a placeholder). Render the 16 metrics as a scorecard (Actual vs Goal/Budget + Delta, color the delta only — Brad's pref), with a Weekly/Monthly/Annual toggle.
- Sync step computes per-period values from the sources above → `data/pf-dashboard.js`.
- Queue: build after the in-flight nav batch (Field Ops / Awarded index / Insurance), since it edits the same nav file.

---

## SHIPPED (2026-06-24): Section dashboards — Precon + BD (reuse the engine)

Two NEW section dashboards now reuse the SAME `window.PFDashboard` engine that
powers the company PF Dashboard. The engine's `render()` gained an optional
4th `opts` arg (`{ids, cardMetrics, scopeNoun, weekMsg, finStart, note}`) plus a
`window.PFDashboard.mount(cfg)` helper, so each dashboard mounts its own DOM
nodes (no duplicate IDs) and shares ONE codebase. Backward-compatible: the PF
dashboard call is unchanged.

### A. Preconstruction Dashboard
- **Module:** `mod-precon-dashboard` (title "Preconstruction Dashboard").
- **Feed:** `data/precon-dashboard.js` (`window.PF_PRECON_DASH`), built by
  `sync/build-precon-dashboard.py`. Source = the **bid log**, derived via
  `data/precon-pipeline.js` (no token / no extra SharePoint hit; `--xlsx` re-parses
  a raw bid log if ever needed).
- **KPIs (real source columns only):** Bid Invites (count, by Invite Date),
  Bids Sent (count + $ submitted, by Date Submitted), Budget Pricing (count),
  Awarded (count + $), Not Awarded (count), Win Rate (% = awarded / decided).
- **Honesty note:** the bid log has NO dedicated Award Date column, so Awarded /
  Not Awarded are dated by **Date Submitted** (documented in the feed banner).
  Year is chosen as the year with the MOST dated rows (a stray "2028" typo can't
  hijack it). Currently builds 2026, Jan–Jun.
- **Gating:** `data/precon-dashboard.js` → `preconstruction` area
  (admin/partner/business_dev; **field_ops BLOCKED**, server-enforced).

### B. Business Development Dashboard
- **Module:** `mod-bd-dashboard` (title "Business Development Dashboard").
- **Feed:** `data/bd-dashboard.js` (`window.PF_BD_DASH`), built by
  `sync/build-bd-dashboard.py` from `sync/downloads/PF_BD_Master.xlsm`.
- **KPIs:** Interactions Logged (count, dated) and Companies Contacted
  (distinct companies, dated) per period; Total Companies / Total Contacts /
  Total Opportunities as **annual snapshots** (shown once on Annual + the latest
  month, never spread across months). Currently builds 2026, Jan–Apr; snapshots
  263 companies / 399 contacts / 71 opportunities.
- **OMITTED (no source data — NOT fabricated):**
  - *New Companies Added* / *New Contacts Added* per period — the Organizations
    and Contacts sheets have no date-added column.
  - *Active / Won / Lost Opportunities* — the Opportunities Status + Stage
    columns are currently 100% blank. (Documented in the feed's `_omitted` list.)
- **Gating:** `data/bd-dashboard.js` → `business_dev` area
  (admin/partner/business_dev; **field_ops BLOCKED**, server-enforced).

### Wiring + tests
- `functions/lib/auth.js` `DATA_FILE_AREAS`: `precon-dashboard.js → preconstruction`,
  `bd-dashboard.js → business_dev`.
- `migrations/test-rbac.mjs`: asserts admin/partner/business_dev can read both
  feeds and field_ops CANNOT (368 assertions, all pass).
- Role-aware loader in `index.html` injects both feeds for the BD tier
  (admin/partner/business_dev), never field_ops.
- Both builders wired into `tools/platform_sync_boop.sh` (non-fatal) after the
  pf-dashboard step.
- Both views show the same Week banner as the PF dashboard ("no weekly feed yet").

### Review fixes (2026-06-24, post triple-review)
- **User-visible disclosure note.** `render()` now takes an optional `opts.note`.
  When present and the template/week banner is not already showing, the note is
  rendered into the banner so the user always sees how the numbers were derived.
  Precon note: "Awarded and Not Awarded are dated by Date Submitted. The bid log
  has no separate award date column." BD note: "Opportunity status and new
  companies or contacts added are not shown. The source columns are blank.
  Companies Contacted is counted per month." The company PF Dashboard passes no
  note, so its behavior is unchanged.
- **Pooled Win Rate on quarter/annual.** A pct metric may declare
  `basisNum` + `basisDen` in `metricsMeta`. `rollup()` then computes the rolled
  value as sum(numerator) / sum(denominator) over the period (the true pooled
  rate) instead of averaging the monthly rates. Win Rate declares
  `basisNum: 'Awarded'`, `basisDen: ['Awarded', 'Not Awarded']`. Annual Win Rate
  is now 46.67% (14 / 30 decided), not the 45.68% mean-of-months. pct metrics
  WITHOUT a basis (every company-dashboard margin) keep the averaging path, proven
  byte-identical across all periods.
- **Real `isTemplateData`.** Both builders now compute the identical-month
  signature check (parity with `build-pf-dashboard.py`) instead of hardcoding
  False, so the template banner can fire if a feed ever fills with identical
  months. Currently False (data is genuinely distinct).

## Period control: Year to Date + Annual year dropdown (2026-06-24)

Brad reworked the "Annual" end of the PF Dashboard period toggle. The control is
now: Week | Month | Quarter | Year to Date | Annual [year v]. This is the COMPANY
PF Dashboard ONLY - it is OPT-IN via `opts.yearMode` so the shared engine's
Precon + BD dashboards are unchanged (they pass no yearMode, have no YTD button).

- **Year to Date (YTD):** sums the current year's months from January through the
  CURRENT month, using the EASTERN clock (Intl timeZone America/New_York, the same
  basis pm-project uses). Counts and dollars are summed and percentages averaged
  by the existing `rollup()` (basis-pct like Win Rate uses its pooled basis).
  Labeled "{year} Year to Date (through {Month})". If the feed year is not the
  current Eastern year, a clean "No data entered for {year} year to date" banner
  shows (no zeros, no crash). Verified: 2026 YTD (Jan-Jun, 6 months) = the sum of
  those months, and is less than the 12-month Annual.

- **Annual with a YEAR DROPDOWN:** options 2024 / 2025 / 2026 (PF started in 2024;
  nothing earlier). Defaults to the current Eastern year. When the selected year
  has no data in the feed (today: 2024 and 2025), a clean "No data entered for
  {year}" banner shows with empty cards + table (no zeros, no NaN, no crash).

- **Week | Month | Quarter unchanged.** Month/Quarter still operate on the current
  year's months; Week keeps the existing "no weekly data" banner.

### Data decision (years map)
The feed (`build-pf-dashboard.py` -> `data/pf-dashboard.js`) stays a SINGLE-YEAR
feed (the current year, 2026, from the "PF Dashboard" tab). The Annual year
dropdown lists 2024/2025/2026 and the UI treats any year not equal to the feed's
`year` as empty ("No data entered"). This was the cleaner option: no builder
change, no new data surface, no RBAC change. When a prior year's data is added
later, the simplest path is a follow-up that emits a years map
(`years:{'2025':{...},'2026':{...}}`) and points the dropdown at it; the UI empty
path already handles the gap until then.

### Scope guardrails honored
- OPT-IN: only the PF `draw()` passes `{ yearMode: true }`. Precon + BD mounts
  (`window.PFDashboard.mount`) pass no yearMode -> their Week/Month/Quarter/Annual
  behavior is byte-identical, and their toggles have no YTD button.
- No RBAC/gating change: `/data/pf-dashboard.js` stays `financials_global`
  (admin/partner only; business_dev + field_ops blocked). No new data surface.
- No mail.

### Verification (2026-06-24)
- `node migrations/test-rbac.mjs`: 661 pass / 0 fail (RBAC unchanged - UI-only).
- YTD 2026 = Jan-Jun rollup (Bids Sent qty 72 = manual sum; Annual 12mo = 144).
  Annual 2025/2024 -> "No data entered" path (no NaN/crash).
- PF Month (June=12) + Quarter (Q2=36) rollups reconcile (no regression). Precon +
  BD render unchanged (no yearMode, single ytd button = the PF toggle).
- Deploy OK; gate 401 with no creds on / and /data/pf-dashboard.js.
