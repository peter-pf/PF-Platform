// Render-proof for the 3 computed automations (phase 2, display-only).
// Chromium-free jsdom drive of office renderInto(D, root). Seeds overrides via
// window.PF_PROJECT_OVERRIDES[num].sections, renders, asserts the 3 computed hints.
import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
let iife = blocks.find(b => /function\s+renderInto\s*\(\s*D\s*,\s*root\s*\)/.test(b));
if (!iife) { console.error('FAIL: no renderInto IIFE'); process.exit(1); }
iife = iife.replace(/\n\s*\}\s*catch\s*\(e\)\s*\{\s*\n\s*console\.error\("Project record view failed to load:"/,
  '\n    window.__renderInto = renderInto;\n  } catch(e) {\n    console.error("Project record view failed to load:"');

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; } else { FAIL++; console.error('  FAIL: ' + m); } };

function boot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="prRoot"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.PF_PROJECT_POET = null; w.PF_PROJECT_RECORDS = {}; w.PF_PM = {};
  w.PF_ME = { role: 'admin', name: 'Peter' };
  w.showModule = () => {}; w.esc = (s) => String(s == null ? '' : s);
  w.XMLHttpRequest = function(){ this.open=()=>{}; this.setRequestHeader=()=>{}; this.send=()=>{}; this.status=0; this.responseText=''; };
  w.fetch = () => Promise.reject(new Error('no-net'));
  try { w.eval(iife); } catch (e) { console.error('EVAL ERR: ' + e.message); process.exit(1); }
  return w;
}
function rec(num, bid){ return { project_number: num, project_name: 'CA Test', number: num, bid_log: bid||{}, subcontract:{fields:{}}, contacts:{}, links:{}, qaqc:null }; }
function render(w, D){ const root = w.document.getElementById('prRoot'); root.innerHTML=''; w.__renderInto(D, root); return root; }
function seed(w, num, sections){ w.PF_PROJECT_OVERRIDES[num] = { sections, _meta:null }; }
function hintTexts(root){ return [...root.querySelectorAll('.pr-computed-hint')].map(e=>e.textContent.trim()); }

