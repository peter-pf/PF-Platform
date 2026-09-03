import fs from 'fs';
import { JSDOM } from 'jsdom';

// Staking & Layout DOCUMENT-TRACKING CHECKLIST verify (Brad 2026-09-03,
// branch staking-doc-checklist-20260903). Conditional on the existing
// "Staking & Layout PF's responsibility?" Yes/No toggle:
//   YES -> surveyor company/contact selector + 6-item doc checklist + "email surveyor" btn
//   NO  -> GC note + 1-item checklist (Approved AP Shop Dwgs (CAD)) + "email GC" btn
// Each item = subhead + [<item> - Date Sent] + [<item> - File Link].
// Run from platform/ dir (reads index.html).

const html = fs.readFileSync('index.html', 'utf8');
const _mark = 'Renders window.PF_PROJECT_POET into #prRoot as 11 collapsible schema cards.';
const _mi = html.indexOf(_mark);
const _ss = html.indexOf('<script>', _mi) + '<script>'.length;
const _se = html.indexOf('</script>', _ss);
let block = html.slice(_ss, _se);
block = block.replace(/\n  \} catch\(e\) \{\n    console\.error\("Project record view failed to load:", e\);/,
  '\n    try { window.__renderInto = renderInto; } catch(_x){ window.__renderErr = _x.message; }\n  } catch(e) {\n    console.error("Project record view failed to load:", e);');

function makeWindow(role) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.esc = (v) => (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  w.pfFmtPhone = (v) => String(v == null ? '' : v);
  w.pfFmtDate = (v) => String(v == null ? '' : v);
  w.pfFmtQty = (v) => String(v == null ? '' : v);
  w.pfFmtMoney = (v) => String(v == null ? '' : v);
  w.pfFmtNum = (v) => String(v == null ? '' : v);
  // Use the REAL date-label regex from the page so "... - Date Sent" classifies as a date.
  w.PF_DATE_LABEL_RE = /(^|[^a-z])dates?([^a-z]|$)|completion\b|\bstart\b|(prelim|design) completed by\b|submittals? (received|sent|approved)|shop drawings ready|design (completed|fee paid)|release date|as built dwgs (to|from|sent)|last log|certified payroll submitted|column logs from rig|modulus load test - passed/i;
  w.pfIsDateLabel = (label) => w.PF_DATE_LABEL_RE.test(String(label || ''));
  w.pfToDateInputValue = (v) => String(v == null ? '' : v);
  w.PF_ME = { name: 'Test ' + role, role: role };
  w.PF_COST_CODE_TEMPLATE = { groups: [{ rows: [{ cost_code: '5110' }, { cost_code: '5405' }] }] };
  w.PF_PROJECT_RECORDS = {}; w.PF_PM = {};
  w.PF_PROJECT_POET = null;
  w.PF_CONTACTS = [];
  // Sibling-block helpers the render IIFE references but that live in OTHER page script
  // blocks (absent when only the office IIFE is extracted). Stub as no-ops so render runs.
  w.pfSubmittalSummaryTotalsFor = () => ({ totalLf: '', pierQty: '', columnDia: '' });
  w.pfFmtBiz = (v) => String(v == null ? '' : v);
  w.pfParseNum = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; };
  w.pfBusinessDaysAfter = () => '';
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ companies: [], contacts: [] }) });
  return { dom, w };
}

let pass = 0, fail = 0; const F = [];
function ok(c, m) { if (c) { pass++; } else { fail++; F.push(m); } }

const D = {
  project_number: '26-999', project_name: 'Test Project',
  bid_log: { total_lf: 5000, total_columns: 100, total_stone_tn: 250, engineer_firm: 'Garbin Geo' },
  contacts: { groups: { engineering: [{ company: 'Garbin', name: 'Ed' }], owner: [{ company: 'Owner LLC' }], vendors: [{ company: 'SafeCo', scope: 'safety' }], pf_team: [] } },
  qaqc: { installed_columns: 88, installed_lf: 5000, design_columns: 100, design_lf: 5200, pct_columns: '-', pct_lf: '-', redrill_logs: 0, last_log_date: '' },
  links: {}
};

