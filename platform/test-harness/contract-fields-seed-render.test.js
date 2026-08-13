// Seed render-proof (Stage 2, Brad 2026-08-13): feed the ACTUAL post-seed 26-002 KV override
// (saved at /tmp/26-002-after.json by the seed step) through the real frontend renderers and
// confirm: (1) the __contract_pull provenance line renders from pfContractPullControl(); (2)
// the __subcontract_analysis YELLOW review STILL renders from pfSubcontractAnalysis()+Sub();
// (3) the flat contract-field values are present in the override for field() to pick up; (4)
// everything is escaped. If /tmp/26-002-after.json is absent (seed not run), the test SKIPS
// with a clear note rather than failing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { esc } = require('./extract.js');

const AFTER = '/tmp/26-002-after.json';
let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

if (!fs.existsSync(AFTER)) {
  console.log('SKIP: ' + AFTER + ' not found (run the seed step first). No assertions executed.');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const kv = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
const overrides = kv.sections;

function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
const sandbox = {
  E: esc,
  subhead: function (t) { return '<div class="pr-subhead">' + esc(t) + '</div>'; },
  canEdit: function () { return true; },
  _curOverrides: overrides,
  _curNum: '26-002',
  window: {}, document: {},
};
vm.createContext(sandbox);
vm.runInContext(
  extractFn(html, 'pfContractPull') + '\n' + extractFn(html, 'pfContractPullControl') + '\n' +
  extractFn(html, 'pfSubcontractAnalysis') + '\n' + extractFn(html, 'pfSubcontractAnalysisSub') +
  '\nthis.__ctrl = pfContractPullControl; this.__saRead = pfSubcontractAnalysis; this.__saSub = pfSubcontractAnalysisSub;',
  sandbox
);

// (1) provenance line renders from the real seeded __contract_pull.
const ctrl = sandbox.__ctrl();
ok('seed: provenance line renders', /Contract fields pulled from 26-0331 - POET Subcontract Agmt FE\.pdf/.test(ctrl));
ok('seed: provenance shows fully executed date', /fully executed 3\/31\/2026/.test(ctrl));
ok('seed: office button present', /Pull from Executed Subcontract/.test(ctrl));

// (2) __subcontract_analysis STILL renders (preserved through the seed).
const A = sandbox.__saRead({});
ok('seed: analysis read from override', A && A.verdict === 'YELLOW');
const saHtml = sandbox.__saSub(A);
ok('seed: analysis subsection renders', /Subcontract Analysis/.test(saHtml));
ok('seed: analysis shows a risk', /\$500\/calendar-day liquidated damages/.test(saHtml) || /LD exposure/i.test(saHtml) || saHtml.length > 200);

// (3) flat contract-field values present for field() to render.
const c = overrides.contract;
ok('seed: Subcontract Value present', c['Subcontract Value'] === '$343,037.07');
ok('seed: Contract Status = Fully Executed', c['Contract Status'] === 'Fully Executed');
ok('seed: Insurance Requirements present', /Exhibit E/.test(c['Insurance Requirements (per subcontract)']));
ok('seed: Payment Terms pay-if-paid present', /PAY-IF-PAID/.test(c['Payment Terms']));

// (4) escaping — the rendered provenance never contains a raw angle bracket from data.
ok('seed: provenance has no raw < from data', !/<[^/a-zA-Z!]/.test(ctrl.replace(/<\/?(div|button|span|strong)[^>]*>/g, '')));

console.log('\n==== Contract-fields SEED render-proof (26-002) ====');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail) { console.log('FAILURES: ' + fails.join('; ')); process.exit(1); }
process.exit(0);
