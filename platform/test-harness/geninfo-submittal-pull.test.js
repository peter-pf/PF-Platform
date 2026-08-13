// Harness for the General Info AUTO-PULL from the E&D Submittal Summary (Brad 2026-08-13).
// Runs from platform/:  node test-harness/geninfo-submittal-pull.test.js
//
// PROVES the three General Info fields compute correctly from a sample __site_elevations:
//   "Total Pier Qty (Approved Submittal)" = SUM of pierQty across areas
//   "Total LF (Approved Submittal)"       = SUM of totalLf across areas
//   "Column Diameter"                     = uniform value, or the distinct set (mixed)
// Plus: comma formatting (via the real field() qty gate), blank when no areas
// (fail-closed), and manual-override precedence (a non-empty override wins).
//
// Pure logic: extracts the REAL function bodies from index.html
// (pfSiteElevations, pfSgeCellNum, pfSgeSumField, pfSubmittalGeneralInfoPull, field,
//  pfIsQtyLabel, pfFmtQty, ovLookup) and runs them in a vm sandbox with injectable
// _curOverrides. No live server.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- window.esc / E (canonical escaper) — verbatim from index.html --------------
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- brace-matched top-level function extractor (same idiom as extract.js) -------
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

// ---- extract window.pfFmtQty (an assignment, not a `function NAME`) --------------
function extractPfFmtQty(src) {
  const m = /window\.pfFmtQty\s*=\s*function\s*\(/.exec(src);
  if (!m) throw new Error('pfFmtQty not found');
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  // include the trailing ';' if present
  let end = j;
  if (src[end] === ';') end++;
  return src.slice(m.index, end);
}

const pfSiteElevationsSrc = extractFn(html, 'pfSiteElevations');
const pfSgeCellNumSrc     = extractFn(html, 'pfSgeCellNum');
const pfSgeSumFieldSrc    = extractFn(html, 'pfSgeSumField');
const pfPullSrc           = extractFn(html, 'pfSubmittalGeneralInfoPull');
const pfIsQtyLabelSrc     = extractFn(html, 'pfIsQtyLabel');
const fieldSrc            = extractFn(html, 'field');       // FIRST match = main render field()
const pfFmtQtySrc         = extractPfFmtQty(html);

// The main field() references several display helpers + globals; we stub the ones the
// three target fields DO NOT exercise (dates/phones/textareas/live-edit) and provide the
// real qty path (pfIsQtyLabel + pfFmtQty). ovLookup drives override precedence.

function buildSandbox(state) {
  const sandbox = {
    E: esc,
    window: {},
    // --- pulled the two module-level regexes field()->pfIsQtyLabel needs ---
    PF_QTY_LABEL_RE: /\bLF\b|\bpier\b|\bpiers\b|\bcolumns?\b|\bstone\b|\bspoils\b|\bTN\b|\bSF\b|\bacres?\b/i,
    PF_QTY_LABEL_EXCLUDE_RE: /project\s*#|\bGC\b.*#|zip|\byear\b|\bdate\b|cost\s*code|\bphone\b/i,
    // --- state injected per test ---
    _curSection: 'general',
    _curOverrides: state._curOverrides || {},
    // --- ovLookup: reads a manual override for (_curSection,label) from _curOverrides ---
    ovLookup: function (section, label) {
      const sec = sandbox._curOverrides && sandbox._curOverrides[section];
      if (sec && Object.prototype.hasOwnProperty.call(sec, label)) {
        return { has: true, value: sec[label] };
      }
      return { has: false, value: undefined };
    },
    // --- display-helper stubs the three target fields never hit (no dates/phones/etc) ---
    pfIsDateLabel: function () { return false; },
    pfIsPhoneLabel: function () { return false; },
    pfIsTextareaLabel: function () { return false; },
    pfFmtDate: function (v) { return v; },
    pfFmtPhone: function (v) { return v; },
    canEdit: function () { return false; },   // read-only path
    _srLiveEdit: false,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    pfFmtQtySrc + '\n' +
    pfIsQtyLabelSrc + '\n' +
    pfSgeCellNumSrc + '\n' +
    pfSgeSumFieldSrc + '\n' +
    pfSiteElevationsSrc + '\n' +
    pfPullSrc + '\n' +
    fieldSrc + '\n' +
    'this.__pull = pfSubmittalGeneralInfoPull;' +
    'this.__field = field;' +
    'this.__sitElev = pfSiteElevations;',
    sandbox
  );
  return sandbox;
}

// ---- helpers to read a field()'s rendered value (strip tags) --------------------
function fieldValue(htmlStr) {
  // grab the inner text of the <span class="pr-field-value ...">...</span>
  const m = /<span class="pr-field-value[^"]*">([\s\S]*?)<\/span>/.exec(htmlStr);
  return m ? m[1] : null;
}
function fieldSrcTag(htmlStr) {
  const m = /<span class="pr-field-src">([\s\S]*?)<\/span>/.exec(htmlStr);
  return m ? m[1] : null;
}

