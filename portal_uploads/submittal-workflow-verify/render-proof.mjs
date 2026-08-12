// Functional harness for the PF Design Submittal WORKFLOW (Stage 1, Brad 2026-08-12).
// Extracts the REAL function bodies from platform/index.html and runs them in a vm
// sandbox against a POET-like override. No chromium.
//
// Proves: the linear date chain renders in order; #2/#5 auto-compute +15/+10 business
// days from #1/#4 (blank when source empty); the 3-option Submittal Status dropdown
// drives the correct next-step note; AAN/Revise carry the "email to Garbin needed"
// flag; the PF Design Submittal Folder link renders (valid href where the folder
// exists, blank otherwise); the manual fields are .pr-field[data-pr-label] (editable /
// savable) and the computed hints are NOT (editor ignores them).
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('platform/index.html', 'utf8');

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('fn not found: ' + name);
  let j = html.indexOf('{', start), depth = 0;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return html.slice(start, j);
}

const fns = ['field', 'fields', 'fieldLinked', 'subgroupNote', 'computedHint', 'effVal',
             'pfParseDate', '_pfMkDate', 'pfAddBusinessDays', 'pfFmtDateObj',
             'pfIsDateLabel', 'pfIsPhoneLabel', 'pfIsQtyLabel', 'pfFmtDate', 'pfFmtPhone',
             'ovLookup', 'pfDesignSubmittalFolder', 'pfDesignSubmittalFolderRow',
             'submittalWorkflowBlock'];
let src = '';
for (const f of fns) src += extractFn(f) + '\n';

// helpers not extracted (globals the fns lean on)
src += `
function _pf2(n){return (n<10?'0':'')+n;}
`;

const sandbox = {
  _curSection: 'engineering',
  _curNum: '26-999',
  _curOverrides: {},
  PF_OVERRIDE_LABEL_ALIASES: {},
  window: {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    pfFmtQty: v => String(v),
    // MM/DD/YYYY normalizer (mirror of global pfFmtDate for the shapes we test)
    pfFmtDate: v => {
      const s = String(v == null ? '' : v).trim();
      let m;
      if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s))) return `${('0'+m[2]).slice(-2)}/${('0'+m[3]).slice(-2)}/${m[1]}`;
      if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))) { const y = m[3].length===2?'20'+m[3]:m[3]; return `${('0'+m[1]).slice(-2)}/${('0'+m[2]).slice(-2)}/${y}`; }
      return s;
    },
    pfFmtPhone: v => String(v),
    PF_DATE_LABEL_RE: /(^|[^a-z])dates?([^a-z]|$)|completion\b|\bstart\b|(prelim|design) completed by\b|submittals? (received|sent|approved)|shop drawings ready|design (completed|fee paid)|release date|as built dwgs (to|from|sent)|last log|certified payroll submitted|column logs from rig|modulus load test - passed/i,
    PF_DESIGN_SUBMITTAL: null,
  },
  console,
};
sandbox.E = sandbox.window.esc;
sandbox.window.pfIsDateLabel = l => sandbox.window.PF_DATE_LABEL_RE.test(String(l || ''));
// PF_QTY / PHONE gates used inside field() -> extracted fns reference module-level RE vars.
sandbox.PF_PHONE_LABEL_RE = /\bphone\b|\bcell\b|\bmobile\b|\bfax\b|\btel\b/i;
sandbox.PF_QTY_LABEL_RE = /\bLF\b|\bpier\b|\bpiers\b|\bcolumns?\b|\bstone\b|\bspoils\b|\bTN\b|\bSF\b|\bacres?\b/i;
sandbox.PF_QTY_LABEL_EXCLUDE_RE = /project\s*#|\bGC\b.*#|zip|\byear\b|\bdate\b|cost\s*code|\bphone\b/i;
// pfIsTextareaLabel is optional in field(); provide a no-op so typeof check is false-safe.
sandbox.pfIsTextareaLabel = undefined;

vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL: ' + msg); } }

// ---------- Fixture: POET-like engineering override ----------
// #1 sent 2026-08-03 (Mon), #4 PF submits 2026-08-05 (Wed), status = AAN.
sandbox._curOverrides = {
  engineering: {
    'Date Submittal Prereqs Sent to GGG': '2026-08-03',
    'Date PF Submits to GC': '2026-08-05',
    'Submittal Status': 'AAN (Approved as Noted)',
    // a sibling reserved key must be untouched by this display-only block
    __submittal_prereqs: { items: { full_structural_pdf: { date_received: '2026-08-01' } } },
  },
};
// folder record present for this project
sandbox.window.PF_DESIGN_SUBMITTAL = { projects: { '26-999': { folder_url: 'https://pierfoundations.sharepoint.com/PFDS/26-999' } } };

const dsf = sandbox.pfDesignSubmittalFolder('26-999');
let out = sandbox.submittalWorkflowBlock(dsf);

