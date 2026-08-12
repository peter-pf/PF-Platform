// jsdom render-proof for CONTACT EDITABILITY (Brad 2026-08-11: "make all fields
// within the contact accessible and editable"). Loads the REAL office project-record
// IIFE from platform/index.html (no reimplementation) and asserts BOTH gaps closed:
//
//  PART 1 — LEGACY contacts (per-project override model) now expose an editable
//  NOTES field for all contact kinds (Owner / GC PM+Super+PE / PF Team / DP firm),
//  and a saved Notes override renders in the horizontal .pr-crow view. Previously
//  legacy contacts had only 5 editable fields (Name/Title/Office/Cell/Email) — no
//  Notes at all.
//
//  PART 2 — DIRECTORY contacts (master PF Master Contact List) now carry a per-row
//  Edit affordance (.pr-crow-editbtn) for office/CRM users. Clicking it opens an
//  inline 6-field editor (Name/Title/Office Phone/Cell Phone/Email/Notes). Save
//  posts /api/contacts action:'update' with the contactId (Option A — single source
//  of truth) carrying company/category through; the local cache updates and the
//  record re-renders. A read-only role gets NO edit button (server also 403s).
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/contacts-editability-verify/render-proof.mjs
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

// A tiny in-memory directory the /api/contacts stub serves + mutates on update, so
// PART 2 can prove the round-trip (edit -> POST update -> cache reflects new value).
const DIR = {
  'C0001': { contactId:'C0001', firstName:'Nora', lastName:'Owner', name:'Nora Owner',
             title:'VP', company:'Westhoff Development', category:'Owner',
             officePhone:'2604130000', cellPhone:'2604131111', email:'no@wd.com',
             companyAddress:'1 A St', companyWebsite:'wd.com', notes:'Original note', active:'Yes' }
};
let lastUpdatePayload = null;

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
        owner:[{ company:'Westhoff Development', name:'Nathan Westhoff', scope:'Owner',
                 phone:'2604130000', cell:'2604131111', email:'nw@x.com',
                 address:'1 A St', website:'wd.com' }],
        gc:[{ company:'Weigand Construction', name:'Tanner Schweer', scope:'Project Manager',
              address:'2 B St', phone:'2604135555', website:'weigand.com',
              cell:'2604133333', email:'ts@x.com' },
            { name:'Larry Blanchard', scope:'Superintendent', cell:'2604132222', email:'lb@x.com' },
            { name:'Jacob Lincoln', scope:'Project Engineer', phone:'2604134444', email:'jl@x.com' }],
        engineering:[{ company:'GAI', name:'Eng One', scope:'Ground Improvement',
                       phone:'2604139999', email:'eng@gai.com' }],
        pf_team:[{ name:'Seth Willis', scope:'Operator', cell:'2605551011', email:'sw@pf.com' }],
        vendors:[{ company:'Rogers Group', name:'Stone Guy', scope:'stone' }]
      } },
      links:{}, qaqc:null }
  }};
  w.PF_PM = { byBidId:{}, loaded:true };
  return dom;
}

// Fetch stub: serves the directory list + a CRM company/contacts projection, and
// handles action:'update' by mutating DIR (proving the update path is exercised).
function dirFetch(w){
  return (url, opts)=>{
    const u = String(url);
    if (u.includes('/api/contacts')) {
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body || '{}');
        lastUpdatePayload = body;
        if (body.action === 'update') {
          const c = body.contact || {};
          const cid = String(c.contactId||'').toUpperCase();
          if (DIR[cid]) {
            Object.assign(DIR[cid], c, {
              name: ((c.firstName||'')+' '+(c.lastName||'')).trim(), lastUpdated:'08/11/2026'
            });
          }
          const saved = DIR[cid];
          return Promise.resolve({ ok:true, status:200,
            json:()=>Promise.resolve({ ok:true, saved:true, action:'update', contact: saved }) });
        }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, saved:true, action:'add', contact:{ contactId:'C9999' } }) });
      }
      // GET flat list (typeahead + pfLoadContacts): return all active directory rows.
      return Promise.resolve({ ok:true, status:200,
        json:()=>Promise.resolve({ ok:true, contacts: Object.values(DIR) }) });
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
  w.fetch = dirFetch(w);
  w.eval(iife);
  return w;
}

