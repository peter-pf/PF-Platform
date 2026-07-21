// ===========================================================================
// OT ENGINE  --  SINGLE SOURCE OF TRUTH for Regular vs Overtime math.
// ===========================================================================
// This is PAYROLL logic. Brad approved the exact rule below; do NOT deviate.
// Imported by: functions/api/timesheets.js (weekly aggregation) and mirrored
// verbatim in index.html (per-row daily split shown on the Daily Report form).
// Node-testable: sync/test-ot-engine.js imports THIS file and asserts the
// required cases. Keep this file dependency-free and pure (no I/O, no dates
// beyond parsing an ISO string) so it runs identically in Workers, the browser,
// and node.
//
// THE CONFIRMED RULE (Brad approved, do NOT change without his sign-off)
//   DAILY:  hours over 8 in a single day = Overtime (1.5x).
//           dayReg   = min(dayHours, 8)
//           dailyOT  = max(dayHours - 8, 0)
//   WEEK:   Sunday 12:01am .. Saturday 11:59pm. Each daily report is bucketed
//           into that week by its date.
//   WEEKLY (NO pyramiding -- an hour is NEVER paid as OT twice):
//           only the per-day REGULAR portions count toward 40.
//           weekRegSum = sum(dayReg) across the week's days
//           weeklyOT   = max(0, weekRegSum - 40)
//           finalReg   = min(weekRegSum, 40)
//   TOTALS: totalOT = sum(dailyOT across days) + weeklyOT
//           total   = finalReg + totalOT   (== sum of all hours worked)
//
// Verified cases (see sync/test-ot-engine.js):
//   A: five 9h days  = 45h -> Reg 40, OT 5
//   B: six 8h days   = 48h -> Reg 40, OT 8
//   Mixed: four 10h days = 40h -> Reg 32, OT 8
// ===========================================================================

// Round to 2 decimals to keep sums clean (hours are entered to 2dp elsewhere).
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Coerce a value to a non-negative day-hours number (a single day cannot exceed
// 24h). Blank / invalid -> 0. Mirrors the daily-report `hours()` sanitizer.
export function toDayHours(v) {
  if (v == null || String(v).trim() === '') return 0;
  let n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n) || n < 0) return 0;
  if (n > 24) n = 24;
  return r2(n);
}

// ---- DAILY split for a single day's hours --------------------------------
// Returns { reg, ot } where reg = min(h,8), ot = max(h-8,0). This is the ONLY
// split a single daily report can compute on its own (weekly OT needs the whole
// week). Used by the Daily Report per-crew-row readout.
export function daySplit(dayHours) {
  const h = toDayHours(dayHours);
  const reg = Math.min(h, 8);
  const ot = Math.max(h - 8, 0);
  return { reg: r2(reg), ot: r2(ot) };
}

// ---- WEEKLY roll-up for one employee -------------------------------------
// Input: an array of day-hour values (numbers or number-like strings) for the
// Sun..Sat week (order does not matter; blanks/zero are fine). Applies the full
// confirmed rule with NO pyramiding.
// Returns { regular, ot, total, dailyOT, weeklyOT, weekRegSum }.
export function weeklyTotals(dayHoursList) {
  const list = Array.isArray(dayHoursList) ? dayHoursList : [];
  let weekRegSum = 0;   // sum of per-day regular (min(day,8))
  let dailyOTSum = 0;   // sum of per-day OT (max(day-8,0))
  for (const v of list) {
    const { reg, ot } = daySplit(v);
    weekRegSum += reg;
    dailyOTSum += ot;
  }
  weekRegSum = r2(weekRegSum);
  dailyOTSum = r2(dailyOTSum);
  const weeklyOT = r2(Math.max(0, weekRegSum - 40));
  const finalReg = r2(Math.min(weekRegSum, 40));
  const totalOT = r2(dailyOTSum + weeklyOT);
  const total = r2(finalReg + totalOT);
  return {
    regular: finalReg,
    ot: totalOT,
    total,
    dailyOT: dailyOTSum,
    weeklyOT,
    weekRegSum,
  };
}

// ---- Sun..Sat week bucketing ---------------------------------------------
// Given an ISO date string (YYYY-MM-DD), return { week_start, week_end } as
// ISO date strings for the Sunday..Saturday week that contains it. Parsed as
// UTC to avoid the runtime's local-timezone shifting the day.
export function weekBounds(isoDate) {
  const d = new Date(String(isoDate) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const start = new Date(d.getTime());
  start.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(start.getTime());
  end.setUTCDate(start.getUTCDate() + 6);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { week_start: iso(start), week_end: iso(end) };
}

// Stable key for a week (its Sunday date).
export function weekKey(isoDate) {
  const b = weekBounds(isoDate);
  return b ? b.week_start : null;
}

// Short human label "M.D-M.D" matching the static timesheet week_label style.
export function weekLabel(week_start, week_end) {
  const fmt = (s) => {
    const d = new Date(s + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return s;
    return (d.getUTCMonth() + 1) + '.' + d.getUTCDate();
  };
  return fmt(week_start) + '-' + fmt(week_end);
}

// The seven weekday names Sun..Sat, index-aligned to getUTCDay().
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const _r2 = r2; // exported for tests
