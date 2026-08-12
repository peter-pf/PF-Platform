import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('index.html', 'utf8');

function extractFn(name){
  const idx = html.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error('fn not found: ' + name);
  let i = html.indexOf('{', idx), depth = 0;
  for (; i < html.length; i++){
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0){ i++; break; } }
  }
  return html.slice(idx, i);
}

const fnNames = [
  'pfCycleLabel','pfSubmittalCycles','pfActiveCycleRev','pfCycleComputed',
  'submittalWorkflowBlock','pfSwfCycleReadHtml','computedHint','effVal','ovLookup',
  'pfParseDate','_pfMkDate','pfAddBusinessDays','_pf2','pfFmtDateObj','pfDesignSubmittalFolderRow',
  'subgroupNote','fields','pfSwfBuildArray','pfSwfToInputDate','canEdit'
];
let code = '';
for (const n of fnNames){ code += extractFn(n) + '\n'; }
const stMatch = html.match(/var PF_SUBMITTAL_STATUSES = \[[^\]]*\];/);
code += (stMatch ? stMatch[0] : 'var PF_SUBMITTAL_STATUSES=[];') + '\n';
code += 'var _curNum = "99-777";\n';
code += 'var _curOverrides = {};\n';
code += 'var _pfCycleView = {};\n';
code += 'var PF_OVERRIDE_LABEL_ALIASES = {};\n';
code += 'function __set(num, ov, view){ _curNum=num; _curOverrides=ov; _pfCycleView=view; }\n';
code += 'function __render(dsf){ return submittalWorkflowBlock(dsf); }\n';
code += 'function __cycles(){ return pfSubmittalCycles(); }\n';
code += 'function __computed(cy){ return pfCycleComputed(cy); }\n';
code += 'function __buildArr(rev,patch){ return pfSwfBuildArray(null, rev, patch); }\n';
code += 'function __toInput(v){ return pfSwfToInputDate(v); }\n';
code += 'function __label(n){ return pfCycleLabel(n); }\n';

const win = {};
win.pfFmtDate = (v)=>{
  const s = String(v==null?'':v).trim(); if(!s) return s;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return ('0'+m[2]).slice(-2)+'/'+('0'+m[3]).slice(-2)+'/'+m[1];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return ('0'+m[1]).slice(-2)+'/'+('0'+m[2]).slice(-2)+'/'+m[3];
  return s;
};
win.esc = (s)=> String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
win.PF_ME = { role: 'admin' };
const sandbox = {
  window: win,
  document: { getElementById: ()=>null },
  E: win.esc,
  esc2: win.esc,
  pfFmtDate: win.pfFmtDate,
  console, Number, String, Array, Math, isFinite, isNaN, parseInt, Date, Boolean, Object, RegExp
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'extracted.js' });

let pass=0, fail=0;
function ok(cond, label){ if(cond){pass++;} else {fail++; console.log('  FAIL: '+label);} }
const R = (fn,...a)=> vm.runInContext(`__${fn}`, sandbox).apply(null, a);
const set = (ov, view)=> vm.runInContext('__set', sandbox)('99-777', ov, view||{});
const render = (dsf)=> vm.runInContext('__render', sandbox)(dsf);
const cycles = ()=> vm.runInContext('__cycles', sandbox)();
const computed = (cy)=> vm.runInContext('__computed', sandbox)(cy);
function setRole(r){ win.PF_ME = { role: r }; }
function tabCount(out){ return (out.match(/class="pf-swf-tab(?:\s|")/g)||[]).length; }

// 1. labels
ok(R('label',0)==='Original','label 0');
ok(R('label',1)==='Rev1','label 1');
ok(R('label',3)==='Rev3','label 3');

// 2. MIGRATION: flat Stage-1 data -> Original cycle
set({ engineering: {
  'Date Submittal Prereqs Sent to GGG':'2026-08-03',
  'Actual Submittal Completion Date':'2026-09-01',
  'Date PF Submits to GC':'2026-08-05',
  'Submittal Status':'Revise & Resubmit'
}});
let cyc = cycles();
ok(cyc.length===1,'migration one cycle');
ok(cyc[0].rev===0,'migration rev 0');
ok(cyc[0].prereqs_sent==='2026-08-03','migration prereqs');
ok(cyc[0].actual_completion==='2026-09-01','migration actual');
ok(cyc[0].pf_submits_gc==='2026-08-05','migration pfgc');
ok(cyc[0].status==='Revise & Resubmit','migration status');

// 3. per-cycle computed (Original)
let c0 = computed(cyc[0]);
ok(c0.shopDueTxt==='08/24/2026','Original shopDue 08/24/2026 got '+c0.shopDueTxt);
ok(c0.gcDueTxt==='08/19/2026','Original gcDue 08/19/2026 got '+c0.gcDueTxt);

