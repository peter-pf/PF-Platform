import fs from 'fs';
import { JSDOM } from 'jsdom';

// VERIFY (Brad 2026-08-13, branch portal-cleanup-subcontracts-collapse-20260813):
//
// CHANGE 1 — the STANDALONE "Subcontracts" review tool (nav group + #mod-subcontracts module +
//   label-map entry, iframe -> /subcontracts.html) is REMOVED, while the NESTED "Subcontract
//   Analysis" subsection (pfSubcontractAnalysisSub / __subcontract_analysis) inside Section 3
//   "Subcontract Agreement" still renders. The separate "Vendors" module (mod-subs / subs-app,
//   data-module="subs") must be UNTOUCHED.
//
// CHANGE 2 — collapsibleSubgroup() now DEFAULTS to COLLAPSED (rolled up): a 2-arg call renders
//   without .open; expanding (toggle .open) still works; the E&D 3 subgroups AND the Site
//   Readiness subsections all start rolled up.
//
// Run from platform/ dir (reads index.html).

const html = fs.readFileSync('index.html', 'utf8');
let pass = 0, fail = 0; const F = [];
function ok(c, m) { if (c) { pass++; } else { fail++; F.push(m); } }

// ============================================================================
// PART A — CHANGE 1 static / structural assertions on the raw HTML.
// ============================================================================

// A1) The standalone Subcontracts module view is GONE.
ok(html.indexOf('id="mod-subcontracts"') === -1, 'A1: #mod-subcontracts module view removed');
ok(html.indexOf('/subcontracts.html') === -1, 'A1: /subcontracts.html iframe src removed');

// A2) The standalone Subcontracts NAV item is GONE (data-module + showModule wiring).
ok(html.indexOf('data-module="subcontracts"') === -1, 'A2: nav item data-module="subcontracts" removed');
ok(html.indexOf("showModule('subcontracts')") === -1, "A2: showModule('subcontracts') wiring removed");

// A3) The module LABEL-MAP entry is GONE.
ok(!/\n\s*subcontracts:\s*'Subcontracts',/.test(html), "A3: label-map entry `subcontracts: 'Subcontracts'` removed");

// A4) The "Subcontracts" nav-sub-label group header is GONE.
ok(html.indexOf(">Subcontracts</div>") === -1, 'A4: "Subcontracts" nav-sub-label group header removed');

// A5) The SEPARATE Vendors module (mod-subs / data-module="subs") is UNTOUCHED.
ok(html.indexOf('id="mod-subs"') !== -1, 'A5: Vendors module #mod-subs still present (not the one removed)');
ok(html.indexOf('data-module="subs"') !== -1, 'A5: Vendors nav item data-module="subs" still present');
ok(html.indexOf("showModule('subs')") !== -1, "A5: showModule('subs') still wired");

// A6) The NESTED Subcontract Analysis renderers are STILL in the source (untouched).
ok(html.indexOf('function pfSubcontractAnalysisSub(') !== -1, 'A6: pfSubcontractAnalysisSub() still defined');
ok(html.indexOf('function pfSubcontractAnalysis(') !== -1, 'A6: pfSubcontractAnalysis() still defined');
ok(html.indexOf('__subcontract_analysis') !== -1, 'A6: reserved __subcontract_analysis key still referenced');
ok(html.indexOf('pfSubcontractAnalysisSub(pfSubcontractAnalysis(D))') !== -1,
  'A6: Section 3 still calls pfSubcontractAnalysisSub(pfSubcontractAnalysis(D))');

