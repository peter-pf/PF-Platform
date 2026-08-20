// Cloudflare Pages Function -- /api/inventory
// EDITABLE OVERLAY for the Inventory tab (mod-inventory in index.html).
// The tab renders the read-only seed feed (data/inventory.js) MERGED with a small
// KV override map. Two override kinds, both stored HERE (the seed stays immutable):
//
//   1) qty    -- the per-(location,item) "Actual Qty on Hand" (v1; unchanged).
//   2) fields -- per-ITEM field overrides so the office can SELF-CORRECT the seed
//                data (description, manufacturer, part#, alt sources, notes, and the
//                per-location required stock reqTrailer/reqHome). Added 2026-08-13
//                for Derek's temporary full-row Edit mode (CHANGE B).
//
// WHY store field edits in KV (not by rewriting data/inventory.js): the seed is a
// static feed committed to the repo. Persisting Derek's corrections as a KV overlay
// lets edits survive WITHOUT a code change / redeploy per correction, mirrors the
// existing qty-override pattern, and keeps the seed as an auditable baseline. When
// the corrections settle, the office overrides can be folded back into the seed and
// the overrides cleared. (Documented approach + limitation in the branch summary.)
//
// WHAT IT STORES
//   inventory_qty_v1 -> JSON {
//     version, meta:{updated},
//     qty:    { "<locationId>::<itemId>": { qty:<number|null>, updatedAt, updatedBy } },
//     fields: { "<itemId>":               { <fieldOverrides...>, updatedAt, updatedBy } }
//   }
//   (KV_KEY kept as 'inventory_qty_v1' so the existing qty overrides are preserved.)
//   Clearing a qty (null/'') DELETES its key. Clearing a field (null/'') removes just
//   that field from the item's override; emptying the last field DELETES the item key.
//
// KEY SCHEMES:
//   qty    key = `${locationId}::${itemId}` (per-location; required for Actual qty).
//   fields key = `${itemId}` (per-item; description/mfr/part#/etc. are intrinsic to
//                the item, not the location, so one override serves both locations).
//   Both are treated as OPAQUE validated strings (length-capped, angle-stripped,
//   prototype-pollution guarded); the server does NOT re-derive them.
//
// SECURITY MODEL (unchanged):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - READ (GET): 'general' area = admin/partner/business_dev/field_ops. The whole
//     company can VIEW; ZERO financials in this feed.
//   - WRITE (POST): OFFICE ONLY. requireArea(session, 'financials') =
//     admin/partner/business_dev; field_ops is BLOCKED from EDITING (403). Applies to
//     BOTH the qty action AND the new fields action. Fails CLOSED on missing session.
//   - updatedAt + updatedBy are ALWAYS server-set from the session (never the body).
//   - WRITE hardening: body-size cap -> 413, strict JSON -> 400, keys rebuilt +
//     length-capped + angle-stripped, prototype-pollution guard, qty validated as a
//     finite non-negative number (or null), field values length-capped strings (or
//     null to clear), only an ALLOWLIST of field names accepted, entry caps -> 413,
//     private no-store. NO mail, NO outbound fetch.
//
// v2 SEAM (NOT built here): qty becomes a per-location CONSUMPTION + TRANSFER LEDGER.
// The field overrides fold back into the seed / metadata DB. Same /api/inventory path.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'inventory_qty_v1';
const MAX_BODY_BYTES = 32 * 1024;   // 32KB request cap
const MAX_QTY_ENTRIES = 5000;       // total qty override entries cap
const MAX_FIELD_ENTRIES = 5000;     // total per-item field override entries cap
const MAX_KEY = 200;                // composite key length cap
const MAX_QTY_VALUE = 1e9;          // sane upper bound on a quantity
const MAX_FIELD_LEN = 2000;         // per text-field value length cap

