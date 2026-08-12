// Simulate the POST merge block to prove the 3 reserved keys coexist and never wipe
// each other. Mirrors the exact logic in onRequestPost (project-override.js).
const CRM_KEY='__crm', PREREQ_KEY='__submittal_prereqs', CYCLES_KEY='__submittal_cycles';

function cleanFields(input){
  const out={}; if(!input||typeof input!=='object') return out;
  for(const k of Object.keys(input)){
    if(k===CRM_KEY||k===PREREQ_KEY||k===CYCLES_KEY) continue;
    out[k]=String(input[k]==null?'':input[k]);
  }
  return out;
}
// merge simulation given existing section + an incoming fields object
function merge(existing, incoming){
  const rawFieldsObj = incoming;
  const fields = cleanFields(rawFieldsObj);
  const hasCrm = Object.prototype.hasOwnProperty.call(rawFieldsObj, CRM_KEY);
  const hasPr  = Object.prototype.hasOwnProperty.call(rawFieldsObj, PREREQ_KEY);
  const hasCyc = Object.prototype.hasOwnProperty.call(rawFieldsObj, CYCLES_KEY);
  const crmUpdate = hasCrm ? rawFieldsObj[CRM_KEY] : undefined;
  const prUpdate  = hasPr  ? rawFieldsObj[PREREQ_KEY] : undefined;
  const cycUpdate = hasCyc ? rawFieldsObj[CYCLES_KEY] : undefined;
  const prevCrm = (existing[CRM_KEY] && typeof existing[CRM_KEY]==='object' && !Array.isArray(existing[CRM_KEY])) ? existing[CRM_KEY] : undefined;
  const prevPr  = (existing[PREREQ_KEY] && typeof existing[PREREQ_KEY]==='object' && !Array.isArray(existing[PREREQ_KEY])) ? existing[PREREQ_KEY] : undefined;
  const prevCyc = Array.isArray(existing[CYCLES_KEY]) ? existing[CYCLES_KEY] : undefined;
  const merged = Object.assign({}, existing, fields);
  if(crmUpdate!==undefined) merged[CRM_KEY]=crmUpdate; else if(prevCrm!==undefined) merged[CRM_KEY]=prevCrm; else delete merged[CRM_KEY];
  if(prUpdate!==undefined) merged[PREREQ_KEY]=prUpdate; else if(prevPr!==undefined) merged[PREREQ_KEY]=prevPr; else delete merged[PREREQ_KEY];
  if(cycUpdate!==undefined) merged[CYCLES_KEY]=cycUpdate; else if(prevCyc!==undefined) merged[CYCLES_KEY]=prevCyc; else delete merged[CYCLES_KEY];
  return merged;
}

let pass=0,fail=0; function ok(c,l){ if(c){pass++;} else {fail++; console.log('  FAIL: '+l);} }

// start: a section with prereqs + crm + a flat field
let existing = {
  'Some Field':'v',
  __crm: { Owner: { company:'X', contactIds:['C1'] } },
  __submittal_prereqs: { items: { a:{date_received:'2026-01-01'} } }
};
// 1. save CYCLES only -> prereqs + crm + flat field preserved, cycles added
let m1 = merge(existing, { __submittal_cycles: [ {rev:0, prereqs_sent:'p'} ] });
ok(Array.isArray(m1.__submittal_cycles) && m1.__submittal_cycles.length===1,'cycles added');
ok(m1.__crm && m1.__crm.Owner,'crm preserved on cycles save');
ok(m1.__submittal_prereqs && m1.__submittal_prereqs.items.a,'prereqs preserved on cycles save');
ok(m1['Some Field']==='v','flat field preserved on cycles save');

// 2. from that state, save PREREQS only -> cycles preserved
let m2 = merge(m1, { __submittal_prereqs: { items: { b:{date_received:'x'} } } });
ok(Array.isArray(m2.__submittal_cycles),'cycles preserved on prereqs save');
ok(m2.__submittal_prereqs.items.b && !m2.__submittal_prereqs.items.a,'prereqs whole-replaced');
ok(m2.__crm && m2.__crm.Owner,'crm still preserved');

// 3. save a FLAT field only -> all 3 reserved keys preserved
let m3 = merge(m2, { 'Another':'y' });
ok(m3['Another']==='y','flat added');
ok(Array.isArray(m3.__submittal_cycles),'cycles preserved on flat save');
ok(m3.__submittal_prereqs && m3.__crm,'prereqs+crm preserved on flat save');

// 4. save CYCLES whole-array-replace
let m4 = merge(m3, { __submittal_cycles: [ {rev:0}, {rev:1}, {rev:2} ] });
ok(m4.__submittal_cycles.length===3,'cycles whole-array replaced');
ok(Array.isArray(m4.__submittal_cycles),'cycles still array');
ok(m4.__submittal_prereqs && m4.__crm,'prereqs+crm survive cycles replace');

console.log('\nMERGE COEXISTENCE HARNESS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
