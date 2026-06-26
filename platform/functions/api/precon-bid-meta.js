// Cloudflare Pages Function -- /api/precon-bid-meta
// Per-bid PRECONSTRUCTION metadata overlay for the Actively Pricing module.
// One KV map keyed by the stable bid id holds, per bid:
//   - date OVERRIDES (Prelim "Design Completed Date" + "Bid Due Date") so an
//     addendum-shifted date can be corrected without touching the read-only feed;
//   - the BIDDING GCS list (multiple GCs can bid the same job);
//   - the AWARDED GC index (which GC of record won).
// Mirrors the precon-flag.js / precon-log.js KV + write-hardening pattern.
// NO mail, NO outbound fetch. ZERO financials (GC info + dates are not money).
//
// WHAT IT STORES
//   precon_bid_meta_v1 -> JSON {
//     meta: { updated },
//     bids: { <bidId>: {
//       dates:     { designCompletedDate?, dueDate? },  // ISO YYYY-MM-DD, only set ones present
//       gcs:       [ { company, contact, email, phone } ],
//       awardedGc: <int index into gcs, or -1>,
//       by, at
//     } }
//   }
//   Lives ONLY in KV; the precon-pipeline.js base is read-only so a re-sync never
//   erases this overlay.
//
// BID ID SCHEME (consistent with precon-pipeline.js + the client resolveKey()):
//   bidId = 'num_<project number>' when the bid has a real number, else
//   'ng_<hash of name+gc>'. The CLIENT computes it (bidLogId/resolveKey) and
//   passes it; the server only validates + length-caps it (opaque key here).
//
// SECURITY MODEL:
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401. PRECONSTRUCTION area enforced HERE via requireArea on GET AND POST AND
//     in lib/auth.js areaForPath('/api/precon-bid-meta') -> 'preconstruction'.
//     Allowed: admin, partner, business_dev. field_ops BLOCKED by direct URL too.
//     Fails CLOSED.
//   - WRITE hardening (mirrors api/precon-flag.js): body size cap, strict JSON
//     parse -> 400, every string rebuilt + length-capped + angle-stripped, dates
//     validated to ISO YYYY-MM-DD (junk rejected), gcs array capped, awardedGc
//     coerced to a bounded int, bidId prototype-pollution guard, server-set by/at.
//     Private no-store.
//   - NO mail is sent and NO mail API is called.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'precon_bid_meta_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_BIDS = 20000;     // total tracked bids cap
const MAX_SHORT = 300;      // bidId / company / contact / phone cap
const MAX_EMAIL = 200;      // email cap
const MAX_GCS = 12;         // bidding GCs per bid cap

const VALID_DATE_FIELD = { designCompletedDate: 1, dueDate: 1 };

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

// Validate / normalize a date to ISO YYYY-MM-DD, or '' to clear. Anything that is
// not a clean ISO date (and not the empty clear-value) is rejected by the caller.
function normIsoDate(v) {
  if (v == null) return '';
  const str = String(v).trim();
  if (str === '') return '';
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null; // junk -> caller returns 400
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return str;
}

// Rebuild one GC entry from untrusted input, length-capping every field.
function normGc(g) {
  g = g || {};
  return {
    company: s(g.company, MAX_SHORT),
    contact: s(g.contact, MAX_SHORT),
    email: s(g.email, MAX_EMAIL),
    phone: s(g.phone, MAX_SHORT),
  };
}

function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION: KV read-modify-write (load map -> set one bid -> put), no
// transaction, so two simultaneous writes to DIFFERENT bids can last-writer-wins
// and drop one. Acceptable for precon's low-concurrency editing; the durable fix
// is a D1 migration with a row per bid. No behavior change now.
async function loadMeta(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { bids: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      bids: (parsed && parsed.bids && typeof parsed.bids === 'object') ? parsed.bids : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { bids: {}, meta: { updated: null } };
  }
}

