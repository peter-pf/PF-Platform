// jsdom render-proof for CHANGE A (Responsible Party = dropdown/typeahead of the
// project's contacts, tied to email) + CHANGE B (SOW moved to bottom of Prelim Design).
// Loads the REAL project-record IIFE from platform/index.html (no reimplementation).
//
// CHANGE A assertions:
//   A1 Read view resolves a directory-tied responsible party (responsible_contact_id)
//      to the LIVE directory name + email (directory email wins over stored copy).
//   A2 Editor renders a <datalist> of THIS project's contacts (from __crm selections +
//      legacy stored parties); the name input is list-bound + has a hidden contactId.
//   A3 Typing/selecting a project contact NAME auto-associates its email + contactId
//      (pfPrqOnPartyInput); a non-matching name clears the tie but keeps a typed email.
//   A4 Save POSTs responsible_contact_id + responsible_name + responsible_email.
//   A5 A NOT-in-project free name+email still saves (graceful path), cid empty.
//   A6 Existing stored responsible data is PRESERVED/shown (legacy free name/email).
//   A7 "X of 9 received" count + Required For checkboxes unaffected by the change.
//   A8 field_ops sees NO editor controls on the checklist.
//
// CHANGE B assertions:
//   B1 In Prelim Design, SOW renders BELOW Total Stone (TN) (SOW is the LAST field).
//   B2 Both keep bindings: Total Stone shows Garbin stone; SOW is a dropdown field.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/prereq-responsible-party-verify/render-proof.mjs
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

// Directory contacts assigned to THIS project (via __crm) + a couple extra.
const ALL_CONTACTS = [
  { contactId:'C0009', name:'Nathan Westhoff', title:'Owner', officePhone:'', cellPhone:'2604131111', email:'nathan@westhoff.com' },
  { contactId:'C0007', name:'Tanner Schweer', title:'PM', officePhone:'2604133333', cellPhone:'', email:'tanner@weigand.com' },
  { contactId:'C0020', name:'Ed Garbin', title:'EOR', officePhone:'', cellPhone:'', email:'ed@garbin.com' },
];

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
  w.PF_DATE_LABEL_RE = /date|deadline|expires|due/i;
  w.pfIsDateLabel = (label)=> w.PF_DATE_LABEL_RE.test(String(label||''));
  w.pfIsPhoneLabel = ()=> false;
  w.pfParseDate = ()=> null;
  w.pfAddBusinessDays = ()=> null;
  w.pfFmtDateObj = (d)=> String(d==null?'':d);
  w.PF_PROJECT_POET = null;
  // Garbin prelim with a stone value so Total Stone (TN) renders (Change B needs both fields).
  w.PF_GARBIN_PRELIM = { projects: { '26-002': {
    lf: 13397, total_columns: 1044, nominal_dia_ft: 2.5, stone_tn: 3200,
    bearing_psf: 5000, webUrl: 'https://sp/gg.xlsx', folder_url: 'https://sp/folder'
  } } };
  w.PF_SHOP_DWG_INFO = { projects: { '26-002': { folder_url: 'https://sp/shop' } } };
  w.PF_PROJECT_RECORDS = { records: {
    '26-002': { project_number:'26-002', project_name:'POET', location:'Warsaw, IN',
      bid_log:{ gc_name:'Weigand', total_columns:1044, total_lf:13397 },
      contacts:{ groups:{} }, links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

function fetchImpl(posts){
  return (url, init)=>{
    const u = String(url);
    if (u.includes('/api/contacts')) {
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:ALL_CONTACTS }) });
    }
    if (u.includes('/api/project-override') && init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (posts) posts.push(body);
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
        ok:true, saved:true, num:body.num, section:body.section,
        sections:{ [body.section]: body.fields }, _meta:{updatedBy:'Tester',updatedAt:'2026-08-12T12:00:00Z'} }) });
    }
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true }) });
  };
}

function boot(dom, { overrideGet, fetchI }){
  const w = dom.window;
  w.XMLHttpRequest = class {
    open(m,u){ this.url=u; }
    setRequestHeader(){}
    send(){ const r = overrideGet(this.url); this.status=r.status; this.responseText=r.text; }
  };
  if (fetchI) w.fetch = fetchI;
  w.eval(iife);
  return w;
}
const ovWith = (sections)=>()=>({status:200, text: JSON.stringify({ok:true,num:'26-002',sections,_meta:null})});

