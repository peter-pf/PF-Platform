// Node self-test for the OT engine (PAYROLL-critical). Run: node sync/test-ot-engine.js
// Imports the SAME module the backend + browser use (functions/lib/ot-engine.js)
// and asserts the Brad-approved cases EXACTLY. Exit code 0 = all pass, 1 = fail.
import {
  daySplit, weeklyTotals, weekBounds, weekKey, weekLabel,
} from '../functions/lib/ot-engine.mjs';
import { buildWeeks, buildEmployeeYear } from '../functions/lib/timesheet-rollup.mjs';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + JSON.stringify(got)); }
}
function eq(name, got, want) {
  ok(name + '  (want ' + JSON.stringify(want) + ')', JSON.stringify(got) === JSON.stringify(want), got);
}

console.log('--- DAILY SPLIT ---');
eq('9h day  -> reg 8 / ot 1', daySplit(9), { reg: 8, ot: 1 });
eq('8h day  -> reg 8 / ot 0', daySplit(8), { reg: 8, ot: 0 });
eq('10h day -> reg 8 / ot 2', daySplit(10), { reg: 8, ot: 2 });
eq('5h day  -> reg 5 / ot 0', daySplit(5), { reg: 5, ot: 0 });
eq('0h day  -> reg 0 / ot 0', daySplit(0), { reg: 0, ot: 0 });
eq('blank   -> reg 0 / ot 0', daySplit(''), { reg: 0, ot: 0 });
eq('"9.5" str -> reg 8 / ot 1.5', daySplit('9.5'), { reg: 8, ot: 1.5 });

console.log('\n--- REQUIRED WEEKLY CASES (Brad approved) ---');
// Example A: five 9-hour days = 45h -> Reg 40, OT 5
{
  const t = weeklyTotals([9, 9, 9, 9, 9]);
  ok('Example A: 5x9=45 -> Reg 40', t.regular === 40, t);
  ok('Example A: OT 5', t.ot === 5, t);
  ok('Example A: Total 45', t.total === 45, t);
  ok('Example A: dailyOT 5 + weeklyOT 0', t.dailyOT === 5 && t.weeklyOT === 0, t);
}
// Example B: six 8-hour days = 48h -> Reg 40, OT 8
{
  const t = weeklyTotals([8, 8, 8, 8, 8, 8]);
  ok('Example B: 6x8=48 -> Reg 40', t.regular === 40, t);
  ok('Example B: OT 8', t.ot === 8, t);
  ok('Example B: Total 48', t.total === 48, t);
  ok('Example B: dailyOT 0 + weeklyOT 8', t.dailyOT === 0 && t.weeklyOT === 8, t);
}
// Mixed: four 10-hour days = 40h -> Reg 32, OT 8
{
  const t = weeklyTotals([10, 10, 10, 10]);
  ok('Mixed: 4x10=40 -> Reg 32', t.regular === 32, t);
  ok('Mixed: OT 8', t.ot === 8, t);
  ok('Mixed: Total 40', t.total === 40, t);
  ok('Mixed: dailyOT 8 + weeklyOT 0', t.dailyOT === 8 && t.weeklyOT === 0, t);
}

console.log('\n--- EDGE / SANITY ---');
{
  const t = weeklyTotals([8, 8, 8, 8, 8]); // exactly 40
  ok('5x8=40 -> Reg 40, OT 0', t.regular === 40 && t.ot === 0 && t.total === 40, t);
}
{
  const t = weeklyTotals([]); // empty week
  ok('empty -> 0/0/0', t.regular === 0 && t.ot === 0 && t.total === 0, t);
}
{
  // total must always equal sum of hours worked
  const days = [7, 12, 9, 4, 11, 8];
  const sum = days.reduce((a, b) => a + b, 0); // 51
  const t = weeklyTotals(days);
  ok('total == sum of hours (51)', t.total === sum, { t, sum });
}
{
  // long-day + short-day mix: 12,6 -> day1 reg8 ot4; day2 reg6 ot0
  // weekReg 14 (<40) -> weeklyOT 0; totalOT = 4; reg 14; total 18
  const t = weeklyTotals([12, 6]);
  ok('12+6 -> Reg 14, OT 4, Total 18', t.regular === 14 && t.ot === 4 && t.total === 18, t);
}

