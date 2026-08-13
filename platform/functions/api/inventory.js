// Cloudflare Pages Function -- /api/inventory
// v1 EDITABLE OVERLAY for the Inventory tab (mod-inventory in index.html).
// The tab renders the read-only seed feed (data/inventory.js). The ONE editable
// field in v1 -- "Actual Qty on Hand", per location -- is stored HERE as a small
// KV override map, merged on top of the seed at render (mirrors the
// maintenance-status.js / precon-bid-meta.js overlay pattern). The seed stays
// immutable; only the override map changes.
//
// WHAT IT STORES
//   inventory_qty_v1 -> JSON {
//     meta: { updated },
//     qty: { "<locationId>::<itemId>": { qty:<number|null>, updatedAt:ISO, updatedBy:string } }
//   }
//   Clearing a value (qty === null / '') DELETES the key so the map stays small.
//
// KEY SCHEME: `${locationId}::${itemId}` -- both come from data/inventory.js
//   (locations[].id and items[].id). The CLIENT builds the same key. The server
//   treats it as an OPAQUE validated string (length-capped, angle-stripped,
//   prototype-pollution guarded); it does NOT re-derive it.
//
// SECURITY MODEL:
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - READ (GET): 'general' area = admin/partner/business_dev/field_ops. The whole
//     company can VIEW live quantities (SPEC: everyone-viewable). ZERO financials.
//   - WRITE (POST): OFFICE ONLY. Enforced here via requireArea(session,
//     'financials') = admin/partner/business_dev; field_ops is BLOCKED from EDITING
//     (SPEC: "edits/mutations still gated"). NOTE the path itself is classified
//     'general' in areaForPath so the crew's GET is allowed; this handler tightens
//     the POST to the office. Fails CLOSED on a missing session.
//   - updatedAt + updatedBy are ALWAYS server-set from the session (never from the
//     body) so a client cannot forge who/when.
//   - WRITE hardening: body-size cap -> 413, strict JSON -> 400, key rebuilt +
//     length-capped + angle-stripped, prototype-pollution guard, qty validated as a
//     finite non-negative number (or null to clear), total entries capped -> 413,
//     private no-store. NO mail, NO outbound fetch.
//
// v2 SEAM (NOT built here): this flat single-value override becomes a per-location
// CONSUMPTION + TRANSFER LEDGER (daily-report auto-deduct + farm->trailer transfer).
// The KV_KEY + key scheme are intentionally location-scoped already so a ledger can
// slot in behind the same /api/inventory path without a client change to the read
// merge. See the v2 build-plan in the branch summary.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'inventory_qty_v1';
const MAX_BODY_BYTES = 32 * 1024;   // 32KB request cap
const MAX_QTY_ENTRIES = 5000;       // total override entries cap
const MAX_KEY = 200;                // composite key length cap
const MAX_QTY_VALUE = 1e9;          // sane upper bound on a quantity

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

// key is used as an object key on store.qty -> reject prototype-chain writes.
function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION (same as maintenance-status.js): KV read-modify-write, no
// transaction, so two simultaneous writes can last-writer-wins. Acceptable for the
// low-concurrency inventory edit flow; the durable fix is the v2 D1 ledger.
async function loadQty(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { qty: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      qty: (parsed && parsed.qty && typeof parsed.qty === 'object') ? parsed.qty : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { qty: {}, meta: { updated: null } };
  }
}

// ---- GET: read the whole override map (loaded alongside the seed feed) -------
// READ is everyone-viewable ('general'): the SPEC makes the tab viewable to all.
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'general');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, qty: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no inventory overrides stored yet.' });
    }
    const store = await loadQty(env);
    return json({ ok: true, qty: store.qty, meta: store.meta });
  } catch (err) {
    console.error('api/inventory GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set / clear one (location,item) Actual Qty on Hand ---------------
// Body: { action:'set', key:'<locationId>::<itemId>', qty:<number|null> }
//   qty a finite >=0 number -> store { qty, updatedAt:<server ISO>, updatedBy:<session> }
//   qty null / '' -> DELETE the key (revert to the seed baseline)
// WRITE is OFFICE-ONLY (financials area); field_ops is blocked from editing.
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
    if (action !== 'set') {
      return json({ status: 'error', message: "action must be 'set'." }, 400);
    }

    const key = s(parsed && parsed.key, MAX_KEY);
    if (!key) return json({ status: 'error', message: 'key is required.' }, 400);
    if (isBadKey(key)) return json({ status: 'error', message: 'Invalid key.' }, 400);
    // Basic shape check: must contain the location::item separator.
    if (key.indexOf('::') < 1) return json({ status: 'error', message: 'Malformed key.' }, 400);

    // qty: null/'' -> clear; otherwise a finite non-negative number.
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

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadQty(env);

    if (clear) {
      delete store.qty[key];
    } else {
      // Cap total stored entries. Allow re-setting an EXISTING key even when full
      // (does not grow the map); block only a NEW key past the cap.
      if (!Object.prototype.hasOwnProperty.call(store.qty, key)
          && Object.keys(store.qty).length >= MAX_QTY_ENTRIES) {
        return json({ status: 'error', message: 'Inventory override store is full.' }, 413);
      }
      const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
      store.qty[key] = {
        qty,
        updatedAt: new Date().toISOString(),  // SERVER-SET, never from the body
        updatedBy: who,                       // SERVER-SET from the session
      };
    }

    const stamp = new Date().toISOString();
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, qty: store.qty, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, key, qty: clear ? null : qty, cleared: clear, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/inventory POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
