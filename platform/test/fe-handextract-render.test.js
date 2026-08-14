// Harness: prove 25-026 + 26-013 subcontract.fields render the EXECUTED values
// through the real card field() path. Loads the REAL global pfFmtDate /
// PF_DATE_LABEL_RE from index.html and the REAL PF_PROJECT_RECORDS from
// project-records.js. Reconstructs field() faithful to index.html (~L13670):
// override-wins-when-non-empty, date labels -> pfFmtDate (display only),
// blank -> "-". No deploy. Run: node platform/test/fe-handextract-render.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Load the REAL global date helpers from index.html into a jsdom window ---
// Extract the exact window.pfFmtDate / PF_DATE_LABEL_RE / pfIsDateLabel block.
function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b + endMarker.length);
}
// pfFmtDate = function(v){ ... };  -> end at the "return s;\n};" that closes it.
const fnStart = INDEX.indexOf('window.pfFmtDate = function(v){');
const fnEnd = INDEX.indexOf('\n};', INDEX.indexOf('  return s;', fnStart));
const dateBlock = INDEX.slice(fnStart, fnEnd + 3); // include "\n};"
// Grab the full PF_DATE_LABEL_RE assignment line + the pfIsDateLabel line.
const reStart = INDEX.indexOf('window.PF_DATE_LABEL_RE = /');
const reEnd = INDEX.indexOf('\n', INDEX.indexOf('window.pfIsDateLabel'));
const reBlock = INDEX.slice(reStart, reEnd + 1);

const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' });
const win = dom.window;
win.eval(dateBlock + '\n' + reBlock);
if (typeof win.pfFmtDate !== 'function') throw new Error('pfFmtDate did not load');
if (!(win.PF_DATE_LABEL_RE instanceof win.RegExp) && !(win.PF_DATE_LABEL_RE instanceof RegExp)) {
  throw new Error('PF_DATE_LABEL_RE did not load');
}
const pfFmtDate = win.pfFmtDate;
const pfIsDateLabel = win.pfIsDateLabel;

// --- Load the REAL data (window.PF_PROJECT_RECORDS) ---
const dataSrc = fs.readFileSync(path.join(ROOT, 'data', 'project-records.js'), 'utf8');
const sandbox = { window: {} };
win.eval.call(null, ''); // noop to keep win alive
(new Function('window', dataSrc))(sandbox.window);
const RECORDS = sandbox.window.PF_PROJECT_RECORDS.records;

// --- Faithful reconstruction of index.html field() (read-only render path) ---
// Mirrors ~L13670-13718: override wins only when non-empty; Date-label values
// formatted through pfFmtDate (display only); blank -> "-" with .blank class.
function makeField(overrides) {
  // overrides: { 'Section::Label': value }  (empty string = blank-this-field override)
  function ovLookup(section, label) {
    const k = section + '::' + label;
    if (Object.prototype.hasOwnProperty.call(overrides, k)) return { has: true, value: overrides[k] };
    return { has: false, value: undefined };
  }
  return function field(section, label, val, src) {
    const ov = ovLookup(section, label);
    const ovHasValue = ov.has && !(ov.value === undefined || ov.value === null || String(ov.value).trim() === '');
    const edited = ovHasValue;
    if (ovHasValue) { val = ov.value; src = 'Manual override'; }
    if (val instanceof Date) { val = String(pfFmtDate(val)); }
    let v = (val === undefined || val === null || String(val).trim() === '') ? '' : String(val);
    if (v && pfIsDateLabel(label)) v = String(pfFmtDate(v));
    const cls = v ? 'pr-field-value' : 'pr-field-value empty blank';
    const shown = v ? v : '-';
    return { v: v, shown: shown, cls: cls, edited: edited, src: (src && v) ? src : '' };
  };
}

// ---- assertions ----
let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; } else { fail++; fails.push(msg); } }
function eq(a, b, msg) { ok(a === b, msg + '  (got: ' + JSON.stringify(a) + ' want: ' + JSON.stringify(b) + ')'); }

// The card's SS source label + the exact SF.* keys the contract card reads.
const SS = 'Subcontract';

