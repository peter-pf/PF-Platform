// Harness: Subcontract Analysis standardization (Brad 2026-08-13).
// Proves: (a) subsection renders in Section 3 for a job WITH analysis + empty state WITHOUT;
//         (b) legacy D.analysis still renders (Indy) when no override key;
//         (c) override __subcontract_analysis renders AND takes precedence over legacy;
//         (d) all fields escaped (hostile string injected → escaped);
//         (e) field_ops does not see it (validator RBAC + render gate);
//         (f) reserved-key merge preserves the OTHER 5 reserved keys on a __subcontract_analysis
//             write, and a write of another reserved key preserves __subcontract_analysis.
const { buildFront, loadWorker, makeKV } = require('./extract.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---------------- FRONTEND RENDER TESTS ----------------
const officeState = { canEdit: true, _curOverrides: {} };

// (a1) Job WITH legacy analysis → full render, contains the subhead + verdict.
{
  const F = buildFront(officeState);
  const D = { analysis: { verdict: 'GREEN', summary: 'Terms acceptable.', amount: '$1,200,000',
    counterparty: 'Flaherty & Collins', review_date: '08/13/2026', execution_status: 'Fully Executed',
    key_terms: [{ k: 'Retainage', v: '10%' }], insurance_summary: '$2M GL', scope_summary: 'AP install',
    risks: ['RED: $75/day LD'] , source: 'Doc review.'} };
  const A = F.read(D);
  const out = F.renderSub(A);
  ok('(a1) subhead present', out.includes('<div class="pr-subhead">Subcontract Analysis</div>'));
  ok('(a1) verdict GREEN rendered', out.includes('pr-verdict green') && out.includes('>GREEN<'));
  ok('(a1) key term rendered', out.includes('Retainage') && out.includes('10%'));
  ok('(a1) risk rendered', out.includes('$75/day LD'));
  ok('(a1) exec banner green', out.includes('pr-exec green'));
}

// (a2) Job WITHOUT any analysis → compact one-line empty state.
{
  const F = buildFront(officeState);
  const A = F.read({}); // no analysis, no override
  ok('(a2) read returns null when neither source', A === null);
  const out = F.renderSub(A);
  ok('(a2) subhead still present (renders every job)', out.includes('Subcontract Analysis</div>'));
  ok('(a2) empty-state one line', out.includes('No subcontract analysis on file yet.'));
  ok('(a2) office run-hint present', out.includes('A review can be run'));
  ok('(a2) empty state is compact (no verdict/exec markup)', !out.includes('pr-verdict') && !out.includes('pr-exec'));
}

// (a2b) Field-office user WOULD see no run-hint IF this renderer were reachable — but it is
// PM-view only; still, verify the hint gates on canEdit() (defense in depth on the affordance).
{
  const F = buildFront({ canEdit: false, _curOverrides: {} });
  const out = F.renderSub(F.read({}));
  ok('(a2b) non-editor empty state has NO run-hint', out.includes('No subcontract analysis on file yet.') && !out.includes('A review can be run'));
}

// (b) Legacy D.analysis renders when NO override key (Indy path).
{
  const F = buildFront({ canEdit: true, _curOverrides: { contract: {} } }); // contract exists but no __subcontract_analysis
  const D = { analysis: { verdict: 'YELLOW', summary: 'Indy legacy.', risks: [] } };
  const A = F.read(D);
  ok('(b) legacy read picks D.analysis', A && A.verdict === 'YELLOW' && A.summary === 'Indy legacy.');
  ok('(b) legacy renders', F.renderSub(A).includes('Indy legacy.'));
}

// (c) Override __subcontract_analysis takes PRECEDENCE over legacy D.analysis.
{
  const F = buildFront({ canEdit: true, _curOverrides: { contract: { __subcontract_analysis: {
    verdict: 'RED', summary: 'OVERRIDE WINS', risks: ['override risk'] } } } });
  const D = { analysis: { verdict: 'GREEN', summary: 'legacy should be hidden' } };
  const A = F.read(D);
  ok('(c) override wins verdict', A && A.verdict === 'RED');
  ok('(c) override wins summary', A && A.summary === 'OVERRIDE WINS');
  const out = F.renderSub(A);
  ok('(c) override renders', out.includes('OVERRIDE WINS') && !out.includes('legacy should be hidden'));
}

// (d) ALL fields escaped — inject hostile strings, confirm no raw < > in output.
{
  const hostile = '<img src=x onerror=alert(1)>';
  const F = buildFront({ canEdit: true, _curOverrides: {} });
  const D = { analysis: {
    verdict: hostile, execution_status: hostile, amount: hostile, counterparty: hostile,
    review_date: hostile, summary: hostile, insurance_summary: hostile, scope_summary: hostile,
    key_terms: [{ k: hostile, v: hostile }], risks: [hostile], source: hostile } };
  const A = F.read(D);
  const out = F.renderSub(A);
  // Verdict is uppercased+enum-classed but E()-escaped; the raw tag must never appear.
  ok('(d) no raw <img tag in output', !out.includes('<img'));
  // The only < > in output must be from OUR trusted markup, never from the payload. Confirm
  // the payload's tag is neutralized to &lt;img (no executable <img sr...> survives).
  ok('(d) no executable <img src in output', !/<img\s/i.test(out));
  ok('(d) escaped &lt; present (proves escaping ran)', out.includes('&lt;img'));
  // Confirm each field region escaped: count &lt;img occurrences ≥ number of distinct escaped fields.
  const n = (out.match(/&lt;img/g) || []).length;
  ok('(d) many fields escaped (>=8 occurrences)', n >= 8);
}

// ---------------- BACKEND VALIDATOR + MERGE + RBAC TESTS ----------------
const W = loadWorker();
const officeSession = { area: 'financials', name: 'Peter' };
const fieldSession = { area: 'field_ops', name: 'FieldGuy' };

function postReq(body) {
  const text = JSON.stringify(body);
  return {
    headers: { get: (h) => (h === 'Content-Length' ? String(text.length) : null) },
    async text() { return text; },
    url: 'https://x/api/project-override',
  };
}
async function post(env, session, body) {
  const res = await W.onRequestPost({ request: postReq(body), env, data: { session } });
  // requireArea stub may return a plain "denied" object (not a Response) — surface it as such.
  if (res && res.__denied) return { status: 403, body: { denied: true } };
  return { status: res.status, body: await res.json() };
}

(async () => {
  // (e) field_ops BLOCKED from writing the analysis (RBAC gate returns denied object).
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, fieldSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'GREEN' } } });
    // requireArea stub returns a denied object → handler returns it directly (not saved).
    ok('(e) field_ops denied (not saved)', r.body && r.body.denied === true && !(r.body.saved));
  }

  // Validator: verdict enum-gate — stray verdict coerced to REVIEW, not rejected.
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'PURPLE', summary: 'x' } } });
    ok('(val) stray verdict saved', r.body && r.body.saved === true);
    ok('(val) stray verdict → REVIEW', r.body.sections.contract.__subcontract_analysis.verdict === 'REVIEW');
  }

  // Validator: angle brackets stripped server-side (defense-in-depth).
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'GREEN', summary: '<script>x</script>',
        key_terms: [{ k: '<b>', v: '<i>' }], risks: ['<svg>'] } } });
    const a = r.body.sections.contract.__subcontract_analysis;
    ok('(val) summary brackets stripped', a.summary === 'scriptx/script');
    ok('(val) key_term brackets stripped', a.key_terms[0].k === 'b' && a.key_terms[0].v === 'i');
    ok('(val) risk brackets stripped', a.risks[0] === 'svg');
  }

  // Validator: malformed (non-object) → reject WHOLE save closed (400).
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: [1, 2, 3] } });
    ok('(val) array payload rejected 400', r.status === 400 && !(r.body && r.body.saved));
  }
  // Validator: risks not-an-array → reject.
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'GREEN', risks: 'notarray' } } });
    ok('(val) risks non-array rejected 400', r.status === 400);
  }
  // Validator: over-cap risks → reject.
  {
    const env = { PF_SCHEDULE: makeKV() };
    const big = new Array(61).fill('r');
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'GREEN', risks: big } } });
    ok('(val) risks over-cap rejected 400', r.status === 400);
  }
  // Validator: __subcontract_analysis on a DIFFERENT section → rejected 400.
  {
    const env = { PF_SCHEDULE: makeKV() };
    const r = await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __subcontract_analysis: { verdict: 'GREEN' } } });
    ok('(val) analysis on wrong section rejected 400', r.status === 400);
  }

  // (f) MERGE: writing __subcontract_analysis preserves the OTHER 5 reserved keys.
  {
    const env = { PF_SCHEDULE: makeKV() };
    // Seed a contract section carrying __crm (allowed on contract? no — __crm not allowed on
    // contract). The 5 "other" reserved keys live on DIFFERENT sections; the merge-preservation
    // requirement is that a __subcontract_analysis write does not clobber keys ON THE SAME
    // section object. On `contract`, the only reserved key is __subcontract_analysis + plain
    // fields. So verify: (1) plain contract fields survive an analysis write, and (2) an
    // analysis write does not disturb reserved keys stored on OTHER sections.
    // First, populate engineering with its 4 reserved keys + design_professionals/general __crm.
    await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __submittal_prereqs: { items: {} } } });
    await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __submittal_cycles: [{ rev: 0, status: 'Original' }] } });
    await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __site_elevations: [{ id: 'a1', area: 'Bldg A' }] } });
    await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __submittal_pull: { status: 'requested', requested_at: 'now' } } });
    await post(env, officeSession, { num: '26-125', section: 'general',
      fields: { __crm: { Owner: { company: 'Acme', contactIds: ['C0001'] } } } });
    // Also a plain contract field.
    await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { 'Subcontract Value': '$1,200,000' } });
    // Now write the analysis.
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'GREEN', summary: 'ok' } } });
    const secs = r.body.sections;
    ok('(f) analysis written', secs.contract.__subcontract_analysis && secs.contract.__subcontract_analysis.verdict === 'GREEN');
    ok('(f) plain contract field preserved on analysis write', secs.contract['Subcontract Value'] === '$1,200,000');
    ok('(f) __submittal_prereqs preserved', !!secs.engineering.__submittal_prereqs);
    ok('(f) __submittal_cycles preserved', Array.isArray(secs.engineering.__submittal_cycles) && secs.engineering.__submittal_cycles.length === 1);
    ok('(f) __site_elevations preserved', Array.isArray(secs.engineering.__site_elevations) && secs.engineering.__site_elevations[0].id === 'a1');
    ok('(f) __submittal_pull preserved', secs.engineering.__submittal_pull && secs.engineering.__submittal_pull.status === 'requested');
    ok('(f) __crm preserved', secs.general.__crm && secs.general.__crm.Owner.company === 'Acme');

    // Vice-versa: a subsequent engineering __submittal_pull write must not clobber the
    // contract __subcontract_analysis just stored.
    const r2 = await post(env, officeSession, { num: '26-125', section: 'engineering',
      fields: { __submittal_pull: { status: 'pulled', pulled_at: 'later' } } });
    ok('(f) vice-versa: analysis survives an engineering pull write', r2.body.sections.contract.__subcontract_analysis.verdict === 'GREEN');
    ok('(f) vice-versa: pull updated', r2.body.sections.engineering.__submittal_pull.status === 'pulled');
  }

  // (f2) A NORMAL contract field save (no analysis key) preserves an existing analysis.
  {
    const env = { PF_SCHEDULE: makeKV() };
    await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { __subcontract_analysis: { verdict: 'RED', summary: 'keep me' } } });
    const r = await post(env, officeSession, { num: '26-125', section: 'contract',
      fields: { 'GC Project #': '12345' } });
    ok('(f2) analysis preserved on plain contract save', r.body.sections.contract.__subcontract_analysis.verdict === 'RED');
    ok('(f2) plain field saved', r.body.sections.contract['GC Project #'] === '12345');
  }

  console.log('\n==== Subcontract Analysis harness ====');
  console.log('PASS: ' + pass + '  FAIL: ' + fail);
  if (fail) { console.log('FAILURES: ' + fails.join('; ')); process.exit(1); }
  process.exit(0);
})();
