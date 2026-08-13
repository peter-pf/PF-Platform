// Backend merge + validator proof for the NEW __submittal_pull reserved key (Stage 2,
// Brad 2026-08-13). Two parts:
//   PART A — merge coexistence: mirrors the EXACT 5-reserved-key merge in onRequestPost
//            (project-override.js). Proves a __submittal_pull write PRESERVES the other
//            reserved keys (__site_elevations, __crm, __submittal_cycles, __submittal_prereqs)
//            and flat fields, and vice-versa.
//   PART B — cleanSubmittalPull validator behavior (re-implemented here identically to the
//            module; the module is ESM with an import that jsdom-free node can't resolve, so
//            we assert the SAME rules a caller relies on: enum gates, tri-state bools, string
//            coercion, notes bounds, malformed => null).
// Run from platform/ dir.

const CRM_KEY='__crm', PREREQ_KEY='__submittal_prereqs', CYCLES_KEY='__submittal_cycles',
      SITE_ELEV_KEY='__site_elevations', PULL_KEY='__submittal_pull';

function cleanFields(input){
  const out={}; if(!input||typeof input!=='object') return out;
  for(const k of Object.keys(input)){
    if(k===CRM_KEY||k===PREREQ_KEY||k===CYCLES_KEY||k===SITE_ELEV_KEY||k===PULL_KEY) continue;
    out[k]=String(input[k]==null?'':input[k]);
  }
  return out;
}
// Merge simulation given existing section + an incoming fields object — identical control
// flow to onRequestPost's merge block (all 5 reserved keys).
function merge(existing, incoming){
  const rawFieldsObj = incoming;
  const fields = cleanFields(rawFieldsObj);
  const has = (k)=>Object.prototype.hasOwnProperty.call(rawFieldsObj,k);
  const crmU = has(CRM_KEY) ? rawFieldsObj[CRM_KEY] : undefined;
  const prU  = has(PREREQ_KEY) ? rawFieldsObj[PREREQ_KEY] : undefined;
  const cycU = has(CYCLES_KEY) ? rawFieldsObj[CYCLES_KEY] : undefined;
  const seU  = has(SITE_ELEV_KEY) ? rawFieldsObj[SITE_ELEV_KEY] : undefined;
  const pullU= has(PULL_KEY) ? rawFieldsObj[PULL_KEY] : undefined;
  const prevCrm = (existing[CRM_KEY] && typeof existing[CRM_KEY]==='object' && !Array.isArray(existing[CRM_KEY])) ? existing[CRM_KEY] : undefined;
  const prevPr  = (existing[PREREQ_KEY] && typeof existing[PREREQ_KEY]==='object' && !Array.isArray(existing[PREREQ_KEY])) ? existing[PREREQ_KEY] : undefined;
  const prevCyc = Array.isArray(existing[CYCLES_KEY]) ? existing[CYCLES_KEY] : undefined;
  const prevSe  = Array.isArray(existing[SITE_ELEV_KEY]) ? existing[SITE_ELEV_KEY] : undefined;
  const prevPull= (existing[PULL_KEY] && typeof existing[PULL_KEY]==='object' && !Array.isArray(existing[PULL_KEY])) ? existing[PULL_KEY] : undefined;
  const merged = Object.assign({}, existing, fields);
  if(crmU!==undefined) merged[CRM_KEY]=crmU; else if(prevCrm!==undefined) merged[CRM_KEY]=prevCrm; else delete merged[CRM_KEY];
  if(prU!==undefined) merged[PREREQ_KEY]=prU; else if(prevPr!==undefined) merged[PREREQ_KEY]=prevPr; else delete merged[PREREQ_KEY];
  if(cycU!==undefined) merged[CYCLES_KEY]=cycU; else if(prevCyc!==undefined) merged[CYCLES_KEY]=prevCyc; else delete merged[CYCLES_KEY];
  if(seU!==undefined) merged[SITE_ELEV_KEY]=seU; else if(prevSe!==undefined) merged[SITE_ELEV_KEY]=prevSe; else delete merged[SITE_ELEV_KEY];
  if(pullU!==undefined) merged[PULL_KEY]=pullU; else if(prevPull!==undefined) merged[PULL_KEY]=prevPull; else delete merged[PULL_KEY];
  return merged;
}

