// jsdom render-proof for the editor-improvements-20260807 feature. Loads the REAL
// project-record IIFE from platform/index.html (no reimplementation) and asserts:
//   CHANGE 1 (textarea): the two designated labels render a <textarea> in the section
//     editor (not <input>), a multi-line value round-trips (save reads .value w/ \n),
//     and the read view marks the field .pr-field-value-multiline (pre-wrap display).
//   CHANGE 2 (DP auto-write): saving the design_professionals section AUTO-POSTs each
//     firm contact to /api/contacts (no button click), best-effort + non-blocking: a
//     423/error on the contacts POST does NOT fail the project override save, and the
//     dup-guard routing (action:'add') is preserved. A NON-DP section save triggers NO
//     contacts POST.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');

const html = readFileSync(join(REPO, 'index.html'), 'utf8');
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
  w.esc = (s)=> String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  w.PF_ME = { role, name: 'Tester' };
  w.showModule = ()=>{};
  w.pfFmtPhone = (v)=> String(v==null?'':v);
  w.pfFmtDate = (v)=> String(v==null?'':v);
  w.PF_PROJECT_POET = null;
  w.PF_PROJECT_RECORDS = { records: {
    '26-002': { project_number:'26-002', project_name:'POET', location:'Warsaw, IN',
      bid_log:{ gc_name:'Weigand', total_columns:1044, total_lf:13397, engineer_firm:'Ground Improvement Inc' },
      contacts:{ groups:{ engineering:[
        { company:'Ground Improvement Inc', name:'Ed Garbin', scope:'AP Design',
          phone:'260-555-2000', cell:'260-555-2001', email:'ed@gie.com', website:'gie.com' }
      ] } },
      links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}
function boot(dom, { overrideGet, fetchImpl }){
  const w = dom.window;
  w.XMLHttpRequest = class {
    open(m,u){ this.url=u; }
    setRequestHeader(){}
    send(){ const r = overrideGet(this.url); this.status=r.status; this.responseText=r.text; }
  };
  if (fetchImpl) w.fetch = fetchImpl;
  w.eval(iife);
  return w;
}
const emptyOv = ()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections:{},_meta:null})});
function ovWith(sections){ return ()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections,_meta:null})}); }
const wait = (ms)=> new Promise(r=>setTimeout(r,ms));
function findInput(scope, re){
  return [...scope.querySelectorAll('.pr-edit-input[data-pr-field-label]')]
    .find(i=>re.test(i.getAttribute('data-pr-field-label')));
}

