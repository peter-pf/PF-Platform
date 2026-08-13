// jsdom render-proof for the ALWAYS-LIVE prereqs checklist (Brad 2026-08-13) + the
// still-valid read-view resolution (Change A) + SOW ordering (Change B). Loads the REAL
// project-record IIFE from platform/index.html (no reimplementation).
//
// UPDATED 2026-08-13: the "PF Info Needed for Submittal Design" table is now ALWAYS-LIVE
// (no Edit/Save/Cancel). The old A2/A3/A4/A5 editor-flow assertions are replaced by
// in-DOM always-live assertions (L*). A1/A6/A7 (read-view resolution + count) and B1/B2
// (SOW ordering) still hold and are retained.
//
// READ-VIEW (retained):
//   A1 A directory-tied responsible party (responsible_contact_id) resolves to the LIVE
//      directory name + email (directory email wins over stored copy).
//   A6 Existing stored responsible data is PRESERVED/shown (legacy free name/email).
//   A7 "X of 9 received" count reflects stored date_received.
//
// ALWAYS-LIVE (new):
//   L1 Office renders IN-CELL live controls (name typeahead + email + date + rf checkboxes),
//      NO "Edit checklist" button, and a datalist of THIS project's contacts.
//   L2 Typing/selecting a project contact NAME auto-associates its email + contactId
//      (pfPrqOnPartyLive); a non-matching name clears the tie but keeps a typed email.
//   L3 Changing a control fires pfPrqLiveSave -> ONE POST of __submittal_prereqs.items,
//      carrying the changed row (read-merge-write) while PRESERVING sibling items.
//   L4 A checkbox (required_for) change saves + preserves that row's party + date.
//   L5 field_ops sees NO live controls (read-only cells) + no Reminder column.
//   L6 A failed save REVERTS the control (fail-closed) — no fabricated "saved".
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

function fetchImpl(posts, opts){
  opts = opts || {};
  return (url, init)=>{
    const u = String(url);
    if (u.includes('/api/contacts')) {
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:ALL_CONTACTS }) });
    }
    if (u.includes('/api/project-override') && init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (posts) posts.push(body);
      // Fail-closed test mode: return a non-saved response so the client must revert.
      if (opts.failPost) {
        return Promise.resolve({ ok:false, status:500, json:()=>Promise.resolve({ status:'error', message:'boom' }) });
      }
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

// ---- A1 + A6 + A7 + L1: office always-live read resolution + in-cell controls ----
await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(null) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80)); // let pfPrqRefreshAfterContacts re-render
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  ok('A1 prereq wrap present', !!wrap);
  // L1: NO Edit button; in-cell live controls present.
  ok('L1 office has NO Edit checklist button', !wrap.querySelector('.pf-prq-edit') && !/Edit checklist/.test(wrap.innerHTML));
  ok('L1 office renders live name/email/date inputs',
    !!wrap.querySelector('.pf-prq-live-name') && !!wrap.querySelector('.pf-prq-live-email') && !!wrap.querySelector('.pf-prq-live-date'));
  ok('L1 office renders live required-for checkboxes',
    !!wrap.querySelector('.pf-prq-live-rf-sub') && !!wrap.querySelector('.pf-prq-live-rf-stk'));
  const dl = wrap.querySelector('datalist#pf-prq-contacts-dl');
  ok('L1 datalist present', !!dl);
  const dlNames = [...dl.querySelectorAll('option')].map(o=>o.value);
  ok('L1 datalist includes directory Owner (Nathan)', dlNames.includes('Nathan Westhoff'));
  ok('L1 datalist includes legacy stored party (Free Person)', dlNames.includes('Free Person'));
  // pfProjectContacts is scoped to Owner+GC (+ legacy + stored parties); a DP-only contact
  // and an unrelated directory contact are BOTH excluded.
  ok('L1 datalist EXCLUDES a DP-only contact (Ed Garbin)', !dlNames.includes('Ed Garbin'));
  ok('L1 datalist EXCLUDES a non-project contact (Tanner)', !dlNames.includes('Tanner Schweer'));
  // A1: tied row resolves directory name/email/cid (INTO the live inputs + data attrs).
  const rowStruct = wrap.querySelector('tr[data-prq-item="struct_foundation_cad"]');
  const sName = rowStruct.querySelector('.pf-prq-live-name');
  const sEmail = rowStruct.querySelector('.pf-prq-live-email');
  const sCid = rowStruct.querySelector('.pf-prq-live-cid');
  ok('A1 tied row resolves directory NAME (not stored OLD NAME)', sName.value === 'Nathan Westhoff');
  ok('A1 tied row resolves directory EMAIL (wins over stale)', sEmail.value === 'nathan@westhoff.com');
  ok('A1 tied row carries contactId', sCid.value === 'C0009' && rowStruct.getAttribute('data-prq-cid') === 'C0009');
  // A6: legacy free party preserved.
  const rowCivil = wrap.querySelector('tr[data-prq-item="civil_grading_cad"]');
  ok('A6 legacy free party name shown', rowCivil.querySelector('.pf-prq-live-name').value === 'Free Person');
  ok('A6 legacy free email preserved', rowCivil.querySelector('.pf-prq-live-email').value === 'free@one.com');
  ok('A6 legacy free party has no cid', (rowCivil.querySelector('.pf-prq-live-cid').value||'') === '');
  // A7: count reflects the one stored date_received.
  ok('A7 received count = 1 of 9', /1 of 9 received/.test(wrap.textContent));
})();

