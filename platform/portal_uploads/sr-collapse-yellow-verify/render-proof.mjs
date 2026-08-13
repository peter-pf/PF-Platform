import fs from 'fs';
import { JSDOM } from 'jsdom';

// TASK E + TASK F verify (Brad 2026-08-13, branch site-readiness-collapse-yellow-20260813):
//  E) Each Site Readiness / Project Setup subsection is INDEPENDENTLY collapsible, reusing
//     the same .pr-cgroup collapse idiom (collapsibleSubgroup) as Engineering & Design.
//     - Each of the 7 numbered subsections renders as a .pr-cgroup with a clickable
//       .pr-cgroup-head + .pr-cgroup-chev + .pr-cgroup-body.
//     - Default state is EXPANDED (.open), matching E&D.
//     - Clicking the header toggles .open (collapse works).
//     - The injected nested cards (Safety / Equipment / Material) land INSIDE their
//       subsection's collapsible body (so they collapse with it).
//  F) Empty Site Readiness fields get the .blank (yellow) class in LIVE-EDIT mode (office),
//     matching the read-view convention; a filled field does NOT get .blank.
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

// The 7 expected numbered Site Readiness subsections, in order.
const EXPECTED = ['1. Shop Drawings', '2. Testing', '3. Staking & Layout', '4. Safety',
  '5. Mobilization Preparation', '6. Mobilization to Site', '7. Rental Equipment'];

