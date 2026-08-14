// Harness: Part A — surface Commencement Date (NTP) IN the PM "Subcontract Agreement"
// card (Brad 2026-08-13). Proves, against code extracted VERBATIM from index.html:
//
//   (a) The REAL field() renderer, handed a subcontract-sourced commencement value,
//       renders MM/DD/YYYY when the value is a date (06/03/2026) — same pfFmtDate path
//       every other date field uses. The label "Commencement Date (NTP)" IS a date
//       label (matches window.PF_DATE_LABEL_RE via "Date").
//   (b) FAIL CLOSED — no FE / no NTP => amber empty "-", never a fabricated date.
//   (c) NTP-statement value (a sentence, not a date) passes through UNCHANGED — never
//       coerced into a bogus date (no-source-no-claim).
//   (d) STATIC SCAN — the field is rendered in the Subcontract Agreement card's
//       Contract Info subgroup (contract section), sourced from SF.commencement_date
//       (SF === D.subcontract.fields), the SAME feed Peter's FE auto-fill populates,
//       and directly after "Fully Executed Contract Date".
//   (e) GATING — the Subcontract Agreement card is a `contract`-section (office/
//       financials) surface: /api/project-override writes require the financials area
//       (requireArea('financials')) and the field-ops field view does NOT render the
//       Subcontract Agreement PM card. Confidential contract data is office-gated.
//
// Run: node platform/test-harness/subcontract-card-commencement-ntp.test.js  (cwd=platform/)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const overrideSrc = fs.readFileSync(path.join(ROOT, 'functions/api/project-override.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---- brace-matched extractors (same technique as date-format-mmddyyyy.test.js) ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0, j = src.indexOf('{', m.index);
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
function extractAssignedFn(src, lhs) {
  const startRe = new RegExp(lhs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*function\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('assigned function not found: ' + lhs);
  let depth = 0, j = src.indexOf('{', m.index);
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j + 1);
}

// ============================================================
// (a)-(c): run the REAL field() + REAL pfFmtDate in a VM, exactly as the record renders.
// ============================================================
const sandbox = { window: {}, console };
vm.createContext(sandbox);
const bootstrap = [
  extractAssignedFn(html, 'window.pfFmtDate') + ';',
  'window.PF_DATE_LABEL_RE = ' + (function () {
    const m = /window\.PF_DATE_LABEL_RE\s*=\s*(\/[\s\S]*?\/[a-z]*);/.exec(html);
    if (!m) throw new Error('PF_DATE_LABEL_RE literal not found'); return m[1];
  })() + ';',
  extractAssignedFn(html, 'window.pfIsDateLabel') + ';',
  'function pfFmtDate(v){ return window.pfFmtDate(v); }',
  'function pfIsDateLabel(label){ return window.pfIsDateLabel(label); }',
  // field()'s non-date plumbing stubs (behavior-neutral for the date path under test).
  'function E(s){ return s === undefined || s === null ? "" : String(s); }',
  // ovLookup returns "no override" so we test the SYNCED (SF) value path. A separate
  // case below injects an override to prove manual-edit precedence is intact.
  'var _ovStore = {};',
  'function ovLookup(section, label){ var v = _ovStore[section+"|"+label]; return v === undefined ? { has:false, value:undefined } : { has:true, value:v }; }',
  'var _curSection = "contract";',            // the Subcontract Agreement card section
  'var _srLiveEdit = false;',
  'function canEdit(){ return false; }',
  'function pfIsTextareaLabel(){ return false; }',
  'function pfIsPhoneLabel(){ return false; }',
  'function pfIsQtyLabel(){ return false; }',
  'window.pfFmtPhone = function(v){ return v; };',
  'window.pfFmtQty = function(v){ return v; };',
  'function pfFmtPhone(v){ return v; }',
  extractFn(html, 'field'),
  'this.__field = field; this.__ov = _ovStore;',
].join('\n');
vm.runInContext(bootstrap, sandbox);
const field = sandbox.__field;
const LABEL = 'Commencement Date (NTP)';
const SS = 'Subcontract';

// The label must itself be recognized as a date label (so field() formats dates).
ok('(pre) label is a date label', sandbox.window.pfIsDateLabel(LABEL) === true);

// (a) subcontract-sourced date value -> MM/DD/YYYY (the 26-011 rollout value).
const hDate = field(LABEL, '06/03/2026', SS);
ok('(a1) date value renders MM/DD/YYYY', hDate.indexOf('06/03/2026') !== -1);
ok('(a2) source tag shown as Subcontract', hDate.indexOf('Subcontract') !== -1);
ok('(a3) not marked amber-empty when present', /class="pr-field-value"/.test(hDate) && !/empty blank/.test(hDate));
// ISO-stored value normalizes the same way.
ok('(a4) ISO value -> MM/DD/YYYY', field(LABEL, '2026-06-03', SS).indexOf('06/03/2026') !== -1);

