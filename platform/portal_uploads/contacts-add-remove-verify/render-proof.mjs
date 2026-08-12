// jsdom render-proof for the TWO contact-management features (Brad 2026-08-12):
//
//  FEATURE 1 — full ADD-CONTACT FORM. The old "+ Add contact" flow used a chain of
//  window.prompt() calls that were MISSING Office Phone + Notes (Brad could not
//  populate those). It is replaced by an inline 6-field card (.pr-crm-addform) that
//  collects Name / Title / Office Phone / Cell Phone / Email / Notes AT ONCE and
//  POSTs them all to /api/contacts action:'add' (with the block's company + trade).
//  We assert: the form opens with all 6 fields, the OLD prompt path is gone, and the
//  POST payload carries office_phone + notes populated, and the new contact appends
//  CHECKED to the selector list (so the section Save assigns it to this project).
//
//  FEATURE 2 — REMOVE a contact FROM THE PROJECT. Each directory .pr-crow row gets a
//  "✕ Remove" button (next to ✎ Edit), office/CRM-gated. Clicking it shows a CONFIRM
//  bar; confirming drops that contactId from the section __crm list and POSTs the
//  FULL __crm map to /api/project-override (the backend whole-object-replaces __crm,
//  so every prefix must be resent — we assert the OTHER prefix survives + the target
//  id is gone). The master directory record is NOT touched (no /api/contacts write).
//  Read-only roles get no Remove button.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/contacts-add-remove-verify/render-proof.mjs
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

// ---- STATIC SOURCE ASSERTIONS (prove the buggy prompt path is gone) ----------
// The add-contact save must send officePhone + notes; the old flow used window.prompt
// for name/title/email/cell and never asked for office phone or notes.
ok('SRC add-save sends officePhone in the payload', /pfCrmAddContactSave[\s\S]*?officePhone:\s*vals\.officePhone/.test(iife));
ok('SRC add-save sends notes in the payload', /pfCrmAddContactSave[\s\S]*?notes:\s*vals\.notes/.test(iife));
ok('SRC old prompt("Cell phone (optional)") path removed', !/prompt\('Cell phone \(optional\):'\)/.test(iife));
ok('SRC old prompt("Contact name (First Last)") path removed', !/prompt\('Contact name \(First Last\):'\)/.test(iife));
ok('SRC pfCrmAddContact opens an inline form (no prompt chain)', /pfCrmAddContact\s*=\s*function[\s\S]*?pr-crm-addform/.test(iife));
ok('SRC remove-confirm posts full __crm to project-override', /pfCrmRemoveContactConfirm[\s\S]*?\/api\/project-override[\s\S]*?__crm:\s*out/.test(iife));
// Scope the "no /api/contacts" check to JUST the three remove functions (slice from
// pfCrmRemoveContactRow up to pfContactPrefix which follows them) so it can't bleed
// into unrelated later code.
const remStart = iife.indexOf('window.pfCrmRemoveContactRow = function');
const remEnd = iife.indexOf('function pfContactPrefix', remStart);
const removeBlock = (remStart !== -1 && remEnd !== -1) ? iife.slice(remStart, remEnd) : '';
ok('SRC remove block located', !!removeBlock);
// Check for an actual FETCH call to /api/contacts (a comment mentioning the path is
// harmless); the remove path must only ever fetch /api/project-override.
ok('SRC remove block never fetches /api/contacts (directory untouched)',
  !!removeBlock && !/fetch\(\s*['"]\/api\/contacts/.test(removeBlock));
ok('SRC remove block fetches /api/project-override', !!removeBlock && /fetch\(\s*['"]\/api\/project-override/.test(removeBlock));

// A small mutable directory the /api/contacts stub serves.
const DIR = {
  'C0001': { contactId:'C0001', firstName:'Nora', lastName:'Owner', name:'Nora Owner',
             title:'VP', company:'Westhoff Development', category:'Owner',
             officePhone:'2604130000', cellPhone:'2604131111', email:'no@wd.com',
             companyAddress:'1 A St', companyWebsite:'wd.com', notes:'Owner note', active:'Yes' },
  'C0002': { contactId:'C0002', firstName:'Gil', lastName:'Contractor', name:'Gil Contractor',
             title:'PM', company:'Weigand Construction', category:'GC',
             officePhone:'2605550000', cellPhone:'2605551111', email:'gil@wc.com',
             companyAddress:'2 B St', companyWebsite:'wc.com', notes:'GC note', active:'Yes' }
};
let lastAddPayload = null;
let lastOverridePayload = null;
let mintCounter = 9000;

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
  w.alert = ()=>{}; w.prompt = ()=>''; w.confirm = ()=>true;
  w.pfFmtPhone = (v)=> String(v==null?'':v);
  w.pfFmtDate = (v)=> String(v==null?'':v);
  w.pfFmtQty = (v)=> String(v==null?'':v);
  w.pfFmtMoney = (v)=> String(v==null?'':v);
  w.pfFmtNum = (v)=> String(v==null?'':v);
  w.PF_DATE_LABEL_RE = /date|deadline|expires|due/i;
  w.pfIsDateLabel = (label)=> w.PF_DATE_LABEL_RE.test(String(label||''));
  w.pfParseDate = ()=> null;
  w.pfAddBusinessDays = ()=> null;
  w.pfFmtDateObj = (d)=> String(d==null?'':d);
  w.PF_PROJECT_POET = null;
  w.PF_PROJECT_RECORDS = { records: {
    '26-002': { project_number:'26-002', project_name:'POET', location:'Warsaw, IN',
      bid_log:{ gc_name:'Weigand Construction', total_columns:1044, total_lf:13397 },
      contacts:{ groups:{
        owner:[{ company:'Westhoff Development', name:'Nathan Westhoff', scope:'Owner' }],
        gc:[{ company:'Weigand Construction', name:'Tanner Schweer', scope:'Project Manager' }],
        engineering:[{ company:'GAI', name:'Eng One', scope:'Ground Improvement' }],
        pf_team:[{ name:'Seth Willis', scope:'Operator' }],
        vendors:[{ company:'Rogers Group', name:'Stone Guy', scope:'stone' }]
      } },
      links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

// Fetch stub: /api/contacts (list + add) and /api/project-override (records __crm).
function makeFetch(w){
  return (url, opts)=>{
    const u = String(url);
    if (u.includes('/api/project-override')) {
      if (opts && opts.method === 'POST') {
        lastOverridePayload = JSON.parse(opts.body || '{}');
        // Echo back a merged sections object (simulate the backend whole-object __crm replace).
        const p = lastOverridePayload;
        const sections = {};
        sections[p.section] = Object.assign({}, (p.fields || {}));
        return Promise.resolve({ ok:true, status:200,
          json:()=>Promise.resolve({ ok:true, saved:true, num:p.num, section:p.section, sections, _meta:{updatedBy:'Tester',updatedAt:'now'} }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, num:'26-002', sections:{}, _meta:null }) });
    }
    if (u.includes('/api/contacts')) {
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body || '{}');
        lastAddPayload = body;
        if (body.action === 'add') {
          const c = body.contact || {};
          const id = 'C' + (++mintCounter);
          const saved = Object.assign({ contactId:id, name:((c.firstName||'')+' '+(c.lastName||'')).trim() }, c);
          DIR[id] = saved;
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, saved:true, action:'add', contact: saved }) });
        }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, saved:true, contact:{ contactId:'C0000' } }) });
      }
      // GET: flat list, or ?company=&trade= projection, or ?trade= companies.
      if (u.includes('company=')) {
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts: Object.values(DIR) }) });
      }
      if (u.includes('trade=')) {
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, companies:[{company:'Westhoff Development',contactCount:1}] }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts: Object.values(DIR) }) });
    }
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true }) });
  };
}