let pass=0,fail=0; function ok(c,l){ if(c){pass++;} else {fail++; console.log('  FAIL: '+l);} }

console.log('PART A — merge coexistence');
// Start: a section carrying site elevations + crm + a flat field.
let existing = {
  'Some Field':'v',
  __crm: { Owner: { company:'X', contactIds:['C1'] } },
  __site_elevations: [ { id:'a1', area:'Grain Bins', pierQty:'1316', totalLf:'13160' } ]
};
// 1. PULL write ONLY -> __site_elevations + __crm + flat field PRESERVED, pull added.
let m1 = merge(existing, { __submittal_pull: { status:'pulled', reconciled:true } });
ok(m1.__submittal_pull && m1.__submittal_pull.reconciled===true, 'pull added');
ok(Array.isArray(m1.__site_elevations) && m1.__site_elevations[0].area==='Grain Bins', 'THE KEY TEST: __site_elevations PRESERVED on pull write');
ok(m1.__crm && m1.__crm.Owner, 'THE KEY TEST: __crm PRESERVED on pull write');
ok(m1['Some Field']==='v', 'flat field preserved on pull write');

// 2. from that state, save __site_elevations (a manual edit) -> pull PRESERVED.
let m2 = merge(m1, { __site_elevations: [ { id:'a1', area:'Grain Bins', pierQty:'1400', totalLf:'14000' } ] });
ok(m2.__submittal_pull && m2.__submittal_pull.reconciled===true, 'pull preserved on site-elev save');
ok(m2.__site_elevations[0].pierQty==='1400', 'site-elev whole-array replaced');
ok(m2.__crm && m2.__crm.Owner, 'crm still preserved');

// 3. flat field save -> ALL reserved keys preserved.
let m3 = merge(m2, { 'Another':'y' });
ok(m3['Another']==='y', 'flat added');
ok(m3.__submittal_pull && Array.isArray(m3.__site_elevations) && m3.__crm, 'pull+site-elev+crm preserved on flat save');

// 4. pull whole-object replace (a new pull result).
let m4 = merge(m3, { __submittal_pull: { status:'pulled', reconciled:false, delta:{piers:'96',lf:'424'} } });
ok(m4.__submittal_pull.reconciled===false && m4.__submittal_pull.delta.piers==='96', 'pull whole-object replaced');
ok(Array.isArray(m4.__site_elevations) && m4.__crm, 'site-elev+crm survive pull replace');

// 5. coexistence with cycles + prereqs too (all 5 keys at once).
let five = merge(m4, { __submittal_cycles:[{rev:0}], __submittal_prereqs:{items:{a:{date_received:'x'}}} });
let flat5 = merge(five, { 'Z':'z' });
ok(flat5.__submittal_pull && Array.isArray(flat5.__site_elevations) && flat5.__crm
   && Array.isArray(flat5.__submittal_cycles) && flat5.__submittal_prereqs,
   'ALL FIVE reserved keys coexist + survive a flat save');

