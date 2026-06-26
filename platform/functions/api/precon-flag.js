// Cloudflare Pages Function -- /api/precon-flag
// Per-bid PRECONSTRUCTION boolean flags overlay. Today it stores ONE flag:
// sentToGarbin (all bid docs sent to Garbin for that job). Single KV map keyed by
// the stable bid id. Mirrors the precon-log.js / precon-action.js KV + write
// hardening pattern. NO mail, NO outbound fetch.
//
// WHAT IT STORES
//   precon_flags_v1 -> JSON { flags: { <bidId>: { sentToGarbin:bool, by, at } },
//                             meta: { updated } }
//   Lives ONLY in KV; the precon-pipeline.js base is read-only, so a re-sync
//   never erases the flags.
//
// BID ID SCHEME (consistent with precon-pipeline.js + the client resolveKey()):
//   bidId = 'num_<project number>' when the bid has a real number, else
//   'ng_<hash of name+gc>'. The CLIENT computes it (bidLogId/resolveKey) and
//   passes it; the server only validates + length-caps it (opaque key here).
//
// SECURITY MODEL:
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401. PRECONSTRUCTION area enforced HERE via requireArea on GET AND POST AND
//     in lib/auth.js areaForPath('/api/precon-flag') -> 'preconstruction'.
//     Allowed: admin, partner, business_dev. field_ops BLOCKED by direct URL too.
//     Fails CLOSED.
//   - WRITE hardening (mirrors api/precon-log.js): body size cap, strict JSON
//     parse -> 400, fields rebuilt + length-capped, angle brackets stripped,
//     server-set by/at from the session, no eval. Private no-store.
//   - NO mail is sent and NO mail API is called.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'precon_flags_v1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_FLAGS = 20000;          // total tracked bids cap
const MAX_SHORT = 300;            // bidId cap

const VALID_FLAG = { sentToGarbin: 1 };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, ''); // strip angle brackets (front-end also escapes)
}

// KNOWN LIMITATION: KV read-modify-write (load map -> set one -> put), no
// transaction, so two simultaneous toggles to DIFFERENT bids can last-writer-wins
// and drop one. Acceptable for precon's low-concurrency flagging; the durable fix
// is a D1 migration with a row per bid. No behavior change now.
async function loadFlags(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { flags: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      flags: (parsed && parsed.flags && typeof parsed.flags === 'object') ? parsed.flags : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { flags: {}, meta: { updated: null } };
  }
}

// ---- GET: read the whole flag map (loaded alongside the bids) ---------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, flags: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no flags stored yet.' });
    }
    const store = await loadFlags(env);
    return json({ ok: true, flags: store.flags, meta: store.meta });
  } catch (err) {
    console.error('api/precon-flag GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set one bid's one flag -----------------------------------------
// Body: { bidId, flag:'sentToGarbin', value:bool }
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'preconstruction');
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const bidId = s(parsed && parsed.bidId, MAX_SHORT);
    if (!bidId) return json({ status: 'error', message: 'bidId is required.' }, 400);
    // Prototype-pollution guard: bidId is used as an object key on store.flags, so
    // reject keys that would write to the prototype chain. Low-impact today (the
    // map is only read by bidId), but this keeps any future spread/iterate of
    // store.flags safe. (Object.create(null) in loadFlags is the alternative.)
    if (bidId === '__proto__' || bidId === 'constructor' || bidId === 'prototype') {
      return json({ status: 'error', message: 'Invalid bidId.' }, 400);
    }

    const flag = String((parsed && parsed.flag) || 'sentToGarbin');
    if (!VALID_FLAG[flag]) {
      return json({ status: 'error', message: "flag must be 'sentToGarbin'." }, 400);
    }
    const value = !!(parsed && parsed.value);

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadFlags(env);
    if (!store.flags[bidId] && Object.keys(store.flags).length >= MAX_FLAGS) {
      return json({ status: 'error', message: 'Flag store is full.' }, 413);
    }

    const by = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = new Date().toISOString();
    const rec = store.flags[bidId] || {};
    rec[flag] = value;
    rec.by = by;
    rec.at = stamp;
    store.flags[bidId] = rec;

    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, flags: store.flags, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, bidId, flag, value, flags: store.flags, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/precon-flag POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
