// Harness for the ONE-SOURCE Total LF / # of Piers wiring (Brad 2026-08-14).
// Runs from platform/:  node test-harness/one-source-lf-piers.test.js
//
// PROVES that all THREE surfaces derive Total LF / # of Piers from the SAME
// source — the E&D Submittal Summary (__site_elevations Pier Qty + Total LF
// columns under the `engineering` override, keyed by project number) — and that
// they render IDENTICAL values:
//   1) General Info auto-pull        -> pfSubmittalGeneralInfoPull() (current proj)
//   2) Project Summary header strip  -> window.pfSubmittalSummaryTotalsFor(num) + pfFmtQty
//   3) Active Projects Summary page  -> totalLfFor(num) / piersFor(num)
// Plus: fail-closed EMPTY state (no Submittal Summary data -> blank/"—", NEVER a
// fabricated fallback) and portal comma formatting (pfFmtQty).
//
// Pure logic: extracts the REAL function bodies from index.html and runs them in a
// vm sandbox with an injectable window.PF_PROJECT_OVERRIDES + _curOverrides. No
// live server.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- brace-matched top-level `function NAME(...) {...}` extractor -----------------
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

// ---- extract a `window.NAME = function(...) {...};` assignment --------------------
function extractWindowAssign(src, name) {
  const m = new RegExp('window\\.' + name + '\\s*=\\s*function\\s*\\(').exec(src);
  if (!m) throw new Error('window.' + name + ' not found');
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  let end = j;
  if (src[end] === ';') end++;
  return src.slice(m.index, end);
}

const pfFmtQtySrc          = extractWindowAssign(html, 'pfFmtQty');
const pfSubTotalsForSrc    = extractWindowAssign(html, 'pfSubmittalSummaryTotalsFor');
const pfSiteElevationsSrc  = extractFn(html, 'pfSiteElevations');
const pfSgeCellNumSrc      = extractFn(html, 'pfSgeCellNum');
const pfSgeSumFieldSrc     = extractFn(html, 'pfSgeSumField');
const pfPullSrc            = extractFn(html, 'pfSubmittalGeneralInfoPull');
const totalLfForSrc        = extractFn(html, 'totalLfFor');
const piersForSrc          = extractFn(html, 'piersFor');

