// Harness: portal-wide MM/DD/YYYY date formatting (Brad 2026-08-13).
// Proves three things, all against code extracted VERBATIM from index.html
// (no re-implementation of the logic under test):
//
//   (a) THE BUG FIX — the project-record field() renderer, when handed a computed
//       Date OBJECT (the "Project Completion" auto-calc = start + duration), now
//       renders MM/DD/YYYY (e.g. 04/15/2026) instead of the raw JS Date.toString()
//       ("Wed Apr 15 2026 00:00:00 GMT-0400 (Eastern Daylight Time)"). Also proves
//       it STILL fails closed to the blank "-" when start/duration are missing.
//
//   (b) window.pfFmtDate outputs MM/DD/YYYY for every input SHAPE the portal stores
//       (ISO YYYY-MM-DD, M/D/YY, M-D-YYYY, YYYY/MM/DD, epoch-ms, Date object) and is
//       blank-graceful on empty/invalid (never "Invalid Date"/NaN); non-date text
//       passes through unchanged (fail-safe, never fabricated).
//
//   (c) STATIC SCAN — no user-facing displayed date field emits a raw
//       Date.toString()/toDateString(), and every date-property render site that
//       used to interpolate a stored ISO string now routes through a MM/DD/YYYY
//       formatter (window.pfFmtDate / a local fmtDate that outputs MM/DD/YYYY).
//
// Run: node platform/test-harness/date-format-mmddyyyy.test.js   (cwd = platform/)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---- brace-matched extractors (same technique as the other harnesses) ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0, j = src.indexOf('{', m.index);
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}
function extractAssignedFn(src, lhs) {
  const startRe = new RegExp(lhs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*function\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('assigned function not found: ' + lhs);
  let depth = 0, j = src.indexOf('{', m.index);
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j + 1);
}

// ============================================================
// (a) + (b): run the REAL field() + REAL pfFmtDate/helpers in a VM.
// ============================================================
// We stub only field()'s presentation-plumbing dependencies (escape, override
// lookup, live-edit gates, phone/qty formatters) — NONE of which touch the
// date->string path under test — and inject the REAL date helpers verbatim.
const sandbox = { window: {}, console };
vm.createContext(sandbox);

const bootstrap = [
  // Real global date formatter + label gate (the single source of truth).
  extractAssignedFn(html, 'window.pfFmtDate') + ';',
  'window.PF_DATE_LABEL_RE = ' + (function(){
     // pull the exact regex literal assigned in index.html
     const m = /window\.PF_DATE_LABEL_RE\s*=\s*(\/[\s\S]*?\/[a-z]*);/.exec(html);
     if (!m) throw new Error('PF_DATE_LABEL_RE literal not found');
     return m[1];
   })() + ';',
  extractAssignedFn(html, 'window.pfIsDateLabel') + ';',
  // Module-local date helpers used by field() (thin delegators + calendar adder).
  'function pfFmtDate(v){ return window.pfFmtDate(v); }',
  'function pfIsDateLabel(label){ return window.pfIsDateLabel(label); }',
  extractFn(html, '_pfMkDate'),
  extractFn(html, 'pfParseDate'),
  extractFn(html, 'pfParseNum'),
  extractFn(html, 'pfAddCalendarDays'),
  // ---- stubs for field()'s NON-date plumbing (behavior-neutral for our cases) ----
  'function E(s){ return s === undefined || s === null ? "" : String(s); }',      // no-op escape (we assert on substrings)
  'function ovLookup(){ return { has:false, value:undefined }; }',                 // no manual overrides in these cases
  'var _curSection = "general";',                                                  // section key ovLookup is called with
  'var _srLiveEdit = false;',                                                      // read view, not live-edit
  'function canEdit(){ return false; }',
  'function pfIsTextareaLabel(){ return false; }',
  'function pfIsPhoneLabel(){ return false; }',
  'function pfIsQtyLabel(){ return false; }',
  'window.pfFmtPhone = function(v){ return v; };',
  'window.pfFmtQty = function(v){ return v; };',
  'function pfFmtPhone(v){ return v; }',
  // The REAL field() renderer, verbatim.
  extractFn(html, 'field'),
  // exports
  'this.__field = field;',
  'this.__fmt = window.pfFmtDate;',
  'this.__parseDate = pfParseDate;',
  'this.__parseNum = pfParseNum;',
  'this.__addCal = pfAddCalendarDays;',
  // In-realm Date factory so `x instanceof Date` inside pfFmtDate/field sees the
  // sandbox's Date constructor (a cross-realm `new Date()` from the test file would
  // be a DIFFERENT Date class and fail instanceof — a VM artifact, not portal behavior).
  'this.__mkDate = function(y,mo,d){ return new Date(y,mo,d); };',
  'this.__badDate = function(){ return new Date("nope"); };',
].join('\n');

