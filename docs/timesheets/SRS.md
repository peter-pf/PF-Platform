# SRS - Timesheets: Regular vs Overtime + Live Feed from Daily Reports

Module: `timesheets`
Endpoints: `/api/timesheets` (GET, new) and the Daily Report crew rows in
`index.html`; shared math in `functions/lib/ot-engine.mjs`.
Area / RBAC: `field_ops` (admin / partner / business_dev / field_ops). HOURS ONLY,
ZERO financials (no wage/rate/$ is read, computed, returned, or displayed).
Status: BUILT + self-tested (node OT-engine suite + handler integration). NOT
deployed (gated for Peter's review).

## 1. Purpose

Add Regular vs Overtime tracking to the field timesheet flow, and feed the
Timesheet module from SUBMITTED daily reports instead of only the static
SharePoint workbook (`data/timesheets.js`).

Two surfaces change:

1. Daily Report form - each crew row shows a DAILY Reg/OT split derived from the
   row's hours (Reg = first 8h, OT = hours over 8). Read-only, auto-updates as
   hours change. A single daily report cannot know weekly OT, so only the daily
   split is shown here.
2. Timesheet module (Weekly + Summary) - now reflects hours from submitted daily
   reports, aggregated per employee into Sun-Sat weeks with the full pay rule.

## 2. THE PAY RULE (Brad approved - PAYROLL, do NOT deviate)

Single source of truth: `functions/lib/ot-engine.mjs`.

- DAILY: hours over 8 in a single day = Overtime (1.5x).
  `dayReg = min(dayHours, 8)`, `dailyOT = max(dayHours - 8, 0)`.
- WEEK: Sunday 12:01am through Saturday 11:59pm. Each daily report is bucketed
  into that week by its date.
- WEEKLY (NO pyramiding - never pay an hour as OT twice): only the per-day
  regular portions count toward 40.
  `weekRegSum = sum(min(day,8))`, `weeklyOT = max(0, weekRegSum - 40)`,
  `finalReg = min(weekRegSum, 40)`.
- TOTALS: `totalOT = sum(dailyOT) + weeklyOT`; `total = finalReg + totalOT`
  (always equals the sum of all hours worked).

Required cases (asserted in `sync/test-ot-engine.mjs`):
- Five 9h days = 45h -> Reg 40, OT 5.
- Six 8h days = 48h -> Reg 40, OT 8.
- Four 10h days = 40h -> Reg 32, OT 8.

## 3. Functional Requirements

- FR1 - Daily Report: for each crew row, show `Reg X / OT Y` computed from the
  row's hours via the daily split. Auto-updates on hours / start / end change.
  Derived (never manually entered).
- FR2 - `GET /api/timesheets` reads KV `daily_reports_v1`, includes only
  `status:'sent'` reports by default (`?includeDrafts=1` to preview drafts),
  buckets crew hours by employee + Sun-Sat week, and applies the pay rule to
  produce per-employee Reg / OT / Total plus `by_cost_code`, `by_job`, and week
  totals - in the same shape the Timesheet renderers already consume.
- FR3 - The Timesheet Weekly + Summary views fetch `/api/timesheets` and fold the
  live weeks over the static `window.PF_TIMESHEETS`. Live weeks WIN over static
  weeks with the same Sunday; live employee-year rows override by name+number.
- FR4 - BACKWARD COMPATIBLE: if the fetch fails or returns no weeks, the static
  data path is untouched and the UI keeps working. No error is surfaced to the
  crew for a blocked/offline fetch.
- FR5 - ZERO financials on every path (hours only).

## 4. Non-Functional / Security

- NFR1 - RBAC: `areaForPath('/api/timesheets') === 'field_ops'`; handler also
  calls `requireArea(session, 'field_ops')`. No-session -> 401 at the gate.
- NFR2 - Read-only endpoint (GET only). No write surface added.
- NFR3 - No pyramiding: an hour is never counted as OT in both the daily and the
  weekly pass. Enforced by the engine (weeklyOT is computed from the per-day
  REGULAR sum only) and covered by tests.
- NFR4 - The OT engine is pure and dependency-free so it runs identically in
  Cloudflare Workers, the browser (mirrored inline), and node (tests).

## 5. Data Sources

- KV `daily_reports_v1` (namespace bound as `env.PF_SCHEDULE`) - the submitted
  daily reports. Crew line shape: `{name, start, end, hours, costCode}`.
- Static `data/timesheets.js` (`window.PF_TIMESHEETS`) - the SharePoint workbook
  roll-up, kept as the fallback / historical base.

## 6. Verification

- `node sync/test-ot-engine.mjs` - 46 assertions: daily split, the three required
  weekly cases exactly, week bucketing, the aggregation across a Sun-Sat set of
  daily reports (Alpha 40/5, Bravo 40/8, Cee 32/8), draft exclusion, and
  no-cross-week pyramiding.
- Handler integration: `onRequestGet` driven with a mocked KV + field_ops session
  returns status 200 and the correct week/employee-year shape.

## 7. Per-employee Start / End / Activity display (added)

- FR6 - The per-employee day table (Timesheet Weekly view, `#tsRoot` empBlock)
  surfaces each employee's daily **Start**, **End**, and **Activity** pulled from
  the submitted daily report. Start/End come from the crew row (`m.start`/`m.end`);
  Activity is the report-level `workCompleted` narrative that applies to every crew
  member on that report.
- Same-day multi-report aggregation: earliest non-blank start, latest non-blank
  end (compared by "HH:MM" -> minutes), distinct activities joined with "; ".
- DISPLAY ONLY - the OT / hours math (`daySplit` / `weeklyTotals`) is byte-identical
  and untouched; the 46-assertion OT suite still passes. Blank fields render empty
  (never `undefined`). Output is XSS-safe (escaped via `window.esc` / `E()`).
- Styling: `.ts-time` (nowrap tabular times) and `.ts-activity` (wrapping, 320px
  cap) on `.ts-day-table`.
- Verification: `node sync/test-timesheet-activity.mjs` - 33 assertions (single
  report, one employee across two reports in a week, same-day aggregation,
  backward-compat blanks).
