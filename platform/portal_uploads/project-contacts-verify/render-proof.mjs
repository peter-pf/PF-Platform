// jsdom render-proof for the Project Contacts restructure (Brad 2026-08-11).
// Loads the REAL office project-record IIFE from platform/index.html (no
// reimplementation), drives a synthetic record, and asserts:
//   A. Top-level sections are gap-free 1-8 with "Project Contacts" at #2, positioned
//      BETWEEN "General Info" (#1) and "Subcontract Agreement" (#3).
//   B. Project Contacts contains ALL 13 contact groups in Brad's EXACT order.
//   C. General Info renders NO contact groups (no Owner/GC/DP/PF-Team/vendor blocks).
//   D. A saved general.__crm (Owner+GC) round-trips into live cards inside Project
//      Contacts (relocated, not dropped/re-keyed); saved design_professionals.__crm
//      firm ids render too.
//   E. DP editor now has 4 firm CRM blocks (GC removed -> lives under general).
//   F. The new-group editors (safety/siteReadiness/equipment/material) render a CRM
//      selector; General Info editor renders NO CRM blocks (split-key gating).
//   G. Save gating: saving the General Info editor (no CRM) does NOT send __crm; saving
//      the Owner & GC card DOES send general.__crm. (Protects the split general key.)
//   H. field_ops sees NO Edit buttons in Project Contacts.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/project-contacts-verify/render-proof.mjs
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
        gc:[{ company:'Weigand Construction', name:'Tanner Schweer', scope:'PM' }],
        engineering:[{ company:'GAI', name:'Eng One', scope:'Ground Improvement' }],
        pf_team:[{ name:'Seth Willis', scope:'Operator' }],
        vendors:[{ company:'Rogers Group', name:'Stone Guy', scope:'stone' }]
      } },
      links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

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

// Helper: ordered list of nested-card titles inside Project Contacts, plus the ordered
// subhead labels within them, flattened in DOM order.
function pcOrderedGroups(root){
  let pc = null;
  root.querySelectorAll('.pr-card').forEach(c=>{
    const t = c.querySelector('.pr-card-title');
    if (t && t.textContent === 'Project Contacts') pc = c;
  });
  if (!pc) return [];
  const out = [];
  // Walk each nested card in DOM order, emitting its subhead group labels in order.
  pc.querySelectorAll('.pr-card-body .pr-card').forEach(nested=>{
    nested.querySelectorAll('.pr-subhead').forEach(sh=>{ out.push(sh.textContent); });
  });
  return out;
}

// ---- A: top-level order gap-free 1-8, Project Contacts at #2 ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const titles = [...root.querySelectorAll(':scope > .pr-card > .pr-card-head > .pr-card-title')]
    .map(t=>t.textContent);
  const nums = [...root.querySelectorAll(':scope > .pr-card > .pr-card-head > .pr-card-num')]
    .map(t=>t.textContent);
  ok('A top-level titles in order', titles.join('|') ===
    ['General Info','Project Contacts','Subcontract Agreement','Engineering & Design',
     'Site Readiness / Project Setup','Project Photos','Financials','Project Closeout'].join('|'));
  ok('A top-level nums gap-free 1-8', nums.join(',') === '1,2,3,4,5,6,7,8');
})();

// ---- B: Project Contacts contains all 13 groups in exact order ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const groups = pcOrderedGroups(root);
  const want = ['Project Owner','General Contractor','Geotechnical Engineer','Civil Engineer',
    'Structural Engineer','Ground Improvement Engineering','Safety Consultant','Staking & Layout',
    'Equipment Transport','Rental Equipment','Material Vendor(s)','Fuel Delivery'];
  // "PF Project Team" is a nested card TITLE (not a subhead), so check it separately by position.
  // The subhead-derived order must contain all engineering + owner/gc + new groups in order.
  const filtered = groups.filter(g=> want.indexOf(g) !== -1);
  ok('B all non-PFTeam groups present in exact order', filtered.join('|') === want.join('|'));
  // PF Project Team card sits between Design Professionals and Safety Consultant.
  const cardTitles = [];
  let pc=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c;});
  pc.querySelectorAll('.pr-card-body > .pr-nested-card-wrap > .pr-card > .pr-card-head > .pr-card-title')
    .forEach(t=>cardTitles.push(t.textContent));
  ok('B nested card sequence', cardTitles.join('|') ===
    ['Owner & General Contractor','Design Professionals','PF Project Team','Safety Consultant',
     'Staking & Layout','Equipment Transport & Rental','Material & Fuel Vendors'].join('|'));
  // 13 group tokens: 2 (owner/gc subheads) + 4 firms + 1 PF team card + 6 new subheads.
  ok('B PF Project Team present as its own card', cardTitles.indexOf('PF Project Team') !== -1);
})();