// 4. render Original (Revise + latest -> Start Rev1)
let out = render({ folder_url:'https://sp/x' });
ok(out.indexOf('pf-swf-wrap')>=0,'render wrap');
ok(out.indexOf('data-swf-rev="0"')>=0,'render active rev 0');
ok(tabCount(out)===1,'render one tab got '+tabCount(out));
ok(out.indexOf('>Original<')>=0,'render Original tab');
ok(out.indexOf('08/24/2026')>=0,'render shopDue');
ok(out.indexOf('08/19/2026')>=0,'render gcDue');
ok(out.indexOf('Email to Garbin needed')>=0,'render Revise flag');
ok(out.indexOf('pf-swf-startrev')>=0,'render Start Rev btn');
ok(out.indexOf('Start Rev1')>=0,'render Start Rev1 label');
ok(out.indexOf('pf-swf-edit')>=0,'render Edit btn');
ok(out.indexOf('Open folder')>=0,'render folder link');
ok(out.indexOf('data-pr-label=')<0,'render no .pr-field data-pr-label rows');

// 5. field_ops gating
setRole('field_ops');
let outFO = render({ folder_url:'' });
ok(outFO.indexOf('pf-swf-edit')<0,'field_ops no Edit');
ok(outFO.indexOf('pf-swf-startrev')<0,'field_ops no Start Rev');
ok(tabCount(outFO)===1,'field_ops still sees tabs');
setRole('admin');

// 6. stored array (Original + Rev1) -> default latest
set({ engineering: { __submittal_cycles: [
  { rev:0, prereqs_sent:'2026-08-03', actual_completion:'2026-08-10', pf_submits_gc:'2026-08-05', status:'Revise & Resubmit' },
  { rev:1, prereqs_sent:'2026-08-20', actual_completion:'', pf_submits_gc:'2026-08-24', status:'' }
]}});
cyc = cycles();
ok(cyc.length===2,'stored two cycles');
let outR = render({folder_url:''});
ok(tabCount(outR)===2,'stored two tabs got '+tabCount(outR));
ok(outR.indexOf('data-swf-rev="1"')>=0,'stored default latest Rev1');
ok(outR.indexOf('>Rev1<')>=0,'stored Rev1 tab');
let c1 = computed(cyc[1]);
ok(c1.shopDueTxt==='09/10/2026','Rev1 shopDue 09/10/2026 got '+c1.shopDueTxt);
ok(c1.gcDueTxt==='09/07/2026','Rev1 gcDue 09/07/2026 got '+c1.gcDueTxt);
ok(outR.indexOf('pf-swf-startrev')<0,'Rev1 empty status no Start Rev');

// 7. view preference -> Original
set({ engineering: { __submittal_cycles: [
  { rev:0, prereqs_sent:'2026-08-03', actual_completion:'2026-08-10', pf_submits_gc:'2026-08-05', status:'Revise & Resubmit' },
  { rev:1, prereqs_sent:'2026-08-20', actual_completion:'', pf_submits_gc:'2026-08-24', status:'' }
]}}, { '99-777': 0 });
let outV = render({folder_url:''});
ok(outV.indexOf('data-swf-rev="0"')>=0,'view pref Original active');
ok(outV.indexOf('pf-swf-startrev')<0,'Original not latest: no Start Rev');
ok(outV.indexOf('08/24/2026')>=0,'view Original own shopDue');

// 8. buildArray patches only edited cycle
let arr = R('buildArr', 1, { prereqs_sent:'2026-09-01', actual_completion:'2026-09-05', pf_submits_gc:'2026-09-03', status:'Approved / Reviewed' });
ok(arr.length===2,'buildArray length');
ok(arr[0].prereqs_sent==='2026-08-03','buildArray cycle0 untouched');
ok(arr[1].prereqs_sent==='2026-09-01' && arr[1].status==='Approved / Reviewed','buildArray cycle1 patched');

// 9. toInputDate
ok(R('toInput','2026-08-03')==='2026-08-03','toInput ISO');
ok(R('toInput','8/3/2026')==='2026-08-03','toInput MMDDYYYY');
ok(R('toInput','')==='','toInput blank');

// 10. blank cycle placeholder + hint fallback
set({ engineering: { __submittal_cycles: [ { rev:0, prereqs_sent:'', actual_completion:'', pf_submits_gc:'', status:'' } ] }});
let outB = render({folder_url:''});
ok(outB.indexOf('pf-swf-blank')>=0,'blank placeholder class');
ok(outB.indexOf('computed as 15 business days')>=0,'blank computed hint fallback');
ok(outB.indexOf('pf-swf-startrev')<0,'blank status no Start Rev');

console.log('\nRENDER/LOGIC HARNESS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