function srCardOf(root) {
  let sr = null;
  root.querySelectorAll(':scope > .pr-card').forEach(c => { const t = c.querySelector('.pr-card-title'); if (t && t.textContent === 'Site Readiness / Project Setup') sr = c; });
  return sr;
}

const SIX = [
  'Approved AP Shop Dwgs (CAD)', 'Approved AP Shop Dwgs (PDF)', 'Civil Drawings PDF',
  'Civil Drawings CAD', 'PDF File for Original Survey (est control)', 'Structural Foundations (PDF)'
];

function render(role, toggle) {
  const { w } = makeWindow(role);
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR: ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  if (toggle) w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { siteReadiness: { "Staking & Layout PF's responsibility?": toggle } } } };
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (' + role + '/' + toggle + '): ' + e.message); }
  return { w, root, sr: srCardOf(root) };
}

// labels of live fields inside the SHOWN wrapper (selector or gc-list)
function shownItems(sr, sel) {
  const wrap = sr.querySelector(sel);
  if (!wrap) return { present: false, labels: [] };
  const hidden = /display:\s*none/.test(wrap.getAttribute('style') || '');
  const labels = [...wrap.querySelectorAll('.pr-field[data-pr-label]')].map(f => f.getAttribute('data-pr-label'));
  return { present: true, hidden, labels, wrap };
}

// ---------- SCENARIO 1: OFFICE, toggle = Yes -> 6-item checklist + surveyor btn ----------
{
  const { sr } = render('admin', 'Yes');
  ok(!!sr, '1: siteReadiness card present');
  const selWrap = sr.querySelector('[data-pf-staking-selector]');
  ok(selWrap && !/display:\s*none/.test(selWrap.getAttribute('style') || ''), '1: selector wrapper SHOWN on Yes');
  const gcWrap = sr.querySelector('[data-pf-staking-gc-list]');
  ok(gcWrap && /display:\s*none/.test(gcWrap.getAttribute('style') || ''), '1: GC list HIDDEN on Yes');

  // 6 items -> 6 Date Sent + 6 File Link fields in the SELECTOR wrapper
  const si = shownItems(sr, '[data-pf-staking-selector]');
  SIX.forEach(n => {
    ok(si.labels.includes(n + ' - Date Sent'), '1: has "' + n + ' - Date Sent"');
    ok(si.labels.includes(n + ' - File Link'), '1: has "' + n + ' - File Link"');
  });
  const dateCount = si.labels.filter(l => / - Date Sent$/.test(l)).length;
  const linkCount = si.labels.filter(l => / - File Link$/.test(l)).length;
  ok(dateCount === 6, '1: exactly 6 Date Sent fields (got ' + dateCount + ')');
  ok(linkCount === 6, '1: exactly 6 File Link fields (got ' + linkCount + ')');

  // Date Sent renders as a native date picker (office + live)
  const dctl = [...si.wrap.querySelectorAll('[data-pr-field-label]')].find(e => e.getAttribute('data-pr-field-label') === 'Civil Drawings PDF - Date Sent');
  ok(dctl && dctl.tagName === 'INPUT' && dctl.getAttribute('type') === 'date', '1: Date Sent = native <input type=date>');
  ok(dctl && /pfLiveFieldChange/.test(dctl.getAttribute('onchange') || ''), '1: Date Sent saves via pfLiveFieldChange');
  // File Link renders as a paste-a-URL text input
  const lctl = [...si.wrap.querySelectorAll('[data-pr-field-label]')].find(e => e.getAttribute('data-pr-field-label') === 'Civil Drawings PDF - File Link');
  ok(lctl && lctl.tagName === 'INPUT' && lctl.getAttribute('type') === 'text', '1: File Link = text input (paste a URL)');
  ok(lctl && /pfLiveFieldChange/.test(lctl.getAttribute('onchange') || ''), '1: File Link saves via pfLiveFieldChange');

  // Email surveyor button present + wired
  const ebtn = si.wrap.querySelector('.pf-staking-email-btn[data-staking-role="surveyor"]');
  ok(!!ebtn, '1: "Email surveyor required info" button present');
  ok(ebtn && /pfStakingEmailRequired\(this, true\)/.test(ebtn.getAttribute('onclick') || ''), '1: surveyor btn wired (isPf=true)');
}

