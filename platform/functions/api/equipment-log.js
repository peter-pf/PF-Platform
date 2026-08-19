// Cloudflare Pages Function -- /api/equipment-log
// EDITABLE Equipment Log store for the OFFICE-ONLY Equipment Log module
// (mod-equipment in index.html). Replaces the old hardcoded read-only JS array
// `var EQUIPMENT = [...]`. Each entry is a per-rig DIGITAL LOGBOOK: general
// machine info, a first-class HOURS field, financials (dailyRate), and a dated
// SERVICE HISTORY. Add / edit / remove rigs; add / remove service-history
// entries; append a service entry from the maintenance completion handoff.
//
// Mirrors the maintenance-manual.js / precon-manual-bid.js KV + write-hardening
// pattern (read those files for the parent shape). NO mail, NO outbound fetch.
//
// !!! FINANCIALS / FIELD FIREWALL !!!
//   The Equipment Log CARRIES DOLLARS (dailyRate on a rig; cost on a service
//   entry). It is OFFICE-ONLY. This endpoint is gated to the 'financials' area
//   (admin/partner/business_dev) on BOTH read (GET) AND write (POST), in the
//   handler via requireArea AND in lib/auth.js areaForPath('/api/equipment-log')
//   -> 'financials'. field_ops (the crew) is BLOCKED from reading OR writing.
//   Dollars must NEVER reach a field surface. The maintenance handoff
//   (append-service action) is the ONLY write path shared with a field flow, and
//   even it is gated to 'financials' here -- the field completion click hits
//   /api/maintenance-status (field_ops) and the OFFICE-driven cross-link, not the
//   crew, appends the service entry (see the client note in mod-maintenance).
//
// WHAT IT STORES
//   equipment_log_v1 -> JSON {
//     version: 1,
//     counter: N,                    // monotonic id counter for CUSTOM rigs (eq_<n>)
//     svcCounter: M,                 // monotonic id counter for service entries (sv_<m>)
//     rigs: [ {
//       id,                          // stable rig id (seed ids are FIXED; custom = 'eq_<n>')
//       name,                        // display name (Derek's names for the 3 primary rigs)
//       type,                        // 'Owned' | 'Rental' (free-text capped, validated to these)
//       category,                    // free-text (Heavy / Specialty / ...)
//       role,                        // free-text machine role
//       status,                      // free-text status (Deployed / Available / Maintenance / Not Rented)
//       project,                     // free-text current project
//       specs,                       // free-text general machine info
//       hours,                       // NUMBER -- first-class tracked hours (>= 0)
//       dailyRate,                   // NUMBER -- $/day (OFFICE-ONLY financial; >= 0)
//       lastService,                 // 'YYYY-MM-DD' (derived-friendly; free date string capped)
//       nextService,                 // 'YYYY-MM-DD'
//       serviceHistory: [ {
//         id,                        // 'sv_<m>'
//         date,                      // 'YYYY-MM-DD'
//         type,                      // 'Scheduled'|'Repair'|'Calibration'|'Field' (validated)
//         desc,                      // free-text (capped)
//         cost,                      // NUMBER -- $ (OFFICE-ONLY financial; >= 0)
//         by,                        // who logged it (server-set on append-service; free on manual add)
//         source,                    // 'manual' | 'maintenance-task' (provenance of a service entry)
//         taskKey,                   // optional: the maintenance itemKey this entry came from (dedupe)
//       } ],
//       archived,                    // soft-delete flag (true => excluded from GET)
//       seed,                        // true for the 3 primary rigs (id is protected/stable)
//     } ],
//     meta: { updated }
//   }
//   Lives ONLY in KV (env.PF_SCHEDULE, same binding as the other endpoints).
//
// SEED: on first read (empty KV) the store is seeded with the 3 primary rigs at
//   their STABLE ids so the maintenance tasks can reference a rig by a durable id
//   even before anyone edits the log. Seeding happens in-memory on GET and is
//   PERSISTED on the first write.
//
// SECURITY MODEL (mirrors maintenance-manual.js, tier = OFFICE):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FINANCIALS area enforced HERE via requireArea on GET AND POST, AND in
//     lib/auth.js areaForPath('/api/equipment-log') -> 'financials'. Fails CLOSED.
//   - `type` validated to Owned|Rental; service `type` validated to a fixed list.
//   - Numeric fields (hours, dailyRate, cost) are COERCED to a finite >= 0 number
//     (NaN/negative/inf -> 0); never trusted as strings.
//   - `by` on an append-service handoff is SERVER-set from the session -- NEVER
//     read from the body -- so a client cannot forge who serviced it.
//   - WRITE hardening: body size cap -> 413, strict JSON -> 400, every string
//     rebuilt + length-capped + angle-stripped, id prototype-pollution guards,
//     total-rigs + per-rig-history caps -> 413, private no-store.
//   - NO mail is sent and NO mail/outbound API is called.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'equipment_log_v1';
const OFFICE_AREA = 'financials';        // OFFICE tier -- field_ops BLOCKED (dollars)
const MAX_BODY_BYTES = 64 * 1024;        // 64KB (a rig + its history is bigger than a maint item)
const MAX_RIGS = 200;                    // total (incl. archived) rig cap
const MAX_HISTORY = 300;                 // per-rig service-history cap
const MAX_ID = 200;                      // id cap (lookup key)
const MAX_SHORT = 200;                   // standard string field cap
const MAX_SPECS = 2000;                  // general-info / specs cap (longer free-text)
const MAX_DESC = 1000;                   // service-entry description cap
const MAX_NUM = 100000000;               // hard ceiling on any numeric field