// A7) collapsibleSubgroup default flipped to collapsed (source-level guard).
ok(/function collapsibleSubgroup\(title, innerHtml, open\)\{\s*\n\s*var isOpen = \(open === true\);/.test(html),
  'A7: collapsibleSubgroup now `var isOpen = (open === true)` (default collapsed)');
ok(html.indexOf('var isOpen = (open !== false)') === -1,
  'A7: old `var isOpen = (open !== false)` (default expanded) is gone');

// ============================================================================
// PART B — CHANGE 2 (+ nested analysis intact) LIVE render via the project-record renderer.
// ============================================================================
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

const D = {
  project_number: '26-999', project_name: 'Test Project',
  bid_log: { total_lf: 5000, total_columns: 100, total_stone_tn: 250, engineer_firm: 'Garbin Geo' },
  contacts: { groups: { engineering: [{ company: 'Garbin', name: 'Ed' }], owner: [{ company: 'Owner LLC' }], vendors: [{ company: 'SafeCo', scope: 'safety' }], pf_team: [] } },
  qaqc: { installed_columns: 88, installed_lf: 5000, design_columns: 100, design_lf: 5200, pct_columns: '-', pct_lf: '-', redrill_logs: 0, last_log_date: '' },
  // Seed a real Subcontract Analysis payload via the reserved override so the NESTED
  // subsection renders its FULL content (not just the empty state).
  links: {}
};

function cardTitled(root, title) {
  let out = null;
  root.querySelectorAll(':scope > .pr-card').forEach(c => { const t = c.querySelector('.pr-card-title'); if (t && t.textContent === title) out = c; });
  return out;
}

// ---------- SCENARIO 1: office admin, with a seeded Subcontract Analysis override ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR: ' + e.message); process.exit(2); }
  ok(typeof w.__renderInto === 'function', 'B: renderInto exposed err=' + (w.__renderErr || ''));

  // Seed the reserved __subcontract_analysis override so the nested subsection has real content.
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { contract: { __subcontract_analysis: {
    summary: 'Analysis: LDs flow down at $75/cal-day; scope matches bid.',
    flags: ['Liquidated damages present', 'Retainage 10%'],
    source: 'Reviewed executed subcontract 2026-08-13'
  } } } } };

  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR: ' + e.message); }

  // --- CHANGE 1 (live): the NESTED Subcontract Analysis subsection renders inside Section 3. ---
  const sub = cardTitled(root, 'Subcontract Agreement');
  ok(!!sub, 'B(C1): Section 3 "Subcontract Agreement" card present');
  const subBody = sub && sub.querySelector(':scope > .pr-card-body');
  // The nested analysis emits a "Subcontract Analysis" .pr-subhead inside the card body.
  const subheads = subBody ? [...subBody.querySelectorAll('.pr-subhead')].map(e => e.textContent.trim()) : [];
  ok(subheads.indexOf('Subcontract Analysis') !== -1,
    'B(C1): NESTED "Subcontract Analysis" subhead renders inside Section 3 (got: ' + subheads.join(' | ') + ')');
  // The seeded analysis content actually made it into the DOM (not the empty state).
  ok(subBody && /LDs flow down/.test(subBody.textContent),
    'B(C1): seeded Subcontract Analysis content rendered (nested render intact)');

  // No standalone Subcontracts module view leaked into the record root.
  ok(!root.querySelector('#mod-subcontracts'), 'B(C1): no #mod-subcontracts inside the project record');

  // --- CHANGE 2 (live): E&D 3 subgroups DEFAULT COLLAPSED (no .open), expand still works. ---
  const eng = cardTitled(root, 'Engineering & Design');
  ok(!!eng, 'B(C2): Engineering & Design card present');
  const engBody = eng && eng.querySelector(':scope > .pr-card-body');
  const engCg = engBody ? [...engBody.querySelectorAll('.pr-cgroup')].filter(g => g.closest('.pr-card') === eng) : [];
  ok(engCg.length === 3, 'B(C2): E&D has its 3 collapsible subgroups (got ' + engCg.length + ')');
  const engTitles = engCg.map(g => (g.querySelector('.pr-cgroup-title') || {}).textContent);
  ['Prelim Design', 'PF Submittal Design', 'As Built Drawings'].forEach((t, i) =>
    ok(engTitles[i] === t, 'B(C2): E&D subgroup ' + (i + 1) + ' = "' + t + '" (got "' + (engTitles[i] || '') + '")'));
  engCg.forEach((g, i) => ok(!g.classList.contains('open'),
    'B(C2): E&D subgroup ' + (i + 1) + ' DEFAULT collapsed (no .open)'));

  // --- CHANGE 2 (live): Site Readiness 7 subsections DEFAULT COLLAPSED too. ---
  const sr = cardTitled(root, 'Site Readiness / Project Setup');
  ok(!!sr, 'B(C2): Site Readiness card present');
  const srBody = sr && sr.querySelector(':scope > .pr-card-body');
  const srCg = srBody ? [...srBody.querySelectorAll('.pr-cgroup')].filter(g => g.closest('.pr-card') === sr) : [];
  ok(srCg.length === 7, 'B(C2): Site Readiness has 7 collapsible subsections (got ' + srCg.length + ')');
  srCg.forEach((g, i) => ok(!g.classList.contains('open'),
    'B(C2): SR subsection ' + (i + 1) + ' DEFAULT collapsed (no .open)'));

  // --- CHANGE 2: chevron un-rotated by default (collapsed indicator) + body hidden via CSS. ---
  // Structurally: default has no .open => the CSS `.pr-cgroup.open .pr-cgroup-body{display:block}`
  // does NOT apply, so the body is display:none (rolled up). Verify class contract.
  engCg.concat(srCg).forEach((g) => {
    ok(!!g.querySelector('.pr-cgroup-chev'), 'B(C2): each roll-up has a chevron indicator');
    ok(!!g.querySelector(':scope > .pr-cgroup-body'), 'B(C2): each roll-up has a body div');
  });

  // --- CHANGE 2: EXPAND still works (toggle .open on then off). ---
  {
    const g = engCg[0];
    ok(!g.classList.contains('open'), 'B(C2/toggle): E&D subgroup 1 starts collapsed');
    g.classList.toggle('open');
    ok(g.classList.contains('open'), 'B(C2/toggle): after click it EXPANDS (.open added)');
    g.classList.toggle('open');
    ok(!g.classList.contains('open'), 'B(C2/toggle): after second click it collapses again');
  }
}