console.log('\n--- WEEK BUCKETING (Sun..Sat) ---');
// 2026-07-21 is a Tuesday. Its week = Sun 2026-07-19 .. Sat 2026-07-25.
eq('Tue 2026-07-21 bounds', weekBounds('2026-07-21'), { week_start: '2026-07-19', week_end: '2026-07-25' });
// 2026-07-19 is Sunday (start of week)
eq('Sun 2026-07-19 bounds', weekBounds('2026-07-19'), { week_start: '2026-07-19', week_end: '2026-07-25' });
// 2026-07-25 is Saturday (end of same week)
eq('Sat 2026-07-25 bounds', weekBounds('2026-07-25'), { week_start: '2026-07-19', week_end: '2026-07-25' });
// 2026-07-26 is Sunday -> NEXT week
eq('Sun 2026-07-26 bounds', weekBounds('2026-07-26'), { week_start: '2026-07-26', week_end: '2026-08-01' });
ok('weekKey groups Tue+Sat of same week', weekKey('2026-07-21') === weekKey('2026-07-25'), [weekKey('2026-07-21'), weekKey('2026-07-25')]);
ok('weekKey splits Sat vs next Sun', weekKey('2026-07-25') !== weekKey('2026-07-26'), [weekKey('2026-07-25'), weekKey('2026-07-26')]);
eq('weekLabel 7.19-7.25', weekLabel('2026-07-19', '2026-07-25'), '7.19-7.25');