// ---- test runner ----------------------------------------------------------------
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

function elevs(rows) { return { engineering: { __site_elevations: rows } }; }

// =================================================================================
console.log('\n[1] pfSubmittalGeneralInfoPull — sums + uniform diameter');
{
  const sb = buildSandbox({ _curOverrides: elevs([
    { id: 'a', area: 'Bldg A', pierQty: '1,200', totalLf: '11,500', columnDiameter: '30' },
    { id: 'b', area: 'Bldg B', pierQty: '862',   totalLf: '8,281',  columnDiameter: '30' },
  ])});
  const p = sb.__pull();
  ok('pierQty sum = 2062 (raw, ungrouped)', p.pierQty === '2062', p.pierQty);
  ok('totalLf sum = 19781 (raw, ungrouped)', p.totalLf === '19781', p.totalLf);
  ok('columnDiameter uniform -> "30"', p.columnDiameter === '30', p.columnDiameter);
}

console.log('\n[2] MIXED column diameter -> distinct set "24 / 30"');
{
  const sb = buildSandbox({ _curOverrides: elevs([
    { id: 'a', pierQty: '100', totalLf: '900',  columnDiameter: '24' },
    { id: 'b', pierQty: '200', totalLf: '1800', columnDiameter: '30' },
    { id: 'c', pierQty: '50',  totalLf: '450',  columnDiameter: '24' }, // dup 24 collapses
  ])});
  const p = sb.__pull();
  ok('pierQty sum = 350', p.pierQty === '350', p.pierQty);
  ok('totalLf sum = 3150', p.totalLf === '3150', p.totalLf);
  ok('mixed diameter -> "24 / 30" (distinct, first-seen order, no silent pick)',
     p.columnDiameter === '24 / 30', p.columnDiameter);
}

console.log('\n[3] BLANK-graceful — no areas -> all blank (fail-closed)');
{
  const sb = buildSandbox({ _curOverrides: { engineering: { __site_elevations: [] } } });
  const p = sb.__pull();
  ok('pierQty blank', p.pierQty === '', JSON.stringify(p.pierQty));
  ok('totalLf blank', p.totalLf === '', JSON.stringify(p.totalLf));
  ok('columnDiameter blank', p.columnDiameter === '', JSON.stringify(p.columnDiameter));
  // no engineering override at all
  const sb2 = buildSandbox({ _curOverrides: {} });
  const p2 = sb2.__pull();
  ok('no engineering override -> all blank', p2.pierQty === '' && p2.totalLf === '' && p2.columnDiameter === '');
}

console.log('\n[4] Partial data — rows exist but a column is all non-numeric/blank');
{
  const sb = buildSandbox({ _curOverrides: elevs([
    { id: 'a', pierQty: '', totalLf: '500', columnDiameter: '' },
    { id: 'b', pierQty: '', totalLf: '',    columnDiameter: '30' },
  ])});
  const p = sb.__pull();
  ok('pierQty all-blank -> "" (never "0")', p.pierQty === '', JSON.stringify(p.pierQty));
  ok('totalLf partial -> 500', p.totalLf === '500', p.totalLf);
  ok('columnDiameter single present -> "30"', p.columnDiameter === '30', p.columnDiameter);
}

console.log('\n[5] field() comma-formatting of the auto-pulled qty values');
{
  const sb = buildSandbox({ _curOverrides: elevs([
    { id: 'a', pierQty: '1200', totalLf: '11500', columnDiameter: '30' },
    { id: 'b', pierQty: '862',  totalLf: '8281',  columnDiameter: '30' },
  ])});
  const p = sb.__pull();
  const fPier = sb.__field('Total Pier Qty (Approved Submittal)', p.pierQty, p.pierQty ? 'Auto (Submittal Summary)' : '');
  const fLf   = sb.__field('Total LF (Approved Submittal)', p.totalLf, p.totalLf ? 'Auto (Submittal Summary)' : '');
  const fDia  = sb.__field('Column Diameter', p.columnDiameter, p.columnDiameter ? 'Auto (Submittal Summary)' : '');
  ok('Pier Qty renders comma-grouped 2,062', fieldValue(fPier) === '2,062', fieldValue(fPier));
  ok('Total LF renders comma-grouped 19,781', fieldValue(fLf) === '19,781', fieldValue(fLf));
  ok('Column Diameter renders verbatim 30 (not comma-mangled)', fieldValue(fDia) === '30', fieldValue(fDia));
  ok('Pier Qty carries "Auto (Submittal Summary)" source tag', fieldSrcTag(fPier) === 'Auto (Submittal Summary)', fieldSrcTag(fPier));
}

