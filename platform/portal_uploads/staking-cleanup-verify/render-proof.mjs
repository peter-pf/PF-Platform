import fs from 'fs';
import { JSDOM } from 'jsdom';

// CHANGE A + B verify (Brad 2026-08-13, branch site-readiness-staking-cleanup-20260813):
//  A) "To Be Placed (pending Brad's direction)" section GONE from Site Readiness.
//  B) "Staking & Layout PF's responsibility?" Yes/No toggle in subsection 3; toggle=No
//     hides the CRM selector, toggle=Yes shows the Staking & Layout company/contact
//     selector (filtered to the "Staking & Layout" trade). Office-gated. Save on-the-fly.
// Run from platform/ dir (reads index.html).

const html = fs.readFileSync('index.html', 'utf8');
const _mark = 'Renders window.PF_PROJECT_POET into #prRoot as 11 collapsible schema cards.';
const _mi = html.indexOf(_mark);
const _ss = html.indexOf('<script>', _mi) + '<script>'.length;
const _se = html.indexOf('</script>', _ss);
let block = html.slice(_ss, _se);
block = block.replace(/\n  \} catch\(e\) \{\n    console\.error\("Project record view failed to load:", e\);/,
  '\n    try { window.__renderInto = renderInto; window.__pfStakingSelectorBlock = pfStakingSelectorBlock; window.__pfCollectCrm = pfCollectCrm; } catch(_x){ window.__renderErr = _x.message; }\n  } catch(e) {\n    console.error("Project record view failed to load:", e);');

function makeWindow(role) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.esc = (v) => (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Formatter + label-gate globals renderInto expects (defined in a sibling script
  // block on the live page; stubbed here so the extracted IIFE renders standalone).
  w.pfFmtPhone = (v) => String(v == null ? '' : v);
  w.pfFmtDate = (v) => String(v == null ? '' : v);
  w.pfFmtQty = (v) => String(v == null ? '' : v);
  w.pfFmtMoney = (v) => String(v == null ? '' : v);
  w.pfFmtNum = (v) => String(v == null ? '' : v);
  w.PF_DATE_LABEL_RE = /\b(date|dated)\b/i;
  w.pfIsDateLabel = (label) => w.PF_DATE_LABEL_RE.test(String(label || ''));
  w.pfToDateInputValue = (v) => String(v == null ? '' : v);
  w.PF_ME = { name: 'Test ' + role, role: role };
  w.PF_COST_CODE_TEMPLATE = { groups: [{ rows: [{ cost_code: '5110' }, { cost_code: '5405' }] }] };
  w.PF_PROJECT_RECORDS = {}; w.PF_PM = {};
  w.PF_PROJECT_POET = null;
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

// ---------- SCENARIO 1: OFFICE (admin), toggle unset (default hidden) ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (admin): ' + e.message); process.exit(2); }
  ok(typeof w.__renderInto === 'function', 'renderInto exposed (admin) err=' + (w.__renderErr || ''));
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (admin): ' + e.message); }

  // CHANGE A: no "To Be Placed" anywhere in the record
  ok(!/To Be Placed/i.test(root.textContent), 'A: "To Be Placed" text ABSENT from whole record');
  const subheads = [...root.querySelectorAll('.pr-subhead, .pr-subgroup')].map(s => s.textContent.trim());
  ok(!subheads.some(s => /To Be Placed/i.test(s)), 'A: no subhead/subgroup titled "To Be Placed"');

  const sr = srCardOf(root);
  ok(!!sr, 'siteReadiness card present');

  // CHANGE B: toggle field renders in Site Readiness (subsection 3)
  const srLabels = [...sr.querySelectorAll('.pr-field[data-pr-label]')].filter(f => f.closest('.pr-card') === sr).map(f => f.getAttribute('data-pr-label'));
  ok(srLabels.includes("Staking & Layout PF's responsibility?"), 'B: toggle field present in Site Readiness own card');

  // toggle renders as a LIVE <select> with Yes/No (office + _srLiveEdit).
  // (querySelector with an apostrophe in the value is brittle; filter by getAttribute.)
  const toggleCtl = [...sr.querySelectorAll('[data-pr-field-label]')].find(e => e.getAttribute('data-pr-field-label') === "Staking & Layout PF's responsibility?");
  ok(!!toggleCtl && toggleCtl.tagName === 'SELECT', 'B: toggle is a live <select> control (office)');
  if (toggleCtl) {
    const opts = [...toggleCtl.querySelectorAll('option')].map(o => o.value);
    ok(opts.includes('Yes') && opts.includes('No'), 'B: toggle has Yes + No options: ' + JSON.stringify(opts));
    ok(/pfLiveFieldChange/.test(toggleCtl.getAttribute('onchange') || ''), 'B: toggle saves on-the-fly via pfLiveFieldChange');
  }

  // selector wrapper present but HIDDEN when toggle unset (default)
  const wrap = sr.querySelector('[data-pf-staking-selector]');
  ok(!!wrap, 'B: staking selector wrapper present');
  ok(wrap && /display:\s*none/.test(wrap.getAttribute('style') || ''), 'B: selector HIDDEN by default (toggle unset)');

  // office gets the picker (.pr-crm) filtered to Staking & Layout + a save button
  const crm = wrap && [...wrap.querySelectorAll('.pr-crm')].find(e => e.getAttribute('data-crm-section') === 'Staking & Layout');
  ok(!!crm, 'B: office picker .pr-crm for "Staking & Layout" present');
  ok(crm && crm.getAttribute('data-crm-trade') === 'Staking & Layout', 'B: picker filtered to trade "Staking & Layout"');
  ok(crm && crm.getAttribute('data-crm-key') === 'siteReadiness', 'B: picker stores under siteReadiness key');
  const saveBtn = wrap && wrap.querySelector('.pf-staking-save');
  ok(!!saveBtn, 'B: explicit Save button present (office, edit-on-the-fly)');
  ok(saveBtn && /pfStakingSaveSelection/.test(saveBtn.getAttribute('onclick') || ''), 'B: Save button wired to pfStakingSaveSelection');
  const rhost = wrap && [...wrap.querySelectorAll('.pr-crm-cards')].find(e => e.getAttribute('data-crm-cards') === 'Staking & Layout' && e.getAttribute('data-crm-cards-key') === 'siteReadiness');
  ok(!!rhost, 'B: read-view host present (siteReadiness key)');
}

// ---------- SCENARIO 2: OFFICE, toggle = Yes (override) -> selector SHOWN ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (admin/yes): ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { siteReadiness: { "Staking & Layout PF's responsibility?": 'Yes' } } } };
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (admin/yes): ' + e.message); }
  const sr = srCardOf(root);
  const wrap = sr && sr.querySelector('[data-pf-staking-selector]');
  ok(!!wrap, 'B(yes): wrapper present');
  ok(wrap && !/display:\s*none/.test(wrap.getAttribute('style') || ''), 'B(yes): selector SHOWN when toggle=Yes');
  const toggleCtl = [...sr.querySelectorAll('[data-pr-field-label]')].find(e => e.getAttribute('data-pr-field-label') === "Staking & Layout PF's responsibility?");
  ok(toggleCtl && toggleCtl.value === 'Yes', 'B(yes): toggle control seeded to Yes from override');
}

