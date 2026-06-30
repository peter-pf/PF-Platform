// Cloudflare Pages Function -- /api/maintenance-status
// COMPLETION OVERLAY for the compiled Field Operations Maintenance checklist.
// The Maintenance tab (mod-maintenance in index.html) compiles every
// maintenance[] and futureIssues[] row from EVERY daily report (the read-only
// /api/daily-report feed). This endpoint stores ONLY the per-item completion
// record (done / completedAt / completedBy) keyed by a stable itemKey, so the
// historical daily reports stay IMMUTABLE (the failure really was logged that
// day) while owners can check items off a live schedule list.
//
// WHY A SEPARATE OVERLAY: never mutate maintenance[] inside a daily report (it
// is an audit record). The completion state lives here, joined to the compiled
// rows on the client by itemKey. Mirrors the precon-bid-meta.js overlay pattern.
//
// WHAT IT STORES
//   maintenance_status_v1 -> JSON {
//     meta: { updated },
//     status: { <itemKey>: { done:true, completedAt:ISO, completedBy:string } }
//   }
//   Only DONE items are stored; clearing an item DELETES its key (the map stays
//   small -- it never accumulates a row per item, only per completed item).
//
// ITEM KEY SCHEME (the CLIENT computes the SAME key; see mod-maintenance):
//   maintenance row:  `${reportId}::${djb2(category|type|subcategory|item|hourAtFailure)}`
//   futureIssue row:  `${reportId}::f${djb2(equipment|description)}`
//   reportId is the daily report record id (r.id). djb2 is the classic string
//   hash (see djb2 below) rendered as an unsigned base-36 string. The server does
//   NOT recompute the key -- it treats itemKey as an OPAQUE, validated string and
//   only the client derives it from the source row, so server + client must keep
//   the SAME djb2 + field-join order.
//   NOTE (v1, documented + acceptable): the key is derived from the row TEXT, so
//   EDITING a daily-report maintenance row (changing its category/type/sub/item/
//   hour, or a futureIssue's equipment/description) CHANGES its itemKey. A
//   completion recorded against the old text becomes orphaned (its key no longer
//   matches any compiled row) and the edited row shows as not-done again. This is
//   acceptable for v1: edits to a logged failure are rare, and re-checking is one
//   click. Orphaned keys are harmless (they just sit in the map) and are bounded
//   by MAX_STATUS_ENTRIES.
//
// SECURITY MODEL (mirrors daily-report.js / precon-bid-meta.js):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FIELD_OPS area enforced HERE via requireArea on GET AND POST, AND in
//     lib/auth.js areaForPath('/api/maintenance-status') -> 'field_ops'. The
//     field_ops area = admin/partner/business_dev/field_ops (same readership as
//     the daily reports it overlays). Fails CLOSED.
//   - completedAt + completedBy are ALWAYS server-set from the session -- they are
//     NEVER read from the request body, so a client cannot forge who/when.
//   - WRITE hardening: body size cap -> 413, strict JSON -> 400, itemKey rebuilt +
//     length-capped + angle-stripped, prototype-pollution guard on itemKey,
//     total stored entries capped -> 413, server-set audit, private no-store.
//   - NO mail, NO outbound fetch. ZERO financials (this endpoint stores only a
//     boolean + a timestamp + a user name -- no dollars/rates/costs anywhere).

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'maintenance_status_v1';
const MAX_BODY_BYTES = 32 * 1024;      // 32KB request cap
const MAX_STATUS_ENTRIES = 2000;       // total completed items cap
const MAX_KEY = 200;                   // itemKey length cap

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

// Prototype-pollution guard: itemKey is used as an object key on store.status, so
// reject keys that would write to the prototype chain.
function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION: KV read-modify-write (load map -> set/clear one key -> put),
// no transaction, so two simultaneous writes can last-writer-wins and drop one.
// Acceptable for the low-concurrency maintenance check-off flow; the durable fix
// is a D1 migration with a row per item. No behavior change now.
async function loadStatus(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { status: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      status: (parsed && parsed.status && typeof parsed.status === 'object') ? parsed.status : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { status: {}, meta: { updated: null } };
  }
}

// ---- GET: read the whole completion map (loaded alongside the compiled rows) --
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, status: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no maintenance status stored yet.' });
    }
    const store = await loadStatus(env);
    return json({ ok: true, status: store.status, meta: store.meta });
  } catch (err) {
    console.error('api/maintenance-status GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set / clear one item's completion record -------------------------
// Body: { action:'set', itemKey:<string>, done:<bool> }
//   done:true  -> store { done:true, completedAt:<server ISO>, completedBy:<session> }
//   done:false -> DELETE the key (revert to not-done)
// completedAt + completedBy are ALWAYS server-set (never client-supplied).
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');   // same readership as daily reports
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

    const itemKey = s(parsed && parsed.itemKey, MAX_KEY);
    if (!itemKey) return json({ status: 'error', message: 'itemKey is required.' }, 400);
    if (isBadKey(itemKey)) return json({ status: 'error', message: 'Invalid itemKey.' }, 400);

    // Strict boolean -- no string injection.
    const done = !!(parsed && parsed.done);

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadStatus(env);

    if (done) {
      // Cap total stored (completed) entries. Allow re-setting an EXISTING key even
      // when full (it does not grow the map); only block a NEW key past the cap.
      if (!Object.prototype.hasOwnProperty.call(store.status, itemKey)
          && Object.keys(store.status).length >= MAX_STATUS_ENTRIES) {
        return json({ status: 'error', message: 'Maintenance status store is full.' }, 413);
      }
      const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
      store.status[itemKey] = {
        done: true,
        completedAt: new Date().toISOString(),  // SERVER-SET, never from the body
        completedBy: who,                       // SERVER-SET from the session
      };
    } else {
      // Clearing reverts to not-done: drop the key so the map stays small.
      delete store.status[itemKey];
    }

    const stamp = new Date().toISOString();
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, status: store.status, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, itemKey, done, status: store.status, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/maintenance-status POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