// Overrides: general.__crm.Owner ties C0009; a prereq item tied by contactId with a
// STALE stored email (to prove the directory email wins); another item with a legacy
// free name/email (no cid); Required For flags + a date_received to exercise the count.
const OVERRIDES = {
  general: { __crm: { Owner: { company:'Westhoff Development', contactIds:['C0009'] } } },
  design_professionals: { __crm: { Geotechnical: { company:'Garbin', contactIds:['C0020'] } } },
  engineering: { __submittal_prereqs: { items: {
    struct_foundation_cad: { responsible_contact_id:'C0009', responsible_name:'OLD NAME', responsible_email:'stale@old.com',
      date_received:'', required_for:{ submittal_design:true, staking_layout:false } },
    civil_grading_cad: { responsible_contact_id:'', responsible_name:'Free Person', responsible_email:'free@one.com',
      date_received:'2026-08-01', required_for:{ submittal_design:false, staking_layout:true } }
  } } }
};

function findCard(root, title){
  let found = null;
  root.querySelectorAll('.pr-card').forEach(c=>{
    const t = c.querySelector('.pr-card-title');
    if (t && t.textContent === title) found = c;
  });
  return found;
}

// ---- A1 + A6 + A7: read view resolves tie, preserves legacy, count intact ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(null) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80)); // let pfPrqRefreshAfterContacts re-render
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  ok('A1 prereq wrap present', !!wrap);
  const rowStruct = wrap.querySelector('tr[data-prq-item="struct_foundation_cad"]');
  ok('A1 tied row resolves directory NAME (not stored OLD NAME)',
    /Nathan Westhoff/.test(rowStruct.textContent) && !/OLD NAME/.test(rowStruct.textContent));
  ok('A1 tied row resolves directory EMAIL (wins over stale)',
    rowStruct.getAttribute('data-prq-email') === 'nathan@westhoff.com');
  ok('A1 tied row carries contactId', rowStruct.getAttribute('data-prq-cid') === 'C0009');
  const rowCivil = wrap.querySelector('tr[data-prq-item="civil_grading_cad"]');
  ok('A6 legacy free party name shown', /Free Person/.test(rowCivil.textContent));
  ok('A6 legacy free email preserved', rowCivil.getAttribute('data-prq-email') === 'free@one.com');
  ok('A6 legacy free party has no cid', (rowCivil.getAttribute('data-prq-cid')||'') === '');
  // count: only civil_grading_cad has a date_received -> "1 of 9 received"
  ok('A7 received count = 1 of 9', /1 of 9 received/.test(wrap.textContent));
  // Required For read-view checkboxes reflect stored flags
  const rfBoxes = rowStruct.querySelectorAll('.pf-prq-rf-box');
  ok('A7 struct Required-For: submittal checked, staking unchecked',
    rfBoxes.length===2 && rfBoxes[0].checked===true && rfBoxes[1].checked===false);
})();

// ---- A2 + A3 + A4: editor datalist + typeahead tie + save payload ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(posts) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  const editBtn = wrap.querySelector('.pf-prq-edit');
  ok('A2 office sees Edit checklist button', !!editBtn);
  w.pfPrereqEdit(editBtn);
  const editor = wrap.querySelector('.pf-prq-editor');
  ok('A2 editor opened', !!editor);
  const dl = editor.querySelector('datalist#pf-prq-contacts-dl');
  ok('A2 datalist present', !!dl);
  const dlNames = [...dl.querySelectorAll('option')].map(o=>o.value);
  // Project contacts = C0009 (Owner) + C0020 (Geo DP) + legacy "Free Person" (from item)
  ok('A2 datalist includes directory contact Nathan Westhoff', dlNames.includes('Nathan Westhoff'));
  ok('A2 datalist includes DP contact Ed Garbin', dlNames.includes('Ed Garbin'));
  ok('A2 datalist includes legacy free party', dlNames.includes('Free Person'));
  ok('A2 datalist EXCLUDES a non-project contact (Tanner)', !dlNames.includes('Tanner Schweer'));
  const rowStruct = editor.querySelector('tr[data-prq-item="struct_foundation_cad"]');
  const nameEl = rowStruct.querySelector('.pf-prq-in-name');
  const emailEl = rowStruct.querySelector('.pf-prq-in-email');
  const cidEl = rowStruct.querySelector('.pf-prq-in-cid');
  ok('A2 name input is list-bound', nameEl.getAttribute('list') === 'pf-prq-contacts-dl');
  ok('A2 tied row prefilled with directory name/email/cid',
    nameEl.value==='Nathan Westhoff' && emailEl.value==='nathan@westhoff.com' && cidEl.value==='C0009');
  // A3: change the party of the CIVIL row (currently free) to a project contact Ed Garbin
  const rowCivil = editor.querySelector('tr[data-prq-item="civil_grading_cad"]');
  const cNameEl = rowCivil.querySelector('.pf-prq-in-name');
  const cEmailEl = rowCivil.querySelector('.pf-prq-in-email');
  const cCidEl = rowCivil.querySelector('.pf-prq-in-cid');
  cNameEl.value = 'Ed Garbin';
  w.pfPrqOnPartyInput(cNameEl);
  ok('A3 selecting project contact auto-fills email', cEmailEl.value === 'ed@garbin.com');
  ok('A3 selecting project contact ties contactId', cCidEl.value === 'C0020');
  // A3b: a partial / non-matching name clears the tie but keeps typed email
  cNameEl.value = 'Someone Else';
  cEmailEl.value = 'someone@else.com';
  w.pfPrqOnPartyInput(cNameEl);
  ok('A3 non-matching name clears cid', (cCidEl.value||'') === '');
  ok('A3 non-matching name keeps typed email', cEmailEl.value === 'someone@else.com');
  // Reset civil to Ed for the save assertion
  cNameEl.value = 'Ed Garbin'; w.pfPrqOnPartyInput(cNameEl);
  // A4: Save -> POST carries responsible_contact_id
  const saveBtn = editor.querySelector('.pf-prq-save');
  w.pfPrereqSave(saveBtn);
  await new Promise(r=>setTimeout(r,40));
  ok('A4 one override POST fired', posts.length === 1);
  const items = posts[0] && posts[0].fields && posts[0].fields.__submittal_prereqs && posts[0].fields.__submittal_prereqs.items;
  ok('A4 struct item saves tied cid C0009', items && items.struct_foundation_cad.responsible_contact_id === 'C0009');
  ok('A4 struct item saves resolved name+email',
    items && items.struct_foundation_cad.responsible_name==='Nathan Westhoff' && items.struct_foundation_cad.responsible_email==='nathan@westhoff.com');
  ok('A4 civil item re-tied to C0020', items && items.civil_grading_cad.responsible_contact_id === 'C0020');
})();

