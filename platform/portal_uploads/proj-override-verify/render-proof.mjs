// jsdom render-proof for the per-section project-record override feature.
// Loads the REAL project-record IIFE from platform/index.html (no reimplementation),
// stubs the page globals it needs, mocks the override XHR/fetch, and asserts the
// rendered DOM: Edit-button gating by role, override-wins merge, and the
// fail-closed save path (error shown, stays in edit mode, no fake success).
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');

const html = readFileSync(join(REPO, 'index.html'), 'utf8');
// Extract the project-record IIFE (the block that defines openProjectRecord).
const mark = 'Renders window.PF_PROJECT_POET into #prRoot as 11 collapsible schema cards.';
const idx = html.indexOf(mark);
const sStart = html.indexOf('<script>', idx) + '<script>'.length;
const sEnd = html.indexOf('</script>', sStart);
const iife = html.slice(sStart, sEnd);

let pass = 0, fail = 0; const fails = [];
function ok(name, cond){ if(cond){pass++;} else {fail++; fails.push(name); console.error('  FAIL:', name);} }

function makeDom(role){
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="prRoot" class="pr-root"></div>
    <div id="prGenericRoot" class="pr-root"></div>
    <div id="pageTitle"></div>
  </body></html>`, { runScripts: 'outside-only' });
  const w = dom.window;
  // page globals the IIFE relies on
  w.esc = (s)=> String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  w.PF_ME = { role, name: 'Tester' };
  w.showModule = ()=>{};
  // Formatter stubs the render IIFE relies on (added 2026-08-11: this stale harness
  // predates the pfFmt* helpers; without them renderInto throws on qty labels).
  w.pfFmtPhone = (v)=> String(v==null?'':v);
  w.pfFmtDate = (v)=> String(v==null?'':v);
  w.pfFmtQty = (v)=> String(v==null?'':v);
  w.pfFmtMoney = (v)=> String(v==null?'':v);
  w.pfFmtNum = (v)=> String(v==null?'':v);
  w.PF_PROJECT_POET = null;         // no POET auto-render in this harness
  w.PF_PROJECT_RECORDS = { records: {
    '26-002': { project_number:'26-002', project_name:'POET', location:'Warsaw, IN',
      bid_log:{ gc_name:'Weigand', total_columns:1044, total_lf:13397 },
      contacts:{groups:{}}, links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

// Run the IIFE inside a window, with an injected XHR (override GET) + fetch (save).
function boot(dom, { overrideGet, fetchImpl }){
  const w = dom.window;
  // Synchronous XHR mock for /api/project-override?num=
  w.XMLHttpRequest = class {
    open(m,u){ this.url=u; }
    setRequestHeader(){}
    send(){ const r = overrideGet(this.url); this.status=r.status; this.responseText=r.text; }
  };
  if (fetchImpl) w.fetch = fetchImpl;
  // Execute the IIFE in the window scope.
  w.eval(iife);
  return w;
}

// ---- Scenario A: OFFICE user, no overrides -> Edit buttons present on all 11 sections
(function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: ()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections:{},_meta:null})}) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const editBtns = root.querySelectorAll('.pr-edit-btn');
  ok('A office sees Edit buttons (>=11)', editBtns.length >= 11);
  const cards = root.querySelectorAll('.pr-card[data-pr-section]');
  ok('A 11 sectioned cards rendered', cards.length === 11);
  // no edited markers when no overrides
  ok('A no edited markers', root.querySelectorAll('.pr-field-edited').length === 0);
})();

// ---- Scenario B: FIELD_OPS user -> NO Edit buttons (client gate; server is real boundary)
(function(){
  const dom = makeDom('field_ops');
  // field_ops GET would 403; harness returns 403 -> empty
  const w = boot(dom, { overrideGet: ()=>({status:403, text: JSON.stringify({status:'forbidden'})}) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  ok('B field_ops sees NO Edit buttons', root.querySelectorAll('.pr-edit-btn').length === 0);
  ok('B field_ops still sees the record', root.querySelectorAll('.pr-card').length >= 11);
})();

// ---- Scenario C: OFFICE user WITH an override -> override value WINS on render
(function(){
  const dom = makeDom('admin');
  const overrides = { ok:true, num:'26-002',
    sections:{ general:{ 'County':'Kosciusko', 'Column Diameter':'30 in' } },
    _meta:{ updatedBy:'Brad', updatedAt:'2026-07-28T12:00:00Z' } };
  const w = boot(dom, { overrideGet: ()=>({status:200, text: JSON.stringify(overrides)}) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  // find the County field
  const countyField = [...root.querySelectorAll('.pr-field[data-pr-label]')].find(f=>f.getAttribute('data-pr-label')==='County');
  ok('C county override rendered', countyField && /Kosciusko/.test(countyField.textContent));
  ok('C county marked edited', countyField && countyField.querySelector('.pr-field-edited'));
  ok('C edited-by meta shown', /edited by Brad/.test(root.textContent));
})();

// ---- Scenario D: FAIL CLOSED save -> error shown, stays in edit mode, no fake success
(async function(){
  const dom = makeDom('partner');
  const w = boot(dom, {
    overrideGet: ()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections:{},_meta:null})}),
    // fetch returns a 503 (KV unavailable) -> must fail closed
    fetchImpl: ()=> Promise.resolve({ ok:false, status:503,
      json: ()=> Promise.resolve({ status:'error', message:'Persistence unavailable' }) })
  });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  // open the general editor
  const genCard = root.querySelector('.pr-card[data-pr-section="general"]');
  const editBtn = genCard.querySelector('.pr-edit-btn');
  w.pfEditSection(editBtn);
  ok('D editor opened', !!genCard.querySelector('.pr-editor'));
  // change a value then Save
  const inp = genCard.querySelector('.pr-edit-input');
  inp.value = 'CHANGED';
  const saveBtn = genCard.querySelector('.pr-save-btn');
  w.pfSaveSection(saveBtn);
  await new Promise(r=>setTimeout(r, 50)); // let the promise chain settle
  const err = genCard.querySelector('.pr-edit-err');
  ok('D error shown on failed save', err && err.style.display !== 'none' && /unavailable|not saved|NOT saved|failed/i.test(err.textContent));
  ok('D still in edit mode', !!genCard.querySelector('.pr-editor'));
  ok('D input value preserved', genCard.querySelector('.pr-edit-input').value === 'CHANGED');

  // ---- Scenario E: successful save -> re-render shows override, editor closed
  w.fetch = ()=> Promise.resolve({ ok:true, status:200,
    json: ()=> Promise.resolve({ ok:true, saved:true, num:'26-002', section:'general',
      sections:{ general:{ 'County':'SAVEDVALUE' } }, _meta:{ updatedBy:'Tester', updatedAt:'2026-07-28T13:00:00Z' } }) });
  // re-open + save
  const editBtn2 = genCard.querySelector('.pr-edit-btn');
  w.pfEditSection(editBtn2);
  w.pfSaveSection(genCard.querySelector('.pr-save-btn'));
  await new Promise(r=>setTimeout(r, 50));
  const root2 = w.document.getElementById('prGenericRoot');
  const countyField = [...root2.querySelectorAll('.pr-field[data-pr-label]')].find(f=>f.getAttribute('data-pr-label')==='County');
  ok('E success merges override on re-render', countyField && /SAVEDVALUE/.test(countyField.textContent));
  ok('E editor closed after success', !root2.querySelector('.pr-editor'));

  // ---- Scenario F: NEW project (no synced record) -> synthesized editable record
  const domF = makeDom('partner');
  domF.window.PF_PM = { byBidId:{ 'num_26-020':{ projectNumber:'26-020', name:'New Data Center', gc:'Turner' } }, loaded:true };
  const wF = boot(domF, { overrideGet: ()=>({status:200, text: JSON.stringify({ok:true,num:'26-020',sections:{},_meta:null})}) });
  wF.openProjectRecord('26-020');
  const rootF = wF.document.getElementById('prGenericRoot');
  ok('F new project renders 11 editable sections', rootF.querySelectorAll('.pr-card[data-pr-section]').length === 11);
  ok('F new project name from PM overlay', /New Data Center/.test(rootF.textContent));
  ok('F new project has Edit buttons', rootF.querySelectorAll('.pr-edit-btn').length >= 11);

  console.log('\nRENDER-PROOF: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:', fails); process.exit(1); }
})();
