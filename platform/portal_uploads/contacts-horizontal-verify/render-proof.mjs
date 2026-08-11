// jsdom render-proof for the HORIZONTAL-EVERYWHERE conversion (Brad 2026-08-11
// followup: "the Equipment Transportation is good in how it is horizontal, make the
// rest of the contacts look like this"). Loads the REAL office project-record IIFE
// from platform/index.html (no reimplementation) and asserts, for the LEGACY
// (non-CRM) contact path — the boxed vertical .pr-ccard look Brad rejected:
//
//   A. Project Owner renders Nathan Westhoff as a HORIZONTAL .pr-crow row (from the
//      legacy g.owner synced data + a per-contact override), NOT a boxed .pr-ccard.
//   B. General Contractor renders Tanner Schweer (PM) + Larry Blanchard (Super) +
//      Jacob Lincoln (PE) as horizontal rows (from GC override fields).
//   C. Design Professionals firms render horizontally; a firm with NO data renders
//      CLEAN (role tag + company area, no wall of blank editable fields VISIBLE).
//   D. PF Project Team renders its roles horizontally.
//   E. NO VISIBLE .pr-ccard boxed contact card remains in ANY Project Contacts group
//      (the boxed grid is kept in the DOM but hidden via .pr-ccards{display:none} so
//      the editor + Add-contact still work; jsdom has no layout so we assert the
//      hidden grid is wrapped in .pr-ccards and that the horizontal .pr-crow table
//      is present as the real display).
//   F. NO CONTACT DATA LOST: every seeded/override contact name still appears in the
//      Project Contacts card text.
//   G. The editable .pr-field[data-pr-label] rows still EXIST in the DOM (editor
//      round-trip preserved) — same count of key labels as before.
//   H. Equipment Transport (the target format) still renders horizontally + the
//      Site-Readiness vendor .pr-ccards (OUTSIDE Project Contacts) are NOT hidden by
//      the scoped rule (structural check: they are not inside .pr-pc-section).
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/contacts-horizontal-verify/render-proof.mjs
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
        // GC[0] is the company/PM anchor; the Superintendent + Project Engineer are
        // synced roles (scope-matched by /super/i and /project eng/i) — this mirrors
        // the real POET record where Larry Blanchard (Super) + Jacob Lincoln (PE) are
        // synced GC team members, proving they render as horizontal rows.
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

// Fetch stub: NO CRM directory selection anywhere (pure legacy path).
function noCrmFetch(){
  return (url)=>{
    const u = String(url);
    if (u.includes('/api/contacts')) {
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ ok:true, contacts:[] }) });
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
  w.fetch = noCrmFetch();
  w.eval(iife);
  return w;
}