// ---------- SCENARIO 2: OFFICE, toggle = No -> 1-item checklist (GC) + GC btn ----------
{
  const { sr } = render('admin', 'No');
  const selWrap = sr.querySelector('[data-pf-staking-selector]');
  ok(selWrap && /display:\s*none/.test(selWrap.getAttribute('style') || ''), '2: selector wrapper HIDDEN on No');
  const gc = shownItems(sr, '[data-pf-staking-gc-list]');
  ok(gc.present && !gc.hidden, '2: GC list SHOWN on No');
  ok(gc.labels.includes('Approved AP Shop Dwgs (CAD) - Date Sent'), '2: GC list has the CAD Date Sent');
  ok(gc.labels.includes('Approved AP Shop Dwgs (CAD) - File Link'), '2: GC list has the CAD File Link');
  const gdate = gc.labels.filter(l => / - Date Sent$/.test(l)).length;
  ok(gdate === 1, '2: GC list has exactly ONE item (got ' + gdate + ' date fields)');
  // none of the other 5 items appear in the GC list
  const leaked = SIX.slice(1).some(n => gc.labels.includes(n + ' - Date Sent'));
  ok(!leaked, '2: GC list does NOT contain the other 5 surveyor-only items');
  const ebtn = gc.wrap.querySelector('.pf-staking-email-btn[data-staking-role="gc"]');
  ok(!!ebtn, '2: "Email GC required info" button present');
  ok(ebtn && /pfStakingEmailRequired\(this, false\)/.test(ebtn.getAttribute('onclick') || ''), '2: GC btn wired (isPf=false)');
  ok(/GC/i.test(sr.textContent) && /responsibility/i.test(sr.textContent), '2: GC-responsibility note shown');
}

// ---------- SCENARIO 3: FIELD_OPS -> no live controls, no email button ----------
{
  const { sr } = render('field_ops', 'Yes');
  ok(!!sr, '3: siteReadiness card present (field_ops)');
  // No email button for field_ops (office-gated)
  ok(!sr.querySelector('.pf-staking-email-btn'), '3: field_ops sees NO email button');
  // No live date/text controls (read view only): date sent shows as read span, not input
  const anyLiveDate = [...sr.querySelectorAll('input[type="date"][data-pr-field-label]')].some(e => / - Date Sent$/.test(e.getAttribute('data-pr-field-label') || ''));
  ok(!anyLiveDate, '3: field_ops sees NO live date controls');
  // No staking picker save button
  ok(!sr.querySelector('.pf-staking-save'), '3: field_ops sees NO staking Save button');
}

// ---------- SCENARIO 4: both lists ALWAYS rendered (so live toggle can flip w/o re-render) ----------
{
  const { sr } = render('admin', 'Yes');
  ok(!!sr.querySelector('[data-pf-staking-selector]'), '4: selector wrapper always in DOM');
  ok(!!sr.querySelector('[data-pf-staking-gc-list]'), '4: GC-list wrapper always in DOM');
}

// ---------- SCENARIO 5: blank toggle -> both lists hidden ----------
{
  const { sr } = render('admin', '');
  const selWrap = sr.querySelector('[data-pf-staking-selector]');
  const gcWrap = sr.querySelector('[data-pf-staking-gc-list]');
  ok(selWrap && /display:\s*none/.test(selWrap.getAttribute('style') || ''), '5: selector HIDDEN when toggle blank');
  ok(gcWrap && /display:\s*none/.test(gcWrap.getAttribute('style') || ''), '5: GC list HIDDEN when toggle blank');
}

console.log('\n===== Staking Doc Checklist verify =====');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (F.length) { console.log('\nFAILURES:'); F.forEach(m => console.log('  - ' + m)); process.exit(1); }
console.log('ALL GREEN');