// ===== CASE 1: elevation diff 2.5 ft -> RED flag =====
{
  const w = boot();
  seed(w, '26-101', { siteReadiness: { 'Expected Building Pad Elevation':"102.5'", 'Actual Building Pad Elevation':"100 ft" } });
  const root = render(w, rec('26-101', {}));
  const hints = hintTexts(root);
  ok(hints.some(t=>/Computed elevation difference \(Expected - Actual\): 2\.5 ft/.test(t)), '1a: elev diff 2.5 computed');
  const flagged = [...root.querySelectorAll('.pr-computed-hint.pr-computed-flag')].map(e=>e.textContent);
  ok(flagged.some(t=>/exceeds 2 ft - review required/.test(t)), '1b: >2ft RED flag present');
  ok(hints.some(t=>/notify PM \/ Field Ops \/ Owners \(FUTURE/.test(t)), '1c: FUTURE notify note present');
  // verify red styled element exists (has pr-computed-flag class)
  ok([...root.querySelectorAll('.pr-computed-flag')].length >= 1, '1d: red-styled flag element present');
  // manual Elevation Difference field still present + untouched (no data-pr-label on hints)
  const labels = [...root.querySelectorAll('.pr-field[data-pr-label]')].map(f=>f.getAttribute('data-pr-label'));
  ok(labels.includes('Elevation Difference'), '1e: manual Elevation Difference field intact');
  ok([...root.querySelectorAll('.pr-computed-hint[data-pr-label]')].length === 0, '1f: hints are NOT editable fields (no data-pr-label)');
}

// ===== CASE 2: elevation diff 1 ft -> normal (no flag) =====
{
  const w = boot();
  seed(w, '26-102', { siteReadiness: { 'Expected Building Pad Elevation':'101', 'Actual Building Pad Elevation':'100' } });
  const root = render(w, rec('26-102', {}));
  const hints = hintTexts(root);
  ok(hints.some(t=>/Computed elevation difference \(Expected - Actual\): 1 ft \(within 2 ft\)/.test(t)), '2a: 1ft diff normal text');
  ok([...root.querySelectorAll('.pr-computed-flag')].length === 0, '2b: NO red flag under 2ft');
  ok(!hints.some(t=>/exceeds 2 ft/.test(t)), '2c: no exceed warning under 2ft');
}

// ===== CASE 2b: exactly 2 ft -> normal (>2 strict) =====
{
  const w = boot();
  seed(w, '26-103', { siteReadiness: { 'Expected Building Pad Elevation':'102', 'Actual Building Pad Elevation':'100' } });
  const root = render(w, rec('26-103', {}));
  ok([...root.querySelectorAll('.pr-computed-flag')].length === 0, '2b1: exactly 2ft NOT flagged (>2 strict)');
  ok(hintTexts(root).some(t=>/2 ft \(within 2 ft\)/.test(t)), '2b2: exactly 2ft shows within-2ft');
}

// ===== CASE 3: elevation blank -> NO computed hint =====
{
  const w = boot();
  seed(w, '26-104', { siteReadiness: { 'Expected Building Pad Elevation':'100' } }); // actual missing
  const root = render(w, rec('26-104', {}));
  ok(!hintTexts(root).some(t=>/Computed elevation difference/.test(t)), '3a: no elev hint when one value missing');
}

// ===== CASE 4: GGG return = files-sent + 5 business days =====
{
  const w = boot();
  seed(w, '26-105', { closeout: { 'Date All Files Sent to GGG':'2026-08-07' } }); // Fri
  const root = render(w, rec('26-105', {}));
  const hints = hintTexts(root);
  ok(hints.some(t=>/Computed expected GGG return: 08\/14\/2026 \(5 business days after files sent\)/.test(t)), '4a: GGG Fri+5biz = 08/14/2026');
  ok(hints.some(t=>/Manual entry above overrides this/.test(t)), '4b: GGG override note present');
  const labels = [...root.querySelectorAll('.pr-field[data-pr-label]')].map(f=>f.getAttribute('data-pr-label'));
  ok(labels.includes('Expected GGG Return Date'), '4c: manual Expected GGG Return Date field intact');
}

// ===== CASE 4b: GGG blank -> no hint =====
{
  const w = boot();
  const root = render(w, rec('26-106', {}));
  ok(!hintTexts(root).some(t=>/Computed expected GGG return/.test(t)), '4d: no GGG hint when files-sent blank');
}

// ===== CASE 5: locate-by = start - 4 business days (from bid.projected_start) =====
{
  const w = boot();
  const root = render(w, rec('26-107', { projected_start:'2026-08-17' })); // Mon
  const hints = hintTexts(root);
  ok(hints.some(t=>/Call locate by: 08\/11\/2026 \(4 business days before the 08\/17\/2026 project start\)/.test(t)), '5a: locate Mon 8/17 -4biz = 08/11/2026');
  ok(hints.some(t=>/PM to-do reminder \(FUTURE/.test(t)), '5b: locate FUTURE reminder note');
}

// ===== CASE 5b: locate-by uses override of Anticipated Project Start (override wins) =====
{
  const w = boot();
  seed(w, '26-108', { general: { 'Anticipated Project Start':'2026-08-12' } }); // Wed override
  const root = render(w, rec('26-108', { projected_start:'2026-01-01' })); // synced ignored
  ok(hintTexts(root).some(t=>/Call locate by: 08\/06\/2026 \(4 business days before the 08\/12\/2026 project start\)/.test(t)), '5c: locate uses override start (override wins)');
}

// ===== CASE 5c: no start date -> no locate hint =====
{
  const w = boot();
  const root = render(w, rec('26-109', {})); // no projected_start
  ok(!hintTexts(root).some(t=>/Call locate by/.test(t)), '5d: no locate hint when start blank');
}

// ===== CASE 6: other sections still intact (regression) =====
{
  const w = boot();
  const root = render(w, rec('26-110', { projected_start:'2026-08-17' }));
  const sections = [...root.querySelectorAll('.pr-card[data-pr-section]')].map(c=>c.getAttribute('data-pr-section'));
  ['general','contract','engineering','siteReadiness','closeout'].forEach(s=>ok(sections.includes(s), '6: section intact: '+s));
  // closeout 5 subgroups still there
  const closeout = root.querySelector('.pr-card[data-pr-section="closeout"]');
  ok(closeout && [...closeout.querySelectorAll('.pr-subgroup')].length >= 5, '6: closeout 5 subgroups intact');
}

console.log('\n' + PASS + ' pass, ' + FAIL + ' fail');
process.exit(FAIL ? 1 : 0);