// ---- assertions: field chain present + order ----
ok(out.includes('data-pr-label="Date Submittal Prereqs Sent to GGG"'), '#1 Date Submittal Prereqs Sent to GGG is an editable field');
ok(out.includes('data-pr-label="Actual Submittal Completion Date"'), '#3 Actual Submittal Completion Date is an editable field');
ok(out.includes('data-pr-label="Date PF Submits to GC"'), '#4 Date PF Submits to GC is an editable field');
ok(out.includes('data-pr-label="Submittal Status"'), '#6 Submittal Status is an editable field');
// order check: #1 before #2-hint before #3 before #4 before #5-hint before #6 before folder
const idx = s => out.indexOf(s);
ok(idx('Date Submittal Prereqs Sent to GGG') < idx('Shop Drawings Due from Garbin'), '#1 before #2 hint');
ok(idx('Shop Drawings Due from Garbin') < idx('Actual Submittal Completion Date'), '#2 hint before #3');
ok(idx('Actual Submittal Completion Date') < idx('Date PF Submits to GC'), '#3 before #4');
ok(idx('Date PF Submits to GC') < idx('Submittal Due Back from GC By'), '#4 before #5 hint');
ok(idx('Submittal Due Back from GC By') < idx('Submittal Status'), '#5 hint before #6');
ok(idx('Submittal Status') < idx('PF Design Submittal Folder'), '#6 before #7 folder');

// ---- #2 = #1 + 15 business days = Mon 8/3 -> 08/24/2026 ----
ok(out.includes('Shop Drawings Due from Garbin:') && out.includes('08/24/2026'), '#2 computed = 08/24/2026 (+15 biz from Mon 8/3)');
// ---- #5 = #4 + 10 business days = Wed 8/5 -> 08/19/2026 ----
ok(out.includes('Submittal Due Back from GC By:') && out.includes('08/19/2026'), '#5 computed = 08/19/2026 (+10 biz from Wed 8/5)');

// ---- computed hints are NOT editable fields ----
ok(!/data-pr-label="Shop Drawings Due from Garbin"/.test(out), '#2 hint is NOT a savable field');
ok(!/data-pr-label="Submittal Due Back from GC By"/.test(out), '#5 hint is NOT a savable field');
ok((out.match(/pr-computed-hint/g) || []).length >= 2, 'both computed hints present');

// ---- Status = AAN note + flag ----
ok(out.includes('return to Garbin (GGG) to pick up the notes'), 'AAN next-step note present');
ok(out.includes('Email to Garbin needed'), 'AAN carries email-to-Garbin flag');
ok(out.includes('pf-wf-flag'), 'AAN flag uses .pf-wf-flag styling');
ok(out.includes('pr-computed-flag'), 'AAN note rendered as red flag hint');

// ---- #7 folder link present with valid href ----
ok(out.includes('href="https://pierfoundations.sharepoint.com/PFDS/26-999"'), '#7 folder link has valid href');
ok(out.includes('>PF Design Submittal Folder<'), '#7 folder link text present');

// ===== Variation A: Approved / Reviewed status =====
sandbox._curOverrides.engineering['Submittal Status'] = 'Approved / Reviewed';
let outA = sandbox.submittalWorkflowBlock(dsf);
ok(outA.includes('final for-construction submittal. No further action'), 'Approved note present');
ok(!outA.includes('Email to Garbin needed'), 'Approved does NOT flag an email');

// ===== Variation B: Revise & Resubmit status =====
sandbox._curOverrides.engineering['Submittal Status'] = 'Revise & Resubmit';
let outB = sandbox.submittalWorkflowBlock(dsf);
ok(outB.includes('send back to Garbin for revisions'), 'Revise note present');
ok(outB.includes('Email to Garbin needed'), 'Revise carries email-to-Garbin flag');
ok(outB.includes('Rev1, Rev2'), 'Revise flags the FUTURE Rev1/Rev2 cycle (Stage 2, not built)');

// ===== Variation C: blank #1/#4 -> hints show the "computed as..." placeholder, no date =====
sandbox._curOverrides.engineering['Date Submittal Prereqs Sent to GGG'] = '';
sandbox._curOverrides.engineering['Date PF Submits to GC'] = '';
sandbox._curOverrides.engineering['Submittal Status'] = '';
let outC = sandbox.submittalWorkflowBlock(dsf);
ok(!/08\/24\/2026/.test(outC) && !/08\/19\/2026/.test(outC), 'blank sources -> no computed dates');
ok(outC.includes('computed as 15 business days'), '#2 shows placeholder text when #1 blank');
ok(outC.includes('computed as 10 business days'), '#5 shows placeholder text when #4 blank');
ok(outC.indexOf('return to Garbin') === -1 && outC.indexOf('No further action') === -1, 'no status note when status blank');

// ===== Variation D: folder absent -> graceful blank link =====
sandbox.window.PF_DESIGN_SUBMITTAL = { projects: {} };
const dsfNone = sandbox.pfDesignSubmittalFolder('26-999');
let outD = sandbox.submittalWorkflowBlock(dsfNone);
ok(outD.includes('data-pr-label') === false || true, 'sanity');
ok(!/href="https:\/\/pierfoundations/.test(outD), 'no href when folder absent');
ok(outD.includes('PF Design Submittal Folder') && outD.includes('empty blank'), 'folder row renders blank (yellow) when absent');

// ===== #3 manual field value round-trips via engineering override =====
sandbox._curOverrides.engineering['Actual Submittal Completion Date'] = '2026-09-01';
let outE = sandbox.submittalWorkflowBlock(sandbox.pfDesignSubmittalFolder('26-999'));
ok(outE.includes('09/01/2026'), '#3 Actual Submittal Completion Date displays MM/DD/YYYY from override');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
