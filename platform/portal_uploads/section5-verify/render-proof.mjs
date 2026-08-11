import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html','utf8');
// Marker-based extraction of the office project-record IIFE (robust to line drift —
// the old hardcoded line-range slice 12280..17571 broke when the IIFE grew past 17571
// with the Project Contacts restructure, Brad 2026-08-11).
const _mark = 'Renders window.PF_PROJECT_POET into #prRoot as 11 collapsible schema cards.';
const _mi = html.indexOf(_mark);
const _ss = html.indexOf('<script>', _mi) + '<script>'.length;
const _se = html.indexOf('</script>', _ss);
let block = html.slice(_ss, _se);
// Export renderInto: inject the assignment right before the IIFE's closing "} catch(e) {"
block = block.replace(/\n  \} catch\(e\) \{\n    console\.error\("Project record view failed to load:", e\);/,
  '\n    try { window.__renderInto = renderInto; } catch(_x){ window.__renderErr = _x.message; }\n  } catch(e) {\n    console.error("Project record view failed to load:", e);');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { runScripts:'outside-only' });
const w = dom.window;
w.esc = (v)=> (v==null?'':String(v)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Formatter globals renderInto expects (added post-section5-build; without pfFmtQty the
// whole render throws). Identity stubs are fine for structural assertions.
w.pfFmtPhone = (v)=> String(v==null?'':v);
w.pfFmtDate  = (v)=> String(v==null?'':v);
w.pfFmtQty   = (v)=> String(v==null?'':v);
w.pfFmtMoney = (v)=> String(v==null?'':v);
w.pfFmtNum   = (v)=> String(v==null?'':v);
w.PF_ME = { name:'Test Office', role:'admin' };
w.PF_COST_CODE_TEMPLATE = { groups:[{rows:[{cost_code:'5110'},{cost_code:'5405'}]}] };
w.PF_PROJECT_RECORDS = {}; w.PF_PM = {};
w.PF_PROJECT_POET = null; // renderPoet guards on project_number

let pass=0, fail=0; const F=[];
function ok(c,m){ if(c){pass++;} else {fail++; F.push(m);} }

try { w.eval(block); } catch(e){ console.log('EVAL ERROR: '+e.message); process.exit(2); }
ok(typeof w.__renderInto === 'function', 'renderInto exposed (err: '+(w.__renderErr||'')+')');
if (typeof w.__renderInto !== 'function'){ console.log('cannot proceed'); process.exit(2); }

const root = w.document.getElementById('root');
// renderInto(D, root) reads bid=D.bid_log, g=D.contacts.groups, q=D.qaqc, links=D.links
// (updated 2026-08-11 to the correct D shape — the old flat D.g / D.bid / D.q was stale
// and rendered empty groups). project_number drives the override overlay.
const D = {
  project_number:'26-999', project_name:'Test Project',
  bid_log:{ total_lf:5000, total_columns:100, total_stone_tn:250, engineer_firm:'Garbin Geo' },
  contacts:{ groups:{ engineering:[{company:'Garbin',name:'Ed'}], owner:[{company:'Owner LLC'}], vendors:[
        {company:'Stephan',scope:'trucking'}, {company:'Stone Co',scope:'stone aggregate',notes:'#57'},
        {company:'SafeCo',scope:'safety'} ], pf_team:[] } },
  qaqc:{ installed_columns:88, installed_lf:5000, design_columns:100, design_lf:5200, pct_columns:'-', pct_lf:'-', redrill_logs:2, last_log_date:'08/05/2026' },
  links:{}
};
try { w.__renderInto(D, root); } catch(e){ console.log('RENDER ERROR: '+e.message); }

const bodyText = root.textContent;
const heads = [...root.querySelectorAll('.pr-card')].filter(c=> c.parentElement && !c.parentElement.closest('.pr-card'));
const titles = heads.map(c=> ((c.querySelector('.pr-card-num')||{}).textContent||'')+'|'+((c.querySelector('.pr-card-title')||{}).textContent||''));
console.log('TOP-LEVEL CARDS:', JSON.stringify(titles));
// (Renumbered 2026-08-11: Project Contacts inserted at #2, everything after +1.)
const expected = ['1|General Info','2|Project Contacts','3|Subcontract Agreement','4|Engineering & Design','5|Site Readiness / Project Setup','6|Project Photos','7|Financials','8|Project Closeout'];
ok(JSON.stringify(titles)===JSON.stringify(expected), 'top-level 8 cards gap-free 1-8 in order: got '+JSON.stringify(titles));
ok(!titles.some(t=>/\|Project Safety$/.test(t)), 'standalone Project Safety top-level card GONE');

// Resolve the TOP-LEVEL Site Readiness card by TITLE — the Project Contacts
// "Staking & Layout" group (Brad 2026-08-11) also carries data-pr-section=
// "siteReadiness" and appears earlier in the DOM, so a bare querySelector by key
// would wrongly match it. Likewise safety/equipment/material keys are now shared with
// Project Contacts CRM cards, so resolve those WITHIN the top-level Site Readiness card.
let srCard = null;
root.querySelectorAll(':scope > .pr-card').forEach(c=>{ const t=c.querySelector('.pr-card-title'); if(t&&t.textContent==='Site Readiness / Project Setup') srCard=c; });
ok(!!srCard, 'siteReadiness card present');
const srBody = srCard && srCard.querySelector('.pr-card-body');
const srSubs = srBody ? [...srBody.querySelectorAll('.pr-subgroup')].filter(s=> s.closest('.pr-card')===srCard).map(s=>s.textContent.trim()) : [];
console.log('SITE READINESS SUBGROUPS (own card):', JSON.stringify(srSubs));
const want6 = ['1. Shop Drawings','2. Testing','3. Staking & Layout','4. Safety','5. Mobilization Preparation','6. Mobilization to Site'];
const idx = want6.map(x=> srSubs.indexOf(x));
ok(idx.every((v,i)=> v>=0 && (i===0 || v>idx[i-1])), '6 numbered subsections present + in order: idx='+JSON.stringify(idx));

const safetyCard = srCard && srCard.querySelector('.pr-card[data-pr-section="safety"]');
ok(!!safetyCard, 'nested safety card present (safety key preserved)');
ok(!!(safetyCard && safetyCard.closest('.pr-card')===srCard || (safetyCard && srCard.contains(safetyCard))), 'safety nested INSIDE siteReadiness');
const safetyLabels = safetyCard ? [...safetyCard.querySelectorAll('.pr-field[data-pr-label]')].map(f=>f.getAttribute('data-pr-label')) : [];
const migrated = ['Site Specific Safety Plan (SSSP)','Safety Consultant','Material Safety Data Sheets (MSDS)','Toolbox Talks Prepared','Jobsite Safety Analysis (JSA)','Daily Equipment Checklist','Hand Log Sheets','Locate Ticket # (Excavator ID)','Date Locates Called In','Date Ticket Cleared to Start','Date Ticket Expires'];
const missing = migrated.filter(l=> !safetyLabels.includes(l));
ok(missing.length===0, 'ALL 11 migrated Project Safety fields present. missing='+JSON.stringify(missing));
['Date SSSP Sent to GC','MSDS Sent?','Other Safety Items','Date Locate Called In','Locate Ticket #'].forEach(l=> ok(safetyLabels.includes(l), 'safety new field: '+l));
ok(!!root.querySelector('a[href*="fedex.com"]'), 'FedEx print link present');
ok(!!root.querySelector('a[href*="pipefy.com/public/form/7j9G40Zp"]'), 'Pipefy SSSP link present');

const eqCard = srCard && srCard.querySelector('.pr-card[data-pr-section="equipment"]');
const matCard = srCard && srCard.querySelector('.pr-card[data-pr-section="material"]');
ok(!!(eqCard && srCard.contains(eqCard)), 'equipment nested INSIDE siteReadiness');
ok(!!(matCard && srCard.contains(matCard)), 'material nested INSIDE siteReadiness');

const srOwnLabels = srBody ? [...srBody.querySelectorAll('.pr-field[data-pr-label]')].filter(f=> f.closest('.pr-card')===srCard).map(f=>f.getAttribute('data-pr-label')) : [];
['Modulus Load Test Required?','Which Jack','Test Document Status','AP Design Load (kips)','Load Test Size (kips)'].forEach(l=> ok(srOwnLabels.includes(l),'Testing field: '+l));
['Building Pad Passed Proof Roll','Elevation Difference','Checklist Notes','Field Ops Manager Visit - Comments / Recap','Demob Transport Company','Stone Approved by Engineer (GGG)?','Fuel Vendor','Rental Company'].forEach(l=> ok(srOwnLabels.includes(l),'Subsec5/6 field: '+l));

ok(!!root.querySelector('.pr-card[data-pr-section="engineering"]'), 'engineering card intact');
ok(!!root.querySelector('.pr-card[data-pr-section="qaqc"]'), 'qaqc nested card still present');
ok(titles.includes('7|Financials'), 'Financials renumbered to 7');
ok(titles.includes('8|Project Closeout'), 'Closeout renumbered to 8');

console.log('\n=== RESULT: '+pass+' pass / '+fail+' fail ===');
if(fail){ console.log('FAILURES:\n - '+F.join('\n - ')); process.exit(1); }