const RIG_TYPES = ['Owned', 'Rental'];
const DEFAULT_RIG_TYPE = 'Owned';
const SVC_TYPES = ['Scheduled', 'Repair', 'Calibration', 'Field'];
const DEFAULT_SVC_TYPE = 'Scheduled';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Length-cap + angle-strip a string (the front-end ALSO escapes on render).
function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

// Coerce to a finite number in [0, MAX_NUM]. Anything else -> 0. Never trusts a
// string blindly and can never yield NaN/Infinity/negative (financial safety).
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > MAX_NUM ? MAX_NUM : n;
}

function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

function normRigType(v) {
  const t = s(v, 40).trim();
  return RIG_TYPES.indexOf(t) >= 0 ? t : DEFAULT_RIG_TYPE;
}
function normSvcType(v) {
  const t = s(v, 40).trim();
  return SVC_TYPES.indexOf(t) >= 0 ? t : DEFAULT_SVC_TYPE;
}

// ---- SEED: the 3 primary rigs at STABLE ids -------------------------------
// These ids are the join target for maintenance tasks (a task's rigId points at
// one of these). Names are Derek's display names; the old roster mapping is:
//   rig-deere-vibro  <- Deere 350G ("Deere Vibro Rig")
//   rig-cat-vibro    <- CAT 308     ("Cat Vibro Rig")
//   rig-sany-drill   <- Sany Predrill Rig ("Sany Drill Rig")
function seedRigs() {
  return [
    {
      id: 'rig-deere-vibro', name: 'Deere Vibro Rig', type: 'Owned', category: 'Heavy',
      role: 'VSC Rig (mast + vibroflot assembly)', status: 'Deployed', project: '',
      specs: 'Deere 350G base -- primary installation rig, 79,300 lbs operating weight, mast + vibroflot assembly mounted.',
      hours: 4280, dailyRate: 500, lastService: '2026-05-10', nextService: '2026-06-10',
      serviceHistory: [
        { id: 'sv_seed_1', date: '2026-05-10', type: 'Scheduled', desc: 'Hydraulic fluid change, filter replacement, track tension check', cost: 1850, by: '', source: 'manual', taskKey: '' },
        { id: 'sv_seed_2', date: '2026-03-22', type: 'Repair', desc: 'Replaced hydraulic hose on mast cylinder', cost: 620, by: '', source: 'manual', taskKey: '' },
        { id: 'sv_seed_3', date: '2026-01-15', type: 'Scheduled', desc: '4000-hr service - full fluid change, undercarriage inspection', cost: 4200, by: '', source: 'manual', taskKey: '' },
      ],
      archived: false, seed: true,
    },
    {
      id: 'rig-cat-vibro', name: 'Cat Vibro Rig', type: 'Owned', category: 'Heavy',
      role: 'Support excavator with drill attachment', status: 'Deployed', project: '',
      specs: 'CAT 308 base -- 8-ton class mini excavator, support excavator with drill attachment for site prep.',
      hours: 3560, dailyRate: 250, lastService: '2026-05-05', nextService: '2026-06-05',
      serviceHistory: [
        { id: 'sv_seed_4', date: '2026-05-05', type: 'Scheduled', desc: 'Oil change, bucket pin inspection, track adjustment', cost: 850, by: '', source: 'manual', taskKey: '' },
        { id: 'sv_seed_5', date: '2026-03-01', type: 'Scheduled', desc: 'Hydraulic system flush, new filters', cost: 1100, by: '', source: 'manual', taskKey: '' },
      ],
      archived: false, seed: true,
    },
    {
      id: 'rig-sany-drill', name: 'Sany Drill Rig', type: 'Owned', category: 'Heavy',
      role: 'Pre-drilling for bottom feed columns', status: 'Available', project: '',
      specs: 'Sany Predrill Rig -- opens the hole before vibroflot insertion for bottom-feed stone column installation.',
      hours: 2140, dailyRate: 400, lastService: '2026-04-28', nextService: '2026-05-28',
      serviceHistory: [
        { id: 'sv_seed_6', date: '2026-04-28', type: 'Scheduled', desc: 'Engine oil, hydraulic filter, air filter replacement', cost: 1400, by: '', source: 'manual', taskKey: '' },
        { id: 'sv_seed_7', date: '2026-02-10', type: 'Repair', desc: 'Drill attachment bearing replacement', cost: 980, by: '', source: 'manual', taskKey: '' },
      ],
      archived: false, seed: true,
    },
  ];
}