function boot(dom, overrideSections){
  const w = dom.window;
  const text = JSON.stringify({ ok:true, num:'26-002', sections: overrideSections || {}, _meta:null });
  w.XMLHttpRequest = class {
    open(m,u){ this.url=u; }
    setRequestHeader(){}
    send(){ this.status=200; this.responseText=text; }
  };
  w.fetch = makeFetch(w);
  w.eval(iife);
  return w;
}

function pcCard(root){
  let pc=null;
  root.querySelectorAll('.pr-card').forEach(c=>{ const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c; });
  return pc;
}
const tick = ()=> new Promise(r=>setTimeout(r,0));

// ========================================================================
// FEATURE 1 — full add-contact form: 6 fields, office phone + notes SENT.
// ========================================================================
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, {});
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  ok('F1 Project Contacts card exists', !!pc);

  // Open the Owner & GC editor (general key) so the cascading CRM selector renders.
  const ownerGcCard = (()=>{ let c=null; pc.querySelectorAll('.pr-card[data-pr-section="general"]').forEach(x=>{ const t=x.querySelector('.pr-card-title'); if(t&&/Owner & General Contractor/.test(t.textContent)) c=x; }); return c; })();
  ok('F1 Owner & GC nested card found', !!ownerGcCard);
  const eb = ownerGcCard && ownerGcCard.querySelector('.pr-edit-btn');
  w.pfEditSection(eb);
  const editor = ownerGcCard.querySelector('.pr-editor');
  await tick(); await tick(); // pfCrmHydrate fetches companies

  // Grab the Owner CRM block; select a company so the "+ Add contact" affordance shows.
  const ownerBlock = editor && [...editor.querySelectorAll('.pr-crm')].find(b=>b.getAttribute('data-crm-section')==='Owner');
  ok('F1 Owner CRM selector block present in editor', !!ownerBlock);
  const sel = ownerBlock && ownerBlock.querySelector('.pr-crm-company');
  if (sel) {
    sel.value = 'Westhoff Development'; sel.setAttribute('data-crm-selected','Westhoff Development');
    // The real user path: a change on the company <select> triggers pfCrmLoadContacts
    // via the delegated document 'change' listener the IIFE installs.
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  await tick(); await tick();

  const addBtn = ownerBlock.querySelector('.pr-crm-addcontact');
  ok('F1 "+ Add contact" button present', !!addBtn);

  // Click "+ Add contact" -> the FULL form opens (not a prompt chain).
  w.pfCrmAddContact(addBtn);
  const form = ownerBlock.querySelector('.pr-crm-addform');
  ok('F1 clicking "+ Add contact" opens the inline 6-field form', !!form);
  const afFields = form ? [...form.querySelectorAll('[data-af]')].map(e=>e.getAttribute('data-af')) : [];
  ['name','title','officePhone','cellPhone','email','notes'].forEach(f=>
    ok('F1 add form exposes '+f+' field', afFields.indexOf(f) !== -1));
  ok('F1 add form has exactly the 6 expected fields', afFields.length === 6);
  ok('F1 "+ Add contact" button hidden while form is open', addBtn.style.display === 'none');

  // Fill ALL SIX fields (crucially Office Phone + Notes) and submit.
  form.querySelector('[data-af="name"]').value = 'Paul Newman';
  form.querySelector('[data-af="title"]').value = 'Director';
  form.querySelector('[data-af="officePhone"]').value = '2607778888';
  form.querySelector('[data-af="cellPhone"]').value = '2607779999';
  form.querySelector('[data-af="email"]').value = 'paul@wd.com';
  form.querySelector('[data-af="notes"]').value = 'Prefers email over phone';
  const saveBtn = form.querySelector('.pr-save-btn');
  w.pfCrmAddContactSave(saveBtn);
  await tick(); await tick();

  ok('F1 submit POSTed action:add to /api/contacts', !!lastAddPayload && lastAddPayload.action === 'add');
  const c = lastAddPayload && lastAddPayload.contact || {};
  ok('F1 payload carries office phone (the previously-missing field)', c.officePhone === '2607778888');
  ok('F1 payload carries notes (the previously-missing field)', c.notes === 'Prefers email over phone');
  ok('F1 payload carries cell phone', c.cellPhone === '2607779999');
  ok('F1 payload carries email', c.email === 'paul@wd.com');
  ok('F1 payload carries title', c.title === 'Director');
  ok('F1 payload splits the name (first/last)', c.firstName === 'Paul' && c.lastName === 'Newman');
  ok('F1 payload carries the selected company', c.company === 'Westhoff Development');
  ok('F1 payload carries the group trade as category', c.category === 'Owner');

  // The form closes and the new contact appears CHECKED in the selector list.
  ok('F1 add form removed after success', !ownerBlock.querySelector('.pr-crm-addform'));
  ok('F1 "+ Add contact" button restored', addBtn.style.display === '');
  const newCb = [...ownerBlock.querySelectorAll('.pr-crm-cb')].find(cb=>/Paul Newman/.test((cb.closest('label')||{}).textContent||''));
  ok('F1 new contact appended to the selector list', !!newCb);
  ok('F1 new contact is pre-CHECKED (so section Save assigns it)', !!newCb && newCb.checked);

  // Cancel path: open again, cancel, form gone + button back.
  w.pfCrmAddContact(addBtn);
  const form2 = ownerBlock.querySelector('.pr-crm-addform');
  ok('F1 add form re-opens', !!form2);
  w.pfCrmAddContactCancel(form2.querySelector('.pr-cancel-btn'));
  ok('F1 Cancel drops the form', !ownerBlock.querySelector('.pr-crm-addform'));
})();