// ---------- SCENARIO 3: OFFICE, toggle = No (override) -> selector HIDDEN + GC note ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (admin/no): ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { siteReadiness: { "Staking & Layout PF's responsibility?": 'No' } } } };
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (admin/no): ' + e.message); }
  const sr = srCardOf(root);
  const wrap = sr && sr.querySelector('[data-pf-staking-selector]');
  ok(wrap && /display:\s*none/.test(wrap.getAttribute('style') || ''), 'B(no): selector HIDDEN when toggle=No');
  ok(/GC/i.test(sr.textContent) && /responsibility/i.test(sr.textContent), 'B(no): GC-responsibility note shown');
}

// ---------- SCENARIO 4: NON-OFFICE (field_ops) read-only ----------
{
  const { w } = makeWindow('field_ops');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (field_ops): ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { siteReadiness: { "Staking & Layout PF's responsibility?": 'Yes' } } } };
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (field_ops): ' + e.message); }
  const sr = srCardOf(root);
  // toggle renders read-only (no live control) for non-office
  const liveToggle = [...sr.querySelectorAll('select[data-pr-field-label]')].find(e => e.getAttribute('data-pr-field-label') === "Staking & Layout PF's responsibility?");
  ok(!liveToggle, 'B(field_ops): NO live toggle control (read-only)');
  const wrap = sr.querySelector('[data-pf-staking-selector]');
  ok(!!wrap, 'B(field_ops): wrapper still present (toggle=Yes -> shown)');
  // non-office get the read host but NOT the picker/save
  ok(!wrap.querySelector('.pr-crm'), 'B(field_ops): NO picker (.pr-crm) for non-office');
  ok(!wrap.querySelector('.pf-staking-save'), 'B(field_ops): NO Save button for non-office');
  const rhost2 = [...wrap.querySelectorAll('.pr-crm-cards')].find(e => e.getAttribute('data-crm-cards') === 'Staking & Layout');
  ok(!!rhost2, 'B(field_ops): read host present');
  ok(!/To Be Placed/i.test(root.textContent), 'A(field_ops): "To Be Placed" absent');
}

console.log('\n=== RESULT: ' + pass + ' pass / ' + fail + ' fail ===');
if (fail) { console.log('FAILURES:\n - ' + F.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
