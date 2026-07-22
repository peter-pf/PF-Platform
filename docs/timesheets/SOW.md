# SOW - Timesheets: Regular vs Overtime + Live Feed from Daily Reports

Module: `timesheets`
Status: BUILT + self-tested, NOT deployed (gated for Peter's review).
Branch: `website-build-20260721-dailyreport`.

## Scope of Work

Add Regular vs Overtime tracking to the Daily Report and feed the Timesheet
module from submitted daily reports, applying the Brad-approved pay rule.

### Delivered

1. `functions/lib/ot-engine.mjs` - single source of truth for the pay math.
   `toDayHours`, `daySplit` (daily Reg/OT), `weeklyTotals` (no-pyramiding weekly
   rule), `weekBounds` / `weekKey` / `weekLabel` (Sun-Sat bucketing), `WEEKDAYS`.
   Pure, dependency-free, runs in Workers + browser + node.

2. `functions/lib/timesheet-rollup.mjs` - pure aggregation of daily-report
   records into the `PF_TIMESHEETS` week shape (`buildWeeks`, `buildEmployeeYear`).
   Imported by the API and by the node tests.

3. `functions/api/timesheets.js` - `GET /api/timesheets`. Reads KV
   `daily_reports_v1`, aggregates via the rollup lib, returns weeks +
   by_employee_year + grand total + latest-week-with-hours. field_ops RBAC.

4. `functions/lib/auth.js` - `areaForPath` maps `/api/timesheets` -> `field_ops`.

5. `index.html`:
   - Daily Report crew rows: `Reg X / OT Y` readout per row (daily split),
     auto-updating on hours/start/end change (`drDaySplit`, `updateRegOt`,
     `.dr-regot` styles). Mirrors the engine's `daySplit`.
   - Timesheet Weekly + Summary renderers exposed as `PF_TS_RENDER_WEEKLY` /
     `PF_TS_RENDER_SUMMARY`; a live-feed coordinator fetches `/api/timesheets`,
     folds live weeks over the static `PF_TIMESHEETS`, and repaints. Falls back
     to the static data if the fetch fails.

6. `sync/test-ot-engine.mjs` - node self-test (46 assertions).

7. Docs: this SOW + `docs/timesheets/SRS.md`; note added to
   `docs/daily-report/SRS.md`.

### Added: per-employee Start / End / Activity display (branch `website-build-20260722-timesheet-activity`, commit 6cdcc64)

- `functions/lib/timesheet-rollup.mjs` - the crew-ingest loop now captures each
  crew member's start/end and the report-level `workCompleted` activity, populates
  the `dayRows` start/end/activity fields (previously hardcoded blank), with
  sensible same-day multi-report aggregation. DISPLAY ONLY; OT/hours math unchanged.
- `index.html` - the per-employee day table's Activity/Start/End columns now show
  real data; added `.ts-time` / `.ts-activity` CSS and refreshed the intro copy.
  XSS-safe.
- `sync/test-timesheet-activity.mjs` - 33 assertions; the 46 OT assertions stay green.

### Out of scope / follow-ups

- Wages / pay rates ($) - intentionally never added (field_ops = no financials).
- Per-diem nights on the live feed (daily reports do not capture per-diem yet;
  live rows report 0, static workbook rows keep their per-diem).
- Employee number/title on live rows (daily reports capture name only; static
  workbook rows keep number/title).

## Acceptance

- `node sync/test-ot-engine.mjs` exits 0 with the three required cases passing
  exactly (40/5, 40/8, 32/8) plus the weekly aggregation.
- Timesheet views render with or without daily reports (backward compatible).
- No $ anywhere on the timesheet or daily-report crew surfaces.

## Deploy

Deploy via `./deploy.sh` after Peter's review (NOT done in this work block).
Post-deploy verify: `/api/timesheets` returns 401 with no session; a field_ops
session gets the JSON roll-up; the Timesheet module reflects submitted reports.
