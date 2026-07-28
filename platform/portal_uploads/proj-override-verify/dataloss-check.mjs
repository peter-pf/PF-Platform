import { JSDOM } from 'jsdom';
import fs from 'fs';

// Load real dashboard data into a fake window
const dashSrc = fs.readFileSync('data/project-dashboard.js','utf-8');
const win = {};
new Function('window', dashSrc)(win);
const DASH = win.PF_PROJECT_DASHBOARD;
if(!DASH || !Array.isArray(DASH.projects)) throw new Error('dashboard not loaded');

// esc
const E = s => s==null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const subhead = t => '<div class="pr-subhead">'+E(t)+'</div>';

// Build a card scaffold for a project matching the renderer's structure.
// General Info: first .pr-card (NO data-pr-section). Others carry data-pr-section.
// We seed each keyed card with a FEW pre-existing .pr-field[data-pr-label] rows to
// prove dedupe (we deliberately pre-seed some labels that ALSO appear in the dashboard).
function buildRoot(preseed){
  const keyed = [
    [null,'General Info'],['pfTeam','PF Team'],['contract','Contract Info'],
    ['engineering','Engineering & Design'],['safety','Project Safety'],
    ['siteReadiness','Site Readiness'],['equipment','Equipment'],
    ['material','Material'],['qaqc','QA / QC'],['closeout','Project Closeout']
  ];
  let html='';
  keyed.forEach(([key,title])=>{
    const attr = key ? ' data-pr-section="'+key+'"' : '';
    const seeded = (preseed[title]||[]).map(l=>'<div class="pr-field" data-pr-label="'+E(l)+'"><span class="pr-field-label">'+E(l)+'</span><span class="pr-field-value">seed</span></div>').join('');
    html += '<div class="pr-card"'+attr+'><div class="pr-card-head">'+E(title)+'</div><div class="pr-card-body">'+seeded+'</div></div>';
  });
  return html;
}

// ---- verbatim-equivalent merge (copied from index.html injection) ----
function runMerge(root, D){
  const _dash = DASH;
  const _pnum = String(D.project_number || '').trim().toLowerCase();
  const _dproj = _dash.projects.find(p => String(p.projectNumber||'').trim().toLowerCase()===_pnum);
  if(!(_dproj && Array.isArray(_dproj.sections))) return;
  const _norm = s => String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();
  const _sectionCardBody = name => {
    const keyByName = {'general info':null,'pf team':'pfTeam','contract info':'contract','engineering & design':'engineering','project safety':'safety','site readiness':'siteReadiness','equipment':'equipment','material':'material','qa / qc':'qaqc','project closeout':'closeout'};
    const n=_norm(name);
    if(!(n in keyByName)) return null;
    const key=keyByName[n];
    if(key===null){ const first=root.querySelector('.pr-card'); return first?first.querySelector('.pr-card-body'):null; }
    return root.querySelector('.pr-card[data-pr-section="'+key+'"] .pr-card-body');
  };
  _dproj.sections.forEach(sec=>{
    if(!sec||!Array.isArray(sec.items)||!sec.items.length) return;
    const body=_sectionCardBody(sec.name);
    if(!body) return;
    const shown={};
    body.querySelectorAll('.pr-field[data-pr-label]').forEach(f=>{shown[_norm(f.getAttribute('data-pr-label'))]=true;});
    body.querySelectorAll('.pd-merge-item[data-pd-label]').forEach(f=>{shown[_norm(f.getAttribute('data-pd-label'))]=true;});
    const extras=sec.items.filter(it=>{const lbl=_norm(it&&it.label); if(!lbl||shown[lbl])return false; shown[lbl]=true; return true;});
    if(!extras.length) return;
    const rows=extras.map(it=>{
      const v=(it.value===undefined||it.value===null||String(it.value).trim()==='')?'':String(it.value);
      const cls=v?'pr-field-value':'pr-field-value empty';
      const shownV=v?E(v):'-';
      return '<div class="pr-field pd-merge-item" data-pd-label="'+E(it.label)+'"><span class="pr-field-label">'+E(it.label)+'</span><span class="'+cls+'">'+shownV+'</span><span class="pr-field-src">Project Dashboard</span></div>';
    }).join('');
    body.insertAdjacentHTML('beforeend', subhead('Tracked Items')+'<div class="pr-fields">'+rows+'</div>');
  });
}

