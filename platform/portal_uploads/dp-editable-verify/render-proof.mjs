// jsdom render-proof for the DP-editable-backfeed feature. Loads the REAL project
// -record IIFE from platform/index.html (no reimplementation), drives a synthetic
// record with engineering contacts, and asserts:
//   1. The Design Professionals nested card now has data-pr-section="design_professionals"
//      + an Edit button (office role) — and NO second editable "engineering" card leaks.
//   2. Editing the DP card + Save POSTs to /api/project-override with
//      section:"design_professionals" (NOT "engineering") — key isolation.
//   3. The DP editor exposes the "Save contact(s) to directory" button, and
//      pfSaveContactsToDirectory backfeeds each firm contact to /api/contacts with the
//      correct category + company (firm -> category map) via action:'add'.
//   4. field_ops sees NO Edit button on the DP card.
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
  // Page globals defined in OTHER script blocks that the record IIFE calls out to.
  w.pfFmtPhone = (v)=> String(v==null?'':v);
  w.pfFmtDate = (v)=> String(v==null?'':v);
  w.pfFmtQty = (v)=> String(v==null?'':v); // added: global introduced post-harness (commit 0a97417)
  // Globals from earlier <script> blocks the harness doesn't eval (pre-existing debt).
  w.PF_DATE_LABEL_RE = /date|deadline|expires|due/i;
  w.pfIsDateLabel = (label)=> w.PF_DATE_LABEL_RE.test(String(label||''));
  w.pfParseDate = ()=> null;
  w.pfAddBusinessDays = ()=> null;
  w.pfFmtDateObj = (d)=> String(d==null?'':d);
  w.PF_PROJECT_POET = null;
  // Synthetic record WITH an engineering contact so the Ground Improvement firm block seeds.
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

// ---- A: office user -> DP card is editable with its OWN key, no engineering leak ----
(function(){
  const dom = makeDom('partner');
  const w = boot(dom, { overrideGet: emptyOv });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  ok('A DP card has design_professionals section', !!dpCard);
  ok('A DP card has an Edit button', !!(dpCard && dpCard.querySelector('.pr-edit-btn')));
  // exactly ONE editable engineering card (the standalone section #3), DP is separate
  const engCards = root.querySelectorAll('.pr-card[data-pr-section="engineering"]');
  ok('A exactly one engineering card (no DP collision)', engCards.length === 1);
  // DP card shows the four firm subheads
  const dpText = dpCard ? dpCard.textContent : '';
  ok('A DP shows Ground Improvement subhead', /Ground Improvement Engineering/.test(dpText));
  ok('A DP shows Geotechnical/Civil/Structural', /Geotechnical Engineer/.test(dpText) && /Civil Engineer/.test(dpText) && /Structural Engineer/.test(dpText));
  // Seeded Ground Improvement contact present
  ok('A DP seeded the GI contact (Ed Garbin)', /Ed Garbin/.test(dpText));
})();

// ---- B: field_ops -> NO Edit button on DP card ----
(function(){
  const dom = makeDom('field_ops');
  const w = boot(dom, { overrideGet: ()=>({status:403, text: JSON.stringify({status:'forbidden'})}) });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  ok('B DP card still renders for field_ops', !!dpCard);
  ok('B DP card has NO Edit button for field_ops', !!dpCard && !dpCard.querySelector('.pr-edit-btn'));
})();