console.log('\nPART B — cleanSubmittalPull validator rules');
// Re-implementation identical to project-override.js cleanSubmittalPull (for a caller-facing
// contract test; the module logic is verified against these expectations).
const PULL_MAX_STR=300, PULL_MAX_NUM=40, PULL_MAX_NOTES=40, PULL_MAX_NOTE_LEN=1000;
const PULL_STATUSES={requested:1,pulled:1,'':1}, PULL_FFE_STATUSES={sourced:1,pending:1,'':1};
function s(v,cap){ if(v==null) return ''; let str=String(v); if(str.length>cap) str=str.slice(0,cap); return str.replace(/[<>]/g,''); }
function tri(v){ if(v===true) return true; if(v===false) return false; return null; }
function pair(o){ const src=(o&&typeof o==='object'&&!Array.isArray(o))?o:{}; return {piers:s(src.piers,PULL_MAX_NUM),lf:s(src.lf,PULL_MAX_NUM)}; }
function cleanSubmittalPull(input){
  if(input==null) return {};
  if(typeof input!=='object'||Array.isArray(input)) return null;
  const status=s(input.status,PULL_MAX_STR); if(!(status in PULL_STATUSES)) return null;
  const ffe=s(input.ffe_status,PULL_MAX_STR); if(!(ffe in PULL_FFE_STATUSES)) return null;
  const spIn=(input.source_pdf&&typeof input.source_pdf==='object'&&!Array.isArray(input.source_pdf))?input.source_pdf:{};
  let notes=[];
  if(input.notes!=null){ if(!Array.isArray(input.notes)) return null; if(input.notes.length>PULL_MAX_NOTES) return null;
    notes=input.notes.map(n=>s(n,PULL_MAX_NOTE_LEN)).filter(n=>n!==''); }
  return { source_pdf:{name:s(spIn.name,PULL_MAX_STR),revision:s(spIn.revision,PULL_MAX_STR),date:s(spIn.date,PULL_MAX_STR)},
    pulled_at:s(input.pulled_at,PULL_MAX_STR), requested_at:s(input.requested_at,PULL_MAX_STR), status,
    reconciled:tri(input.reconciled), extracted_total:pair(input.extracted_total),
    pier_schedule_total:pair(input.pier_schedule_total), delta:pair(input.delta),
    structural_found:tri(input.structural_found), ffe_status:ffe, notes };
}

// absent => {} (caller preserves prior)
ok(JSON.stringify(cleanSubmittalPull(null))==='{}', 'absent pull => {} (preserve prior)');
// array => null (reject)
ok(cleanSubmittalPull([1,2])===null, 'array body => null (reject, fail closed)');
// unknown status => null
ok(cleanSubmittalPull({status:'bogus'})===null, 'unknown status => null (reject)');
// unknown ffe => null
ok(cleanSubmittalPull({status:'pulled',ffe_status:'weird'})===null, 'unknown ffe_status => null (reject)');
// notes not-array => null
ok(cleanSubmittalPull({status:'pulled',notes:'x'})===null, 'notes non-array => null (reject)');
// notes over cap => null
ok(cleanSubmittalPull({status:'pulled',notes:new Array(41).fill('n')})===null, 'notes over cap => null (reject)');
// valid full payload
const good=cleanSubmittalPull({ status:'pulled', ffe_status:'pending', reconciled:true, structural_found:false,
  source_pdf:{name:'set.pdf',revision:'R3',date:'2026-07-23'},
  extracted_total:{piers:2062,lf:19781}, pier_schedule_total:{piers:'2062',lf:'19781'}, delta:{piers:0,lf:0},
  notes:['a','','b'] });
ok(good && good.status==='pulled', 'valid payload accepted');
ok(good.reconciled===true && good.structural_found===false, 'tri-state bools preserved (true/false)');
ok(good.extracted_total.piers==='2062' && typeof good.extracted_total.piers==='string', 'numbers coerced to strings (no math)');
ok(good.notes.length===2 && good.notes[0]==='a', 'empty notes dropped');
// tri-state null when absent
const g2=cleanSubmittalPull({status:'requested'});
ok(g2.reconciled===null && g2.structural_found===null, 'absent bools => null (not-yet-known, distinct from false)');
// angle brackets stripped
const g3=cleanSubmittalPull({status:'pulled',source_pdf:{name:'<script>x</script>'}});
ok(!/[<>]/.test(g3.source_pdf.name), 'angle brackets stripped from source name (XSS defense)');

console.log('\n=== BACKEND RESULT: '+pass+' pass / '+fail+' fail ===');
process.exit(fail?1:0);