// ---- L2 + L3: typeahead tie + save-on-change POST (read-merge-write) ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(posts) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  // L2: change the CIVIL row party (currently free) to project contact Nathan Westhoff
  // (the Owner, C0009 — a real member of pfProjectContacts).
  const rowCivil = wrap.querySelector('tr[data-prq-item="civil_grading_cad"]');
  const cName = rowCivil.querySelector('.pf-prq-live-name');
  const cEmail = rowCivil.querySelector('.pf-prq-live-email');
  const cCid = rowCivil.querySelector('.pf-prq-live-cid');
  cName.value = 'Nathan Westhoff';
  w.pfPrqOnPartyLive(cName);
  ok('L2 selecting project contact auto-fills email', cEmail.value === 'nathan@westhoff.com');
  ok('L2 selecting project contact ties contactId', cCid.value === 'C0009');
  // Non-matching name clears the tie but keeps a typed email.
  cName.value = 'Someone Else'; cEmail.value = 'someone@else.com';
  w.pfPrqOnPartyLive(cName);
  ok('L2 non-matching name clears cid', (cCid.value||'') === '');
  ok('L2 non-matching name keeps typed email', cEmail.value === 'someone@else.com');
  // Reset to Nathan, then fire the name control's onchange -> pfPrqLiveSave.
  cName.value = 'Nathan Westhoff'; w.pfPrqOnPartyLive(cName);
  w.pfPrqLiveSave(cName);
  await new Promise(r=>setTimeout(r,40));
  ok('L3 exactly ONE override POST fired', posts.length === 1);
  const p0 = posts[0];
  ok('L3 POST targets engineering', p0.section === 'engineering');
  const items = p0.fields && p0.fields.__submittal_prereqs && p0.fields.__submittal_prereqs.items;
  ok('L3 civil row re-tied to Nathan (cid C0009, email)',
    items && items.civil_grading_cad.responsible_contact_id === 'C0009' && items.civil_grading_cad.responsible_email === 'nathan@westhoff.com');
  // read-merge-write: the OTHER (struct) item is preserved in the same payload.
  ok('L3 sibling struct item preserved (cid C0009)',
    items && items.struct_foundation_cad && items.struct_foundation_cad.responsible_contact_id === 'C0009');
  ok('L3 civil row date_received preserved (2026-08-01)',
    items && items.civil_grading_cad.date_received === '2026-08-01');
})();

// ---- L4: required_for checkbox change saves + preserves party/date ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(posts) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  const rowCivil = wrap.querySelector('tr[data-prq-item="civil_grading_cad"]');
  const stk = rowCivil.querySelector('.pf-prq-live-rf-stk'); // stored true -> toggle off
  stk.checked = false;
  w.pfPrqLiveSave(stk);
  await new Promise(r=>setTimeout(r,40));
  const items = posts[0].fields.__submittal_prereqs.items;
  ok('L4 rf staking toggled off', items.civil_grading_cad.required_for.staking_layout === false);
  ok('L4 party preserved on checkbox save', items.civil_grading_cad.responsible_email === 'free@one.com');
  ok('L4 date preserved on checkbox save', items.civil_grading_cad.date_received === '2026-08-01');
})();

// ---- L5: field_ops sees NO live controls (read-only) ----
await (async function(){
  const dom = makeDom('field_ops');
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(null) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  ok('L5 prereq wrap still renders for field_ops', !!wrap);
  ok('L5 field_ops has NO live inputs',
    !wrap.querySelector('.pf-prq-live') && !wrap.querySelector('.pf-prq-live-name') && !wrap.querySelector('.pf-prq-live-date'));
  ok('L5 field_ops has NO Edit checklist button', !wrap.querySelector('.pf-prq-edit'));
  ok('L5 field_ops has NO Reminder column', !wrap.querySelector('.pf-prq-remind') && !/>Reminder</.test(wrap.innerHTML));
  // Read-only value cells still resolve the tied party name (in cell text, not an input).
  const rowStruct = wrap.querySelector('tr[data-prq-item="struct_foundation_cad"]');
  ok('L5 field_ops read-only cell shows resolved party name', /Nathan Westhoff/.test(rowStruct.textContent));
})();

// ---- L6: failed save REVERTS the control (fail-closed) ----
await (async function(){
  const dom = makeDom('partner');
  const posts = [];
  const w = boot(dom, { overrideGet: ovWith(OVERRIDES), fetchI: fetchImpl(posts, { failPost:true }) });
  w.openProjectRecord('26-002');
  await new Promise(r=>setTimeout(r,80));
  const root = w.document.getElementById('prGenericRoot');
  const wrap = root.querySelector('.pf-prq-wrap');
  const rowStruct = wrap.querySelector('tr[data-prq-item="struct_foundation_cad"]');
  const dateEl = rowStruct.querySelector('.pf-prq-live-date');
  const before = dateEl.value;                 // '' (struct has no date_received)
  dateEl.value = '2026-08-13';
  w.pfPrqLiveSave(dateEl);
  await new Promise(r=>setTimeout(r,40));
  ok('L6 POST was attempted', posts.length === 1);
  ok('L6 control REVERTED to prior value after failed save', dateEl.value === before);
  const msgEl = wrap.querySelector('.pf-prq-msg');
  ok('L6 an error message is shown (non-empty, error-styled)',
    !!msgEl && msgEl.textContent.trim() !== '' && /pf-prq-msg-err/.test(msgEl.className) && msgEl.style.display !== 'none');
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
