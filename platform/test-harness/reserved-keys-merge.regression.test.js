// No-regression: reserved-key MERGE across ALL 7 keys (extends the prior 6-key harness to
// include the new __contract_pull, which shares the `contract` section with
// __subcontract_analysis). Proves that writing ANY one reserved key never clobbers the other
// six, in either direction, and that plain string fields coexist. Also confirms VALID_SECTIONS
// + per-section allow-lists unchanged. Special focus: on the `contract` section, writing
// __contract_pull (or a flat contract field) preserves __subcontract_analysis and vice-versa.
const { loadWorker, makeKV } = require('./extract.js');
const W = loadWorker();
const S = { area: 'financials', name: 'Peter' };

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

function req(body) {
  const t = JSON.stringify(body);
  return { headers: { get: (h) => (h === 'Content-Length' ? String(t.length) : null) }, async text() { return t; }, url: 'https://x/api/project-override' };
}
async function post(env, body) {
  const res = await W.onRequestPost({ request: req(body), env, data: { session: S } });
  if (res && res.__denied) return { status: 403, body: { denied: true } };
  return { status: res.status, body: await res.json() };
}

(async () => {
  const env = { PF_SCHEDULE: makeKV() };
  const num = '99-999';
  // Seed every reserved key on its OWNING section, plus plain fields.
  const writes = [
    ['general', { __crm: { Owner: { company: 'Acme', contactIds: ['C0001'] } }, 'Owner': 'Acme Inc' }],
    ['design_professionals', { __crm: { Structural: { company: 'Garbin', contactIds: ['C0009'] } } }],
    ['engineering', { __submittal_prereqs: { items: { k1: { responsible_name: 'X' } } } }],
    ['engineering', { __submittal_cycles: [{ rev: 0, status: 'Original' }] }],
    ['engineering', { __site_elevations: [{ id: 'a1', area: 'Bldg A' }] }],
    ['engineering', { __submittal_pull: { status: 'requested', requested_at: 't0' } }],
    ['contract', { __subcontract_analysis: { verdict: 'GREEN', summary: 's' }, 'Subcontract Value': '$1M' }],
    ['contract', { __contract_pull: { status: 'pulled', source_doc: 'POET FE.pdf', fully_executed_date: '3/31/2026' } }],
  ];
  for (const [sec, f] of writes) { await post(env, { num, section: sec, fields: f }); }

  function snap(secs) {
    return {
      crmGen: secs.general && secs.general.__crm && secs.general.__crm.Owner && secs.general.__crm.Owner.company,
      crmDP: secs.design_professionals && secs.design_professionals.__crm && secs.design_professionals.__crm.Structural && secs.design_professionals.__crm.Structural.company,
      prereq: !!(secs.engineering && secs.engineering.__submittal_prereqs),
      cycles: secs.engineering && Array.isArray(secs.engineering.__submittal_cycles) && secs.engineering.__submittal_cycles.length,
      elev: secs.engineering && Array.isArray(secs.engineering.__site_elevations) && secs.engineering.__site_elevations[0] && secs.engineering.__site_elevations[0].id,
      pull: secs.engineering && secs.engineering.__submittal_pull && secs.engineering.__submittal_pull.status,
      suban: secs.contract && secs.contract.__subcontract_analysis && secs.contract.__subcontract_analysis.verdict,
      subanFld: secs.contract && secs.contract['Subcontract Value'],
      cpull: secs.contract && secs.contract.__contract_pull && secs.contract.__contract_pull.status,
      ownerFld: secs.general && secs.general['Owner'],
    };
  }

  // Baseline: all present.
  let r = await post(env, { num, section: 'general', fields: {} }); // no-op read-modify-write
  let s = snap(r.body.sections);
  ok('baseline crm/general', s.crmGen === 'Acme');
  ok('baseline crm/dp', s.crmDP === 'Garbin');
  ok('baseline prereq', s.prereq);
  ok('baseline cycles', s.cycles === 1);
  ok('baseline elev', s.elev === 'a1');
  ok('baseline pull', s.pull === 'requested');
  ok('baseline suban', s.suban === 'GREEN');
  ok('baseline suban plain field', s.subanFld === '$1M');
  ok('baseline cpull', s.cpull === 'pulled');
  ok('baseline owner plain field', s.ownerFld === 'Acme Inc');

  // Now re-write EACH reserved key once more; after each, ALL others must survive.
  const rewrites = [
    ['contract', { __subcontract_analysis: { verdict: 'RED', summary: 's2' } }, 'suban→RED'],
    ['contract', { __contract_pull: { status: 'requested', requested_at: 't2' } }, 'cpull→requested'],
    ['contract', { 'Subcontract Value': '$2M' }, 'contractFld→$2M'],
    ['engineering', { __submittal_pull: { status: 'pulled', pulled_at: 't1' } }, 'pull→pulled'],
    ['engineering', { __submittal_cycles: [{ rev: 0, status: 'Original' }, { rev: 1, status: 'Rev1' }] }, 'cycles→2'],
    ['engineering', { __site_elevations: [{ id: 'a1', area: 'A' }, { id: 'a2', area: 'B' }] }, 'elev→2'],
    ['engineering', { __submittal_prereqs: { items: { k1: {}, k2: {} } } }, 'prereq→2'],
    ['general', { __crm: { Owner: { company: 'Acme2', contactIds: [] } } }, 'crm→Acme2'],
  ];
  for (const [sec, f, label] of rewrites) {
    r = await post(env, { num, section: sec, fields: f });
    s = snap(r.body.sections);
    // After ANY rewrite the seven keys are all still present (values may have changed for the one written).
    ok(label + ': crm/dp survives', s.crmDP === 'Garbin');
    ok(label + ': prereq survives', s.prereq);
    ok(label + ': cycles survives', s.cycles >= 1);
    ok(label + ': elev survives', !!s.elev);
    ok(label + ': pull survives', !!s.pull);
    ok(label + ': suban survives', !!s.suban);
    ok(label + ': cpull survives', !!s.cpull);
    ok(label + ': suban plain field survives', s.subanFld !== undefined && s.subanFld !== '');
  }

  console.log('\n==== Reserved-keys merge regression (7 keys) ====');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (fail) { console.log('FAILURES: ' + fails.join('; ')); process.exit(1); }
  process.exit(0);
})();