console.log('\n[6] BLANK renders amber "-" with NO source tag');
{
  const sb = buildSandbox({ _curOverrides: { engineering: { __site_elevations: [] } } });
  const p = sb.__pull();
  const fPier = sb.__field('Total Pier Qty (Approved Submittal)', p.pierQty, p.pierQty ? 'Auto (Submittal Summary)' : '');
  ok('blank Pier Qty renders "-"', fieldValue(fPier) === '-', fieldValue(fPier));
  ok('blank field carries no source tag', fieldSrcTag(fPier) === null);
  ok('blank field has .empty.blank class', /pr-field-value empty blank/.test(fPier));
}

console.log('\n[7] MANUAL-OVERRIDE precedence — a non-empty override WINS over auto-pull');
{
  const sb = buildSandbox({ _curOverrides: {
    engineering: { __site_elevations: [
      { id: 'a', pierQty: '1200', totalLf: '11500', columnDiameter: '30' },
      { id: 'b', pierQty: '862',  totalLf: '8281',  columnDiameter: '30' },
    ]},
    general: {
      'Total Pier Qty (Approved Submittal)': '2100',   // hand-corrected
      'Column Diameter': '24"',                          // hand-set dropdown
    },
  }});
  const p = sb.__pull();
  const fPier = sb.__field('Total Pier Qty (Approved Submittal)', p.pierQty, p.pierQty ? 'Auto (Submittal Summary)' : '');
  const fLf   = sb.__field('Total LF (Approved Submittal)', p.totalLf, p.totalLf ? 'Auto (Submittal Summary)' : '');
  const fDia  = sb.__field('Column Diameter', p.columnDiameter, p.columnDiameter ? 'Auto (Submittal Summary)' : '');
  ok('overridden Pier Qty shows 2,100 (override wins)', fieldValue(fPier) === '2,100', fieldValue(fPier));
  ok('overridden Pier Qty source = "Manual override"', fieldSrcTag(fPier) === 'Manual override', fieldSrcTag(fPier));
  ok('overridden Pier Qty shows edited pencil', /pr-field-edited/.test(fPier));
  ok('NON-overridden Total LF still auto-pulls 19,781', fieldValue(fLf) === '19,781', fieldValue(fLf));
  ok('NON-overridden Total LF source = "Auto (Submittal Summary)"', fieldSrcTag(fLf) === 'Auto (Submittal Summary)', fieldSrcTag(fLf));
  ok('overridden Column Diameter shows 24" (override wins, escaped)', fieldValue(fDia) === '24&quot;', fieldValue(fDia));
}

console.log('\n[8] EMPTY override does NOT hide the auto-pull (blank-override fail-safe)');
{
  // A stored EMPTY override on the field must be treated as "no override" (field()'s
  // ovHasValue guard) so the auto-pull still shows — mirrors the Garbin-fallback fix.
  const sb = buildSandbox({ _curOverrides: {
    engineering: { __site_elevations: [
      { id: 'a', pierQty: '500', totalLf: '4000', columnDiameter: '30' },
    ]},
    general: { 'Total Pier Qty (Approved Submittal)': '' },  // blank override
  }});
  const p = sb.__pull();
  const fPier = sb.__field('Total Pier Qty (Approved Submittal)', p.pierQty, p.pierQty ? 'Auto (Submittal Summary)' : '');
  ok('empty override -> auto-pull 500 still shows', fieldValue(fPier) === '500', fieldValue(fPier));
  ok('empty override -> source stays "Auto (Submittal Summary)"', fieldSrcTag(fPier) === 'Auto (Submittal Summary)', fieldSrcTag(fPier));
}

console.log('\n[9] Diameter with unit marks in the summary passes through verbatim');
{
  const sb = buildSandbox({ _curOverrides: elevs([
    { id: 'a', pierQty: '100', totalLf: '900', columnDiameter: '30"' },
    { id: 'b', pierQty: '100', totalLf: '900', columnDiameter: '30"' },
  ])});
  const p = sb.__pull();
  ok('uniform 30" -> "30\\"" verbatim', p.columnDiameter === '30"', p.columnDiameter);
  const fDia = sb.__field('Column Diameter', p.columnDiameter, 'Auto (Submittal Summary)');
  ok('field renders 30&quot; escaped', fieldValue(fDia) === '30&quot;', fieldValue(fDia));
}

// =================================================================================
console.log('\n----------------------------------------');
console.log('  ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