function pcCard(root){
  let pc=null;
  root.querySelectorAll('.pr-card').forEach(c=>{ const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c; });
  return pc;
}

// ========================================================================
// PART 1 — LEGACY contacts: Notes now editable + renders in the horiz view.
// ========================================================================
await (async function(){
  const dom = makeDom('partner');
  // Seed Notes overrides so we can prove they render (override-wins) in the horiz row.
  const OV = { general: {
    'Owner Contact 1 - Contact Name':'Nathan Westhoff',
    'Owner Contact 1 - Notes':'Signs the checks',
    'GC Project Manager - Name':'Tanner Schweer',
    'GC Project Manager - Notes':'Main jobsite contact'
  }, pfTeam: {
    'Operator #1 - Notes':'Certified rig operator'
  }, design_professionals: {
    'Ground Improvement - Contact 1 - Notes':'Sealed the design'
  } };
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  ok('P1 Project Contacts card exists', !!pc);

  // 1a. Every legacy contact kind now has an editable Notes .pr-field in the DOM.
  ok('P1 Owner contact has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="Owner Contact 1 - Notes"]'));
  ok('P1 GC Project Manager has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="GC Project Manager - Notes"]'));
  ok('P1 GC Superintendent has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="GC Superintendent - Notes"]'));
  ok('P1 GC Project Engineer has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="GC Project Engineer - Notes"]'));
  ok('P1 PF Team role has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="Operator #1 - Notes"]'));
  ok('P1 DP firm seeded contact has editable Notes field',
    !!pc.querySelector('.pr-field[data-pr-label="Ground Improvement - Contact 1 - Notes"]'));

  // 1b. The saved Notes override renders in the horizontal .pr-crow view (Notes column).
  const pcText = pc.textContent;
  ok('P1 Owner Notes override renders in horiz view', /Signs the checks/.test(pcText));
  ok('P1 GC PM Notes override renders in horiz view', /Main jobsite contact/.test(pcText));
  ok('P1 PF Team Notes override renders in horiz view', /Certified rig operator/.test(pcText));
  ok('P1 DP firm Notes override renders in horiz view', /Sealed the design/.test(pcText));

  // 1c. The section editor round-trip: opening the Owner&GC editor exposes the Notes
  // input so it can be edited + saved through the existing override model.
  const ownerGcCard = (()=>{ let c=null; pc.querySelectorAll('.pr-card[data-pr-section="general"]').forEach(x=>{ const t=x.querySelector('.pr-card-title'); if(t&&/Owner & General Contractor/.test(t.textContent)) c=x; }); return c; })();
  ok('P1 Owner & GC nested card found', !!ownerGcCard);
  const eb = ownerGcCard && ownerGcCard.querySelector('.pr-edit-btn');
  ok('P1 Owner & GC has an Edit button', !!eb);
  if (eb) {
    w.pfEditSection(eb);
    const editor = ownerGcCard.querySelector('.pr-editor');
    const notesInput = editor && [...editor.querySelectorAll('.pr-edit-input[data-pr-field-label]')]
      .find(i=>i.getAttribute('data-pr-field-label')==='Owner Contact 1 - Notes');
    ok('P1 editor exposes an editable Owner Notes input', !!notesInput);
    ok('P1 editor Owner Notes input carries the saved value', !!notesInput && notesInput.value === 'Signs the checks');
  }
})();

