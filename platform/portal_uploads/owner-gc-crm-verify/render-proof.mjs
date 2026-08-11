// jsdom render-proof for the Owner/GC CRM cascading selector extension. Loads the
// REAL project-record IIFE from platform/index.html (no reimplementation), drives a
// synthetic record, and asserts:
// (Updated 2026-08-11: Owner+GC relocated to the Project Contacts "Owner & General
//  Contractor" nested card — still the `general` key. Assertions target that card.)
//   A. The Owner & GC editor exposes Owner + GC CRM selector blocks (data-crm-key=general),
//      each with a company dropdown + "+ Add company", and NO other trade blocks leak in.
//   B. The Owner dropdown hydrates from trade=Owner (Owner-category companies only);
//      the GC dropdown from trade=GC (GC-category only) — filter isolation.
//   C. Selecting a company + checking contacts + Save POSTs to /api/project-override
//      with section:"general" and a __crm payload carrying Owner + GC selections
//      (contactIds validated ^C\d+$), coexisting with plain general fields.
//   D. On reload with a saved general.__crm, pfCrmRenderCards resolves Owner + GC ids
//      into live cards under the Owner / GC hosts (name-first card layout).
//   E. No regression: the Design Professionals selector renders its 4 firm blocks under
//      design_professionals (GC firm removed -> GC now lives under general); DP + general
//      __crm are independent.
//   F. field_ops sees NO Edit button on the Owner & GC card.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/owner-gc-crm-verify/render-proof.mjs
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

// Fixture directory for the CRM fetch endpoints.
const OWNER_COMPANIES = [{ company:'Westhoff Development', contactCount:2, address:'1 A St', website:'wd.com' }];
const GC_COMPANIES = [{ company:'Weigand Construction', contactCount:2, address:'2 B St', website:'weigand.com' }];
const OWNER_CONTACTS = [
  { contactId:'C0009', name:'Nathan Westhoff', title:'Owner', officePhone:'', cellPhone:'2604131111', email:'nw@x.com' },
  { contactId:'C0014', name:'Larry Blanchard', title:'Partner', officePhone:'', cellPhone:'2604132222', email:'lb@x.com' }
];
const GC_CONTACTS = [
  { contactId:'C0007', name:'Tanner Schweer', title:'PM', officePhone:'2604133333', cellPhone:'', email:'ts@x.com' },
  { contactId:'C0008', name:'Jacob Lincoln', title:'Super', officePhone:'', cellPhone:'2604134444', email:'jl@x.com' }
];
const ALL_CONTACTS = OWNER_CONTACTS.concat(GC_CONTACTS);

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
  w.pfFmtQty = (v)=> String(v==null?'':v);
  w.pfFmtMoney = (v)=> String(v==null?'':v);
  w.pfFmtNum = (v)=> String(v==null?'':v);
  w.PF_PROJECT_POET = null;
  w.PF_PROJECT_RECORDS = { records: {
    '26-002': { project_number:'26-002', project_name:'POET', location:'Warsaw, IN',
      bid_log:{ gc_name:'Weigand', total_columns:1044, total_lf:13397 },
      contacts:{ groups:{
        owner:[{ company:'Westhoff Development', name:'Nathan Westhoff', scope:'Owner' }],
        gc:[{ company:'Weigand Construction', name:'Tanner Schweer', scope:'PM' }]
      } },
      links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

// A fetch that serves the CRM directory endpoints + records POSTs.
function crmFetch(posts){
  return (url, init)=>{
    const u = String(url);
    if (u.includes('/api/contacts')) {
      const q = u.split('?')[1] || '';
      const params = new URLSearchParams(q);
      const trade = params.get('trade') || '';
      const company = params.get('company');
      if (company != null) {
        const list = trade === 'Owner' ? OWNER_CONTACTS : trade === 'GC' ? GC_CONTACTS : [];
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, mode:'contacts', contacts:list }) });
      }
      if (trade) {
        const cos = trade === 'Owner' ? OWNER_COMPANIES : trade === 'GC' ? GC_COMPANIES : [];
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, mode:'companies', companies:cos }) });
      }
      // flat list (pfLoadContacts, used by pfCrmRenderCards)
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:ALL_CONTACTS }) });
    }
    if (u.includes('/api/project-override')) {
      if (init && init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (posts) posts.push(body);
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
          ok:true, saved:true, num:body.num, section:body.section,
          sections:{ [body.section]: body.fields }, _meta:{updatedBy:'Tester',updatedAt:'2026-08-11T12:00:00Z'} }) });
      }
    }
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true }) });
  };
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
const ovWith = (sections)=>()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections,_meta:null})});