vm.runInContext(bootstrap, sandbox);
const field = sandbox.__field;
const fmt = sandbox.__fmt;
const parseDate = sandbox.__parseDate;
const parseNum = sandbox.__parseNum;
const addCal = sandbox.__addCal;
const mkDate = sandbox.__mkDate;    // Date constructed in the sandbox realm
const badDate = sandbox.__badDate;

// Reproduce the EXACT General Info compute (mirrors the IIFE wired into the record):
// it passes the computed Date OBJECT straight into field() as the value.
function completionValue(startVal, durVal) {
  const start = parseDate(startVal);
  const dur = parseNum(durVal);
  if (!start || dur === null) return '';
  const end = addCal(start, dur);
  return end || '';
}
function renderCompletion(startVal, durVal) {
  return field('Project Completion', completionValue(startVal, durVal), 'Auto (start + duration)');
}

const RAW_DATE_RE = /[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}\s\d{4}|GMT[+-]\d{4}|\(Eastern|\(Coordinated Universal Time\)/;

// ---- (a) THE BUG: Date object -> MM/DD/YYYY through field(), no raw toString ----
// Brad's example: start 03/28/2026 + 18 calendar days = 04/15/2026.
const h1 = renderCompletion('03/28/2026', '18');
ok('(a1) field(Date) renders 04/15/2026', h1.indexOf('04/15/2026') !== -1);
ok('(a2) field(Date) does NOT emit raw Date.toString()', !RAW_DATE_RE.test(h1));
ok('(a3) field(Date) not GMT/Eastern string', h1.indexOf('GMT') === -1 && h1.indexOf('Eastern') === -1);
// ISO-stored start behaves identically.
const h2 = renderCompletion('2026-03-28', '18');
ok('(a4) ISO start -> 04/15/2026 via field()', h2.indexOf('04/15/2026') !== -1 && !RAW_DATE_RE.test(h2));
// A second concrete case (month rollover): 08/20/2026 + 18 = 09/07/2026.
const h3 = renderCompletion('08/20/2026', '18');
ok('(a5) field(Date) 08/20/2026+18 -> 09/07/2026', h3.indexOf('09/07/2026') !== -1 && !RAW_DATE_RE.test(h3));
// FAIL-CLOSED: missing start/duration -> blank "-" (amber empty), never a guessed date.
const hBlankStart = renderCompletion('', '18');
ok('(a6) blank start -> amber "-" blank (no date)', /class="pr-field-value empty blank"/.test(hBlankStart) && hBlankStart.indexOf('/2026') === -1);
const hBlankDur = renderCompletion('03/28/2026', '');
ok('(a7) blank duration -> amber "-" blank (no date)', /class="pr-field-value empty blank"/.test(hBlankDur) && hBlankDur.indexOf('/2026') === -1);
// A raw Date passed as a non-completion date field also formats (label is a date label).
const hReleased = field('Released to Start Submittals', mkDate(2026, 3, 15), '');
ok('(a8) any date-labelled field formats a Date object', hReleased.indexOf('04/15/2026') !== -1 && !RAW_DATE_RE.test(hReleased));

// ---- (b) pfFmtDate output shape coverage ----
ok('(b1) ISO YYYY-MM-DD -> MM/DD/YYYY', fmt('2026-04-15') === '04/15/2026');
ok('(b2) ISO w/ time -> MM/DD/YYYY', fmt('2026-04-15T00:00:00') === '04/15/2026');
ok('(b3) M/D/YY 2-digit year', fmt('4/5/26') === '04/05/2026');
ok('(b4) M-D-YYYY dashed', fmt('4-5-2026') === '04/05/2026');
ok('(b5) YYYY/MM/DD slashes', fmt('2026/04/15') === '04/15/2026');
ok('(b6) already MM/DD/YYYY idempotent', fmt('04/15/2026') === '04/15/2026');
ok('(b7) Date object -> MM/DD/YYYY', fmt(mkDate(2026, 3, 15)) === '04/15/2026');
ok('(b8) zero-padded single digits', fmt('2026-1-5') === '01/05/2026');
ok('(b9) empty string -> empty', fmt('') === '');
ok('(b10) null passes through (like esc)', fmt(null) === null);
ok('(b11) undefined passes through', fmt(undefined) === undefined);
ok('(b12) invalid Date -> ""', fmt(badDate()) === '');
ok('(b13) impossible date (month 13) -> raw unchanged', fmt('2026-13-40') === '2026-13-40');
ok('(b14) non-date text unchanged (never fabricated)', fmt('March 30, 2026') === 'March 30, 2026');
ok('(b15) plain number NOT mis-parsed as date', fmt('24') === '24');
ok('(b16) matches MM/DD/YYYY regex', /^\d{2}\/\d{2}\/\d{4}$/.test(fmt('2026-4-5')));

// ============================================================
// (c) STATIC SCAN: no user-facing displayed date emits a raw Date.toString(),
//     and known date-property render sites route through a MM/DD/YYYY formatter.
// ============================================================
// (c1) No .toDateString() anywhere (that IS the raw "Wed Apr 15 2026" form).
ok('(c1) no .toDateString() in index.html', html.indexOf('.toDateString(') === -1);

// (c2) The field() value coercion guards a Date OBJECT before String(val) so a Date
//      can never reach the DOM as its default toString. (The fix line.)
ok('(c2) field() has Date-object guard before String(val)', /if\s*\(\s*val instanceof Date\s*\)\s*\{\s*val = String\(pfFmtDate\(val\)\);/.test(html));

// (c3) The load-test Test Date renderer now delegates to the canonical formatter
//      (was month-abbrev toLocaleDateString).
ok('(c3) formatDate() routes through window.pfFmtDate', /function formatDate\(dateStr\)\s*\{\s*return window\.pfFmtDate\(dateStr\)/.test(html));

// (c4) Known live/data date-property render sites now wrap the value in a MM/DD/YYYY
//      formatter (window.pfFmtDate) rather than interpolating the raw stored string.
const mustFormat = [
  ['pay-app date',            "a.date ? E(window.pfFmtDate(a.date))"],
  ['budget invoice date',     "E(window.pfFmtDate(iv.date) || '')"],
  ['daily-report list date',  "E(window.pfFmtDate(r.date) || '')"],
  ['timesheet day date',      "E(window.pfFmtDate(d.date) || '')"],
  ['deadline cal date',       "E(window.pfFmtDate(e.date) || '')"],
  ['bd activity date (rec)',  "E(window.pfFmtDate(it.date) || '')"],
  ['bd activity date (meta)', "E(window.pfFmtDate(it.date) || '')"],
  ['equipment service date',  "esc(window.pfFmtDate(h.date) || '')"],
  ['guhma install date',      "(window.pfFmtDate(p.date) || '')"],
  ['proposal history date',   "esc(window.pfFmtDate(p.date) || '')"],
  ['feasibility hist date',   "esc(window.pfFmtDate(s.date) || '')"],
  ['est history date',        "h.date ? esc(window.pfFmtDate(h.date)) : '--'"],
  ['action due date',         "'due ' + E(window.pfFmtDate(a.dueDate) || '')"],
  ['action completed date',   "E(window.pfFmtDate((a.completedAt || '').slice(0, 10)) || '')"],
  ['daily-report edit toast', "(window.pfFmtDate(r.date) || '')"],
  ['sge source-pdf date',     "E(String(window.pfFmtDate(sp.date)))"],
];
mustFormat.forEach(function (pair) {
  ok('(c4) formatted: ' + pair[0], html.indexOf(pair[1]) !== -1);
});

// (c5) Anti-regression: the two OLD raw-render forms we corrected are GONE.
ok("(c5a) old raw 'E(iv.date || \"\")' removed", html.indexOf("E(iv.date || '')") === -1);
ok("(c5b) old raw '<td>' + p.date + '</td>' (guhma) removed", html.indexOf("'<td>' + p.date + '</td>'") === -1);

console.log('\nDate-format MM/DD/YYYY: ' + pass + ' passed, ' + fail + ' failed'
  + (fail ? ('\nFAILURES: ' + fails.join(', ')) : ''));
process.exit(fail ? 1 : 0);