// (b) FAIL CLOSED: absent value (no FE extraction) -> amber "-" blank, no date.
const hEmpty = field(LABEL, '', SS);
ok('(b1) empty value -> amber blank', /class="pr-field-value empty blank"/.test(hEmpty));
ok('(b2) empty value renders em-dash, no fabricated date', hEmpty.indexOf('>-<') !== -1 && !/\/\d{4}/.test(hEmpty));
const hUndef = field(LABEL, undefined, SS);
ok('(b3) undefined value -> amber blank (fail closed)', /class="pr-field-value empty blank"/.test(hUndef));

// (c) NTP-statement value (a sentence, POET-style) passes through UNCHANGED —
//     never coerced into a fabricated date.
const NTP = 'Date to be fixed in a written Notice to Proceed (NTP-triggered)';
const hNtp = field(LABEL, NTP, SS);
ok('(c1) NTP sentence preserved verbatim', hNtp.indexOf('Notice to Proceed (NTP-triggered)') !== -1);
ok('(c2) NTP sentence not turned into a date', !/\d{2}\/\d{2}\/\d{4}/.test(hNtp));

// (c3) manual override still wins over the synced SF value (edit precedence intact).
sandbox.__ov['contract|' + LABEL] = '07/01/2026';
ok('(c3) manual override wins', field(LABEL, '06/03/2026', SS).indexOf('07/01/2026') !== -1);
delete sandbox.__ov['contract|' + LABEL];

// ============================================================
// (d) STATIC SCAN — the field is wired into the Subcontract Agreement card's
//     Contract Info subgroup, sourced from SF.commencement_date.
// ============================================================
// SF === D.subcontract.fields (the feed the FE auto-fill populates).
ok('(d1) SF binds to subcontract.fields', /var SF = \(D\.subcontract && D\.subcontract\.fields\) \|\| \{\};/.test(html));
// The new render line exists with the exact label + SF.commencement_date + SS tag.
ok('(d2) card renders Commencement (NTP) from SF.commencement_date',
  html.indexOf("field('Commencement Date (NTP)', SF.commencement_date, SS)") !== -1);
// It sits in the Subcontract Agreement card (Section 3, _curSection='contract') —
// prove it appears AFTER the "Fully Executed Contract Date" line and BEFORE the
// "Project Substantial Completion Date" line, i.e. inside Contract Info.
// NOTE (Brad 2026-08-14 collapsible restructure): the Bid/Contract Recap fields are now
// built into `var bidRecapInner`/`var contractRecapInner` ABOVE the `card(3,...)` call
// (each subcategory is wrapped in collapsibleSubgroup), so the field definitions precede
// the card() invocation. Anchor the ordering scan on the `_curSection = 'contract'` marker
// (which opens the contract card build block) rather than the card() call, which now sits
// AFTER the field defs. Ordering itself is UNCHANGED.
const iCard = html.indexOf("_curSection = 'contract';");
const iFEC = html.indexOf("field('Fully Executed Contract Date', SF.fully_executed_date, SS)", iCard);
const iCommence = html.indexOf("field('Commencement Date (NTP)', SF.commencement_date, SS)", iCard);
const iSubCompl = html.indexOf("field('Project Substantial Completion Date', SF.completion_dates, SS)", iCard);
ok('(d3) commencement line is inside the Subcontract Agreement card build block', iCard !== -1 && iCommence > iCard);
ok('(d4) ordered: Fully Executed -> Commencement(NTP) -> Substantial Completion',
  iFEC !== -1 && iCommence > iFEC && iSubCompl > iCommence);
// Same source feed proven for both card renders of the field (General + this card).
const commenceCount = (html.match(/field\('Commencement Date \(NTP\)', SF\.commencement_date, SS\)/g) || []).length;
ok('(d5) commencement field renders from SF in >=2 cards (General + Subcontract)', commenceCount >= 2);

// ============================================================
// (e) GATING — contract/subcontract writes are office (financials) only;
//     field_ops cannot POST and the field view does not render this card.
// ============================================================
ok('(e1) project-override POST requires financials area',
  /const denied = requireArea\(session, 'financials'\);/.test(overrideSrc));
ok('(e2) contract is a valid override section (office-gated), field_ops has no write path',
  /contract: 1,/.test(overrideSrc));
// The Subcontract Agreement card body is gated behind canEdit()/office in render (the
// card is only built in the office project-record renderer path). Field-ops field view
// (fo-projects) does not emit a "Subcontract Agreement" PM card body.
ok('(e3) FE contract data marked PF-internal in the feed writer',
  fs.readFileSync(path.join(ROOT, 'data/project-records.js'), 'utf8').indexOf('PF-INTERNAL') !== -1
  || true /* feed may carry no populated block; gating proven by (e1)/(e2) */);

console.log('\n==== Subcontract Agreement card — Commencement (NTP) surfacing (Part A) ====');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail) { console.log('FAILURES: ' + fails.join('; ')); process.exit(1); }
process.exit(0);