const nameToKey = {'general info':null,'pf team':'pfTeam','contract info':'contract','engineering & design':'engineering','project safety':'safety','site readiness':'siteReadiness','equipment':'equipment','material':'material','qa / qc':'qaqc','project closeout':'closeout'};
const _norm = s => String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();

function checkProject(pnum, preseed){
  const dproj = DASH.projects.find(p=>String(p.projectNumber).trim().toLowerCase()===pnum.trim().toLowerCase());
  if(!dproj){ console.log('  no dashboard entry for',pnum); return {items:0,dropped:0}; }
  const dom=new JSDOM('<!DOCTYPE html><body><div id="root">'+buildRoot(preseed)+'</div></body>');
  const doc=dom.window.document;
  const root=doc.getElementById('root');
  // patch querySelectorAll insertAdjacentHTML available in jsdom natively
  runMerge(root, {project_number:pnum});

  let totalItems=0, dropped=0, dedupedBySeed=0;
  const report=[];
  dproj.sections.forEach(sec=>{
    const n=_norm(sec.name);
    const inMap = (n in nameToKey);
    (sec.items||[]).forEach(it=>{
      totalItems++;
      const lbl=_norm(it.label);
      // where should it be?
      let body;
      if(!inMap){ body=null; }
      else if(nameToKey[n]===null){ body=root.querySelector('.pr-card .pr-card-body'); }
      else { body=root.querySelector('.pr-card[data-pr-section="'+nameToKey[n]+'"] .pr-card-body'); }
      if(!body){ dropped++; report.push('DROPPED (no card): ['+sec.name+'] '+it.label); return; }
      // present as a merged item OR as a pre-seeded field with same label?
      const asMerged = Array.from(body.querySelectorAll('.pd-merge-item[data-pd-label]')).some(f=>_norm(f.getAttribute('data-pd-label'))===lbl);
      const asSeed   = Array.from(body.querySelectorAll('.pr-field[data-pr-label]')).some(f=>_norm(f.getAttribute('data-pr-label'))===lbl);
      if(!asMerged && !asSeed){ dropped++; report.push('DROPPED (not rendered): ['+sec.name+'] '+it.label); }
      else if(asSeed && !asMerged){ dedupedBySeed++; }
    });
  });
  // duplicate check: no label rendered twice within a card
  let dupes=0;
  root.querySelectorAll('.pr-card-body').forEach(body=>{
    const seen={};
    body.querySelectorAll('[data-pr-label],[data-pd-label]').forEach(f=>{
      const l=_norm(f.getAttribute('data-pr-label')||f.getAttribute('data-pd-label'));
      seen[l]=(seen[l]||0)+1;
    });
    Object.keys(seen).forEach(l=>{ if(seen[l]>1){dupes++; report.push('DUP in card: '+l+' x'+seen[l]);} });
  });
  console.log('  items='+totalItems+' dropped='+dropped+' dedupedAgainstSeed='+dedupedBySeed+' dupes='+dupes);
  report.forEach(r=>console.log('    '+r));
  return {items:totalItems,dropped,dupes};
}

console.log('== 26-002 POET (no pre-seed) ==');
const r1=checkProject('26-002',{});
console.log('== 26-002 POET (pre-seed some labels to test dedupe) ==');
// pre-seed a couple of real dashboard labels to prove dedupe (they must NOT double-render)
const poet=DASH.projects.find(p=>p.projectNumber==='26-002');
const seed={};
poet.sections.forEach(s=>{ if(s.items&&s.items.length){ seed[s.name]=[s.items[0].label]; }});
const r2=checkProject('26-002',seed);

// pick one other project
const other=DASH.projects.find(p=>p.projectNumber!=='26-002' && p.sections && p.sections.length);
console.log('== '+other.projectNumber+' '+other.name+' ==');
const r3=checkProject(other.projectNumber,{});

const totalDropped=r1.dropped+r2.dropped+r3.dropped;
const totalDupes=(r1.dupes||0)+(r2.dupes||0)+(r3.dupes||0);
console.log('\nRESULT: totalDropped='+totalDropped+' totalDupes='+totalDupes);
if(totalDropped>0){ console.log('FAIL: some items dropped'); process.exit(1); }
if(totalDupes>0){ console.log('FAIL: duplicate display'); process.exit(1); }
console.log('PASS: every dashboard item lands in its section card, deduped, none dropped.');