// KNOWN LIMITATION: KV read-modify-write (load -> mutate -> put), no transaction,
// so two simultaneous writes can last-writer-wins and drop one. Acceptable for
// the low-concurrency equipment editing flow; the durable fix is a D1 migration
// with a row per rig. Mirrors the maintenance-manual note.
async function loadStore(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) {
    return { rigs: seedRigs(), counter: 0, svcCounter: 0, meta: { updated: null }, _seeded: true };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      rigs: (parsed && Array.isArray(parsed.rigs)) ? parsed.rigs : seedRigs(),
      counter: (parsed && Number.isInteger(parsed.counter)) ? parsed.counter : 0,
      svcCounter: (parsed && Number.isInteger(parsed.svcCounter)) ? parsed.svcCounter : 0,
      meta: (parsed && parsed.meta) || { updated: null },
      _seeded: false,
    };
  } catch {
    return { rigs: seedRigs(), counter: 0, svcCounter: 0, meta: { updated: null }, _seeded: true };
  }
}

// Re-sanitize ONE stored service entry for output (defense-in-depth).
function cleanSvc(h) {
  h = h || {};
  return {
    id: s(h.id, MAX_ID),
    date: s(h.date, 40),
    type: normSvcType(h.type),
    desc: s(h.desc, MAX_DESC),
    cost: num(h.cost),
    by: s(h.by, MAX_SHORT),
    source: (s(h.source, 40) === 'maintenance-task') ? 'maintenance-task' : 'manual',
    taskKey: s(h.taskKey, MAX_ID),
  };
}

// Re-sanitize ONE stored rig for output (defense-in-depth: never re-emit junk).
function cleanRig(r) {
  r = r || {};
  const hist = Array.isArray(r.serviceHistory) ? r.serviceHistory.map(cleanSvc) : [];
  return {
    id: s(r.id, MAX_ID),
    name: s(r.name, MAX_SHORT),
    type: normRigType(r.type),
    category: s(r.category, MAX_SHORT),
    role: s(r.role, MAX_SHORT),
    status: s(r.status, MAX_SHORT),
    project: s(r.project, MAX_SHORT),
    specs: s(r.specs, MAX_SPECS),
    hours: num(r.hours),
    dailyRate: num(r.dailyRate),
    lastService: s(r.lastService, 40),
    nextService: s(r.nextService, 40),
    serviceHistory: hist,
    archived: !!r.archived,
    seed: !!r.seed,
  };
}

// Find a live (non-archived) rig by id. Returns the index or -1.
function findRigIdx(store, id) {
  for (let i = 0; i < store.rigs.length; i++) {
    if (store.rigs[i] && String(store.rigs[i].id) === id) return i;
  }
  return -1;
}

async function persist(env, store) {
  const stamp = new Date().toISOString();
  store.meta = { updated: stamp };
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
    version: 1,
    counter: store.counter,
    svcCounter: store.svcCounter,
    rigs: store.rigs,
    meta: store.meta,
  }));
  return stamp;
}

function outputRigs(store) {
  return store.rigs
    .filter(function (r) { return r && !r.archived; })
    .map(cleanRig);
}