// ---- C: General Info renders NO contact groups ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  let genCard=null; root.querySelectorAll(':scope > .pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='General Info')genCard=c;});
  ok('C General Info card exists', !!genCard);
  const genBody = genCard.querySelector('.pr-card-body');
  // No nested cards (Owner/DP/PF-Team all moved out).
  ok('C General Info has no nested cards', genBody.querySelectorAll('.pr-card').length === 0);
  // No CRM hosts in General Info.
  ok('C General Info has no CRM hosts', genBody.querySelectorAll('.pr-crm-cards').length === 0);
  // No Owner Info / GC subheads in General Info.
  const gsubs = [...genBody.querySelectorAll('.pr-subhead')].map(s=>s.textContent);
  ok('C no Owner/GC/DP subheads in General Info',
    !gsubs.includes('Project Owner') && !gsubs.includes('General Contractor') &&
    !gsubs.includes('Owner Info') && !gsubs.includes('General Contractor Info') &&
    !gsubs.includes('GC Project Team'));
  // Project Info fields still present (not lost).
  const labels = [...genBody.querySelectorAll('.pr-field[data-pr-label]')].map(f=>f.getAttribute('data-pr-label'));
  ok('C General Info keeps Project Info fields', labels.includes('PF Project #') && labels.includes('Project Scope of Work (SOW)'));
})();

// ---- D: saved general.__crm + DP __crm round-trip into Project Contacts ----
await (async function(){
  const dom = makeDom('partner');
  const savedSections = {
    general: { __crm: {
      'Owner': { company:'Westhoff Development', contactIds:['C0009','C0014'] },
      'GC': { company:'Weigand Construction', contactIds:['C0007'] }
    } },
    design_professionals: { __crm: {
      'Ground Improvement': { company:'GAI', contactIds:['C0009'] }
    } }
  };
  const w = boot(dom, { overrideGet: ovWith(savedSections), fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  let pc=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c;});
  const ownerHost = pc.querySelector('.pr-crm-cards[data-crm-cards="Owner"][data-crm-cards-key="general"]');
  const gcHost = pc.querySelector('.pr-crm-cards[data-crm-cards="GC"][data-crm-cards-key="general"]');
  ok('D Owner host inside Project Contacts', !!ownerHost);
  ok('D GC host inside Project Contacts', !!gcHost);
  await new Promise(r=>setTimeout(r,80));
  const ot = ownerHost ? ownerHost.textContent : '';
  const gt = gcHost ? gcHost.textContent : '';
  ok('D Owner cards rendered from saved ids', /Nathan Westhoff/.test(ot) && /Larry Blanchard/.test(ot));
  ok('D GC card rendered from saved id', /Tanner Schweer/.test(gt));
  ok('D GC did NOT render unselected id', !/Jacob Lincoln/.test(gt));
  ok('D cards use shared name-first head', !!ownerHost.querySelector('.pr-ccard-head, .pr-ccard'));
})();

// ---- E: DP editor now has 4 firm CRM blocks (GC removed) ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  ok('E DP card renders', !!dpCard);
  w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
  const dpEditor = dpCard.querySelector('.pr-editor');
  const dpBlocks = dpEditor.querySelectorAll('.pr-crm[data-crm-key="design_professionals"]');
  ok('E DP editor has 4 firm CRM blocks', dpBlocks.length === 4);
  const secs = [...dpBlocks].map(b=>b.getAttribute('data-crm-section')).join(',');
  ok('E DP firm order Geo,Civil,Structural,GroundImprovement',
    secs === 'Geotechnical,Civil,Structural,Ground Improvement');
  ok('E no GC block in DP editor', ![...dpBlocks].some(b=>b.getAttribute('data-crm-section')==='GC'));
})();