// ---- A5: NOT-in-project free name+email still saves (graceful path) ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(posts) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  w.pfPrereqEdit(wrap.querySelector('.pf-prq-edit'));
  const editor = wrap.querySelector('.pf-prq-editor');
  const row = editor.querySelector('tr[data-prq-item="full_civil_pdf"]');
  const nameEl = row.querySelector('.pf-prq-in-name');
  const emailEl = row.querySelector('.pf-prq-in-email');
  nameEl.value = 'One Off Person';
  w.pfPrqOnPartyInput(nameEl);        // no match -> cid stays empty
  emailEl.value = 'oneoff@ext.com';
  w.pfPrereqSave(editor.querySelector('.pf-prq-save'));
  await new Promise(r=>setTimeout(r,40));
  const items = posts[0].fields.__submittal_prereqs.items;
  ok('A5 free party saves with empty cid', items.full_civil_pdf.responsible_contact_id === '');
  ok('A5 free party saves name+email', items.full_civil_pdf.responsible_name==='One Off Person' && items.full_civil_pdf.responsible_email==='oneoff@ext.com');
})();

// ---- A8: field_ops sees NO editor controls ----
await (async function(){
  const dom = makeDom('field_ops');
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(null) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  ok('A8 prereq wrap still renders for field_ops', !!wrap);
  ok('A8 field_ops has NO Edit checklist button', !wrap.querySelector('.pf-prq-edit'));
  ok('A8 field_ops has NO Reminder column', !wrap.querySelector('.pf-prq-remind') && !/>Reminder</.test(wrap.innerHTML));
})();

// ---- B1 + B2: Change B — SOW at bottom of Prelim Design; bindings intact ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(null) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  // Find the Prelim Design subgroup then read the ordered field labels that follow it,
  // up to the next subgroup (PF Design Submittal).
  const engCard = findCard(root, 'Engineering & Design') || findCard(root, 'Engineering & Design / Submittals');
  ok('B1 Engineering & Design card found', !!engCard);
  const labels = [...engCard.querySelectorAll('.pr-field-label')].map(el=>el.textContent);
  const iSOW = labels.lastIndexOf('SOW');
  const iStone = labels.indexOf('Total Stone (TN)');
  ok('B1 SOW field present', iSOW !== -1);
  ok('B2 Total Stone (TN) field present', iStone !== -1);
  ok('B1 SOW renders BELOW Total Stone (TN)', iSOW > iStone);
  // Also confirm SOW is AFTER Column Diameter (inches) (bottom of the subsection block)
  const iDia = labels.indexOf('Column Diameter (inches)');
  ok('B1 order: Column Diameter -> Total Stone -> SOW',
    iDia !== -1 && iDia < iStone && iStone < iSOW);
  // B2 binding: Total Stone value from Garbin (3200); SOW is a dropdown-registered field.
  const stoneField = [...engCard.querySelectorAll('.pr-field')].find(f=>{
    const l = f.querySelector('.pr-field-label'); return l && l.textContent === 'Total Stone (TN)';
  });
  ok('B2 Total Stone shows Garbin value 3200', /3200/.test(stoneField.textContent));
})();

console.log('\nprereq-responsible-party render-proof: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.error('FAILURES:', fails.join(' | ')); process.exit(1); }