function renderContractFields(num, overrides) {
  const D = RECORDS[num];
  ok(!!D, num + ': record present');
  const SF = (D.subcontract && D.subcontract.fields) || {};
  const field = makeField(overrides || {});
  const bid = D.bid_log || {};
  // Exact SF-sourced field() calls from index.html contract card (~L17019-17076).
  return {
    D, SF,
    gc_project_number: field('contract', 'GC Project #', SF.gc_project_number, SS),
    subcontract_number: field('contract', 'GC Subcontract #', SF.subcontract_number, SS),
    subcontract_value: field('contract', 'Subcontract Value', SF.subcontract_value, SS),
    fully_executed_date: field('contract', 'Fully Executed Contract Date', SF.fully_executed_date, SS),
    commencement_date: field('contract', 'Commencement Date (NTP)', SF.commencement_date, SS),
    completion_dates: field('contract', 'Project Substantial Completion Date', SF.completion_dates, SS),
    certified_payroll: field('contract', 'Certified Payroll?', SF.certified_payroll, SS),
    insurance_requirements: field('contract', 'Insurance Requirements (per subcontract)', SF.insurance_requirements, SS),
    liquidated_damages: field('contract', 'Liquidated Damages', SF.liquidated_damages, SS),
    personal_guaranty: field('contract', 'Personal / Performance Guaranty', SF.personal_guaranty, SS),
    working_hours: field('contract', 'Project Working Hours', SF.working_hours, SS),
    payment_terms: field('contract', 'Payment Terms', SF.payment_terms, SS),
    retainage_pct: field('contract', 'Retainage % Withheld', SF.retainage_pct, SS),
    retainage_release: field('contract', 'Retainage Release', SF.retainage_release, SS)
  };
}

// ===== 25-026 GRANARY (executed) =====
(function () {
  const r = renderContractFields('25-026', {});
  eq(r.subcontract_value.shown, '$320,200.00', '25-026 Subcontract Value = executed $320,200.00');
  eq(r.subcontract_number.shown, 'GNC-233-107', '25-026 GC Subcontract # = GNC-233-107');
  // Date field routed through pfFmtDate -> MM/DD/YYYY.
  eq(r.fully_executed_date.shown, '07/15/2026', '25-026 Fully Executed Date = 07/15/2026 (MM/DD/YYYY)');
  ok(/^\d{2}\/\d{2}\/\d{4}$/.test(r.fully_executed_date.shown), '25-026 executed date matches MM/DD/YYYY shape');
  // LD present and carries $75/cal-day.
  ok(/\$75\.00 per calendar day/.test(r.liquidated_damages.shown), '25-026 LD = $75/cal-day');
  // Retainage.
  ok(/10%/.test(r.retainage_pct.shown), '25-026 retainage 10%');
  // Pay-if-paid payment terms present.
  ok(/PAY-IF-PAID/i.test(r.payment_terms.shown), '25-026 payment terms pay-if-paid');
  // Commencement = NTP-trigger statement (non-date text passes through unchanged).
  ok(/Notice to Proceed/.test(r.commencement_date.shown), '25-026 commencement = NTP-trigger text');
  eq(r.commencement_date.v, r.commencement_date.shown, '25-026 commencement text not mangled by date fmt');
  // Completion = schedule-defined text.
  ok(/Schedule-defined/.test(r.completion_dates.shown), '25-026 completion schedule-defined');
  // FAIL CLOSED: fields the FE did not state have NO card value -> blank "-".
  eq(r.gc_project_number.shown, '-', '25-026 GC Project # blank (not in FE) -> honest "-"');
  ok(/blank/.test(r.gc_project_number.cls), '25-026 GC Project # gets .blank class');
  eq(r.certified_payroll.shown, '-', '25-026 Certified Payroll blank (fail closed)');
  eq(r.insurance_requirements.shown, '-', '25-026 Insurance blank (fail closed)');
  eq(r.personal_guaranty.shown, '-', '25-026 Personal Guaranty blank (fail closed)');
  eq(r.working_hours.shown, '-', '25-026 Working Hours blank (fail closed)');
  // subcontract block wired.
  ok(r.D.subcontract && r.D.subcontract.fields, '25-026 subcontract.fields present (was null)');
  eq(r.D.subcontract.docusign_completed, true, '25-026 docusign_completed true');
})();

