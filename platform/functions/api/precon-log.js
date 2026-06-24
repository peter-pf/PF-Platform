// Cloudflare Pages Function -- /api/precon-log
// Per-bid PRECONSTRUCTION activity log: changes, communications, notes, files
// (file REFERENCES only; no upload, no mail). Mirrors the bd-interaction KV
// pattern exactly. Append-only list per bid, keyed by a STABLE bid id.
//
// WHAT IT STORES
//   precon_log__<bidId>  ->  JSON { items:[...], meta:{updated} }
//   Each entry: { id, kind, date, who, channel, note, fileRef, addedBy, addedAt }
//     kind: 'note' | 'change' | 'comm' | 'file'
//     channel: optional (for comm: call/email/meeting/...); fileRef: optional
//              link/path for kind 'file' (the file itself is NOT stored here).
//   Lives ONLY in KV; the precon-pipeline.js base is read-only, so a re-sync
//   never erases the log.
//
// BID ID SCHEME (consistent with precon-pipeline.js + build-precon-historical.py):
//   bidId = the bid's Project Number when it is a real value, else a hash of
//   (Project Name + GC). The CLIENT computes it from the row and passes it; the
//   server only validates + length-caps it (it is an opaque key here).
//
// SECURITY MODEL:
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401. PRECONSTRUCTION area enforced HERE via requireArea AND in lib/auth.js
//     areaForPath('/api/precon-log') -> 'preconstruction'. Allowed: admin,
//     partner, business_dev. field_ops BLOCKED by direct URL too. Fails CLOSED.
//   - WRITE hardening (mirrors api/bd-interaction.js): body size cap, strict JSON
//     parse -> 400, schema rebuilt field by field + length caps, angle brackets
//     stripped, server-set addedBy/addedAt, no eval. Private no-store.
//   - NO mail is sent and NO mail API is called.

import { requireArea } from '../lib/auth.js';

const KV_PREFIX = 'precon_log__';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_ITEMS = 2000;               // per-bid cap
const MAX_STR = 4000;                 // note cap
const MAX_SHORT = 300;                // bidId/who/channel/fileRef/date cap

const VALID_KIND = { note: 1, change: 1, comm: 1, file: 1 };
const VALID_CHANNEL = {
  call: 1, email: 1, meeting: 1, text: 1, 'site visit': 1, portal: 1,
  voicemail: 1, other: 1,
};

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

function isoDateOrToday(v) {
  const str = String(v == null ? '' : v).slice(0, 40);
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function logKey(bidId) {
  return KV_PREFIX + bidId;
}

function rid() {
  return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// KNOWN LIMITATION: KV read-modify-write (load log -> push item -> put), no
// transaction, so two simultaneous appends to the SAME bid can last-writer-wins
// and drop one. Acceptable for precon's low-concurrency logging; the durable fix
// is a D1 migration with an INSERT per entry. No behavior change now.
async function loadLog(env, key) {
  const raw = await env.PF_SCHEDULE.get(key);
  if (!raw) return { items: [], meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed && parsed.items) ? parsed.items : [],
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { items: [], meta: { updated: null } };
  }
}

function readBidId(src) {
  const bidId = s(src && src.bidId, MAX_SHORT);
  return bidId || null;
}

// ---- GET: read one bid's activity log -------------------------------------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const bidId = readBidId({ bidId: url.searchParams.get('bidId') });
    if (!bidId) return json({ status: 'error', message: 'bidId is required.' }, 400);
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, bidId, items: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no activity logged yet.' });
    }
    const log = await loadLog(env, logKey(bidId));
    return json({ ok: true, bidId, items: log.items, meta: log.meta });
  } catch (err) {
    console.error('api/precon-log GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: append one activity entry --------------------------------------
// Body: { bidId, kind, date, who, channel?, note, fileRef? }
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

    const bidId = readBidId(parsed);
    if (!bidId) return json({ status: 'error', message: 'bidId is required.' }, 400);

    const kind = String((parsed && parsed.kind) || '');
    if (!VALID_KIND[kind]) {
      return json({ status: 'error',
        message: "kind must be 'note', 'change', 'comm', or 'file'." }, 400);
    }
    const note = s(parsed && parsed.note, MAX_STR);
    if (!note) return json({ status: 'error', message: 'note is required.' }, 400);

    let channel = '';
    if (kind === 'comm') {
      channel = String((parsed && parsed.channel) || 'other').toLowerCase();
      if (!VALID_CHANNEL[channel]) channel = 'other';
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const key = logKey(bidId);
    const log = await loadLog(env, key);
    if (log.items.length >= MAX_ITEMS) {
      return json({ status: 'error', message: 'Activity log is full for this bid.' }, 413);
    }

    const who = s(parsed && parsed.who, MAX_SHORT);
    const addedBy = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = new Date().toISOString();
    const item = {
      id: rid(),
      kind,
      date: isoDateOrToday(parsed && parsed.date),
      who,
      channel,
      note,
      fileRef: s(parsed && parsed.fileRef, MAX_SHORT),
      addedBy,
      addedAt: stamp,
    };
    log.items.push(item);

    await env.PF_SCHEDULE.put(key, JSON.stringify({ version: 1, items: log.items, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, bidId, item, items: log.items, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/precon-log POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