// ---- GET: read the whole bid-meta map (loaded alongside the bids) -----------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, bids: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no bid meta stored yet.' });
    }
    const store = await loadMeta(env);
    return json({ ok: true, bids: store.bids, meta: store.meta });
  } catch (err) {
    console.error('api/precon-bid-meta GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set one bid's meta via a sub-action -----------------------------
// Body (one of):
//   { action:'setDate',      bidId, field:'designCompletedDate'|'dueDate', value:ISO|'' }
//   { action:'setGcs',       bidId, gcs:[ {company,contact,email,phone}, ... ] }
//   { action:'setAwardedGc', bidId, index:int }
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

    const action = String((parsed && parsed.action) || '');
    if (action !== 'setDate' && action !== 'setGcs' && action !== 'setAwardedGc') {
      return json({ status: 'error', message: 'Unknown action.' }, 400);
    }

    const bidId = s(parsed && parsed.bidId, MAX_SHORT);
    if (!bidId) return json({ status: 'error', message: 'bidId is required.' }, 400);
    // Prototype-pollution guard: bidId is used as an object key on store.bids, so
    // reject keys that would write to the prototype chain.
    if (isBadKey(bidId)) return json({ status: 'error', message: 'Invalid bidId.' }, 400);

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadMeta(env);
    if (!store.bids[bidId] && Object.keys(store.bids).length >= MAX_BIDS) {
      return json({ status: 'error', message: 'Bid meta store is full.' }, 413);
    }

    // Start from the existing record (or a fresh, prototype-free shape).
    const prev = store.bids[bidId] || {};
    const rec = {
      dates: (prev.dates && typeof prev.dates === 'object') ? {
        designCompletedDate: s(prev.dates.designCompletedDate, 10) || undefined,
        dueDate: s(prev.dates.dueDate, 10) || undefined,
      } : {},
      gcs: Array.isArray(prev.gcs) ? prev.gcs.slice(0, MAX_GCS).map(normGc) : [],
      awardedGc: Number.isInteger(prev.awardedGc) ? prev.awardedGc : -1,
    };
    // Drop any undefined date keys so we only persist set ones.
    if (rec.dates.designCompletedDate === undefined) delete rec.dates.designCompletedDate;
    if (rec.dates.dueDate === undefined) delete rec.dates.dueDate;

    if (action === 'setDate') {
      const field = String((parsed && parsed.field) || '');
      if (!VALID_DATE_FIELD[field]) {
        return json({ status: 'error', message: "field must be 'designCompletedDate' or 'dueDate'." }, 400);
      }
      const iso = normIsoDate(parsed && parsed.value);
      if (iso === null) return json({ status: 'error', message: 'value must be an ISO date (YYYY-MM-DD) or empty.' }, 400);
      if (iso === '') delete rec.dates[field];
      else rec.dates[field] = iso;
    } else if (action === 'setGcs') {
      const arr = (parsed && Array.isArray(parsed.gcs)) ? parsed.gcs : null;
      if (!arr) return json({ status: 'error', message: 'gcs must be an array.' }, 400);
      if (arr.length > MAX_GCS) return json({ status: 'error', message: 'Too many GCs (max ' + MAX_GCS + ').' }, 400);
      rec.gcs = arr.map(normGc);
      // Keep awardedGc in range after the list changes.
      if (rec.awardedGc >= rec.gcs.length) rec.awardedGc = -1;
    } else if (action === 'setAwardedGc') {
      let idx = parseInt(parsed && parsed.index, 10);
      if (!Number.isInteger(idx)) return json({ status: 'error', message: 'index must be an integer.' }, 400);
      if (idx < -1) idx = -1;
      if (idx >= rec.gcs.length) return json({ status: 'error', message: 'index is out of range for the GC list.' }, 400);
      rec.awardedGc = idx;
    }

    rec.by = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    rec.at = new Date().toISOString();
    store.bids[bidId] = rec;

    const stamp = rec.at;
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, bids: store.bids, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, bidId, action, bids: store.bids, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/precon-bid-meta POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