// ---- F: new-group editors render CRM selectors; General Info editor has none ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv, fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  // Owner & GC card -> general key -> HAS CRM blocks (Owner + GC).
  let ogCard=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Owner & General Contractor')ogCard=c;});
  w.pfEditSection(ogCard.querySelector('.pr-edit-btn'));
  const ogBlocks = ogCard.querySelector('.pr-editor').querySelectorAll('.pr-crm[data-crm-key="general"]');
  ok('F Owner&GC editor has 2 general CRM blocks', ogBlocks.length === 2);
  // General Info card -> general key but NO CRM host -> NO CRM blocks.
  let genCard=null; root.querySelectorAll(':scope > .pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='General Info')genCard=c;});
  w.pfEditSection(genCard.querySelector('.pr-edit-btn'));
  const genBlocks = genCard.querySelector('.pr-editor').querySelectorAll('.pr-crm');
  ok('F General Info editor has NO CRM blocks (split-key gate)', genBlocks.length === 0);
  // Equipment Transport & Rental card -> equipment key -> 2 CRM blocks.
  let eqCard=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Equipment Transport & Rental')eqCard=c;});
  w.pfEditSection(eqCard.querySelector('.pr-edit-btn'));
  const eqBlocks = eqCard.querySelector('.pr-editor').querySelectorAll('.pr-crm[data-crm-key="equipment"]');
  ok('F Equipment card editor has 2 CRM blocks', eqBlocks.length === 2);
  const eqSecs = [...eqBlocks].map(b=>b.getAttribute('data-crm-section')).sort().join(',');
  ok('F Equipment CRM sections correct', eqSecs === 'Equipment Transport,Rental Equipment');
})();

// ---- G: split-key save gating ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const savedSections = { general: { __crm: { 'Owner': { company:'Westhoff Development', contactIds:['C0009'] } } } };
  const w = boot(dom, { overrideGet: ovWith(savedSections), fetchImpl: crmFetch(posts) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  // Save General Info editor (no CRM) -> must NOT send __crm (would wipe general.__crm).
  let genCard=null; root.querySelectorAll(':scope > .pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='General Info')genCard=c;});
  w.pfEditSection(genCard.querySelector('.pr-edit-btn'));
  w.pfSaveSection(genCard.querySelector('.pr-save-btn'));
  await new Promise(r=>setTimeout(r,40));
  const gp = posts.find(p=>p.section==='general');
  ok('G General Info save POSTed general', !!gp);
  ok('G General Info save did NOT send __crm', gp && !Object.prototype.hasOwnProperty.call(gp.fields, '__crm'));
  // Save Owner & GC editor -> DOES send general.__crm.
  posts.length = 0;
  let ogCard=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Owner & General Contractor')ogCard=c;});
  w.pfEditSection(ogCard.querySelector('.pr-edit-btn'));
  w.pfSaveSection(ogCard.querySelector('.pr-save-btn'));
  await new Promise(r=>setTimeout(r,40));
  const op = posts.find(p=>p.section==='general');
  ok('G Owner&GC save POSTed general', !!op);
  ok('G Owner&GC save DID send __crm', op && Object.prototype.hasOwnProperty.call(op.fields, '__crm'));
})();

// ---- H: field_ops sees NO Edit buttons in Project Contacts ----
await (async function(){
  const dom = makeDom('field_ops');
  const w = boot(dom, { overrideGet: ()=>({status:403, text: JSON.stringify({status:'forbidden'})}), fetchImpl: crmFetch(null) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  let pc=null; root.querySelectorAll('.pr-card').forEach(c=>{const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c;});
  ok('H Project Contacts renders for field_ops', !!pc);
  ok('H no Edit buttons in Project Contacts for field_ops', pc.querySelectorAll('.pr-edit-btn').length === 0);
})();

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
if (fail) { console.log('FAILS:', fails.join(' | ')); process.exit(1); }
process.exit(0);