// A DASH const lives in the Active Projects IIFE scope; the extracted totalLfFor /
// piersFor reference it, so provide it in the sandbox exactly as index.html does.
function buildSandbox(state) {
  const win = {
    PF_PROJECT_OVERRIDES: state.PF_PROJECT_OVERRIDES || {},
    // Present but intentionally IGNORED by the new wiring — a stale bid_log / progress
    // number must NEVER leak in. Seed them with WRONG values to prove they're not read.
    PF_PROGRESS: state.PF_PROGRESS || { projects: {} },
    PF_PROJECT_RECORDS: state.PF_PROJECT_RECORDS || { records: {} },
  };
  const sandbox = {
    window: win,
    DASH: '—',                              // em dash, matches index.html summary DASH
    // _curOverrides drives pfSiteElevations() (the General Info pull's read path).
    _curOverrides: state._curOverrides || {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    pfFmtQtySrc + '\n' +
    pfSubTotalsForSrc + '\n' +
    pfSgeCellNumSrc + '\n' +
    pfSgeSumFieldSrc + '\n' +
    pfSiteElevationsSrc + '\n' +
    pfPullSrc + '\n' +
    totalLfForSrc + '\n' +
    piersForSrc + '\n' +
    'this.__pull = pfSubmittalGeneralInfoPull;' +
    'this.__totalLfFor = totalLfFor;' +
    'this.__piersFor = piersFor;' +
    'this.__subTotals = window.pfSubmittalSummaryTotalsFor;' +
    'this.__fmtQty = window.pfFmtQty;',
    sandbox
  );
  return sandbox;
}

// The Project Summary HEADER strip logic (verbatim from renderInto ~L16509):
//   _hQtyOrDash(raw) = raw==''? '—' : String(window.pfFmtQty(raw))
// applied to window.pfSubmittalSummaryTotalsFor(num).{totalLf,pierQty}.
function headerStrip(sb, num) {
  const sub = sb.__subTotals(num);
  const dash = '—';
  const qtyOrDash = function (raw) {
    if (raw == null || raw === '') return dash;
    return String(sb.__fmtQty(raw));
  };
  return { totalLf: qtyOrDash(sub.totalLf), piers: qtyOrDash(sub.pierQty) };
}

// ---- test runner -----------------------------------------------------------------
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

function overridesFor(num, rows) {
  const o = {};
  o[num] = { sections: { engineering: { __site_elevations: rows } }, _meta: null };
  return o;
}

const DASH = '—';

// =================================================================================
console.log('\n[1] All three surfaces agree for a normal project (2 areas)');
{
  const NUM = '26-001';
  const rows = [
    { id: 'a', area: 'Bldg A', pierQty: '1,200', totalLf: '11,500', columnDiameter: '30' },
    { id: 'b', area: 'Bldg B', pierQty: '862',   totalLf: '8,281',  columnDiameter: '30' },
  ];
  const sb = buildSandbox({
    PF_PROJECT_OVERRIDES: overridesFor(NUM, rows),
    _curOverrides: { engineering: { __site_elevations: rows } },  // current project = same
    // WRONG stale numbers in the OLD sources — must be ignored entirely.
    PF_PROGRESS: { projects: { [NUM]: { design_lf: '99999', design_columns: '99999' } } },
    PF_PROJECT_RECORDS: { records: { [NUM]: { bid_log: { total_lf: '88888', total_columns: '88888' } } } },
  });

  // (1) General Info auto-pull -> raw sums 2062 / 19781, then pfFmtQty for display.
  const pull = sb.__pull();
  const giLf    = String(sb.__fmtQty(pull.totalLf));
  const giPiers = String(sb.__fmtQty(pull.pierQty));
  ok('General Info raw pierQty = 2062', pull.pierQty === '2062', pull.pierQty);
  ok('General Info raw totalLf = 19781', pull.totalLf === '19781', pull.totalLf);
  ok('General Info displays 19,781 LF (comma)', giLf === '19,781', giLf);
  ok('General Info displays 2,062 piers (comma)', giPiers === '2,062', giPiers);

  // (2) Project Summary header strip.
  const hdr = headerStrip(sb, NUM);
  ok('Header Total LF = 19,781', hdr.totalLf === '19,781', hdr.totalLf);
  ok('Header # of Piers = 2,062', hdr.piers === '2,062', hdr.piers);

  // (3) Active Projects Summary page.
  const sumLf    = sb.__totalLfFor(NUM);
  const sumPiers = sb.__piersFor(NUM);
  ok('Summary page Total LF = 19,781', sumLf === '19,781', sumLf);
  ok('Summary page # of Piers = 2,062', sumPiers === '2,062', sumPiers);

  // CROSS-SURFACE EQUALITY — the whole point.
  ok('EQUAL: General Info LF == Header LF == Summary LF',
     giLf === hdr.totalLf && hdr.totalLf === sumLf, [giLf, hdr.totalLf, sumLf].join(' | '));
  ok('EQUAL: General Info Piers == Header Piers == Summary Piers',
     giPiers === hdr.piers && hdr.piers === sumPiers, [giPiers, hdr.piers, sumPiers].join(' | '));

  // NEGATIVE: the stale bid_log/progress numbers must NOT appear anywhere.
  ok('stale 99,999 / 88,888 never surface',
     ![giLf, giPiers, hdr.totalLf, hdr.piers, sumLf, sumPiers].some(v => /99,999|88,888/.test(v)));
}

console.log('\n[2] FAIL-CLOSED: no Submittal Summary data -> blank / DASH everywhere');
{
  const NUM = '26-099';
  // Override exists but empty array (or missing entirely) -> no data.
  const sb = buildSandbox({
    PF_PROJECT_OVERRIDES: overridesFor(NUM, []),
    _curOverrides: { engineering: { __site_elevations: [] } },
    // Stale numbers present — must NOT be used as a fallback.
    PF_PROGRESS: { projects: { [NUM]: { design_lf: '5000', design_columns: '400' } } },
    PF_PROJECT_RECORDS: { records: { [NUM]: { bid_log: { total_lf: '5000', total_columns: '400' } } } },
  });
  const pull = sb.__pull();
  ok('General Info pierQty blank', pull.pierQty === '', JSON.stringify(pull.pierQty));
  ok('General Info totalLf blank', pull.totalLf === '', JSON.stringify(pull.totalLf));

  const hdr = headerStrip(sb, NUM);
  ok('Header Total LF = DASH (fail-closed)', hdr.totalLf === DASH, hdr.totalLf);
  ok('Header # of Piers = DASH (fail-closed)', hdr.piers === DASH, hdr.piers);

  ok('Summary page Total LF = DASH', sb.__totalLfFor(NUM) === DASH, sb.__totalLfFor(NUM));
  ok('Summary page # of Piers = DASH', sb.__piersFor(NUM) === DASH, sb.__piersFor(NUM));

  // Never fabricated: the stale 5000/400 must not leak.
  ok('no fabricated 5,000 / 400 fallback',
     ![hdr.totalLf, hdr.piers, sb.__totalLfFor(NUM), sb.__piersFor(NUM)].some(v => /5,000|400/.test(v)));

  // No override at all for a different number.
  const NUM2 = '26-100';
  const hdr2 = headerStrip(sb, NUM2);
  ok('Missing override -> Header DASH', hdr2.totalLf === DASH && hdr2.piers === DASH);
  ok('Missing override -> Summary DASH', sb.__totalLfFor(NUM2) === DASH && sb.__piersFor(NUM2) === DASH);
}

console.log('\n[3] Partial data — one column numeric, other all-blank -> that column DASH');
{
  const NUM = '26-050';
  const rows = [
    { id: 'a', pierQty: '', totalLf: '4,000', columnDiameter: '30' },
    { id: 'b', pierQty: '', totalLf: '3,000', columnDiameter: '30' },
  ];
  const sb = buildSandbox({
    PF_PROJECT_OVERRIDES: overridesFor(NUM, rows),
    _curOverrides: { engineering: { __site_elevations: rows } },
  });
  const pull = sb.__pull();
  ok('General Info totalLf = 7000', pull.totalLf === '7000', pull.totalLf);
  ok('General Info pierQty blank (all-blank col, never 0)', pull.pierQty === '', JSON.stringify(pull.pierQty));

  const hdr = headerStrip(sb, NUM);
  ok('Header Total LF = 7,000', hdr.totalLf === '7,000', hdr.totalLf);
  ok('Header # of Piers = DASH (no numeric pier cell)', hdr.piers === DASH, hdr.piers);

  ok('Summary LF = 7,000', sb.__totalLfFor(NUM) === '7,000', sb.__totalLfFor(NUM));
  ok('Summary piers = DASH', sb.__piersFor(NUM) === DASH, sb.__piersFor(NUM));

  ok('EQUAL (LF): 7,000 across GI/header/summary',
     String(sb.__fmtQty(pull.totalLf)) === hdr.totalLf && hdr.totalLf === sb.__totalLfFor(NUM));
}

console.log('\n[4] Cells carrying unit suffixes still sum + agree ("17,003 LF")');
{
  const NUM = '26-060';
  const rows = [
    { id: 'a', pierQty: '500', totalLf: '17,003 LF' },
    { id: 'b', pierQty: '250', totalLf: '2,000 LF' },
  ];
  const sb = buildSandbox({
    PF_PROJECT_OVERRIDES: overridesFor(NUM, rows),
    _curOverrides: { engineering: { __site_elevations: rows } },
  });
  const pull = sb.__pull();
  const hdr = headerStrip(sb, NUM);
  ok('LF sum strips units -> 19,003', hdr.totalLf === '19,003', hdr.totalLf);
  ok('Piers -> 750', hdr.piers === '750', hdr.piers);
  ok('EQUAL across all three (LF)',
     String(sb.__fmtQty(pull.totalLf)) === hdr.totalLf && hdr.totalLf === sb.__totalLfFor(NUM));
  ok('EQUAL across all three (piers)',
     String(sb.__fmtQty(pull.pierQty)) === hdr.piers && hdr.piers === sb.__piersFor(NUM));
}

// =================================================================================
console.log('\n----------------------------------------');
console.log('  ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