// ---- GET: return the non-archived rigs (OFFICE ONLY) -----------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, OFFICE_AREA);
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      // No KV -> hand back the seed so the office view still renders (read-only).
      return json({ ok: true, rigs: seedRigs().map(cleanRig), meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; showing seed rigs (edits will not persist).' });
    }
    const store = await loadStore(env);
    return json({ ok: true, rigs: outputRigs(store), meta: store.meta });
  } catch (err) {
    console.error('api/equipment-log GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: mutate the log (OFFICE ONLY) ------------------------------------
// Actions:
//   { action:'add-rig', name(required), type, category, role, status, project,
//       specs, hours, dailyRate, lastService, nextService }
//   { action:'update-rig', id(required), <same editable fields as add-rig> }
//        -- seed rigs: id + seed flag are protected; everything else editable.
//   { action:'remove-rig', id(required) }        -- soft-delete (archived:true)
//   { action:'add-service', id(required rig id), date, type, desc(required), cost, by }
//   { action:'remove-service', id(required rig id), svcId(required) }  -- hard remove one entry
//   { action:'append-service', id(required rig id), date, type, desc(required),
//       cost, taskKey } -- the MAINTENANCE HANDOFF. `by` is SERVER-set from the
//       session; taskKey dedupes so the same completed task never double-appends.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, OFFICE_AREA);
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const action = String((parsed && parsed.action) || '');
    const ACTIONS = ['add-rig', 'update-rig', 'remove-rig', 'add-service', 'remove-service', 'append-service'];
    if (ACTIONS.indexOf(action) < 0) {
      return json({ status: 'error', message: 'Unknown action.' }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadStore(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';

    // Build a clean editable-field object shared by add-rig / update-rig.
    function readRigFields(p) {
      return {
        name: s(p && p.name, MAX_SHORT).trim(),
        type: normRigType(p && p.type),
        category: s(p && p.category, MAX_SHORT),
        role: s(p && p.role, MAX_SHORT),
        status: s(p && p.status, MAX_SHORT),
        project: s(p && p.project, MAX_SHORT),
        specs: s(p && p.specs, MAX_SPECS),
        hours: num(p && p.hours),
        dailyRate: num(p && p.dailyRate),
        lastService: s(p && p.lastService, 40),
        nextService: s(p && p.nextService, 40),
      };
    }

    if (action === 'add-rig') {
      if (store.rigs.length >= MAX_RIGS) {
        return json({ status: 'error', message: 'Equipment log is full.' }, 413);
      }
      const f = readRigFields(parsed);
      if (!f.name) return json({ status: 'error', message: 'Rig name is required.' }, 400);
      const counter = (Number.isInteger(store.counter) ? store.counter : 0) + 1;
      const rec = Object.assign({ id: 'eq_' + counter }, f, {
        serviceHistory: [], archived: false, seed: false,
      });
      store.rigs.push(rec);
      store.counter = counter;

    } else if (action === 'update-rig') {
      const id = s(parsed && parsed.id, MAX_ID);
      if (!id) return json({ status: 'error', message: 'id is required.' }, 400);
      if (isBadKey(id)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      const idx = findRigIdx(store, id);
      if (idx < 0 || (store.rigs[idx] && store.rigs[idx].archived)) {
        return json({ status: 'error', message: 'Unknown rig id.' }, 400);
      }
      const f = readRigFields(parsed);
      if (!f.name) return json({ status: 'error', message: 'Rig name is required.' }, 400);
      const cur = store.rigs[idx];
      // id + seed flag + serviceHistory are NOT overwritten from the body.
      store.rigs[idx] = Object.assign({}, cur, f, {
        id: cur.id, seed: !!cur.seed,
        serviceHistory: Array.isArray(cur.serviceHistory) ? cur.serviceHistory : [],
        archived: false,
      });

    } else if (action === 'remove-rig') {
      const id = s(parsed && parsed.id, MAX_ID);
      if (!id) return json({ status: 'error', message: 'id is required.' }, 400);
      if (isBadKey(id)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      const idx = findRigIdx(store, id);
      if (idx < 0) return json({ status: 'error', message: 'Unknown rig id.' }, 400);
      if (store.rigs[idx] && store.rigs[idx].seed) {
        return json({ status: 'error', message: 'The three primary rigs cannot be removed.' }, 400);
      }
      if (store.rigs[idx] && !store.rigs[idx].archived) store.rigs[idx].archived = true;

    } else if (action === 'add-service' || action === 'append-service') {
      const id = s(parsed && parsed.id, MAX_ID);
      if (!id) return json({ status: 'error', message: 'rig id is required.' }, 400);
      if (isBadKey(id)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      const idx = findRigIdx(store, id);
      if (idx < 0 || (store.rigs[idx] && store.rigs[idx].archived)) {
        return json({ status: 'error', message: 'Unknown rig id.' }, 400);
      }
      const rig = store.rigs[idx];
      const hist = Array.isArray(rig.serviceHistory) ? rig.serviceHistory : (rig.serviceHistory = []);
      const desc = s(parsed && parsed.desc, MAX_DESC).trim();
      if (!desc) return json({ status: 'error', message: 'Service description is required.' }, 400);

      // append-service (maintenance handoff): dedupe by taskKey so a completed
      // task never appends twice; `by` is SERVER-set (never from the body).
      if (action === 'append-service') {
        const taskKey = s(parsed && parsed.taskKey, MAX_ID);
        if (taskKey && !isBadKey(taskKey)) {
          for (let i = 0; i < hist.length; i++) {
            if (hist[i] && String(hist[i].taskKey) === taskKey) {
              // Already recorded -> idempotent success (no duplicate entry).
              const stampD = await persist(env, store);
              return json({ ok: true, saved: false, duplicate: true, action, rigs: outputRigs(store), meta: { updated: stampD } });
            }
          }
        }
        if (hist.length >= MAX_HISTORY) {
          return json({ status: 'error', message: 'Service history is full for this rig.' }, 413);
        }
        const svcCounter = (Number.isInteger(store.svcCounter) ? store.svcCounter : 0) + 1;
        // A handoff entry defaults to type 'Field' (it came off a field task) when
        // the caller does not name a valid service type.
        const svcType = (parsed && parsed.type != null) ? normSvcType(parsed.type) : 'Field';
        hist.unshift({
          id: 'sv_' + svcCounter,
          date: s(parsed && parsed.date, 40) || new Date().toISOString().slice(0, 10),
          type: svcType,
          desc: desc,
          cost: num(parsed && parsed.cost),
          by: who,                 // SERVER-set from the session, never the body
          source: 'maintenance-task',
          taskKey: taskKey,
        });
        store.svcCounter = svcCounter;
      } else {
        // Manual add-service (office user typing an entry directly).
        if (hist.length >= MAX_HISTORY) {
          return json({ status: 'error', message: 'Service history is full for this rig.' }, 413);
        }
        const svcCounter = (Number.isInteger(store.svcCounter) ? store.svcCounter : 0) + 1;
        hist.unshift({
          id: 'sv_' + svcCounter,
          date: s(parsed && parsed.date, 40) || new Date().toISOString().slice(0, 10),
          type: normSvcType(parsed && parsed.type),
          desc: desc,
          cost: num(parsed && parsed.cost),
          by: s(parsed && parsed.by, MAX_SHORT) || who,
          source: 'manual',
          taskKey: '',
        });
        store.svcCounter = svcCounter;
      }
      // Keep the rig's lastService in sync with the newest entry date.
      const newest = hist[0] && hist[0].date ? hist[0].date : rig.lastService;
      if (newest) rig.lastService = s(newest, 40);

    } else if (action === 'remove-service') {
      const id = s(parsed && parsed.id, MAX_ID);
      const svcId = s(parsed && parsed.svcId, MAX_ID);
      if (!id || !svcId) return json({ status: 'error', message: 'rig id and svcId are required.' }, 400);
      if (isBadKey(id) || isBadKey(svcId)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      const idx = findRigIdx(store, id);
      if (idx < 0) return json({ status: 'error', message: 'Unknown rig id.' }, 400);
      const rig = store.rigs[idx];
      const hist = Array.isArray(rig.serviceHistory) ? rig.serviceHistory : [];
      let found = false;
      const next = [];
      for (let i = 0; i < hist.length; i++) {
        if (hist[i] && String(hist[i].id) === svcId) { found = true; continue; }
        next.push(hist[i]);
      }
      if (!found) return json({ status: 'error', message: 'Unknown service entry.' }, 400);
      rig.serviceHistory = next;
    }

    const stamp = await persist(env, store);
    return json({ ok: true, saved: true, action, rigs: outputRigs(store), meta: { updated: stamp } });
  } catch (err) {
    console.error('api/equipment-log POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
