import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html','utf8');
const lines = html.split('\n');
let block = lines.slice(12280-1, 17571).join('\n');
block = block.replace(/^[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*$/, '');
// Export renderInto: inject the assignment right before the IIFE's closing "} catch(e) {"
block = block.replace(/\n  \} catch\(e\) \{\n    console\.error\("Project record view failed to load:", e\);/,
  '\n    try { window.__renderInto = renderInto; } catch(_x){ window.__renderErr = _x.message; }\n  } catch(e) {\n    console.error("Project record view failed to load:", e);');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { runScripts:'outside-only' });
const w = dom.window;
w.esc = (v)=> (v==null?'':String(v)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
const D = {
  num:'26-999', name:'Test Project', number:'26-999',
  bid:{ total_lf:5000, total_columns:100, total_stone_tn:250, engineer_firm:'Garbin Geo' },
  g:{ engineering:[{company:'Garbin',name:'Ed'}], owner:[{company:'Owner LLC'}], vendors:[
        {company:'Stephan',scope:'trucking'}, {company:'Stone Co',scope:'stone aggregate',notes:'#57'},
        {company:'SafeCo',scope:'safety'} ], pf_team:[] },
  q:{ installed_columns:88, installed_lf:5000, design_columns:100, design_lf:5200, pct_columns:'-', pct_lf:'-', redrill_logs:2, last_log_date:'08/05/2026' },
  links:{}
};
try { w.__renderInto(D, root); } catch(e){ console.log('RENDER ERROR: '+e.message); }

const bodyText = root.textContent;
const heads = [...root.querySelectorAll('.pr-card')].filter(c=> c.parentElement && !c.parentElement.closest('.pr-card'));
const titles = heads.map(c=> ((c.querySelector('.pr-card-num')||{}).textContent||'')+'|'+((c.querySelector('.pr-card-title')||{}).textContent||''));
console.log('TOP-LEVEL CARDS:', JSON.stringify(titles));
const expected = ['1|General Info','2|Subcontract Agreement','3|Engineering & Design','4|Site Readiness / Project Setup','5|Project Photos','6|Financials','7|Project Closeout'];
ok(JSON.stringify(titles)===JSON.stringify(expected), 'top-level 7 cards gap-free 1-7 in order: got '+JSON.stringify(titles));
ok(!titles.some(t=>/\|Project Safety$/.test(t)), 'standalone Project Safety top-level card GONE');

const srCard = root.querySelector('.pr-card[data-pr-section="siteReadiness"]');
ok(!!srCard, 'siteReadiness card present');
const srBody = srCard && srCard.querySelector('.pr-card-body');
const srSubs = srBody ? [...srBody.querySelectorAll('.pr-subgroup')].filter(s=> s.closest('.pr-card')===srCard).map(s=>s.textContent.trim()) : [];
console.log('SITE READINESS SUBGROUPS (own card):', JSON.stringify(srSubs));
const want6 = ['1. Shop Drawings','2. Testing','3. Staking & Layout','4. Safety','5. Mobilization Preparation','6. Mobilization to Site'];
const idx = want6.map(x=> srSubs.indexOf(x));
ok(idx.every((v,i)=> v>=0 && (i===0 || v>idx[i-1])), '6 numbered subsections present + in order: idx='+JSON.stringify(idx));

const safetyCard = root.querySelector('.pr-card[data-pr-section="safety"]');
ok(!!safetyCard, 'nested safety card present (safety key preserved)');
ok(safetyCard && safetyCard.closest('.pr-card[data-pr-section="siteReadiness"]')===srCard, 'safety nested INSIDE siteReadiness');
const safetyLabels = safetyCard ? [...safetyCard.querySelectorAll('.pr-field[data-pr-label]')].map(f=>f.getAttribute('data-pr-label')) : [];
const migrated = ['Site Specific Safety Plan (SSSP)','Safety Consultant','Material Safety Data Sheets (MSDS)','Toolbox Talks Prepared','Jobsite Safety Analysis (JSA)','Daily Equipment Checklist','Hand Log Sheets','Locate Ticket # (Excavator ID)','Date Locates Called In','Date Ticket Cleared to Start','Date Ticket Expires'];
const missing = migrated.filter(l=> !safetyLabels.includes(l));
ok(missing.length===0, 'ALL 11 migrated Project Safety fields present. missing='+JSON.stringify(missing));
['Date SSSP Sent to GC','MSDS Sent?','Other Safety Items','Date Locate Called In','Locate Ticket #'].forEach(l=> ok(safetyLabels.includes(l), 'safety new field: '+l));
ok(!!root.querySelector('a[href*="fedex.com"]'), 'FedEx print link present');
ok(!!root.querySelector('a[href*="pipefy.com/public/form/7j9G40Zp"]'), 'Pipefy SSSP link present');

const eqCard = root.querySelector('.pr-card[data-pr-section="equipment"]');
const matCard = root.querySelector('.pr-card[data-pr-section="material"]');
ok(eqCard && eqCard.closest('.pr-card[data-pr-section="siteReadiness"]')===srCard, 'equipment nested INSIDE siteReadiness');
ok(matCard && matCard.closest('.pr-card[data-pr-section="siteReadiness"]')===srCard, 'material nested INSIDE siteReadiness');

const srOwnLabels = srBody ? [...srBody.querySelectorAll('.pr-field[data-pr-label]')].filter(f=> f.closest('.pr-card')===srCard).map(f=>f.getAttribute('data-pr-label')) : [];
['Modulus Load Test Required?','Which Jack','Test Document Status','AP Design Load (kips)','Load Test Size (kips)'].forEach(l=> ok(srOwnLabels.includes(l),'Testing field: '+l));
['Building Pad Passed Proof Roll','Elevation Difference','Checklist Notes','Field Ops Manager Visit - Comments / Recap','Demob Transport Company','Stone Approved by Engineer (GGG)?','Fuel Vendor','Rental Company'].forEach(l=> ok(srOwnLabels.includes(l),'Subsec5/6 field: '+l));

ok(!!root.querySelector('.pr-card[data-pr-section="engineering"]'), 'engineering card intact');
ok(!!root.querySelector('.pr-card[data-pr-section="qaqc"]'), 'qaqc nested card still present');
ok(titles.includes('6|Financials'), 'Financials renumbered to 6');
ok(titles.includes('7|Project Closeout'), 'Closeout renumbered to 7');

console.log('\n=== RESULT: '+pass+' pass / '+fail+' fail ===');
if(fail){ console.log('FAILURES:\n - '+F.join('\n - ')); process.exit(1); }