async function run(){
  // ================================================================
  // CHANGE 1 — textarea for the two designated fields
  // ================================================================
  // A: Contract Recap > Scope of Work -> "Extra Scope of Work Language" is a <textarea>.
  {
    const dom = makeDom('partner');
    const w = boot(dom, { overrideGet: emptyOv });
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const contractCard = root.querySelector('.pr-card[data-pr-section="contract"]');
    ok('A1 contract card present', !!contractCard);
    if (contractCard) {
      w.pfEditSection(contractCard.querySelector('.pr-edit-btn'));
      const el = findInput(contractCard, /^Extra Scope of Work Language$/);
      ok('A1 Extra SOW field present in editor', !!el);
      ok('A1 Extra SOW renders as <textarea>', !!el && el.tagName.toLowerCase() === 'textarea');
      ok('A1 Extra SOW has textarea class', !!el && el.classList.contains('pr-edit-textarea'));
      // A neighbouring plain field is still a text input (mechanism is opt-in only).
      const plain = findInput(contractCard, /Staking & Layout/);
      ok('A1 non-designated field stays <input>', !plain || plain.tagName.toLowerCase() === 'input');
    }
  }

  // B: Engineering & Design > As Built Drawings -> "Field As-Built Notes" is a <textarea>.
  {
    const dom = makeDom('partner');
    const w = boot(dom, { overrideGet: emptyOv });
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const engCard = root.querySelector('.pr-card[data-pr-section="engineering"]');
    ok('B1 engineering card present', !!engCard);
    if (engCard) {
      w.pfEditSection(engCard.querySelector('.pr-edit-btn'));
      const el = findInput(engCard, /^Field As-Built Notes$/);
      ok('B1 Field As-Built Notes present in editor', !!el);
      ok('B1 Field As-Built Notes renders as <textarea>', !!el && el.tagName.toLowerCase() === 'textarea');
    }
  }

  // C: multi-line VALUE round-trips through the editor + read view.
  //    Seed an override with a 3-line value; assert the textarea holds it verbatim,
  //    the read view marks it .pr-field-value-multiline, and re-editing reads it back.
  {
    const multi = 'Line one\nLine two\nLine three';
    const dom = makeDom('partner');
    const w = boot(dom, { overrideGet: ovWith({ contract: { 'Extra Scope of Work Language': multi } }) });
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const contractCard = root.querySelector('.pr-card[data-pr-section="contract"]');
    // Read-view: the field marks multiline + preserves the text.
    const fieldEl = [...contractCard.querySelectorAll('.pr-field[data-pr-label]')]
      .find(f=>f.getAttribute('data-pr-label') === 'Extra Scope of Work Language');
    ok('C1 override field rendered', !!fieldEl);
    const valEl = fieldEl && fieldEl.querySelector('.pr-field-value');
    ok('C1 read view is multiline class', !!valEl && valEl.classList.contains('pr-field-value-multiline'));
    ok('C1 read view preserves all lines (textContent)', !!valEl && valEl.textContent === multi);
    // Open editor: textarea prefilled with the exact multi-line value.
    w.pfEditSection(contractCard.querySelector('.pr-edit-btn'));
    const ta = findInput(contractCard, /^Extra Scope of Work Language$/);
    ok('C1 editor textarea prefilled multi-line', !!ta && ta.value === multi);
    // Edit to a NEW multi-line value + Save -> the POST carries the newlines.
    let posted = null;
    w.fetch = (url, init)=>{
      if (String(url).includes('/api/project-override')) {
        posted = JSON.parse(init.body);
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
          ok:true, saved:true, num:'26-002', section:'contract',
          sections:{ contract: posted.fields }, _meta:null }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ok:true,contacts:[]}) });
    };
    ta.value = 'Alpha\nBeta';
    w.pfSaveSection(contractCard.querySelector('.pr-save-btn'));
    await wait(40);
    ok('C1 Save POSTed multi-line value', posted && posted.fields['Extra Scope of Work Language'] === 'Alpha\nBeta');
    ok('C1 Save used contract section', posted && posted.section === 'contract');
  }

  // ================================================================
  // CHANGE 2 — DP save AUTO-writes to master (no button)
  // ================================================================
  // D: saving design_professionals AUTO-POSTs firm contacts to /api/contacts.
  {
    const dom = makeDom('partner');
    const contactPosts = [];
    let overridePosted = null, renderCount = 0;
    const w = boot(dom, {
      overrideGet: emptyOv,
      fetchImpl: (url, init)=>{
        if (String(url).includes('/api/project-override')) {
          overridePosted = JSON.parse(init.body);
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
            ok:true, saved:true, num:'26-002', section:'design_professionals',
            sections:{ design_professionals: overridePosted.fields }, _meta:null }) });
        }
        if (String(url).includes('/api/contacts')) {
          if (init && init.method === 'POST') {
            contactPosts.push(JSON.parse(init.body));
            return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, saved:true, action:'add' }) });
          }
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:[] }) });
        }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true }) });
      }
    });
    const origRender = w.renderProjectRecord;
    w.renderProjectRecord = function(n, r){ renderCount++; return origRender(n, r); };
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
    w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
    const editor = dpCard.querySelector('.pr-editor');
    // Fill a Structural firm + contact.
    (findInput(editor, /^Structural - Company$/) || {}).value = 'BoltStruct LLC';
    (findInput(editor, /Structural - Contact 1 - Contact Name/) || {}).value = 'Pat Beam';
    (findInput(editor, /Structural - Contact 1 - Email/) || {}).value = 'pat@bolt.com';
    (findInput(editor, /Ground Improvement - Company/) || {}).value = 'Ground Improvement Inc';
    // Click SAVE (the section save) — NOT the directory button.
    w.pfSaveSection(dpCard.querySelector('.pr-save-btn'));
    await wait(80);
    ok('D project override saved', !!overridePosted && overridePosted.section === 'design_professionals');
    ok('D re-render happened (project save succeeded)', renderCount >= 1);
    ok('D AUTO-backfeed POSTed contacts (no button click)', contactPosts.length >= 1);
    const structPost = contactPosts.map(p=>p.contact).find(c=>c && c.lastName === 'Beam');
    ok('D structural contact auto-backfed', !!structPost);
    ok('D structural category mapped', structPost && structPost.category === 'Structural Engineer');
    ok('D structural company attached', structPost && structPost.company === 'BoltStruct LLC');
    const giPost = contactPosts.map(p=>p.contact).find(c=>c && c.lastName === 'Garbin');
    ok('D seeded GI contact auto-backfed w/ category', giPost && giPost.category === 'Ground Improvement Engineer');
    ok('D all auto posts action=add (dup-guard routes repeat->update)', contactPosts.every(p=>p.action === 'add'));
  }

  // E: contacts POST returns 423 (Excel locked) -> project override save STILL succeeds,
  //    a soft toast appears, NO hard failure, edit mode is exited (re-render happened).
  {
    const dom = makeDom('partner');
    let overridePosted = null, renderCount = 0, editErrShown = false;
    const w = boot(dom, {
      overrideGet: emptyOv,
      fetchImpl: (url, init)=>{
        if (String(url).includes('/api/project-override')) {
          overridePosted = JSON.parse(init.body);
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
            ok:true, saved:true, num:'26-002', section:'design_professionals',
            sections:{ design_professionals: overridePosted.fields }, _meta:null }) });
        }
        if (String(url).includes('/api/contacts') && init && init.method === 'POST') {
          // 423 lock
          return Promise.resolve({ ok:false, status:423, json:()=>Promise.resolve({
            status:'error', message:'The contact list is open in Excel. Close it and retry; nothing was changed.' }) });
        }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:[] }) });
      }
    });
    const origRender = w.renderProjectRecord;
    w.renderProjectRecord = function(n, r){ renderCount++; return origRender(n, r); };
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
    w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
    const editor = dpCard.querySelector('.pr-editor');
    (findInput(editor, /Ground Improvement - Company/) || {}).value = 'Ground Improvement Inc';
    // capture whether the editor error box got shown (it must NOT for a 423 backfeed)
    const errBox = editor.querySelector('.pr-edit-err');
    w.pfSaveSection(dpCard.querySelector('.pr-save-btn'));
    await wait(90);
    if (errBox) editErrShown = (errBox.style.display === 'block');
    ok('E project override STILL saved on 423 backfeed', !!overridePosted);
    ok('E project save re-rendered (not stuck in edit)', renderCount >= 1);
    ok('E NO hard save error surfaced for the 423 backfeed', editErrShown === false);
    const toast = w.document.querySelector('.pr-toast.pr-toast-warn');
    ok('E soft (warn) toast shown, not a blocking error', !!toast && /Excel|retry|sync/i.test(toast.textContent));
  }

  // F: a NON-DP section save triggers NO contacts POST (auto-write is DP-only).
  {
    const dom = makeDom('partner');
    const contactPosts = [];
    const w = boot(dom, {
      overrideGet: emptyOv,
      fetchImpl: (url, init)=>{
        if (String(url).includes('/api/project-override')) {
          const b = JSON.parse(init.body);
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
            ok:true, saved:true, num:'26-002', section:b.section,
            sections:{ [b.section]: b.fields }, _meta:null }) });
        }
        if (String(url).includes('/api/contacts') && init && init.method === 'POST') { contactPosts.push(1); }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:[] }) });
      }
    });
    w.openProjectRecord('26-002');
    const root = w.document.getElementById('prGenericRoot');
    const contractCard = root.querySelector('.pr-card[data-pr-section="contract"]');
    w.pfEditSection(contractCard.querySelector('.pr-edit-btn'));
    w.pfSaveSection(contractCard.querySelector('.pr-save-btn'));
    await wait(60);
    ok('F non-DP save made ZERO contacts POSTs', contactPosts.length === 0);
  }

  console.log('\nEDITOR-IMPROVEMENTS RENDER-PROOF: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:', fails); process.exit(1); }
}
run();