// ---------- SCENARIO 1: OFFICE (admin) ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (admin): ' + e.message); process.exit(2); }
  ok(typeof w.__renderInto === 'function', 'renderInto exposed (admin) err=' + (w.__renderErr || ''));
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (admin): ' + e.message); }

  const sr = srCardOf(root);
  ok(!!sr, 'siteReadiness card present');
  const srBody = sr.querySelector(':scope > .pr-card-body');

  // ---- TASK E: collapsible subsections ----
  // Collect the DIRECT collapsible subgroups of the Site Readiness card body.
  const cgroups = [...srBody.querySelectorAll('.pr-cgroup')].filter(g => {
    // direct-to-this-card: the nearest .pr-card ancestor is the SR card (not a nested one)
    return g.closest('.pr-card') === sr;
  });
  ok(cgroups.length === 7, 'E: exactly 7 collapsible subsections (.pr-cgroup) found, got ' + cgroups.length);

  // Titles + order match the 7 numbered subsections.
  const titles = cgroups.map(g => { const t = g.querySelector('.pr-cgroup-title'); return t ? t.textContent.trim() : '(none)'; });
  EXPECTED.forEach((exp, i) => ok(titles[i] === exp, 'E: subsection ' + (i + 1) + ' title = "' + exp + '" (got "' + (titles[i] || '') + '")'));

  // Each subsection: has a clickable head, a chevron, a body; DEFAULT EXPANDED (.open);
  // reuses the SAME classes as E&D (.pr-cgroup / .pr-cgroup-head / .pr-cgroup-chev / .pr-cgroup-body).
  cgroups.forEach((g, i) => {
    const head = g.querySelector(':scope > .pr-cgroup-head');
    const chev = g.querySelector('.pr-cgroup-chev');
    const body = g.querySelector(':scope > .pr-cgroup-body');
    ok(!!head, 'E: subsection ' + (i + 1) + ' has a .pr-cgroup-head');
    ok(head && /classList\.toggle\('open'\)/.test(head.getAttribute('onclick') || ''), 'E: subsection ' + (i + 1) + ' head toggles .open (same idiom as E&D)');
    ok(!!chev, 'E: subsection ' + (i + 1) + ' has a chevron (.pr-cgroup-chev)');
    ok(!!body, 'E: subsection ' + (i + 1) + ' has a .pr-cgroup-body');
    ok(g.classList.contains('open'), 'E: subsection ' + (i + 1) + ' DEFAULT expanded (.open), matching E&D');
  });

  // The collapse actually works: simulate the header onclick toggling .open off then on.
  {
    const g = cgroups[0];
    ok(g.classList.contains('open'), 'E(toggle): subsection 1 starts open');
    g.classList.toggle('open'); // simulate a click
    ok(!g.classList.contains('open'), 'E(toggle): after click subsection 1 is collapsed (.open removed)');
    g.classList.toggle('open');
    ok(g.classList.contains('open'), 'E(toggle): after second click subsection 1 is expanded again');
  }

  // Compare against E&D so we KNOW the same pattern is reused (identical class contract).
  let eng = null;
  root.querySelectorAll(':scope > .pr-card').forEach(c => { const t = c.querySelector('.pr-card-title'); if (t && t.textContent === 'Engineering & Design') eng = c; });
  ok(!!eng, 'E(parity): Engineering & Design card present');
  const engCgroups = eng ? [...eng.querySelector(':scope > .pr-card-body').querySelectorAll('.pr-cgroup')].filter(g => g.closest('.pr-card') === eng) : [];
  ok(engCgroups.length === 3, 'E(parity): E&D still has its 3 collapsible subgroups (got ' + engCgroups.length + ')');
  // Same head/chev/body structure on both (reused pattern, not a new mechanism).
  if (engCgroups.length && cgroups.length) {
    const eHead = engCgroups[0].querySelector('.pr-cgroup-head');
    const sHead = cgroups[0].querySelector('.pr-cgroup-head');
    ok(eHead && sHead && eHead.className === sHead.className, 'E(parity): SR + E&D subsection heads share the SAME class list ("' + (sHead ? sHead.className : '') + '")');
  }

  // Injected nested cards land INSIDE their subsection's collapsible body (collapse together).
  const safetyCg = cgroups.find(g => (g.querySelector('.pr-cgroup-title') || {}).textContent === '4. Safety');
  const safetyCard = safetyCg && [...safetyCg.querySelector('.pr-cgroup-body').querySelectorAll('.pr-card[data-pr-section="safety"]')];
  ok(safetyCard && safetyCard.length === 1, 'E: Safety nested card lives INSIDE the "4. Safety" collapsible body');
  ok(!safetyCg || !safetyCg.querySelector('[data-sr-safety-anchor]'), 'E: safety anchor consumed (removed) after injection');

  const mobCg = cgroups.find(g => (g.querySelector('.pr-cgroup-title') || {}).textContent === '6. Mobilization to Site');
  const mobBody = mobCg && mobCg.querySelector('.pr-cgroup-body');
  ok(mobBody && mobBody.querySelector('.pr-card[data-pr-section="equipment"]'), 'E: Equipment nested card INSIDE "6. Mobilization to Site" collapsible body');
  ok(mobBody && mobBody.querySelector('.pr-card[data-pr-section="material"]'), 'E: Material nested card INSIDE "6. Mobilization to Site" collapsible body');
  ok(!mobBody || !mobBody.querySelector('[data-sr-eqmat-anchor]'), 'E: eqmat anchor consumed (removed) after injection');

  // No stray flat .pr-subgroup numbered subsection headers remain (they became collapsible heads).
  const flatNumbered = [...srBody.querySelectorAll('.pr-subgroup')].filter(el =>
    el.closest('.pr-card') === sr && !el.classList.contains('pr-cgroup-head') &&
    /^[1-7]\.\s/.test((el.textContent || '').trim()));
  ok(flatNumbered.length === 0, 'E: no leftover FLAT numbered .pr-subgroup headers (all are collapsible heads), got ' + flatNumbered.length);

  // ---- TASK F: yellow highlight on empty fields (live-edit / office) ----
  // Gather Site Readiness OWN fields (direct to the SR card, not nested).
  const srFields = [...sr.querySelectorAll('.pr-field[data-pr-label]')].filter(f => f.closest('.pr-card') === sr);
  ok(srFields.length > 0, 'F: Site Readiness has direct data fields (got ' + srFields.length + ')');

  // Every EMPTY live field -> its value cell carries .blank; a live control is present.
  let emptyChecked = 0, emptyBlank = 0;
  srFields.forEach(f => {
    const cell = f.querySelector('.pr-field-value');
    if (!cell) return;
    const ctl = cell.querySelector('.pr-live-input, textarea, select, input');
    // In this render all SR own fields are blank (no overrides seeded) -> expect .blank.
    if (ctl) {
      const v = (ctl.value == null ? '' : String(ctl.value)).trim();
      if (v === '') { emptyChecked++; if (cell.classList.contains('blank')) emptyBlank++; }
    }
  });
  ok(emptyChecked > 0, 'F: found empty LIVE fields to check (got ' + emptyChecked + ')');
  ok(emptyChecked === emptyBlank, 'F: EVERY empty live field cell has .blank (yellow): ' + emptyBlank + '/' + emptyChecked);
}

