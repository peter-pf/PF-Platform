import fs from 'fs';
import vm from 'vm';

// Extract the module's helper fns (cleanCycles, cleanPrereqs, cleanCrm, cleanFields, s)
// and the merge constants, into a sandbox — the file imports ../lib/auth.js which we
// don't need for validator-level tests, so we extract the relevant functions verbatim.
const src = fs.readFileSync('functions/api/project-override.js','utf8');
function extractFn(name){
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error('fn not found '+name);
  let i = src.indexOf('{', idx), depth=0;
  for(; i<src.length; i++){ const c=src[i]; if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0){i++;break;}} }
  return src.slice(idx, i);
}
function grabConst(re){ const m = src.match(re); return m ? m[0] : ''; }
let code = '';
// constants used by cleanCycles + s()
['CYCLES_MAX','CYCLES_MAX_DATE','CYCLES_MAX_STATUS'].forEach(n=>{
  code += grabConst(new RegExp('const '+n+' = [^;]*;')) + '\n';
});
code += extractFn('s') + '\n';
code += extractFn('cleanCycles') + '\n';

const sandbox = { Number, String, Array, Object }; 
vm.createContext(sandbox);
vm.runInContext(code + '\nthis.cleanCycles = cleanCycles;', sandbox);
const cleanCycles = sandbox.cleanCycles;

let pass=0, fail=0;
function ok(c,l){ if(c){pass++;} else {fail++; console.log('  FAIL: '+l);} }

// absent -> []
ok(JSON.stringify(cleanCycles(null))==='[]','null -> []');
ok(JSON.stringify(cleanCycles(undefined))==='[]','undefined -> []');
// non-array -> null (reject whole save)
ok(cleanCycles({})===null,'object -> null');
ok(cleanCycles('x')===null,'string -> null');
// valid array normalized
let r = cleanCycles([
  { rev:0, prereqs_sent:'2026-08-03', actual_completion:'2026-09-01', pf_submits_gc:'2026-08-05', status:'Revise & Resubmit' },
  { rev:1, prereqs_sent:'2026-08-20', actual_completion:'', pf_submits_gc:'2026-08-24', status:'' }
]);
ok(Array.isArray(r) && r.length===2,'valid 2 cycles');
ok(r[0].rev===0 && r[1].rev===1,'revs preserved');
ok(r[0].status==='Revise & Resubmit','status kept');
// positional rev fallback when rev missing/invalid
let r2 = cleanCycles([ { prereqs_sent:'a' }, { rev:-3, prereqs_sent:'b' } ]);
ok(r2[0].rev===0 && r2[1].rev===1,'positional rev fallback');
// angle brackets stripped
let r3 = cleanCycles([ { rev:0, status:'<script>x' } ]);
ok(r3[0].status.indexOf('<')<0 && r3[0].status.indexOf('>')<0,'angle brackets stripped');
// bad entry (array element not object) -> null
ok(cleanCycles([ 5 ])===null,'non-object entry -> null');
ok(cleanCycles([ [] ])===null,'array entry -> null');
ok(cleanCycles([ null ])===null,'null entry -> null');
// over cap -> null
let big = []; for(let i=0;i<61;i++) big.push({rev:i});
ok(cleanCycles(big)===null,'over cap (61) -> null');
let okCount = []; for(let i=0;i<60;i++) okCount.push({rev:i});
ok(Array.isArray(cleanCycles(okCount)) && cleanCycles(okCount).length===60,'60 at cap -> ok');
// only the 5 known keys survive (no arbitrary key leak)
let r4 = cleanCycles([ { rev:0, evil:'x', prereqs_sent:'p' } ]);
ok(!('evil' in r4[0]),'unknown key dropped');
ok(Object.keys(r4[0]).sort().join(',')==='actual_completion,pf_submits_gc,prereqs_sent,rev,status','exact key set');
// length cap on date string
let long = 'x'.repeat(100);
let r5 = cleanCycles([ { rev:0, prereqs_sent: long } ]);
ok(r5[0].prereqs_sent.length===40,'date capped to 40');

console.log('\nBACKEND VALIDATOR HARNESS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
