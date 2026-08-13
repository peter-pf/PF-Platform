// Stage 2 harness — "Pull from Executed Subcontract" contract-field wiring (Brad 2026-08-13).
// Proves:
//   (a) contract fields populate from a sample payload (flat fields keyed by exact labels).
//   (b) __subcontract_analysis + other reserved keys preserved on a contract-field/__contract_pull
//       write, AND vice-versa (writing analysis preserves contract fields + __contract_pull).
//   (c) office-only gating (field_ops POST => denied).
//   (d) provenance line renders from pfContractPullControl().
//   (e) escaping (every rendered value through E()).
// Plus cleanContractPull validator rules (enum-gate status, reject malformed, angle-strip).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWorker, makeKV, esc } = require('./extract.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const W = loadWorker();

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- request/post helpers (mirror reserved-keys-merge harness) ----
function req(body) {
  const t = JSON.stringify(body);
  return { headers: { get: (h) => (h === 'Content-Length' ? String(t.length) : null) }, async text() { return t; }, url: 'https://x/api/project-override' };
}
async function post(env, session, body) {
  const res = await W.onRequestPost({ request: req(body), env, data: { session } });
  if (res && res.__denied) return { status: 403, body: { denied: true } };
  return { status: res.status, body: await res.json() };
}
const OFFICE = { area: 'financials', name: 'Peter' };
const FIELD_OPS = { area: 'field_ops', name: 'Crew' };

// ---- extract the two new frontend functions into a sandbox ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
function buildFront(state) {
  const sandbox = {
    E: esc,
    canEdit: function () { return state.canEdit; },
    _curOverrides: state._curOverrides || {},
    _curNum: state._curNum || '',
    window: {},
    document: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    extractFn(html, 'pfContractPull') + '\n' + extractFn(html, 'pfContractPullControl') +
    '\nthis.__read = pfContractPull; this.__ctrl = pfContractPullControl;',
    sandbox
  );
  return { read: () => sandbox.__read(), ctrl: () => sandbox.__ctrl() };
}

