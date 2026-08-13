// Harness: PF Info Needed for Submittal Design — ALWAYS-LIVE save-on-change (Brad 2026-08-13)
// Proves the (B) prereqs live-edit path AND the (A) cycles live path co-exist without
// clobbering, using the REAL backend onRequestPost + a mock KV. Run from platform/:
//   node test/harness-submittal-prereqs-live.mjs
//
// It exercises the exact CLIENT read-merge-write logic (mirrored from pfPrqLiveSave in
// index.html) and the exact SERVER merge (imported project-override.js), so a real POST
// round-trip is validated end to end.

import { onRequestPost } from '../functions/api/project-override.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) { pass++; } else { fail++; fails.push(msg); console.log('  FAIL: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b) + ')'); }

// ---- Mock KV (in-memory) ----------------------------------------------------
function makeKV() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}
const OFFICE = { role: 'admin', name: 'Peter', uid: 'peter' };
const FIELD = { role: 'field_ops', name: 'Crew', uid: 'crew' };

// Invoke the real backend POST. Returns { status, body }.
async function post(env, session, body) {
  const req = new Request('https://x/api/project-override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await onRequestPost({ request: req, env, data: { session } });
  let json = null; try { json = JSON.parse(await res.text()); } catch {}
  return { status: res.status, body: json };
}

// Read the current engineering section from KV (server truth).
async function readEng(env, num) {
  const raw = await env.PF_SCHEDULE.get('project_override_v1:' + num);
  if (!raw) return {};
  const p = JSON.parse(raw);
  return (p.sections && p.sections.engineering) || {};
}
async function readContract(env, num) {
  const raw = await env.PF_SCHEDULE.get('project_override_v1:' + num);
  if (!raw) return {};
  const p = JSON.parse(raw);
  return (p.sections && p.sections.contract) || {};
}

// ---- CLIENT SIMULATION: pfPrqLiveSave read-merge-write ----------------------
// Mirrors the frontend exactly: read the STORED items map, rebuild the COMPLETE map
// preserving every sibling item, overwrite ONLY the changed row from the row's current
// (DOM) values, POST { section:'engineering', fields:{ __submittal_prereqs:{ items } } }.
const PREREQ_ITEMS = [
  'full_structural_pdf', 'struct_foundation_cad', 'full_civil_pdf', 'civil_grading_cad',
  'civil_site_plan_cad', 'design_service_loads', 'geotech_reports', 'site_grade_elev',
  'survey_or_site_control_doc',
];
function storedItems(eng) {
  const pr = eng && eng.__submittal_prereqs;
  return (pr && pr.items && typeof pr.items === 'object') ? pr.items : {};
}
// row = { name, email, cid, dr, rfSub, rfStk } representing the DOM state of the edited row.
function clientPrqLiveSave(storedEngItems, key, row) {
  const items = {};
  Object.keys(storedEngItems).forEach((k) => {
    const d = storedEngItems[k] || {};
    const rf = (d.required_for && typeof d.required_for === 'object') ? d.required_for : {};
    items[k] = {
      responsible_contact_id: String(d.responsible_contact_id || ''),
      responsible_name: String(d.responsible_name || ''),
      responsible_email: String(d.responsible_email || ''),
      date_received: String(d.date_received || ''),
      required_for: {
        submittal_design: rf.submittal_design === true,
        staking_layout: rf.staking_layout === true,
      },
    };
  });
  items[key] = {
    responsible_contact_id: row.cid || '',
    responsible_name: row.name || '',
    responsible_email: row.email || '',
    date_received: row.dr || '',
    required_for: {
      submittal_design: !!row.rfSub,
      staking_layout: !!row.rfStk,
    },
  };
  return { num: undefined, section: 'engineering', fields: { __submittal_prereqs: { items } } };
}

// ---- CLIENT SIMULATION: pfSwfFieldChange -> pfSwfBuildArray (cycles) ---------
function clientCyclesSave(storedCycles, editRev, patch) {
  const arr = (storedCycles || []).map((c) => {
    const base = {
      rev: c.rev, prereqs_sent: c.prereqs_sent, actual_completion: c.actual_completion,
      pf_submits_gc: c.pf_submits_gc, status: c.status,
      shop_due_override: c.shop_due_override || '', approved_submittal_date: c.approved_submittal_date || '',
    };
    if (c.rev === editRev && patch) Object.assign(base, patch);
    return base;
  });
  return { section: 'engineering', fields: { __submittal_cycles: arr } };
}

async function run() {
  console.log('=== Harness: Submittal Design ALWAYS-LIVE (prereqs + cycles) ===\n');
  const env = { PF_SCHEDULE: makeKV() };
  const NUM = '26-999';

  // SEED all reserved keys on BOTH sections so we can prove nothing gets clobbered.
  // engineering: __submittal_prereqs (2 items), __submittal_cycles, __site_elevations, __submittal_pull, __crm
  await post(env, OFFICE, { num: NUM, section: 'engineering', fields: {
    __submittal_prereqs: { items: {
      full_structural_pdf: { responsible_name: 'GC PM', responsible_email: 'pm@gc.com', responsible_contact_id: 'C0001', date_received: '', required_for: { submittal_design: true, staking_layout: false } },
      full_civil_pdf: { responsible_name: 'Civil', responsible_email: 'civil@x.com', responsible_contact_id: '', date_received: '2026-08-01', required_for: { submittal_design: false, staking_layout: true } },
    } },
  } });
  await post(env, OFFICE, { num: NUM, section: 'engineering', fields: {
    __submittal_cycles: [ { rev: 0, prereqs_sent: '2026-08-05', actual_completion: '', pf_submits_gc: '', status: '', shop_due_override: '', approved_submittal_date: '' } ],
  } });
  await post(env, OFFICE, { num: NUM, section: 'engineering', fields: {
    __site_elevations: [ { id: 'a1', area: 'Bldg A', gradeElev: '612.5', ffe: '614', pierQty: '10', totalLf: '200', columnDiameter: '24', bearingCapacity: '4000' } ],
  } });
  await post(env, OFFICE, { num: NUM, section: 'engineering', fields: {
    __submittal_pull: { status: 'pulled', ffe_status: 'sourced', source_pdf: { name: 'ShopDwg.pdf', revision: 'R2', date: '2026-08-10' }, reconciled: true, notes: ['seed note'] },
  } });
  // __crm lives on design_professionals (NOT engineering — the backend 400s __crm on
  // engineering). Seeded on its own section to prove a cross-section reserved key is
  // untouched by engineering prereq/cycle saves.
  await post(env, OFFICE, { num: NUM, section: 'design_professionals', fields: {
    __crm: { 'Ground Improvement': { company: 'Garbin', contactIds: ['C0005'] } },
  } });
  // contract: seed __subcontract_analysis + __contract_pull (must never be touched by engineering saves)
  await post(env, OFFICE, { num: NUM, section: 'contract', fields: {
    __subcontract_analysis: { verdict: 'GREEN', summary: 'seed analysis', risks: ['r1'] },
  } });
  await post(env, OFFICE, { num: NUM, section: 'contract', fields: {
    __contract_pull: { status: 'pulled', source_doc: 'FE-Sub.pdf', fully_executed_date: '2026-07-01' },
  } });

  // Snapshot the full seeded engineering + contract state.
  let eng0 = await readEng(env, NUM);
  const engReserved = ['__submittal_prereqs', '__submittal_cycles', '__site_elevations', '__submittal_pull'];
  ok(engReserved.every((k) => eng0[k] !== undefined), 'SEED: all 4 engineering reserved keys present');
  // __crm read from its own section (design_professionals).
  async function readDp(env, num) { const raw = await env.PF_SCHEDULE.get('project_override_v1:' + num); if (!raw) return {}; const p = JSON.parse(raw); return (p.sections && p.sections.design_professionals) || {}; }
  const dp0 = await readDp(env, NUM);
  ok(dp0.__crm !== undefined, 'SEED: design_professionals __crm present');

  // ===== (a) A prereq item change auto-saves to __submittal_prereqs (no Edit click) =====
  console.log('(a) prereq item change auto-saves to __submittal_prereqs');
  {
    // User fills Date Received on full_structural_pdf (the outstanding item). The row DOM
    // still shows its existing party (GC PM / pm@gc.com / C0001), rf flags unchanged.
    const body = clientPrqLiveSave(storedItems(eng0), 'full_structural_pdf', {
      name: 'GC PM', email: 'pm@gc.com', cid: 'C0001', dr: '2026-08-12', rfSub: true, rfStk: false,
    });
    body.num = NUM;
    const r = await post(env, OFFICE, body);
    ok(r.status === 200 && r.body && r.body.ok === true && r.body.saved === true, '(a) POST returns {ok:true,saved:true}');
    const eng = await readEng(env, NUM);
    eq(eng.__submittal_prereqs.items.full_structural_pdf.date_received, '2026-08-12', '(a) date_received saved');
    // Responsible party of the edited row preserved (not wiped).
    eq(eng.__submittal_prereqs.items.full_structural_pdf.responsible_email, 'pm@gc.com', '(a) edited row party preserved');
    // The OTHER item (full_civil_pdf) is fully preserved (no clobber).
    eq(eng.__submittal_prereqs.items.full_civil_pdf.date_received, '2026-08-01', '(a) sibling item date preserved');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.required_for, { submittal_design: false, staking_layout: true }, '(a) sibling item rf preserved');
  }

  // ===== responsible-party change (incl typeahead cid + email) auto-saves =====
  console.log('(b) prereq responsible-party change auto-saves to __submittal_prereqs');
  {
    let eng = await readEng(env, NUM);
    // User selects a project contact on full_civil_pdf: name typeahead filled email+cid.
    const body = clientPrqLiveSave(storedItems(eng), 'full_civil_pdf', {
      name: 'Jane Civil', email: 'jane@civil.com', cid: 'C0042', dr: '2026-08-01', rfSub: false, rfStk: true,
    });
    body.num = NUM;
    const r = await post(env, OFFICE, body);
    ok(r.status === 200 && r.body.saved === true, '(b) POST ok');
    eng = await readEng(env, NUM);
    eq(eng.__submittal_prereqs.items.full_civil_pdf.responsible_name, 'Jane Civil', '(b) responsible_name saved');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.responsible_email, 'jane@civil.com', '(b) responsible_email saved');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.responsible_contact_id, 'C0042', '(b) responsible_contact_id saved');
    // The item edited in (a) is preserved.
    eq(eng.__submittal_prereqs.items.full_structural_pdf.date_received, '2026-08-12', '(b) item from (a) preserved');
  }

  // ===== (c) prereq save preserves cycles & vice versa + all other reserved keys =====
  console.log('(c) cross-key preservation (prereq<->cycles + all reserved)');
  {
    // After the two prereq saves above, verify EVERY other engineering reserved key intact.
    let eng = await readEng(env, NUM);
    eq(eng.__submittal_cycles, eng0.__submittal_cycles, '(c) __submittal_cycles preserved through prereq saves');
    eq(eng.__site_elevations, eng0.__site_elevations, '(c) __site_elevations preserved');
    eq(eng.__submittal_pull, eng0.__submittal_pull, '(c) __submittal_pull preserved');
    const dpNow = await readDp(env, NUM);
    eq(dpNow.__crm, dp0.__crm, '(c) design_professionals __crm preserved (cross-section)');
    // Contract-section keys untouched.
    let con = await readContract(env, NUM);
    eq(con.__subcontract_analysis.verdict, 'GREEN', '(c) __subcontract_analysis preserved');
    eq(con.__contract_pull.status, 'pulled', '(c) __contract_pull preserved');

    // Now a CYCLES save (change status) and confirm it does NOT clobber prereqs.
    const cbody = clientCyclesSave(eng.__submittal_cycles, 0, { status: 'Approved / Reviewed', approved_submittal_date: '2026-08-13' });
    cbody.num = NUM;
    const r = await post(env, OFFICE, cbody);
    ok(r.status === 200 && r.body.saved === true, '(c) cycles POST ok');
    eng = await readEng(env, NUM);
    eq(eng.__submittal_cycles[0].status, 'Approved / Reviewed', '(c) cycle status saved');
    // Prereqs from (a)+(b) survive the cycles save.
    eq(eng.__submittal_prereqs.items.full_structural_pdf.date_received, '2026-08-12', '(c) prereqs preserved through cycles save');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.responsible_email, 'jane@civil.com', '(c) prereq party preserved through cycles save');
    eq(eng.__site_elevations, eng0.__site_elevations, '(c) site_elevations preserved through cycles save');
    const dpAfterCyc = await readDp(env, NUM);
    eq(dpAfterCyc.__crm, dp0.__crm, '(c) crm preserved through cycles save (cross-section)');
  }

  // ===== (d) field_ops is BLOCKED (server 403) =====
  console.log('(d) field_ops read-only (server 403 on write)');
  {
    const body = clientPrqLiveSave(storedItems(await readEng(env, NUM)), 'full_structural_pdf', {
      name: 'HACK', email: 'x@x.com', cid: '', dr: '2026-01-01', rfSub: true, rfStk: true,
    });
    body.num = NUM;
    const r = await post(env, FIELD, body);
    ok(r.status === 403, '(d) field_ops POST -> 403');
    // Store unchanged by the blocked write.
    const eng = await readEng(env, NUM);
    eq(eng.__submittal_prereqs.items.full_structural_pdf.responsible_name, 'GC PM', '(d) store unchanged after 403');
  }

  // ===== (e) fail-closed: a malformed prereq body rejects the WHOLE save (store untouched) =====
  console.log('(e) fail-closed on malformed body (store untouched)');
  {
    const before = await readEng(env, NUM);
    // items as an ARRAY (not an object) — cleanPrereqs returns {items:{}} for array items?
    // No: input.items array => treated as {} (empty), which would WIPE. To prove a hard
    // reject, send items with a non-object entry -> cleanPrereqs returns null -> 400.
    const bad = { num: NUM, section: 'engineering', fields: { __submittal_prereqs: { items: { full_structural_pdf: 'not-an-object' } } } };
    const r = await post(env, OFFICE, bad);
    ok(r.status === 400 && (!r.body || r.body.saved !== true), '(e) malformed prereq -> 400, not saved');
    const after = await readEng(env, NUM);
    eq(after.__submittal_prereqs, before.__submittal_prereqs, '(e) prereqs unchanged after rejected save');
    eq(after.__submittal_cycles, before.__submittal_cycles, '(e) cycles unchanged after rejected save');
  }

  // ===== (f) reserved-section guard: __submittal_prereqs rejected on a wrong section =====
  console.log('(f) prereqs rejected outside engineering section (400)');
  {
    const r = await post(env, OFFICE, { num: NUM, section: 'contract', fields: { __submittal_prereqs: { items: {} } } });
    ok(r.status === 400, '(f) __submittal_prereqs on contract -> 400');
    // Contract analysis + pull still intact.
    const con = await readContract(env, NUM);
    eq(con.__subcontract_analysis.verdict, 'GREEN', '(f) contract analysis intact');
  }

  // ===== (g) checkbox-only change (required_for) round-trips + preserves party & date =====
  console.log('(g) required_for checkbox change saves + preserves party/date');
  {
    let eng = await readEng(env, NUM);
    const cur = eng.__submittal_prereqs.items.full_civil_pdf;
    // Toggle staking_layout OFF, keep everything else exactly as stored (DOM harvest).
    const body = clientPrqLiveSave(storedItems(eng), 'full_civil_pdf', {
      name: cur.responsible_name, email: cur.responsible_email, cid: cur.responsible_contact_id,
      dr: cur.date_received, rfSub: cur.required_for.submittal_design, rfStk: false,
    });
    body.num = NUM;
    const r = await post(env, OFFICE, body);
    ok(r.status === 200 && r.body.saved === true, '(g) checkbox POST ok');
    eng = await readEng(env, NUM);
    eq(eng.__submittal_prereqs.items.full_civil_pdf.required_for, { submittal_design: false, staking_layout: false }, '(g) rf toggled off');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.responsible_email, 'jane@civil.com', '(g) party preserved on checkbox save');
    eq(eng.__submittal_prereqs.items.full_civil_pdf.date_received, '2026-08-01', '(g) date preserved on checkbox save');
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
}
run().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