// Owner+GC contact groups were RELOCATED to the Project Contacts section (Brad
// 2026-08-11) into the "Owner & General Contractor" nested card (still `general` key).
// Find a nested card by its title.
function findCard(root, title){
  let found = null;
  root.querySelectorAll('.pr-card').forEach(c=>{
    const t = c.querySelector('.pr-card-title');
    if (t && t.textContent === title) found = c;
  });
  return found;
}

// ---- A + B: General editor exposes Owner + GC selectors, filtered by category ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const genCard = findCard(root, 'Owner & General Contractor');
  ok('A Owner & GC card renders', !!genCard);
  ok('A Owner & GC card editable (office)', !!(genCard && genCard.querySelector('.pr-edit-btn')));
  w.pfEditSection(genCard.querySelector('.pr-edit-btn'));
  const editor = genCard.querySelector('.pr-editor');
  ok('A general editor opened', !!editor);
  const crmBlocks = editor.querySelectorAll('.pr-crm[data-crm-key="general"]');
  ok('A exactly 2 general CRM blocks (Owner + GC)', crmBlocks.length === 2);
  const sections = [...crmBlocks].map(b=>b.getAttribute('data-crm-section')).sort();
  ok('A blocks are Owner + GC', sections.join(',') === 'GC,Owner');
  const trades = {};
  crmBlocks.forEach(b=>{ trades[b.getAttribute('data-crm-section')] = b.getAttribute('data-crm-trade'); });
  ok('A Owner block trade=Owner', trades['Owner'] === 'Owner');
  ok('A GC block trade=GC', trades['GC'] === 'GC');
  // Each has a company select + "+ Add company"
  ok('A Owner block has company dropdown + add-company',
    !!crmBlocks[0].querySelector('.pr-crm-company') && !!crmBlocks[0].querySelector('.pr-crm-addco'));
  // Hydrate is async; wait a tick for company options to populate.
  await new Promise(r=>setTimeout(r,60));
  const ownerBlock = [...crmBlocks].find(b=>b.getAttribute('data-crm-section')==='Owner');
  const gcBlock = [...crmBlocks].find(b=>b.getAttribute('data-crm-section')==='GC');
  const ownerOpts = [...ownerBlock.querySelectorAll('.pr-crm-company option')].map(o=>o.value).filter(Boolean);
  const gcOpts = [...gcBlock.querySelectorAll('.pr-crm-company option')].map(o=>o.value).filter(Boolean);
  ok('B Owner dropdown shows Owner-category company', ownerOpts.includes('Westhoff Development'));
  ok('B Owner dropdown excludes GC company', !ownerOpts.includes('Weigand Construction'));
  ok('B GC dropdown shows GC-category company', gcOpts.includes('Weigand Construction'));
  ok('B GC dropdown excludes Owner company', !gcOpts.includes('Westhoff Development'));
})();