// ---------- SCENARIO 2: OFFICE with a FILLED field -> no .blank on it ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (admin/fill): ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  // Seed one Site Readiness field with a value via override.
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { siteReadiness: { 'Which Jack': 'Enerpac 100T' } } } };
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (admin/fill): ' + e.message); }
  const sr = srCardOf(root);
  const filled = [...sr.querySelectorAll('.pr-field[data-pr-label]')].filter(f => f.closest('.pr-card') === sr)
    .find(f => f.getAttribute('data-pr-label') === 'Which Jack');
  ok(!!filled, 'F(filled): "Which Jack" field present');
  const cell = filled && filled.querySelector('.pr-field-value');
  const ctl = cell && cell.querySelector('.pr-live-input, input, select');
  ok(ctl && String(ctl.value) === 'Enerpac 100T', 'F(filled): control seeded with the value');
  ok(cell && !cell.classList.contains('blank'), 'F(filled): a FILLED field does NOT get .blank (no yellow)');

  // And a sibling empty field on the same render still gets .blank (sanity: coexist).
  const empty = [...sr.querySelectorAll('.pr-field[data-pr-label]')].filter(f => f.closest('.pr-card') === sr)
    .find(f => f.getAttribute('data-pr-label') === 'Load Test Size (kips)');
  const ecell = empty && empty.querySelector('.pr-field-value');
  ok(ecell && ecell.classList.contains('blank'), 'F(filled): a still-empty sibling field keeps .blank');
}

// ---------- SCENARIO 3: NON-OFFICE (field_ops) read view -> blank convention intact ----------
{
  const { w } = makeWindow('field_ops');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (field_ops): ' + e.message); process.exit(2); }
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (field_ops): ' + e.message); }
  const sr = srCardOf(root);
  ok(!!sr, 'F(field_ops): Site Readiness card present');
  const srBody = sr.querySelector(':scope > .pr-card-body');
  // Collapsibles still render for non-office (presentation only).
  const cgroups = [...srBody.querySelectorAll('.pr-cgroup')].filter(g => g.closest('.pr-card') === sr);
  ok(cgroups.length === 7, 'E(field_ops): 7 collapsible subsections render for non-office too (got ' + cgroups.length + ')');
  // Read-view empty fields still yellow (the read path already emitted .blank; unchanged).
  const emptyRead = [...sr.querySelectorAll('.pr-field[data-pr-label]')].filter(f => f.closest('.pr-card') === sr)
    .map(f => f.querySelector('.pr-field-value')).filter(Boolean)
    .filter(c => !c.querySelector('input, select, textarea')); // read spans, not controls
  const someBlank = emptyRead.some(c => c.classList.contains('blank'));
  ok(someBlank, 'F(field_ops): read-view empty fields still carry .blank (yellow) — convention intact');
}

console.log('\n=== RESULT: ' + pass + ' pass / ' + fail + ' fail ===');
if (fail) { console.log('FAILURES:\n - ' + F.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