// ===== 26-013 PARK & POPLAR (executed FE supersedes DRAFT) =====
(function () {
  const r = renderContractFields('26-013', {});
  // The KEY assertion: executed value shows, NOT the draft.
  eq(r.subcontract_value.shown, '$398,500.00', '26-013 Subcontract Value = $398,500.00');
  // Fully executed date is now a REAL date (07/01/2026), NOT the old draft
  // "Not executed — DRAFT ..." string.
  eq(r.fully_executed_date.shown, '07/01/2026', '26-013 Fully Executed Date = 07/01/2026 (MM/DD/YYYY)');
  ok(!/DRAFT|Not executed/i.test(r.fully_executed_date.shown), '26-013 executed date is NOT the old DRAFT string');
  ok(/^\d{2}\/\d{2}\/\d{4}$/.test(r.fully_executed_date.shown), '26-013 executed date MM/DD/YYYY shape');
  // Draft-only keys that DON'T exist on the card must not leak a value into a
  // card field. (agreement_date / gc_party / owner_party / bonds_required /
  // certified_payroll / working_hours / insurance_requirements were draft-block
  // keys; the executed block intentionally omits the ones with no clean FE value.)
  eq(r.certified_payroll.shown, '-', '26-013 Certified Payroll blank (dropped from executed block, fail closed)');
  eq(r.insurance_requirements.shown, '-', '26-013 Insurance blank (dropped from executed block, fail closed)');
  eq(r.working_hours.shown, '-', '26-013 Working Hours blank (dropped from executed block, fail closed)');
  eq(r.gc_project_number.shown, '-', '26-013 GC Project # blank (no card value)');
  eq(r.subcontract_number.shown, '-', '26-013 GC Subcontract # blank (Old Town has no printed sub #)');
  // Executed commercial terms present.
  ok(/PAY-IF-PAID/i.test(r.payment_terms.shown), '26-013 payment terms pay-if-paid');
  ok(/10%/.test(r.retainage_pct.shown), '26-013 retainage 10%');
  ok(/proportionally/i.test(r.liquidated_damages.shown), '26-013 LD proportional flowdown');
  ok(/NTP-triggered/.test(r.commencement_date.shown), '26-013 commencement NTP-trigger text');
  ok(/Schedule-defined/.test(r.completion_dates.shown), '26-013 completion schedule-defined');
  // Non-subcontract data preserved: analysis block still present with its risk verdict.
  ok(r.D.analysis && r.D.analysis.verdict === 'RED', '26-013 analysis block + RED verdict preserved');
  ok(r.D.analysis.risks && r.D.analysis.risks.length >= 5, '26-013 analysis risks preserved');
  // Execution status flags updated to executed (no stale DRAFT banner).
  ok(/Executed/i.test(r.D.analysis.execution_status) && !/^DRAFT/.test(r.D.analysis.execution_status),
     '26-013 analysis.execution_status now Executed (no DRAFT banner)');
  ok(/Executed/i.test(r.D.execution_status) && !/^DRAFT/.test(r.D.execution_status),
     '26-013 record-level execution_status now Executed');
  eq(r.D.subcontract.docusign_completed, false, '26-013 docusign_completed false (Adobe/PKI, honest)');
})();

// ===== MANUAL OVERRIDE STILL WINS =====
(function () {
  // Office override on Subcontract Value must beat the written executed value.
  const D = RECORDS['25-026'];
  const SF = D.subcontract.fields;
  const field = makeField({ 'contract::Subcontract Value': '$321,000.00 (office revision)' });
  const out = field('contract', 'Subcontract Value', SF.subcontract_value, SS);
  eq(out.shown, '$321,000.00 (office revision)', 'manual override wins over written value');
  eq(out.src, 'Manual override', 'override marks source Manual override');
  eq(out.edited, true, 'override sets edited flag');
  // Empty override does NOT hide the real value (fail-safe).
  const field2 = makeField({ 'contract::Subcontract Value': '   ' });
  const out2 = field2('contract', 'Subcontract Value', SF.subcontract_value, SS);
  eq(out2.shown, '$320,200.00', 'empty override does NOT hide the written value');
})();

// ===== 26-013 EXECUTED RECORD CARRIES NO "DRAFT" TOKEN =====
(function () {
  // An executed record must not describe itself as a draft in any user-visible
  // analysis string (summary renders on the card via index.html:15033; review_date
  // + subcontract_number render in the analysis header/terms).
  const A = RECORDS['26-013'].analysis;
  const DRAFT = /DRAFT/i;
  ok(!DRAFT.test(String(A.summary)), '26-013 analysis.summary contains NO "DRAFT" token');
  ok(!DRAFT.test(String(A.review_date)), '26-013 analysis.review_date contains NO "DRAFT" token');
  ok(!DRAFT.test(String(A.subcontract_number)), '26-013 analysis.subcontract_number contains NO "DRAFT" token');
  // Preserved: RED verdict + risk list still intact (negotiated-term risks apply).
  eq(A.verdict, 'RED', '26-013 verdict still RED (preserved)');
  ok(A.risks && A.risks.length >= 5, '26-013 risk list still preserved');
  // Execution status remains Fully Executed.
  ok(/Fully Executed/i.test(String(A.execution_status)), '26-013 execution_status still Fully Executed');
})();

// ===== NO OTHER RECORD DISTURBED =====
(function () {
  // 26-011 (pre-existing commencement_date) untouched + still MM/DD/YYYY.
  const r11 = RECORDS['26-011'];
  eq(r11.subcontract.fields.commencement_date, '06/03/2026', '26-011 commencement_date untouched');
  // 26-015 (Patterson Horth executed block) untouched.
  const r15 = RECORDS['26-015'];
  ok(r15.subcontract && r15.subcontract.fields.subcontract_value === '$68,200.00', '26-015 value untouched');
  // Records that were subcontract:null (e.g. 26-007) still null.
  ok(RECORDS['26-007'].subcontract === null, '26-007 subcontract still null (not disturbed)');
  // Total record count unchanged reference (spot count keys).
  ok(Object.keys(RECORDS).length >= 15, 'record count sane (' + Object.keys(RECORDS).length + ')');
})();

// ---- report ----
console.log('\n=== FE hand-extract writeback render harness ===');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  x ' + f)); process.exit(1); }
console.log('ALL ASSERTIONS PASS');
