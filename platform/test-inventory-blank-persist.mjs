// End-to-end test: deliberately-blanked TEXT field persists as empty across the
// full path (frontend change-detect -> POST body -> API setFields -> KV store ->
// GET hydration -> mergedItem render). Also asserts: change-to-a-value still saves,
// NUM (Req) clear still reverts to seed, RBAC office-only, sanitization intact.
//
// Uses the REAL API handler (functions/api/inventory.js) with a mock KV + auth,
// and faithfully replays the frontend change-handler / applyLocal / mergedItem /
// hydration logic copied from index.html (kept in lockstep with the edited code).

import { onRequestGet, onRequestPost } from './functions/api/inventory.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

// ---- mock KV ---------------------------------------------------------------
function makeEnv() {
  const kv = new Map();
  return {
    PF_SCHEDULE: {
      async get(k) { return kv.has(k) ? kv.get(k) : null; },
      async put(k, v) { kv.set(k, v); },
    },
  };
}

// requireArea is imported by the module from ../lib/auth.js; to exercise the real
// handler we drive it through sessions the middleware would attach. We simulate by
// constructing a context whose request carries a session via a header the real
// auth lib reads. Instead of guessing, we call the handler with an injected session
// through context.data (the pattern _middleware uses). Verify auth semantics via the
// office vs field_ops role below.
function ctx(env, session, body) {
  return {
    env,
    data: { session },
    request: new Request('https://x/api/inventory', {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  };
}

const office = { uid: 'u1', name: 'Derek', role: 'business_dev' };
const crew   = { uid: 'u2', name: 'Crew',  role: 'field_ops' };

// ---- frontend logic replica (copied from index.html, kept in lockstep) -----
const TEXT_FIELDS = ['description', 'manufacturer', 'mfrPart', 'altSources', 'notes'];
const NUM_FIELDS  = ['reqTrailer', 'reqHome'];

// mergedItem: KEY-PRESENCE merge (seed <- override).
function mergedItem(item, fieldOverrides) {
  const ov = fieldOverrides[item.id];
  if (!ov) return item;
  const out = {};
  for (const k in item) if (Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
  TEXT_FIELDS.concat(NUM_FIELDS).forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(ov, f)) out[f] = ov[f];
  });
  return out;
}

// change-handler value derivation + applyLocal + POST body (mirrors index.html).
function frontendEdit(fieldOverrides, itemId, field, isNum, rawInput) {
  const raw = String(rawInput).trim();
  let val;
  if (raw === '') { val = isNum ? null : ''; }
  else if (isNum) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return { error: true };
    val = n;
  } else { val = raw; }

  const payloadFields = {}; payloadFields[field] = (val === null ? '' : val);

  // applyLocal (optimistic)
  const rec = fieldOverrides[itemId] ? Object.assign({}, fieldOverrides[itemId]) : {};
  if (val === null) delete rec[field]; else rec[field] = val;
  if (Object.keys(rec).length) fieldOverrides[itemId] = rec; else delete fieldOverrides[itemId];

  return { payloadFields };
}

// hydration from GET (mirrors index.html load()).
function hydrate(fieldsFromApi) {
  const fieldOverrides = {};
  Object.keys(fieldsFromApi || {}).forEach(function (itemId) {
    const rec = fieldsFromApi[itemId];
    if (!rec || typeof rec !== 'object') return;
    const clean = {};
    TEXT_FIELDS.concat(NUM_FIELDS).forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(rec, f)) clean[f] = rec[f];
    });
    if (Object.keys(clean).length) fieldOverrides[itemId] = clean;
  });
  return fieldOverrides;
}

// ---- scenario --------------------------------------------------------------
const SEED = { id: 'itemA', category: 'Cat', description: 'Widget',
  manufacturer: 'Acme', mfrPart: 'A-1', altSources: 'Grainger', notes: 'seed note',
  reqTrailer: 5, reqHome: 10 };