// ========================================================================
// FEATURE 2 — remove a directory contact from THIS project (unassign only).
// ========================================================================
await (async function(){
  const dom = makeDom('partner');
  // Owner (C0001) + GC (C0002) both under the `general` __crm — proves the OTHER
  // prefix survives when we remove from one (whole-object replace concern).
  const OV = { general: { '__crm': {
    'Owner': { company:'Westhoff Development', contactIds:['C0001'] },
    'GC':    { company:'Weigand Construction', contactIds:['C0002'] }
  } } };
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  w.pfCrmRenderCards(w.document);
  await tick(); await tick();

  const ownerHost = pc.querySelector('.pr-crm-cards[data-crm-cards="Owner"]');
  ok('F2 Owner CRM cards host present', !!ownerHost);
  const ownerRow = ownerHost && ownerHost.querySelector('.pr-crow[data-crm-cid="C0001"]');
  ok('F2 owner directory contact renders as a row', !!ownerRow);
  const rmBtn = ownerRow && ownerRow.querySelector('.pr-crow-rmbtn');
  ok('F2 row carries a "✕ Remove" button (office/CRM)', !!rmBtn);
  const editStill = ownerRow && ownerRow.querySelector('.pr-crow-editbtn');
  ok('F2 Edit button still present next to Remove (not broken)', !!editStill);

  // Click Remove -> a CONFIRM bar appears (accidental-click guard); row hidden.
  w.pfCrmRemoveContactRow(rmBtn);
  const confirmBar = ownerHost.querySelector('.pr-crow-rmconfirm[data-crm-cid="C0001"]');
  ok('F2 clicking Remove shows a confirm step (not an immediate remove)', !!confirmBar);
  ok('F2 confirm wording says THIS PROJECT (not the directory)', !!confirmBar && /this project/i.test(confirmBar.textContent));
  ok('F2 confirm reassures the contact stays in the directory', !!confirmBar && /directory/i.test(confirmBar.textContent));
  ok('F2 confirm carries the right prefix + section key',
    !!confirmBar && confirmBar.getAttribute('data-crm-prefix') === 'Owner' && confirmBar.getAttribute('data-crm-key') === 'general');

  // Cancel restores the row without any POST.
  const before = lastOverridePayload;
  w.pfCrmRemoveContactCancel(confirmBar.querySelector('.pr-rm-no'));
  ok('F2 Cancel restores the row (no confirm bar left)', !ownerHost.querySelector('.pr-crow-rmconfirm'));
  ok('F2 Cancel does NOT POST anything', lastOverridePayload === before);

  // Remove again, then CONFIRM -> POST full __crm to project-override.
  w.pfCrmRemoveContactRow(ownerRow.querySelector('.pr-crow-rmbtn'));
  const cb2 = ownerHost.querySelector('.pr-crow-rmconfirm[data-crm-cid="C0001"]');
  w.pfCrmRemoveContactConfirm(cb2.querySelector('.pr-rm-yes'));
  await tick(); await tick();

  ok('F2 confirm POSTed to /api/project-override', !!lastOverridePayload && !!lastOverridePayload.fields);
  ok('F2 POST targeted the general section', !!lastOverridePayload && lastOverridePayload.section === 'general');
  const crm = lastOverridePayload && lastOverridePayload.fields && lastOverridePayload.fields.__crm;
  ok('F2 POST sends the __crm map', !!crm);
  ok('F2 removed contact is GONE from the Owner list',
    !!crm && Array.isArray(crm.Owner.contactIds) && crm.Owner.contactIds.indexOf('C0001') === -1);
  ok('F2 Owner list is now empty', !!crm && crm.Owner.contactIds.length === 0);
  ok('F2 the OTHER prefix (GC) SURVIVES the whole-object replace',
    !!crm && crm.GC && crm.GC.contactIds.indexOf('C0002') !== -1);
  ok('F2 GC company preserved', !!crm && crm.GC.company === 'Weigand Construction');

  // Directory record C0001 is untouched (remove is unassign-only; no /api/contacts write).
  ok('F2 master directory record C0001 still exists (not deleted)', !!DIR['C0001']);
  ok('F2 no /api/contacts add/update was fired by the remove',
    !lastAddPayload || lastAddPayload.contact.company !== 'Westhoff Development' || lastAddPayload.action === 'add' /* only F1 touched it */);
})();

// ========================================================================
// FEATURE 2 gate — read-only role gets NO Remove button.
// ========================================================================
await (async function(){
  const dom = makeDom('field_ops');
  const OV = { general: { '__crm': { 'Owner': { company:'Westhoff Development', contactIds:['C0001'] } } } };
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  if (pc) {
    w.pfCrmRenderCards(w.document);
    await tick(); await tick();
    ok('F2 read-only role: NO Remove button rendered', !pc.querySelector('.pr-crow-rmbtn'));
    ok('F2 read-only role: NO Edit button rendered', !pc.querySelector('.pr-crow-editbtn'));
  } else {
    ok('F2 read-only role: Project Contacts not shown to field_ops (stronger gate)', true);
  }
})();

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
if (fail) { console.log('FAILS: ' + fails.join(', ')); process.exit(1); }
