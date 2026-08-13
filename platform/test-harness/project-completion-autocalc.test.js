// Harness: Feature 3 — General Info "Project Completion" auto-calc (Brad 2026-08-13).
// Proves the completion date = "Anticipated Project Start" + "Projected Duration
// (Days)" counted as CALENDAR days, using the SAME helpers the render path uses,
// extracted verbatim from index.html (no re-implementation):
//   pfParseDate / _pfMkDate  -> parse the stored start date
//   pfParseNum               -> parse the stored duration
//   pfAddCalendarDays        -> the new month/year-safe calendar-day adder
//   window.pfFmtDate         -> the SAME MM/DD/YYYY formatter field() renders with
// Coverage:
//   (a) POET real case: 08/20/2026 + 18 -> 09/07/2026 (month rollover, Brad's example)
//   (b) plain in-month add (no rollover)
//   (c) month rollover
//   (d) YEAR rollover (Dec -> Jan next year)
//   (e) leap-year Feb boundary
//   (f) accepts multiple stored date shapes (ISO, M/D/YYYY, 2-digit year)
//   (g) FAIL-CLOSED: missing/blank/unparseable start -> '' (blank, never a guess)
//   (h) FAIL-CLOSED: missing/blank/unparseable duration -> ''
//   (i) duration 0 -> completion == start
//   (j) output FORMAT is exactly MM/DD/YYYY via the shared formatter
//   (k) the compute expression wired into General Info exists in index.html
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---- Extract a named `function NAME(...) {...}` body (brace-matched). ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

// ---- Extract the `window.pfFmtDate = function(v){...};` expression (assigned form). ----
function extractAssignedFn(src, lhs) {
  const startRe = new RegExp(lhs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*function\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('assigned function not found: ' + lhs);
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j + 1); // include the closing brace; caller adds ';'
}

// Pull the helpers used by the render-time compute, verbatim.
const src = [
  extractFn(html, '_pfMkDate'),
  extractFn(html, 'pfParseDate'),
  extractFn(html, 'pfParseNum'),
  extractFn(html, 'pfAddCalendarDays'),
].join('\n');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(
  src + '\n'
  + extractAssignedFn(html, 'window.pfFmtDate') + ';\n'
  + 'this.__parseDate = pfParseDate;'
  + 'this.__parseNum = pfParseNum;'
  + 'this.__addCal = pfAddCalendarDays;'
  + 'this.__fmt = window.pfFmtDate;',
  sandbox);

const parseDate = sandbox.__parseDate;
const parseNum = sandbox.__parseNum;
const addCal = sandbox.__addCal;
const fmt = sandbox.__fmt;

// Reproduce the EXACT render-time compute (mirrors the IIFE wired into General Info).
function completion(startVal, durVal) {
  const start = parseDate(startVal);
  const dur = parseNum(durVal);
  if (!start || dur === null) return '';
  const end = addCal(start, dur);
  if (!end) return '';
  return String(fmt(end)); // field() runs pfFmtDate on the synced value it receives
}

// (a) POET real case + Brad's stated example.
ok('(a) 2026-08-20 + 18 -> 09/07/2026', completion('2026-08-20', '18') === '09/07/2026');
ok('(a2) Brad example M/D/YYYY 08/20/2026 + 18 -> 09/07/2026', completion('08/20/2026', '18') === '09/07/2026');

// (b) plain in-month add.
ok('(b) 2026-03-01 + 10 -> 03/11/2026', completion('2026-03-01', '10') === '03/11/2026');

// (c) month rollover.
ok('(c) 2026-01-25 + 10 -> 02/04/2026', completion('2026-01-25', '10') === '02/04/2026');

// (d) YEAR rollover.
ok('(d) 2026-12-25 + 10 -> 01/04/2027', completion('2026-12-25', '10') === '01/04/2027');
ok('(d2) 2026-12-31 + 1 -> 01/01/2027', completion('2026-12-31', '1') === '01/01/2027');

// (e) leap-year Feb boundary (2028 is a leap year: Feb has 29 days).
ok('(e) 2028-02-20 + 10 -> 03/01/2028 (leap)', completion('2028-02-20', '10') === '03/01/2028');
ok('(e2) 2027-02-20 + 10 -> 03/02/2027 (non-leap)', completion('2027-02-20', '10') === '03/02/2027');

// (f) multiple stored date shapes accepted.
ok('(f) 2-digit year 8/20/26 + 18 -> 09/07/2026', completion('8/20/26', '18') === '09/07/2026');
ok('(f2) dashed M-D-YYYY 08-20-2026 + 18 -> 09/07/2026', completion('08-20-2026', '18') === '09/07/2026');

// (g) FAIL-CLOSED on start.
ok('(g) blank start -> ""', completion('', '18') === '');
ok('(g2) null start -> ""', completion(null, '18') === '');
ok('(g3) undefined start -> ""', completion(undefined, '18') === '');
ok('(g4) junk start -> ""', completion('not a date', '18') === '');
ok('(g5) impossible date 2026-02-30 -> ""', completion('2026-02-30', '18') === '');

// (h) FAIL-CLOSED on duration.
ok('(h) blank duration -> ""', completion('2026-08-20', '') === '');
ok('(h2) null duration -> ""', completion('2026-08-20', null) === '');
ok('(h3) undefined duration -> ""', completion('2026-08-20', undefined) === '');
ok('(h4) junk duration -> ""', completion('2026-08-20', 'soon') === '');
ok('(h5) both missing -> ""', completion('', '') === '');

// (i) duration 0 -> completion == start (no shift).
ok('(i) 2026-08-20 + 0 -> 08/20/2026', completion('2026-08-20', '0') === '08/20/2026');

// (j) output format is exactly MM/DD/YYYY (zero-padded).
ok('(j) padded MM/DD/YYYY 2026-01-05 + 3 -> 01/08/2026', completion('2026-01-05', '3') === '01/08/2026');
ok('(j2) format regex MM/DD/YYYY', /^\d{2}\/\d{2}\/\d{4}$/.test(completion('2026-08-20', '18')));

// (k) duration parsing tolerance: "18.0" behaves like 18 (Math.trunc in adder);
//     a comma'd / spaced duration still parses (pfParseNum strips those).
ok('(k) "18.0" -> 09/07/2026 (trunc)', completion('2026-08-20', '18.0') === '09/07/2026');
ok('(k2) " 18 " -> 09/07/2026 (trimmed)', completion('2026-08-20', ' 18 ') === '09/07/2026');

// (l) STRUCTURAL: the render path is actually wired (compute exists in General Info,
//     reading effective start + duration, and pfAddCalendarDays is defined).
ok('(l) pfAddCalendarDays defined in index.html', /function pfAddCalendarDays\s*\(/.test(html));
ok('(l2) compute reads effective start', /effVal\('general',\s*'Anticipated Project Start'/.test(html));
ok('(l3) compute reads effective duration', /effVal\('general',\s*'Projected Duration \(Days\)'/.test(html));
ok('(l4) compute wired into a Project Completion field', /field\('Project Completion',\s*\(function\(\)/.test(html));

console.log('\nFeature 3 (project completion auto-calc): ' + pass + ' passed, ' + fail + ' failed'
  + (fail ? ('\nFAILURES: ' + fails.join(', ')) : ''));
process.exit(fail ? 1 : 0);