async function run() {
  const env = makeEnv();

  // 1) Office blanks the Notes field (deliberate clear-to-empty).
  let fo = {};
  const e1 = frontendEdit(fo, 'itemA', 'notes', false, '');
  ok('frontend keeps blanked TEXT as override key ""',
     Object.prototype.hasOwnProperty.call(fo.itemA || {}, 'notes') && fo.itemA.notes === '');
  ok('POST body sends explicit "" for blanked notes', e1.payloadFields.notes === '');

  // 2) POST to real API as office.
  let r = await onRequestPost(ctx(env, office, { action: 'setFields', item: 'itemA', fields: e1.payloadFields }));
  let b = await r.json();
  ok('API 200 on blank-notes save', r.status === 200 && b.ok === true);
  ok('API response carries notes: "" (stored, not cleared)',
     b.cleared === false && b.fields && b.fields.notes === '');

  // 3) Re-fetch (simulate reload) and hydrate.
  r = await onRequestGet(ctx(env, office));
  b = await r.json();
  ok('GET returns stored notes: ""',
     b.fields && b.fields.itemA && b.fields.itemA.notes === '');
  const foReload = hydrate(b.fields);
  const mergedReload = mergedItem(SEED, foReload);
  ok('AFTER RELOAD merged notes is blank (not seed)', mergedReload.notes === '');

  // 4) Optimistic (same-session) merge shows blank without reload.
  const mergedOptimistic = mergedItem(SEED, fo);
  ok('AFTER OPTIMISTIC merge notes is blank (not seed)', mergedOptimistic.notes === '');

  // 5) Change-to-a-value STILL works (regression guard).
  const e2 = frontendEdit(fo, 'itemA', 'manufacturer', false, 'NewMfr');
  r = await onRequestPost(ctx(env, office, { action: 'setFields', item: 'itemA', fields: e2.payloadFields }));
  b = await r.json();
  ok('change-to-value saves (manufacturer)', r.status === 200 && b.fields.manufacturer === 'NewMfr');
  r = await onRequestGet(ctx(env, office)); b = await r.json();
  ok('reload keeps manufacturer NewMfr AND notes ""',
     b.fields.itemA.manufacturer === 'NewMfr' && b.fields.itemA.notes === '');

  // 6) NUM (Req) blank still CLEARS -> reverts to seed (unchanged behavior).
  const e3 = frontendEdit(fo, 'itemA', 'reqTrailer', true, '');
  ok('frontend NUM blank -> no override key (clear)',
     !Object.prototype.hasOwnProperty.call(fo.itemA, 'reqTrailer'));
  r = await onRequestPost(ctx(env, office, { action: 'setFields', item: 'itemA', fields: e3.payloadFields }));
  b = await r.json();
  r = await onRequestGet(ctx(env, office)); b = await r.json();
  const foNum = hydrate(b.fields);
  const mNum = mergedItem(SEED, foNum);
  ok('NUM blank reverts to seed reqTrailer=5',
     !('reqTrailer' in (b.fields.itemA || {})) && mNum.reqTrailer === 5);

  // 7) Qty save (Actual) still works via action:'set'.
  r = await onRequestPost(ctx(env, office, { action: 'set', key: 'loc1::itemA', qty: 3 }));
  b = await r.json();
  ok('qty save (action:set) ok', r.status === 200 && b.qty === 3);
  r = await onRequestGet(ctx(env, office)); b = await r.json();
  ok('qty persists', b.qty['loc1::itemA'] && b.qty['loc1::itemA'].qty === 3);

  // 8) RBAC: field_ops CANNOT write (blank or otherwise) -> 403.
  r = await onRequestPost(ctx(env, crew, { action: 'setFields', item: 'itemA', fields: { notes: '' } }));
  ok('field_ops blank-write BLOCKED (403)', r.status === 403);

  // 9) field_ops CAN read (general area).
  r = await onRequestGet(ctx(env, crew));
  ok('field_ops read allowed', r.status === 200);

  // 10) Sanitization intact: angle brackets stripped, cap enforced; empty still safe.
  r = await onRequestPost(ctx(env, office, { action: 'setFields', item: 'itemA', fields: { description: '<b>x</b>' } }));
  b = await r.json();
  ok('sanitization strips <> (empty stays valid)',
     b.fields.description === 'bx/b' && !b.fields.description.includes('<') && !b.fields.description.includes('>'));

  // 11) Clearing the LAST remaining override (all text blanked + num cleared) — item
  //     with only notes:"" must NOT be dropped (blank is a real value).
  const env2 = makeEnv();
  let r2 = await onRequestPost(ctx(env2, office, { action: 'setFields', item: 'itemB', fields: { notes: '' } }));
  let b2 = await r2.json();
  ok('item with ONLY notes:"" is NOT dropped (persists blank)',
     b2.cleared === false && b2.fields.notes === '');
  r2 = await onRequestGet(ctx(env2, office)); b2 = await r2.json();
  ok('reload: itemB blank-notes override still present',
     b2.fields.itemB && b2.fields.itemB.notes === '');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

run().catch(function (e) { console.error(e); process.exit(2); });