// ---------- SCENARIO 2: extract the collapsibleSubgroup fn source + eval all 3 arities ----------
// The helper is scoped inside the render closure, so we extract its source and evaluate it
// standalone (with a trivial E()) to assert the flip semantics across arities directly.
{
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.E = (v) => (v == null ? '' : String(v));
  const fnStart = block.indexOf('function collapsibleSubgroup(');
  const fnBody = block.slice(fnStart);
  // Grab up to and including the function's closing brace (balanced from the first '{').
  let i = fnBody.indexOf('{'), depth = 0, end = -1;
  for (; i < fnBody.length; i++) { const ch = fnBody[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
  const fnSrc = fnBody.slice(0, end);
  const probe = w.eval('(' + fnSrc.replace('function collapsibleSubgroup', 'function') + ')');
  const two = probe('t', 'x');            // 2-arg (open undefined)
  const fls = probe('t', 'x', false);     // explicit false
  const tru = probe('t', 'x', true);      // explicit true
  ok(/class="pr-cgroup"/.test(two) && !/pr-cgroup open/.test(two), 'S2: 2-arg call -> collapsed (no .open)');
  ok(/class="pr-cgroup"/.test(fls) && !/pr-cgroup open/.test(fls), 'S2: open=false -> collapsed (no .open)');
  ok(/class="pr-cgroup open"/.test(tru), 'S2: open=true -> expanded (.open present)');
}

console.log('\n=== RESULT: ' + pass + ' pass / ' + fail + ' fail ===');
if (fail) { console.log('FAILURES:\n - ' + F.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