console.log('\n--- WEEKLY AGGREGATION FROM DAILY REPORTS (buildWeeks) ---');
// Simulate a Sun..Sat week (2026-07-19 .. 2026-07-25) of SUBMITTED daily reports.
// Employee "Alpha": five 9h days Mon-Fri -> Example A -> Reg 40 / OT 5.
// Employee "Bravo": six 8h days Sun-Fri  -> Example B -> Reg 40 / OT 8.
// Employee "Cee":   four 10h days Mon-Thu -> Mixed    -> Reg 32 / OT 8.
function rep(date, crew) {
  return { date, status: 'sent', projectId: '26-001', projectName: 'Test Job', crew };
}
const reports = [
  // Alpha: 9h Mon-Fri
  rep('2026-07-20', [{ name: 'Alpha', hours: 9, costCode: '5200' }]),
  rep('2026-07-21', [{ name: 'Alpha', hours: 9, costCode: '5200' }]),
  rep('2026-07-22', [{ name: 'Alpha', hours: 9, costCode: '5200' }]),
  rep('2026-07-23', [{ name: 'Alpha', hours: 9, costCode: '5200' }]),
  rep('2026-07-24', [{ name: 'Alpha', hours: 9, costCode: '5200' }]),
  // Bravo: 8h Sun-Fri (6 days)
  rep('2026-07-19', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  rep('2026-07-20', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  rep('2026-07-21', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  rep('2026-07-22', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  rep('2026-07-23', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  rep('2026-07-24', [{ name: 'Bravo', hours: 8, costCode: '5200' }]),
  // Cee: 10h Mon-Thu (4 days)
  rep('2026-07-20', [{ name: 'Cee', hours: 10, costCode: '5200' }]),
  rep('2026-07-21', [{ name: 'Cee', hours: 10, costCode: '5200' }]),
  rep('2026-07-22', [{ name: 'Cee', hours: 10, costCode: '5200' }]),
  rep('2026-07-23', [{ name: 'Cee', hours: 10, costCode: '5200' }]),
  // A DRAFT report that must be IGNORED by default (not status 'sent')
  { date: '2026-07-22', status: 'draft', projectId: '26-001', crew: [{ name: 'Alpha', hours: 99, costCode: '5200' }] },
];
const weeks = buildWeeks(reports);
ok('one week produced', weeks.length === 1, weeks.map((w) => w.week_label));
const wk = weeks[0];
ok('week label 7.19-7.25', wk && wk.week_label === '7.19-7.25', wk && wk.week_label);
ok('3 employees', wk && wk.employee_count === 3, wk && wk.employee_count);
function emp(w, nm) { return (w.employees || []).find((e) => e.name === nm); }
{
  const a = emp(wk, 'Alpha');
  ok('Alpha Reg 40 / OT 5 / Tot 45 (draft ignored)',
     a && a.totals.regular === 40 && a.totals.ot === 5 && a.totals.total === 45, a && a.totals);
  ok('Alpha days_with_hours 5', a && a.days_with_hours === 5, a && a.days_with_hours);
}
{
  const b = emp(wk, 'Bravo');
  ok('Bravo Reg 40 / OT 8 / Tot 48', b && b.totals.regular === 40 && b.totals.ot === 8 && b.totals.total === 48, b && b.totals);
}
{
  const c = emp(wk, 'Cee');
  ok('Cee Reg 32 / OT 8 / Tot 40', c && c.totals.regular === 32 && c.totals.ot === 8 && c.totals.total === 40, c && c.totals);
}
// week totals = sum of employees: Reg 40+40+32=112, OT 5+8+8=21, Tot 45+48+40=133
ok('week totals Reg 112 / OT 21 / Tot 133',
   wk.totals.regular === 112 && wk.totals.ot === 21 && wk.totals.total === 133, wk.totals);
// day-level split surfaced on Alpha's Monday (9h -> reg 8 / ot 1)
{
  const a = emp(wk, 'Alpha');
  const mon = a.days.find((d) => d.date === '2026-07-20');
  ok('Alpha Mon day split reg 8 / ot 1 / total 9', mon && mon.regular === 8 && mon.ot === 1 && mon.total === 9, mon);
}

console.log('\n--- ANNUAL ROLL-UP (buildEmployeeYear) ---');
{
  const { rows, grand } = buildEmployeeYear(weeks);
  ok('3 employee-year rows', rows.length === 3, rows.map((r) => r.name));
  ok('grand Reg 112 / OT 21 / Tot 133',
     grand.regular === 112 && grand.ot === 21 && grand.total === 133, grand);
}

console.log('\n--- MULTI-WEEK: OT does NOT pyramid across week boundary ---');
{
  // Same employee, 8h each day across a Sat (2026-07-25) and the next Sun
  // (2026-07-26). These are DIFFERENT weeks, so neither accrues weekly OT.
  const r2w = [
    rep('2026-07-25', [{ name: 'Dee', hours: 8, costCode: '5200' }]), // week A (Sat)
    rep('2026-07-26', [{ name: 'Dee', hours: 8, costCode: '5200' }]), // week B (Sun)
  ];
  const w2 = buildWeeks(r2w);
  ok('splits into 2 weeks', w2.length === 2, w2.map((w) => w.week_label));
  const allReg = w2.every((w) => emp(w, 'Dee').totals.regular === 8 && emp(w, 'Dee').totals.ot === 0);
  ok('each week Reg 8 / OT 0 (no cross-week pyramiding)', allReg, w2.map((w) => emp(w, 'Dee').totals));
}

console.log('\n--- EMPTY / FALLBACK ---');
ok('no reports -> no weeks', buildWeeks([]).length === 0, buildWeeks([]));
ok('only drafts -> no weeks (default)', buildWeeks([{ date: '2026-07-20', status: 'draft', crew: [{ name: 'X', hours: 8 }] }]).length === 0, 'ok');
ok('includeDrafts=1 picks up drafts', buildWeeks([{ date: '2026-07-20', status: 'draft', crew: [{ name: 'X', hours: 8 }] }], { includeDrafts: true }).length === 1, 'ok');

console.log('\n============================');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
console.log('============================');
if (fail > 0) process.exit(1);