// ---- C: DP edit + Save POSTs section:"design_professionals" (key isolation) ----
(async function(){
  const dom = makeDom('partner');
  let posted = null;
  const w = boot(dom, {
    overrideGet: emptyOv,
    fetchImpl: (url, init)=>{
      if (String(url).includes('/api/project-override')) {
        posted = JSON.parse(init.body);
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({
          ok:true, saved:true, num:'26-002', section:'design_professionals',
          sections:{ design_professionals: posted.fields }, _meta:{updatedBy:'Tester',updatedAt:'2026-08-07T12:00:00Z'} }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ok:true,contacts:[]}) });
    }
  });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
  ok('C DP editor opened', !!dpCard.querySelector('.pr-editor'));
  // change the Geotechnical company field
  const geoInput = [...dpCard.querySelectorAll('.pr-edit-input[data-pr-field-label]')]
    .find(i=>/Geotechnical - Company/.test(i.getAttribute('data-pr-field-label')));
  ok('C Geotechnical company input present', !!geoInput);
  if (geoInput) geoInput.value = 'New Geo Firm';
  w.pfSaveSection(dpCard.querySelector('.pr-save-btn'));
  await new Promise(r=>setTimeout(r,50));
  ok('C Save POSTed to project-override', !!posted);
  ok('C Save used section design_professionals', posted && posted.section === 'design_professionals');
  ok('C Save carried the edited company', posted && posted.fields['Geotechnical - Company'] === 'New Geo Firm');
})();

// ---- D: directory backfeed maps firm -> category + company via /api/contacts ----
(async function(){
  const dom = makeDom('partner');
  const contactPosts = [];
  const w = boot(dom, {
    overrideGet: emptyOv,
    fetchImpl: (url, init)=>{
      if (String(url).includes('/api/contacts')) {
        // POST add/update (no GET in this flow beyond typeahead which we don't trigger)
        if (init && init.method === 'POST') {
          contactPosts.push(JSON.parse(init.body));
          return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, saved:true, action:'add' }) });
        }
        return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:[] }) });
      }
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true }) });
    }
  });
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const dpCard = root.querySelector('.pr-card[data-pr-section="design_professionals"]');
  w.pfEditSection(dpCard.querySelector('.pr-edit-btn'));
  const editor = dpCard.querySelector('.pr-editor');
  // The "Save contact(s) to directory" button should be present (contact groups exist)
  const saveDirBtn = [...editor.querySelectorAll('button')].find(b=>/Save contact\(s\) to directory/i.test(b.textContent));
  ok('D directory-save button present in DP editor', !!saveDirBtn);
  // Fill a Structural firm company + one structural contact.
  function setInput(re, val){
    const el = [...editor.querySelectorAll('.pr-edit-input[data-pr-field-label]')]
      .find(i=>re.test(i.getAttribute('data-pr-field-label')));
    if (el) el.value = val; return el;
  }
  ok('D structural company input set', !!setInput(/^Structural - Company$/, 'BoltStruct LLC'));
  ok('D structural contact name set', !!setInput(/Structural - Contact 1 - Contact Name/, 'Pat Beam'));
  setInput(/Structural - Contact 1 - Title/, 'SE');
  setInput(/Structural - Contact 1 - Email/, 'pat@bolt.com');
  setInput(/Structural - Contact 1 - Office Phone/, '260-555-9000');
  // Also confirm the seeded Ground Improvement contact will carry its category.
  setInput(/Ground Improvement - Company/, 'Ground Improvement Inc');

  w.pfSaveContactsToDirectory(saveDirBtn);
  await new Promise(r=>setTimeout(r,60));
  ok('D at least one contact POSTed', contactPosts.length >= 1);
  const structPost = contactPosts.map(p=>p.contact).find(c=>c && c.lastName === 'Beam');
  ok('D structural contact backfed', !!structPost);
  ok('D structural category mapped', structPost && structPost.category === 'Structural Engineer');
  ok('D structural company attached', structPost && structPost.company === 'BoltStruct LLC');
  ok('D structural email carried', structPost && structPost.email === 'pat@bolt.com');
  const giPost = contactPosts.map(p=>p.contact).find(c=>c && c.lastName === 'Garbin');
  ok('D GI contact backfed with its category', giPost && giPost.category === 'Ground Improvement Engineer');
  ok('D GI company attached', giPost && giPost.company === 'Ground Improvement Inc');
  // all POSTs are action:add (backend dedups)
  ok('D all posts action=add', contactPosts.every(p=>p.action === 'add'));

  console.log('\nRENDER-PROOF: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:', fails); process.exit(1); }
})();