// Editable per-item text fields (CHANGE B). "reqTrailer"/"reqHome" are numeric and
// handled separately below. Anything NOT in these allowlists is rejected.
const TEXT_FIELDS = ['description', 'manufacturer', 'mfrPart', 'altSources', 'notes'];
const NUM_FIELDS  = ['reqTrailer', 'reqHome'];

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_KEY) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, ''); // strip angle brackets (UI also escapes)
}

// key is used as an object key -> reject prototype-chain writes.
function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION (same as maintenance-status.js): KV read-modify-write, no
// transaction, so two simultaneous writes can last-writer-wins. Acceptable for the
// low-concurrency inventory edit flow; the durable fix is the v2 D1 ledger.
async function loadStore(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { qty: {}, fields: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      qty: (parsed && parsed.qty && typeof parsed.qty === 'object') ? parsed.qty : {},
      fields: (parsed && parsed.fields && typeof parsed.fields === 'object') ? parsed.fields : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { qty: {}, fields: {}, meta: { updated: null } };
  }
}

async function saveStore(env, store) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
    version: 2, qty: store.qty, fields: store.fields, meta: { updated: stamp },
  }));
  return stamp;
}

function who(session) {
  return (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
}

// ---- GET: read the whole override map (loaded alongside the seed feed) -------
// READ is everyone-viewable ('general'). Returns both qty + fields overrides.
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'general');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, qty: {}, fields: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no inventory overrides stored yet.' });
    }
    const store = await loadStore(env);
    return json({ ok: true, qty: store.qty, fields: store.fields, meta: store.meta });
  } catch (err) {
    console.error('api/inventory GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: two actions, both OFFICE-ONLY (financials area) --------------------
//  action:'set'    -> set/clear ONE (location,item) Actual Qty on Hand (v1, qty map).
//                     Body: { action:'set', key:'<loc>::<item>', qty:<number|null> }
//  action:'setFields' -> set/clear per-ITEM field overrides (CHANGE B, fields map).
//                     Body: { action:'setFields', item:'<itemId>', fields:{...} }
//                     Each field value: string (text) / number (reqTrailer/reqHome)
//                     to SET, or null/'' to CLEAR that one field.
// field_ops -> 403 for BOTH actions. Fails CLOSED on missing session.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  // EDIT gate: office only (admin/partner/business_dev). field_ops -> 403.
  const denied = requireArea(session, 'financials');
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

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    if (action === 'set') {
      return await handleSetQty(env, session, parsed);
    }
    if (action === 'setFields') {
      return await handleSetFields(env, session, parsed);
    }
    return json({ status: 'error', message: "action must be 'set' or 'setFields'." }, 400);
  } catch (err) {
    console.error('api/inventory POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- action:'set' -- Actual Qty on Hand (unchanged behavior) -----------------
async function handleSetQty(env, session, parsed) {
  const key = s(parsed && parsed.key, MAX_KEY);
  if (!key) return json({ status: 'error', message: 'key is required.' }, 400);
  if (isBadKey(key)) return json({ status: 'error', message: 'Invalid key.' }, 400);
  if (key.indexOf('::') < 1) return json({ status: 'error', message: 'Malformed key.' }, 400);

  let clear = false;
  let qty = null;
  const rawQty = parsed && parsed.qty;
  if (rawQty === null || rawQty === '' || typeof rawQty === 'undefined') {
    clear = true;
  } else {
    const n = Number(rawQty);
    if (!Number.isFinite(n) || n < 0 || n > MAX_QTY_VALUE) {
      return json({ status: 'error', message: 'qty must be a number between 0 and 1e9, or null to clear.' }, 400);
    }
    qty = n;
  }

  const store = await loadStore(env);

  if (clear) {
    delete store.qty[key];
  } else {
    if (!Object.prototype.hasOwnProperty.call(store.qty, key)
        && Object.keys(store.qty).length >= MAX_QTY_ENTRIES) {
      return json({ status: 'error', message: 'Inventory override store is full.' }, 413);
    }
    store.qty[key] = {
      qty,
      updatedAt: new Date().toISOString(),  // SERVER-SET, never from the body
      updatedBy: who(session),              // SERVER-SET from the session
    };
  }

  const stamp = await saveStore(env, store);
  return json({ ok: true, saved: true, key, qty: clear ? null : qty, cleared: clear, meta: { updated: stamp } });
}

// ---- action:'setFields' -- per-item field overrides (CHANGE B) ---------------
// Accepts an object of field -> value. Only allowlisted fields are honored; unknown
// fields are IGNORED (not an error, so a client can send a whole row safely). A value
// of null/'' clears that field. Text fields are length-capped + angle-stripped;
// reqTrailer/reqHome accept a non-negative integer or null (=> "TBD"/no requirement).
async function handleSetFields(env, session, parsed) {
  const itemId = s(parsed && parsed.item, MAX_KEY);
  if (!itemId) return json({ status: 'error', message: 'item is required.' }, 400);
  if (isBadKey(itemId)) return json({ status: 'error', message: 'Invalid item.' }, 400);

  const inFields = (parsed && parsed.fields && typeof parsed.fields === 'object' && !Array.isArray(parsed.fields))
    ? parsed.fields : null;
  if (!inFields) return json({ status: 'error', message: 'fields object is required.' }, 400);

  // Build the set of clean changes (value) + clears (null) from the allowlists.
  const setVals = {};   // field -> cleaned value to store
  const clears = [];    // field names to remove
  let sawAny = false;

  for (const f of TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(inFields, f)) continue;
    sawAny = true;
    const raw = inFields[f];
    // null/undefined = CLEAR (delete override -> fall back to seed value).
    // '' = a TEXT field DELIBERATELY BLANKED: store the empty string (key present)
    //      so it persists as blank and does NOT revert to the seed on re-render/reload.
    //      '' is a valid bounded value; s('') === '' after strip/cap, still sanitized.
    if (raw === null || typeof raw === 'undefined') { clears.push(f); continue; }
    setVals[f] = s(raw, MAX_FIELD_LEN);
  }
  for (const f of NUM_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(inFields, f)) continue;
    sawAny = true;
    const raw = inFields[f];
    if (raw === null || raw === '' || typeof raw === 'undefined') { clears.push(f); continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_QTY_VALUE || Math.floor(n) !== n) {
      return json({ status: 'error', message: f + ' must be a non-negative whole number, or null to clear.' }, 400);
    }
    setVals[f] = n;
  }

  if (!sawAny) return json({ status: 'error', message: 'No editable fields provided.' }, 400);

  const store = await loadStore(env);
  const existing = (store.fields[itemId] && typeof store.fields[itemId] === 'object') ? store.fields[itemId] : null;

  // Cap NEW item overrides (re-editing an existing item never grows the map).
  if (!existing && Object.keys(store.fields).length >= MAX_FIELD_ENTRIES) {
    return json({ status: 'error', message: 'Inventory field-override store is full.' }, 413);
  }

  const rec = existing ? Object.assign({}, existing) : {};
  for (const f of clears) delete rec[f];
  Object.assign(rec, setVals);

  // If every override field was cleared, drop the item key entirely.
  const dataKeys = Object.keys(rec).filter(k => k !== 'updatedAt' && k !== 'updatedBy');
  if (dataKeys.length === 0) {
    delete store.fields[itemId];
    const stamp = await saveStore(env, store);
    return json({ ok: true, saved: true, item: itemId, fields: {}, cleared: true, meta: { updated: stamp } });
  }

  rec.updatedAt = new Date().toISOString();  // SERVER-SET
  rec.updatedBy = who(session);              // SERVER-SET
  store.fields[itemId] = rec;

  const stamp = await saveStore(env, store);
  const out = {};
  for (const k of dataKeys) out[k] = rec[k];
  return json({ ok: true, saved: true, item: itemId, fields: out, cleared: false, meta: { updated: stamp } });
}