function pcCard(root){
  let pc=null;
  root.querySelectorAll('.pr-card').forEach(c=>{ const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Project Contacts')pc=c; });
  return pc;
}
function nestedByRoleTag(pc, tag){
  let host=null;
  pc.querySelectorAll('.pr-pc-horiz-block').forEach(b=>{
    const rt=b.querySelector('.pr-role-tag');
    if(rt && rt.textContent.trim()===tag) host=b;
  });
  return host;
}

// A per-contact OVERRIDE on the Owner (proves override-wins values flow into the
// horizontal row). Tanner/Larry/Jacob come from synced g.gc (above). The GC PM Name
// is override-editable, so also prove an override reaches the GC PM horizontal row.
const OV = { general: {
  'Owner Contact 1 - Contact Name':'Nathan Westhoff',
  'Owner Contact 1 - Title':'Owner',
  'Owner Contact 1 - Office Phone':'2604130000',
  'Owner Contact 1 - Email':'nw@x.com',
  'GC Project Manager - Name':'Tanner Schweer'
} };

await (async function(){
  const dom = makeDom('partner');
  const w = boot(dom, OV);
  w.openProjectRecord('26-002');
  const root = w.document.getElementById('prGenericRoot');
  const pc = pcCard(root);
  ok('pc0 Project Contacts card exists + scoped .pr-pc-section', !!pc && pc.classList.contains('pr-pc-section'));

  // A. Owner -> Nathan Westhoff as a horizontal row, not a boxed card.
  const ownerBlk = nestedByRoleTag(pc, 'Project Owner');
  ok('A Owner horizontal block present', !!ownerBlk);
  const ownerRows = ownerBlk ? [...ownerBlk.querySelectorAll('.pr-crow:not(.pr-crow-head)')] : [];
  const nathan = ownerRows.find(r=>/Nathan Westhoff/.test(r.textContent));
  ok('A Owner shows Nathan Westhoff as a .pr-crow row', !!nathan);
  ok('A Owner header row is Name|Title|Office Phone|Cell Phone|Email|Notes', !!ownerBlk &&
    [...ownerBlk.querySelectorAll('.pr-crow.pr-crow-head span')].map(s=>s.textContent).join('|') ===
    'Name|Title|Office Phone|Cell Phone|Email|Notes');
  ok('A Owner company name = Westhoff Development', !!ownerBlk &&
    /Westhoff Development/.test((ownerBlk.querySelector('.pr-pc-company-name')||{}).textContent||''));
  ok('A Owner company meta line carries address/phone/website', !!ownerBlk &&
    !!ownerBlk.querySelector('.pr-pc-company-meta') &&
    /wd\.com/.test(ownerBlk.querySelector('.pr-pc-company-meta').textContent));

  // B. GC -> Tanner / Larry / Jacob horizontal rows.
  const gcBlk = nestedByRoleTag(pc, 'General Contractor');
  ok('B GC horizontal block present', !!gcBlk);
  const gcText = gcBlk ? gcBlk.textContent : '';
  ok('B GC shows Tanner Schweer', /Tanner Schweer/.test(gcText));
  ok('B GC shows Larry Blanchard', /Larry Blanchard/.test(gcText));
  ok('B GC shows Jacob Lincoln', /Jacob Lincoln/.test(gcText));
  ok('B GC company name = Weigand Construction', !!gcBlk &&
    /Weigand Construction/.test((gcBlk.querySelector('.pr-pc-company-name')||{}).textContent||''));

  // C. DP firms horizontal; empty firm renders clean (no visible blank field wall).
  const geoBlk = nestedByRoleTag(pc, 'Geotechnical Engineer');
  ok('C Geotechnical (empty) renders as horizontal block (role tag present)', !!geoBlk);
  ok('C Geotechnical empty -> NO visible .pr-crow data rows (clean, no blank wall)',
    !!geoBlk && geoBlk.querySelectorAll('.pr-crow:not(.pr-crow-head)').length === 0);
  const giBlk = nestedByRoleTag(pc, 'Ground Improvement Engineering');
  ok('C Ground Improvement shows synced Eng One row', !!giBlk && /Eng One/.test(giBlk.textContent));
  ok('C Ground Improvement company name = GAI', !!giBlk &&
    /GAI/.test((giBlk.querySelector('.pr-pc-company-name')||{}).textContent||''));

  // D. PF Team horizontal.
  const pfBlk = nestedByRoleTag(pc, 'PF Project Team');
  ok('D PF Project Team horizontal block present', !!pfBlk);
  ok('D PF Team shows a role row (Operator)', !!pfBlk && /Operator/.test(pfBlk.textContent));
  ok('D PF Team shows synced Seth Willis', !!pfBlk && /Seth Willis/.test(pfBlk.textContent));

  // E. NO VISIBLE .pr-ccard — the boxed grid is kept but wrapped in .pr-ccards (hidden
  //    via CSS). Assert every .pr-ccard inside Project Contacts is inside a .pr-ccards
  //    wrapper (the hidden editor scaffold), and a horizontal .pr-crow table exists.
  const allCcards = [...pc.querySelectorAll('.pr-ccard')];
  const ccardsAllHidden = allCcards.every(c => c.closest('.pr-ccards'));
  ok('E every .pr-ccard is inside a hidden .pr-ccards wrapper (not a bare visible card)', ccardsAllHidden);
  ok('E horizontal .pr-crow tables present in Project Contacts', pc.querySelectorAll('.pr-crow').length >= 3);

  // F. No contact data lost — every person still appears in Project Contacts text.
  const pcText = pc.textContent;
  ['Nathan Westhoff','Tanner Schweer','Larry Blanchard','Jacob Lincoln','Eng One','Seth Willis']
    .forEach(nm => ok('F no data lost: '+nm+' still shown', pcText.indexOf(nm) !== -1));

  // G. Editor round-trip preserved: editable .pr-field[data-pr-label] rows still exist.
  ok('G editable Owner Contact field still in DOM',
    !!pc.querySelector('.pr-field[data-pr-label="Owner Contact 1 - Contact Name"]'));
  ok('G editable GC PM Name field still in DOM',
    !!pc.querySelector('.pr-field[data-pr-label="GC Project Manager - Name"]'));
  ok('G DP firm company field still in DOM',
    !!pc.querySelector('.pr-field[data-pr-label="Ground Improvement - Company"]'));
  ok('G contact-group token (Owner Contact) preserved for Add-contact',
    !!pc.querySelector('.pr-fields[data-pr-contact-group="Owner Contact"]'));

  // H. Equipment Transport (target) still renders; its host is a CRM host (horizontal).
  //    And the Site-Readiness vendor .pr-ccards live OUTSIDE .pr-pc-section (not hidden).
  const eqHost = pc.querySelector('.pr-crm-cards[data-crm-cards="Equipment Transport"]');
  ok('H Equipment Transport CRM host present in Project Contacts', !!eqHost);
  const srCcards = [...root.querySelectorAll('.pr-ccards')].filter(g => !g.closest('.pr-pc-section'));
  ok('H Site-Readiness vendor .pr-ccards exist OUTSIDE .pr-pc-section (not hidden by scope)',
    srCcards.length >= 1);
})();

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
if (fail) { console.log('FAILS: ' + fails.join(', ')); process.exit(1); }