// ---- C: select company + contacts + Save POSTs section:general with __crm ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(posts) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const genCard = findCard(root, 'Owner & General Contractor');
  w.pfEditSection(genCard.querySelector('.pr-edit-btn'));
  const editor = genCard.querySelector('.pr-editor');
  await new Promise(r=>setTimeout(r,60));
  const ownerBlock = [...editor.querySelectorAll('.pr-crm')].find(b=>b.getAttribute('data-crm-section')==='Owner');
  const gcBlock = [...editor.querySelectorAll('.pr-crm')].find(b=>b.getAttribute('data-crm-section')==='GC');
  // Select Owner company -> triggers change -> loads contacts
  const oSel = ownerBlock.querySelector('.pr-crm-company');
  oSel.value = 'Westhoff Development';
  oSel.dispatchEvent(new w.Event('change', { bubbles:true }));
  const gSel = gcBlock.querySelector('.pr-crm-company');
  gSel.value = 'Weigand Construction';
  gSel.dispatchEvent(new w.Event('change', { bubbles:true }));
  await new Promise(r=>setTimeout(r,60));
  // Check one Owner contact + one GC contact
  const oCb = ownerBlock.querySelector('.pr-crm-cb');
  ok('C Owner contacts loaded', !!oCb);
  if (oCb) oCb.checked = true;
  const gCb = gcBlock.querySelector('.pr-crm-cb');
  ok('C GC contacts loaded', !!gCb);
  if (gCb) gCb.checked = true;
  w.pfSaveSection(genCard.querySelector('.pr-save-btn'));
  await new Promise(r=>setTimeout(r,60));
  const p = posts.find(x=>x.section==='general');
  ok('C Save POSTed section general', !!p);
  ok('C payload carries __crm', p && p.fields && p.fields.__crm && typeof p.fields.__crm === 'object');
  ok('C __crm.Owner has selected company + id', p && p.fields.__crm.Owner &&
    p.fields.__crm.Owner.company === 'Westhoff Development' &&
    /^C\d+$/.test(p.fields.__crm.Owner.contactIds[0]));
  ok('C __crm.GC has selected company + id', p && p.fields.__crm.GC &&
    p.fields.__crm.GC.company === 'Weigand Construction' &&
    /^C\d+$/.test(p.fields.__crm.GC.contactIds[0]));
})();

// ---- D: reload with saved general.__crm -> Owner/GC cards render ----
await (async function(){
  const dom = makeDom('partner');
  const savedSections = { general: { __crm: {
    'Owner': { company:'Westhoff Development', contactIds:['C0009','C0014'] },
    'GC': { company:'Weigand Construction', contactIds:['C0007'] }
  } } };
  const w = boot(dom, { overrideGet: ovWith(savedSections), fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const genBody = findCard(root, 'Owner & General Contractor').querySelector('.pr-card-body');
  ok('D general card body present', !!genBody);
  const ownerHost = genBody.querySelector('.pr-crm-cards[data-crm-cards="Owner"][data-crm-cards-key="general"]');
  const gcHost = genBody.querySelector('.pr-crm-cards[data-crm-cards="GC"][data-crm-cards-key="general"]');
  ok('D Owner card host exists', !!ownerHost);
  ok('D GC card host exists', !!gcHost);
  await new Promise(r=>setTimeout(r,80));
  const ownerText = ownerHost ? ownerHost.textContent : '';
  const gcText = gcHost ? gcHost.textContent : '';
  ok('D Owner host renders both Owner contacts', /Nathan Westhoff/.test(ownerText) && /Larry Blanchard/.test(ownerText));
  ok('D Owner host shows company sub-label', /Westhoff Development/.test(ownerText));
  ok('D GC host renders the selected GC contact', /Tanner Schweer/.test(gcText));
  ok('D GC host did NOT render unselected id', !/Jacob Lincoln/.test(gcText));
  // cards use the shared name-first/title-below layout (.pr-ccard-head)
  ok('D Owner cards use shared card head layout', !!ownerHost.querySelector('.pr-ccard-head, .pr-ccard'));
})();

// ---- E: no regression — DP selector still renders its 5 firm blocks ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  ok('E DP card still renders', !!dpCard);
  w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
  const dpEditor = dpCard.querySelector('.pr-editor');
  const dpBlocks = dpEditor.querySelectorAll('.pr-crm[data-crm-key="design_professionals"]');
  ok('E DP editor has 4 firm CRM blocks (GC moved to general)', dpBlocks.length === 4);
  // The general card's CRM blocks are NOT inside the DP editor.
  const strayGeneral = dpEditor.querySelectorAll('.pr-crm[data-crm-key="general"]');
  ok('E no general CRM blocks leak into DP editor', strayGeneral.length === 0);
})();

// ---- F: field_ops -> NO Edit button on the general card ----
await (async function(){
  const dom = makeDom('field_ops');
  const w = boot(dom, { overrideGet: ()=>({status:403, text: JSON.stringify({status:'forbidden'})}), fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const genCard = findCard(root, 'Owner & General Contractor');
  ok('F Owner & GC card renders for field_ops', !!genCard);
  ok('F Owner & GC card has NO Edit button for field_ops', !!genCard && !genCard.querySelector('.pr-edit-btn'));
})();

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
if (fail) { console.log('FAILS:', fails.join(' | ')); process.exit(1); }
process.exit(0);