(async () => {
  // ---------- (a) contract fields populate from a sample payload ----------
  {
    const env = { PF_SCHEDULE: makeKV() };
    const num = '26-002';
    // Load the proven POET payload and translate to the flat-field write the engine performs.
    const poet = JSON.parse(fs.readFileSync('/home/aiciv/fe-contract-fields/26-002.json', 'utf8'));
    const flat = {};
    for (const label of Object.keys(poet.payload)) flat[label] = poet.payload[label].value;
    flat['Contract Status'] = poet.contract_status;
    flat['__contract_pull'] = {
      source_doc: poet.source_document,
      fully_executed_date: '3/31/2026',
      contract_status: poet.contract_status,
      pulled_at: poet.pulled_at,
      status: 'pulled',
    };
    const r = await post(env, OFFICE, { num, section: 'contract', fields: flat });
    ok('(a) save ok', r.body && r.body.ok === true && r.body.saved === true);
    const c = r.body.sections.contract;
    ok('(a) Subcontract Value populated', c['Subcontract Value'] === '$343,037.07');
    ok('(a) Liquidated Damages populated', /500\.00 per CALENDAR DAY/.test(c['Liquidated Damages']));
    ok('(a) Retainage % Withheld populated', /^0% \(zero percent\)/.test(c['Retainage % Withheld']));
    ok('(a) Payment Terms populated (pay-if-paid)', /PAY-IF-PAID/.test(c['Payment Terms']));
    ok('(a) Fully Executed Contract Date populated', c['Fully Executed Contract Date'] === '3/31/2026');
    ok('(a) Insurance Requirements populated', /Exhibit E/.test(c['Insurance Requirements (per subcontract)']));
    ok('(a) Contract Status populated', c['Contract Status'] === 'Fully Executed');
    ok('(a) __contract_pull provenance stored', c.__contract_pull && c.__contract_pull.status === 'pulled');
    ok('(a) __contract_pull source_doc', c.__contract_pull.source_doc === poet.source_document);
    ok('(a) __contract_pull fully_executed_date', c.__contract_pull.fully_executed_date === '3/31/2026');
    // Only payload fields written — a field NOT in the payload is absent (untouched).
    ok('(a) unlisted contract field left untouched', !('Bonding Requirements' in c));
  }

  // ---------- (b) reserved-key preservation, both directions ----------
  {
    const env = { PF_SCHEDULE: makeKV() };
    const num = '26-999';
    // 1. Seed a manual contract field + the sibling __subcontract_analysis (the YELLOW review).
    await post(env, OFFICE, { num, section: 'contract', fields: {
      'Bonding Requirements': 'None required',
      '__subcontract_analysis': { verdict: 'YELLOW', summary: 'POET review', risks: ['pay-if-paid'] },
    }});
    // 2. Engine writes the contract fields + __contract_pull (NO analysis in this body).
    let r = await post(env, OFFICE, { num, section: 'contract', fields: {
      'Subcontract Value': '$343,037.07',
      '__contract_pull': { source_doc: 'POET FE.pdf', fully_executed_date: '3/31/2026', status: 'pulled' },
    }});
    let c = r.body.sections.contract;
    ok('(b) analysis preserved after contract-field+pull write', c.__subcontract_analysis && c.__subcontract_analysis.verdict === 'YELLOW');
    ok('(b) analysis risks preserved', Array.isArray(c.__subcontract_analysis.risks) && c.__subcontract_analysis.risks[0] === 'pay-if-paid');
    ok('(b) manual field preserved after pull write', c['Bonding Requirements'] === 'None required');
    ok('(b) new contract field written', c['Subcontract Value'] === '$343,037.07');
    ok('(b) __contract_pull written', c.__contract_pull && c.__contract_pull.status === 'pulled');
    // 3. Vice-versa: writing the analysis again must preserve the contract fields + __contract_pull.
    r = await post(env, OFFICE, { num, section: 'contract', fields: {
      '__subcontract_analysis': { verdict: 'GREEN', summary: 'executed clean' },
    }});
    c = r.body.sections.contract;
    ok('(b-v) analysis replaced to GREEN', c.__subcontract_analysis.verdict === 'GREEN');
    ok('(b-v) contract field survives analysis write', c['Subcontract Value'] === '$343,037.07');
    ok('(b-v) __contract_pull survives analysis write', c.__contract_pull && c.__contract_pull.status === 'pulled');
    ok('(b-v) manual field survives analysis write', c['Bonding Requirements'] === 'None required');
    // 4. A pure __contract_pull request-marker write (button) preserves everything else.
    r = await post(env, OFFICE, { num, section: 'contract', fields: {
      '__contract_pull': { status: 'requested', requested_at: 't1' },
    }});
    c = r.body.sections.contract;
    ok('(b-btn) request marker set', c.__contract_pull.status === 'requested');
    ok('(b-btn) analysis survives button request', c.__subcontract_analysis.verdict === 'GREEN');
    ok('(b-btn) contract field survives button request', c['Subcontract Value'] === '$343,037.07');
  }

  // ---------- cross-section: engineering reserved keys untouched by contract writes ----------
  {
    const env = { PF_SCHEDULE: makeKV() };
    const num = '26-777';
    await post(env, OFFICE, { num, section: 'engineering', fields: { '__submittal_pull': { status: 'pulled', pulled_at: 't0' } } });
    await post(env, OFFICE, { num, section: 'engineering', fields: { '__site_elevations': [{ id: 'a1', area: 'Bldg A' }] } });
    const r = await post(env, OFFICE, { num, section: 'contract', fields: {
      'Subcontract Value': '$1', '__contract_pull': { status: 'pulled', source_doc: 'x.pdf' },
    }});
    ok('(b-x) engineering __submittal_pull untouched by contract write', r.body.sections.engineering.__submittal_pull.status === 'pulled');
    ok('(b-x) engineering __site_elevations untouched by contract write', Array.isArray(r.body.sections.engineering.__site_elevations) && r.body.sections.engineering.__site_elevations[0].id === 'a1');
  }

  // ---------- (c) office-only gating ----------
  {
    const env = { PF_SCHEDULE: makeKV() };
    const num = '26-555';
    const denied = await post(env, FIELD_OPS, { num, section: 'contract', fields: { '__contract_pull': { status: 'requested' } } });
    ok('(c) field_ops POST denied (403)', denied.status === 403);
    // office allowed
    const okr = await post(env, OFFICE, { num, section: 'contract', fields: { '__contract_pull': { status: 'requested' } } });
    ok('(c) office POST allowed', okr.body && okr.body.saved === true);
  }

  // ---------- __contract_pull allowed-section gating ----------
  {
    const env = { PF_SCHEDULE: makeKV() };
    const bad = await post(env, OFFICE, { num: '26-444', section: 'engineering', fields: { '__contract_pull': { status: 'requested' } } });
    ok('(c) __contract_pull rejected on non-contract section (400)', bad.status === 400);
  }

  // ---------- cleanContractPull validator rules ----------
  {
    const cp = W.cleanContractPull;
    ok('(val) absent => {}', JSON.stringify(cp(null)) === '{}');
    ok('(val) array => reject(null)', cp([1, 2]) === null);
    ok('(val) unknown status => reject(null)', cp({ status: 'bogus' }) === null);
    ok('(val) valid requested passes', cp({ status: 'requested' }).status === 'requested');
    ok('(val) valid pulled passes', cp({ status: 'pulled' }).status === 'pulled');
    ok('(val) empty status passes', cp({ status: '' }).status === '');
    const cleaned = cp({ status: 'pulled', source_doc: '<b>x.pdf</b>', fully_executed_date: '3/31/2026' });
    ok('(val) angle brackets stripped from source_doc', cleaned.source_doc === 'bx.pdf/b');
    ok('(val) fully_executed_date preserved', cleaned.fully_executed_date === '3/31/2026');
    ok('(val) length cap on source_doc', cp({ status: 'pulled', source_doc: 'x'.repeat(9999) }).source_doc.length === 300);
  }

  // ---------- (d) provenance line renders + (e) escaping ----------
  {
    // pulled state, office
    let f = buildFront({ canEdit: true, _curNum: '26-002',
      _curOverrides: { contract: { __contract_pull: { status: 'pulled', source_doc: 'POET Subcontract Agmt FE.pdf', fully_executed_date: '3/31/2026' } } } });
    let out = f.ctrl();
    ok('(d) button label present (office)', /Pull from Executed Subcontract/.test(out));
    ok('(d) provenance line renders', /Contract fields pulled from POET Subcontract Agmt FE\.pdf/.test(out));
    ok('(d) provenance shows fully executed date', /fully executed 3\/31\/2026/.test(out));

    // requested state => pending button + note, no provenance line
    f = buildFront({ canEdit: true, _curNum: '26-002', _curOverrides: { contract: { __contract_pull: { status: 'requested', requested_at: 't0' } } } });
    out = f.ctrl();
    ok('(d) pending label when requested', /Pull requested…/.test(out));
    ok('(d) pending note when requested', /Peter is extracting from the executed subcontract/.test(out));

    // no pull yet, office => button present, no provenance
    f = buildFront({ canEdit: true, _curNum: '26-002', _curOverrides: {} });
    out = f.ctrl();
    ok('(d) button present with no pull', /Pull from Executed Subcontract/.test(out));
    ok('(d) no provenance line with no pull', !/Contract fields pulled from/.test(out));

    // field_ops (non-office): no button, but provenance line still shows if pulled
    f = buildFront({ canEdit: false, _curNum: '26-002', _curOverrides: { contract: { __contract_pull: { status: 'pulled', source_doc: 'POET FE.pdf', fully_executed_date: '3/31/2026' } } } });
    out = f.ctrl();
    ok('(d) no button for non-office', !/Pull from Executed Subcontract/.test(out) && !/<button/.test(out));
    ok('(d) provenance still visible for non-office when pulled', /Contract fields pulled from POET FE\.pdf/.test(out));

    // field_ops, no pull => empty string
    f = buildFront({ canEdit: false, _curNum: '26-002', _curOverrides: {} });
    ok('(d) empty for non-office with no pull', f.ctrl() === '');

    // (e) escaping — a malicious source_doc must be HTML-escaped, never raw.
    f = buildFront({ canEdit: true, _curNum: '<x>', _curOverrides: { contract: { __contract_pull: { status: 'pulled', source_doc: '<img src=x onerror=alert(1)>.pdf', fully_executed_date: '"><script>' } } } });
    out = f.ctrl();
    ok('(e) source_doc escaped (no raw <img)', !/<img src=x/.test(out) && /&lt;img src=x/.test(out));
    ok('(e) date escaped (no raw <script)', !/"><script>/.test(out) && /&quot;&gt;&lt;script&gt;/.test(out));
    ok('(e) _curNum escaped in data attr', !/data-cpull-num="<x>"/.test(out) && /data-cpull-num="&lt;x&gt;"/.test(out));
  }

  console.log('\n==== Contract-fields Pull (Stage 2) harness ====');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (fail) { console.log('FAILURES: ' + fails.join('; ')); process.exit(1); }
  process.exit(0);
})();
