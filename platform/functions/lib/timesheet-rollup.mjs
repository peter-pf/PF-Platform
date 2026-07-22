// ===========================================================================
// TIMESHEET ROLLUP  --  pure aggregation of daily-report records into the
// window.PF_TIMESHEETS week shape. NO I/O, NO auth, NO Workers globals, so it is
// node-testable (sync/test-ot-engine.mjs) AND reused by functions/api/timesheets.js.
// Applies the Brad-approved OT rule via ot-engine.mjs. ZERO financials.
// ===========================================================================
import {
  daySplit, weeklyTotals, weekBounds, weekKey, weekLabel, WEEKDAYS, toDayHours,
} from './ot-engine.mjs';

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// "HH:MM" (24h) -> minutes since midnight, for picking earliest start / latest end
// when an employee appears on more than one report the same day. Blank/garbage
// returns null so it never wins a min/max comparison.
function toMinutes(t) {
  const s = String(t == null ? '' : t).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]); const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

// Build the live weekly timesheet structure from daily-report records.
// reports: [{ date, status, projectId, projectName, crew:[{name,hours,costCode}] }]
// opts.includeDrafts: include status!=='sent' records too (preview).
export function buildWeeks(reports, opts) {
  opts = opts || {};
  const includeDrafts = !!opts.includeDrafts;
  const weeks = new Map(); // weekKey -> {week_start, week_end, emps: Map(name->{name,daysByDate})}

  for (const rep of (Array.isArray(reports) ? reports : [])) {
    if (!rep || typeof rep !== 'object') continue;
    if (!includeDrafts && rep.status !== 'sent') continue;
    const date = String(rep.date || '').slice(0, 10);
    const wb = weekBounds(date);
    if (!wb) continue;
    const wk = weekKey(date);
    if (!weeks.has(wk)) weeks.set(wk, { week_start: wb.week_start, week_end: wb.week_end, emps: new Map() });
    const W = weeks.get(wk);
    const job = String(rep.projectId || rep.projectName || '').trim();
    // The day's work narrative is a REPORT-LEVEL field that applies to every crew
    // member on this report (what the crew did that day). DISPLAY ONLY.
    const activity = String(rep.workCompleted || '').trim();
    for (const m of (Array.isArray(rep.crew) ? rep.crew : [])) {
      if (!m || typeof m !== 'object') continue;
      const name = String(m.name || '').trim();
      if (!name) continue;
      const h = toDayHours(m.hours);
      const costCode = String(m.costCode || '').trim();
      const start = String(m.start || '').trim();
      const end = String(m.end || '').trim();
      if (!W.emps.has(name)) W.emps.set(name, { name, daysByDate: new Map() });
      const emp = W.emps.get(name);
      if (!emp.daysByDate.has(date)) {
        emp.daysByDate.set(date, { date, hours: 0, job, cost_code: costCode, start: '', end: '', activities: [], lines: [] });
      }
      const dayRec = emp.daysByDate.get(date);
      dayRec.hours = r2(dayRec.hours + h);
      if (!dayRec.job && job) dayRec.job = job;
      if (!dayRec.cost_code && costCode) dayRec.cost_code = costCode;
      // Same-day multi-report aggregation (rare): earliest non-blank start, latest
      // non-blank end. Keep the raw "HH:MM" string; compare by minutes.
      if (start) {
        const cur = toMinutes(dayRec.start);
        const nw = toMinutes(start);
        if (nw != null && (cur == null || nw < cur)) dayRec.start = start;
        else if (!dayRec.start) dayRec.start = start;
      }
      if (end) {
        const cur = toMinutes(dayRec.end);
        const nw = toMinutes(end);
        if (nw != null && (cur == null || nw > cur)) dayRec.end = end;
        else if (!dayRec.end) dayRec.end = end;
      }
      // Collect distinct non-blank activities; joined with "; " at render time.
      if (activity && !dayRec.activities.includes(activity)) dayRec.activities.push(activity);
      dayRec.lines.push({ hours: h, job, cost_code: costCode });
    }
  }

  const out = [];
  for (const [, W] of weeks) {
    const employees = [];
    const codeAcc = new Map();
    const jobAcc = new Map();
    let weekReg = 0, weekOt = 0, weekTot = 0;

    for (const [, emp] of W.emps) {
      const dayHoursList = [];
      const dayRows = [];
      for (let i = 0; i < 7; i++) {
        const dd = new Date(W.week_start + 'T00:00:00Z');
        dd.setUTCDate(dd.getUTCDate() + i);
        const iso = dd.toISOString().slice(0, 10);
        const rec = emp.daysByDate.get(iso);
        const h = rec ? rec.hours : 0;
        const { reg, ot } = daySplit(h);
        dayHoursList.push(h);
        dayRows.push({
          day: WEEKDAYS[i], date: iso,
          job: rec ? rec.job : '', cost_code: rec ? rec.cost_code : '',
          activity: rec ? (rec.activities || []).join('; ') : '',
          start: rec ? (rec.start || '') : '',
          end: rec ? (rec.end || '') : '',
          regular: reg, ot: ot, total: r2(h), per_diem: '',
        });
        if (rec) {
          for (const ln of rec.lines) {
            const s2 = daySplit(ln.hours);
            const code = ln.cost_code || '(uncoded)';
            const jb = ln.job || '(no job)';
            if (!codeAcc.has(code)) codeAcc.set(code, { code, regular: 0, ot: 0, total: 0 });
            const c = codeAcc.get(code);
            c.regular = r2(c.regular + s2.reg); c.ot = r2(c.ot + s2.ot); c.total = r2(c.total + ln.hours);
            if (!jobAcc.has(jb)) jobAcc.set(jb, { job: jb, regular: 0, ot: 0, total: 0 });
            const j = jobAcc.get(jb);
            j.regular = r2(j.regular + s2.reg); j.ot = r2(j.ot + s2.ot); j.total = r2(j.total + ln.hours);
          }
        }
      }
      const wt = weeklyTotals(dayHoursList);
      const daysWithHours = dayRows.filter((d) => d.total > 0).length;
      employees.push({
        name: emp.name, number: '', title: '',
        status: '', department: 'Field Operations', supervisor: '',
        days: dayRows,
        totals: { regular: wt.regular, ot: wt.ot, total: wt.total, per_diem_nights: 0 },
        days_with_hours: daysWithHours,
      });
      weekReg = r2(weekReg + wt.regular);
      weekOt = r2(weekOt + wt.ot);
      weekTot = r2(weekTot + wt.total);
    }

    employees.sort((a, b) => (b.totals.total - a.totals.total) || a.name.localeCompare(b.name));
    out.push({
      week_label: weekLabel(W.week_start, W.week_end),
      week_start: W.week_start, week_end: W.week_end, crew: 'live',
      employees,
      by_cost_code: Array.from(codeAcc.values()).sort((a, b) => b.total - a.total),
      by_job: Array.from(jobAcc.values()).sort((a, b) => b.total - a.total),
      totals: { regular: weekReg, ot: weekOt, total: weekTot, per_diem_nights: 0 },
      has_hours: weekTot > 0,
      employee_count: employees.length,
    });
  }

  out.sort((a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0));
  return out;
}

// Annual per-employee roll-up: sum each employee's WEEKLY totals across weeks
// (weekly OT accrues per week, never re-pyramided).
export function buildEmployeeYear(weeks) {
  const acc = new Map();
  for (const w of weeks) {
    for (const e of w.employees) {
      if (!acc.has(e.name)) acc.set(e.name, { name: e.name, number: '', title: '', regular: 0, ot: 0, total: 0, per_diem_nights: 0 });
      const a = acc.get(e.name);
      a.regular = r2(a.regular + e.totals.regular);
      a.ot = r2(a.ot + e.totals.ot);
      a.total = r2(a.total + e.totals.total);
    }
  }
  const rows = Array.from(acc.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const grand = rows.reduce((g, r) => ({
    regular: r2(g.regular + r.regular), ot: r2(g.ot + r.ot), total: r2(g.total + r.total), per_diem_nights: 0,
  }), { regular: 0, ot: 0, total: 0, per_diem_nights: 0 });
  return { rows, grand };
}