// ========================================================================
// PART 2 — DIRECTORY contacts: per-row Edit affordance + inline editor + update.
// ========================================================================
await (async function(){
  const dom = makeDom('partner');
  // A CRM selection of the directory contact C0001 under the Owner group (general key).
  const OV = { general: { '__crm': { 'Owner': { company:'Westhoff Development', contactIds:['C0001'] } } } };
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);

  // pfCrmRenderCards runs async (pfLoadContacts fetch). Drive it + let microtasks flush.
  w.pfCrmRenderCards(w.document);
  await new Promise(r=>setTimeout(r, 0));
  await new Promise(r=>setTimeout(r, 0));

  const ownerCardsHost = pc.querySelector('.pr-crm-cards[data-crm-cards="Owner"]');
  ok('P2 Owner CRM cards host present', !!ownerCardsHost);
  const dirRow = ownerCardsHost && ownerCardsHost.querySelector('.pr-crow[data-crm-cid="C0001"]');
  ok('P2 directory contact renders as a .pr-crow row with its contactId', !!dirRow);
  const editBtn = dirRow && dirRow.querySelector('.pr-crow-editbtn');
  ok('P2 directory row carries a per-row Edit button (office/CRM)', !!editBtn);
  ok('P2 Edit button carries the contactId', !!editBtn && editBtn.getAttribute('data-crm-cid') === 'C0001');

  // Open the inline editor.
  if (editBtn) {
    w.pfCrmEditContactRow(editBtn);
    const inlineEd = ownerCardsHost.querySelector('.pr-crow-edit[data-crm-cid="C0001"]');
    ok('P2 clicking Edit opens the inline row editor', !!inlineEd);
    const fields = inlineEd ? [...inlineEd.querySelectorAll('[data-cf]')].map(e=>e.getAttribute('data-cf')) : [];
    ['name','title','officePhone','cellPhone','email','notes'].forEach(f=>
      ok('P2 inline editor exposes '+f+' field', fields.indexOf(f) !== -1));
    ok('P2 inline editor prefills the saved notes', !!inlineEd &&
      inlineEd.querySelector('[data-cf="notes"]').value === 'Original note');
    ok('P2 inline editor warns it updates the shared directory', !!inlineEd &&
      /update the shared PF contact directory/.test(inlineEd.textContent));

    // Change Title + Notes, then Save -> POST update.
    inlineEd.querySelector('[data-cf="title"]').value = 'President';
    inlineEd.querySelector('[data-cf="notes"]').value = 'Updated via project view';
    const saveBtn = inlineEd.querySelector('.pr-save-btn');
    w.pfCrmSaveContactRow(saveBtn);
    await new Promise(r=>setTimeout(r, 0));
    await new Promise(r=>setTimeout(r, 0));

    ok('P2 Save posted an action:update to /api/contacts',
      !!lastUpdatePayload && lastUpdatePayload.action === 'update');
    ok('P2 update payload carries the contactId (no dup — targets the row)',
      !!lastUpdatePayload && String(lastUpdatePayload.contact.contactId).toUpperCase() === 'C0001');
    ok('P2 update payload carries company + category (carried through, not blanked)',
      !!lastUpdatePayload && lastUpdatePayload.contact.company === 'Westhoff Development' &&
      lastUpdatePayload.contact.category === 'Owner');
    ok('P2 update payload has the new Title', !!lastUpdatePayload && lastUpdatePayload.contact.title === 'President');
    ok('P2 update payload has the new Notes', !!lastUpdatePayload && lastUpdatePayload.contact.notes === 'Updated via project view');
    ok('P2 directory record actually mutated (single source of truth)',
      DIR['C0001'].title === 'President' && DIR['C0001'].notes === 'Updated via project view');
  }
})();

// ========================================================================
// PART 3 — read-only role gets NO directory-row Edit button (gate).
// ========================================================================
await (async function(){
  const dom = makeDom('field_ops');
  const OV = { general: { '__crm': { 'Owner': { company:'Westhoff Development', contactIds:['C0001'] } } } };
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  // field_ops has no Project Contacts card at all in most builds; if present, no edit btn.
  if (pc) {
    w.pfCrmRenderCards(w.document);
    await new Promise(r=>setTimeout(r, 0));
    await new Promise(r=>setTimeout(r, 0));
    ok('P3 read-only role: NO directory-row Edit button rendered',
      !pc.querySelector('.pr-crow-editbtn'));
  } else {
    ok('P3 read-only role: Project Contacts not shown to field_ops (stronger gate)', true);
  }
})();

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
if (fail) { console.log('FAILS: ' + fails.join(', ')); process.exit(1); }
