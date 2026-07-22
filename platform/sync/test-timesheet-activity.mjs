// Node self-test for the Timesheet ACTIVITY / START / END display fields.
// These are DISPLAY-ONLY additions to the rollup (functions/lib/timesheet-rollup.mjs):
// each per-employee-per-day row must carry the crew member's start/end and the
// report-level workCompleted narrative (the day's activity). The OT/hours math is
// unchanged and is covered by sync/test-ot-engine.mjs (which must still pass).
//
// Run: node sync/test-timesheet-activity.mjs   (exit 0 = all pass, 1 = fail)
import { buildWeeks } from '../functions/lib/timesheet-rollup.mjs';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + JSON.stringify(got)); }
}
function eq(name, got, want) {
  ok(name + '  (want ' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want), got);
}

// Helper: find employee's row for a specific date in the built weeks.
function findDay(weeks, empName, iso) {
  for (const w of weeks) {
    for (const e of w.employees) {
      if (e.name !== empName) continue;
      for (const d of e.days) { if (d.date === iso) return d; }
    }
  }
  return null;
}
function findEmp(weeks, empName) {
  for (const w of weeks) { for (const e of w.employees) { if (e.name === empName) return e; } }
  return null;
}

// ===========================================================================
console.log('--- (a) single report: start/end/activity flow to the employee day ---');
// Week of Sun 2026-07-19 .. Sat 2026-07-25. 2026-07-20 is a Monday.
{
  const reports = [{
    date: '2026-07-20', status: 'sent', projectId: '26-017', projectName: 'Molto Canal',
    workCompleted: 'Installed aggregate piers, rows A-C',
    crew: [{ name: 'Alpha', start: '07:00', end: '15:30', hours: 8.5, costCode: '100' }],
  }];
  const weeks = buildWeeks(reports);
  const d = findDay(weeks, 'Alpha', '2026-07-20');
  ok('day row exists for Alpha on 2026-07-20', !!d, d);
  eq('  start', d && d.start, '07:00');
  eq('  end', d && d.end, '15:30');
  eq('  activity', d && d.activity, 'Installed aggregate piers, rows A-C');
  // Hours math must be intact (display change did not touch it): 8.5h -> reg 8 / ot 0.5
  eq('  regular', d && d.regular, 8);
  eq('  ot', d && d.ot, 0.5);
  eq('  total', d && d.total, 8.5);
  // Other (blank) days in the same week must render blank, NOT undefined.
  const blank = findDay(weeks, 'Alpha', '2026-07-21');
  eq('  blank Tue start is empty string', blank && blank.start, '');
  eq('  blank Tue end is empty string', blank && blank.end, '');
  eq('  blank Tue activity is empty string', blank && blank.activity, '');
}

// ===========================================================================
console.log('\n--- (b) employee across TWO reports in a week: each day its own start/end/activity ---');
{
  const reports = [
    { date: '2026-07-20', status: 'sent', projectId: '26-017', workCompleted: 'Mobilized rig, staged stone',
      crew: [{ name: 'Bravo', start: '06:30', end: '15:00', hours: 8.5, costCode: '100' }] },
    { date: '2026-07-22', status: 'sent', projectId: '26-125', workCompleted: 'Modulus test + QC logging',
      crew: [{ name: 'Bravo', start: '08:00', end: '16:30', hours: 8.5, costCode: '200' }] },
  ];
  const weeks = buildWeeks(reports);
  const mon = findDay(weeks, 'Bravo', '2026-07-20');
  const wed = findDay(weeks, 'Bravo', '2026-07-22');
  eq('Mon start', mon && mon.start, '06:30');
  eq('Mon end', mon && mon.end, '15:00');
  eq('Mon activity', mon && mon.activity, 'Mobilized rig, staged stone');
  eq('Wed start', wed && wed.start, '08:00');
  eq('Wed end', wed && wed.end, '16:30');
  eq('Wed activity', wed && wed.activity, 'Modulus test + QC logging');
  // The two days must be distinct (no bleed between days).
  ok('Mon and Wed activities differ', (mon && wed) && mon.activity !== wed.activity, { mon: mon && mon.activity, wed: wed && wed.activity });
}

// ===========================================================================
console.log('\n--- (c) SAME-DAY multi-report aggregation: earliest start, latest end, joined activities ---');
{
  const reports = [
    { date: '2026-07-20', status: 'sent', projectId: 'JobX', workCompleted: 'Morning: layout',
      crew: [{ name: 'Charlie', start: '09:00', end: '12:00', hours: 3, costCode: '100' }] },
    { date: '2026-07-20', status: 'sent', projectId: 'JobY', workCompleted: 'Afternoon: install',
      crew: [{ name: 'Charlie', start: '07:00', end: '15:30', hours: 8, costCode: '200' }] },
  ];
  const weeks = buildWeeks(reports);
  const d = findDay(weeks, 'Charlie', '2026-07-20');
  eq('earliest non-blank start (07:00, not 09:00)', d && d.start, '07:00');
  eq('latest non-blank end (15:30, not 12:00)', d && d.end, '15:30');
  eq('activities joined distinct with "; "', d && d.activity, 'Morning: layout; Afternoon: install');
  // Hours still SUM across the two reports (3 + 8 = 11 -> reg 8 / ot 3). Math untouched.
  eq('hours summed 11 -> reg 8', d && d.regular, 8);
  eq('hours summed 11 -> ot 3', d && d.ot, 3);
  eq('hours summed 11 -> total 11', d && d.total, 11);
}

// ===========================================================================
console.log('\n--- edge: duplicate identical activity is NOT repeated; blank start/end ignored ---');
{
  const reports = [
    { date: '2026-07-20', status: 'sent', projectId: 'JobX', workCompleted: 'Install piers',
      crew: [{ name: 'Delta', start: '07:00', end: '', hours: 4, costCode: '100' }] },
    { date: '2026-07-20', status: 'sent', projectId: 'JobX', workCompleted: 'Install piers',
      crew: [{ name: 'Delta', start: '', end: '16:00', hours: 4, costCode: '100' }] },
  ];
  const weeks = buildWeeks(reports);
  const d = findDay(weeks, 'Delta', '2026-07-20');
  eq('start from report 1 (blank in report 2 ignored)', d && d.start, '07:00');
  eq('end from report 2 (blank in report 1 ignored)', d && d.end, '16:00');
  eq('identical activity not duplicated', d && d.activity, 'Install piers');
}

// ===========================================================================
console.log('\n--- backward compat: report with NO start/end/activity renders blank cleanly ---');
{
  const reports = [{
    date: '2026-07-20', status: 'sent', projectId: 'OldJob',
    crew: [{ name: 'Echo', hours: 8, costCode: '100' }], // no start/end, no workCompleted
  }];
  const weeks = buildWeeks(reports);
  const d = findDay(weeks, 'Echo', '2026-07-20');
  ok('day row exists', !!d, d);
  eq('start blank', d && d.start, '');
  eq('end blank', d && d.end, '');
  eq('activity blank', d && d.activity, '');
  eq('hours intact', d && d.total, 8);
  // Employee weekly totals unaffected by display fields.
  const emp = findEmp(weeks, 'Echo');
  eq('weekly reg 8', emp && emp.totals.regular, 8);
  eq('weekly ot 0', emp && emp.totals.ot, 0);
}

console.log('\n============================');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
console.log('============================');
process.exit(fail === 0 ? 0 : 1);
