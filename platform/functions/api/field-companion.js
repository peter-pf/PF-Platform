// Cloudflare Pages Function -- /api/field-companion
// ===========================================================================
// FIELD-OPS SMART SEARCH -- KV-QUEUE MODEL (Hermes stays fully private)
// ===========================================================================
// The crew types a plain-language question ("what stone is approved for 26-002?").
// This endpoint does NOT talk to Hermes directly and holds NO secret. Instead:
//
//   POST /api/field-companion { query, project_hint? }
//     -> writes  fieldq:<id> = { id, query, project_hint, status:"pending", ts }
//        to Workers KV (env.PF_SCHEDULE, the same binding daily-report uses)
//     -> ALSO writes list-free discovery keys so the poller never calls list-keys
//        (free tier caps list at 1,000/day): fqb:<bucket>="1" (beacon) and
//        fqx:<bucket>:<slot>=<id> (contention-free pointer). See
//        ../../field-ops-listfree-design.md.
//     -> returns { ok:true, id, status:"pending" }
//
//   GET /api/field-companion?id=<id>
//     -> reads fieldq:<id>; returns its status. When the poller has answered:
//        { ok:true, status:"done", answer, contains_financials:false }
//
// A PRIVATE poller daemon in Peter's container (tools/field_query_poller.py,
// PPID=1) polls the SAME namespace via the Cloudflare API, runs each pending
// question through the LOCAL Hermes (hermes -p aiciv-doctor -z) with a field-safe
// + NO-FINANCIALS prompt wrapper, and writes { answer, status:"done" } back to
// the same key. Hermes is NEVER exposed -- there is no tunnel, no domain, no
// inbound path. The only channel is KV.
//
// WHY THIS IS SAFER THAN A TUNNEL: Hermes has zero public surface. No hostname,
// no port, no Access gate to misconfigure. The crew browser only ever talks to
// this same-origin Function behind the portal's own auth gate.
//
// RBAC: field_ops area -- the crew's OPERATIONAL tool, NOT financial.
//   requireArea(session,'field_ops') => admin/partner/business_dev/field_ops.
//   _middleware.js already 401s a session-less request; this is defense-in-depth.
//
// FAIL-CLOSED CONTRACT (load-bearing):
//   - env.PF_SCHEDULE (KV) missing  => 503 honest error, no crash.
//   - The poller writes an honest `error` + empty `answer` when it cannot answer;
//     this Function relays that verbatim. It NEVER fabricates an answer.
//   - The FINANCIAL guardrail lives in the poller's prompt wrapper + a dollar
//     post-filter; this Function additionally refuses to relay any result flagged
//     contains_financials:true.
//   An honest "I don't have that" / "unavailable" beats a convincing fiction.

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const KEY_PREFIX = 'fieldq:';
// ANSWER-ECHO keys: fieldr:<id>:<n>. When the poller finishes it writes the SAME
// result to several echo keys (n = 0..READY_ECHO_SLOTS-1). The browser polls with a
// monotonically increasing attempt index n and reads fieldr:<id>:<n> -- a DIFFERENT
// key every poll -- so it can never get stuck on a Workers-KV edge cache that pinned
// an earlier "still pending" / negative-miss read of the base key for up to 60s.
// (Workers KV get() caches reads at the edge for >=60s and caches misses too; a
// fixed-key poll therefore keeps seeing the stale "pending" until the TTL expires --
// this was the ~60s field-tool latency. A fresh key per attempt defeats that.)
const READY_PREFIX = 'fieldr:';
const READY_ECHO_SLOTS = 90; // covers ~60s of polling at the front-end cadence
const MAX_BODY_BYTES = 4 * 1024;
const MAX_QUERY_LEN = 1000;
const QUEUE_ITEM_TTL_SECS = 60 * 60; // KV item self-expires after 1h (cleanup)

// ---------------------------------------------------------------------------
// LIST-FREE DISCOVERY (Cloudflare free tier: list-keys capped at 1,000/day).
// The poller must find pending jobs WITHOUT ever listing. So on enqueue we ALSO
// write two contention-free keys the poller can CONSTRUCT and GET directly:
//   fqb:<bucket>          = "1"    presence beacon (last-writer-wins is safe; no data)
//   fqx:<bucket>:<slot>   = <id>   pointer; <slot> is crypto-random so the writer
//                                  owns its own key -> no read-modify-write race.
// <bucket> = floor(epoch_seconds / BUCKET_SECS). The poller sweeps recent buckets'
// beacons (a few GETs/cycle); only when a beacon is present does it probe that
// bucket's SLOTS pointer keys. See ../../field-ops-listfree-design.md for the full
// key scheme + collision analysis. THESE MUST STAY IN SYNC WITH THE POLLER.
const BUCKET_SECS = 10;   // time-bucket width (poller: BUCKET_SECS)
const SLOTS = 64;         // slots per bucket (poller: SLOTS)
const BEACON_PREFIX = 'fqb:';
const SLOT_PREFIX = 'fqx:';

function bucketOf(msEpoch) {
  return Math.floor(msEpoch / 1000 / BUCKET_SECS);
}
function randSlot() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % SLOTS;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Honest fail-closed envelope. `answer` is ALWAYS empty on failure.
function failClosed(message, status) {
  return json({ ok: false, status: 'error', answer: '', error: message }, status);
}

function s(v, cap) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

// A crypto-random id for the queue key (no PII, no secret).
function newId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let hex = '';
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
  return hex;
}

// ---- POST: enqueue a question -------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;

  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (!env || !env.PF_SCHEDULE) {
    return failClosed('The field assistant is not available right now.', 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return failClosed('Question too long.', 413);
  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch { return failClosed('Invalid request.', 400); }

  const query = s(parsed && parsed.query, MAX_QUERY_LEN).trim();
  if (!query) return failClosed('Please enter a question.', 400);
  const projectHint = s(parsed && parsed.project_hint, 120).trim();

  const id = newId();
  const key = KEY_PREFIX + id;
  const item = {
    id,
    query,
    project_hint: projectHint || '',
    status: 'pending',
    ts: Date.now(),
    // audit who asked (uid only, no PII beyond the session subject)
    asked_by: (session && session.uid) || null,
  };
  const bucket = bucketOf(item.ts);
  const slot = randSlot();
  const slotKey = `${SLOT_PREFIX}${bucket}:${slot}`;
  const beaconKey = `${BEACON_PREFIX}${bucket}`;
  try {
    // Contention-free triple-write, no reads. The job key is the browser's contract;
    // the pointer + beacon let the poller DISCOVER this job without ever listing.
    await env.PF_SCHEDULE.put(key, JSON.stringify(item), { expirationTtl: QUEUE_ITEM_TTL_SECS });
    await env.PF_SCHEDULE.put(slotKey, id, { expirationTtl: QUEUE_ITEM_TTL_SECS });
    await env.PF_SCHEDULE.put(beaconKey, '1', { expirationTtl: QUEUE_ITEM_TTL_SECS });
  } catch {
    return failClosed('The field assistant is temporarily unavailable.', 503);
  }
  return json({ ok: true, id, status: 'pending' }, 202);
}

// ---- GET: poll for the answer -------------------------------------------------
export async function onRequestGet(context) {
  const { request, env } = context;

  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (!env || !env.PF_SCHEDULE) {
    return failClosed('The field assistant is not available right now.', 503);
  }

  const url = new URL(request.url);
  const id = s(url.searchParams.get('id'), 64).trim();
  if (!id || !/^[a-f0-9]{8,64}$/.test(id)) return failClosed('Missing or invalid id.', 400);

  // Poll attempt index (browser sends &n=<attempt>). Used to read a FRESH echo key
  // each poll so a cached "pending" read of the base key can't hide a ready answer.
  let n = parseInt(url.searchParams.get('n') || '0', 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n >= READY_ECHO_SLOTS) n = READY_ECHO_SLOTS - 1;

  let item = null;

  // (1) FAST PATH: read the per-attempt answer-echo key. This key was never read by
  // this browser before, so it is NOT served from a previously cached miss -- once
  // the poller has written it, the browser sees it on the very next poll.
  try {
    const rawEcho = await env.PF_SCHEDULE.get(`${READY_PREFIX}${id}:${n}`);
    if (rawEcho) item = JSON.parse(rawEcho);
  } catch { /* fall through to base key */ }

  // (2) No echo yet -> read the base key for pending/expired status. This read MAY be
  // edge-cached-stale, but it is only used to signal "keep polling" vs "expired"; the
  // authoritative "done" signal is the echo key above.
  if (!item) {
    let rawItem;
    try {
      rawItem = await env.PF_SCHEDULE.get(KEY_PREFIX + id);
    } catch {
      return failClosed('The field assistant is temporarily unavailable.', 503);
    }
    if (!rawItem) {
      // Expired or never existed. Honest, not fabricated.
      return json({ ok: false, status: 'not_found', answer: '', error: 'That question is no longer available. Please ask again.' }, 404);
    }
    try { item = JSON.parse(rawItem); }
    catch { return failClosed('The field assistant is temporarily unavailable.', 503); }
  }

  const status = item && item.status;
  if (status !== 'done') {
    // still pending/processing -- tell the browser to keep polling
    return json({ ok: true, status: status || 'pending', answer: '' }, 200);
  }

  // Done. Defense-in-depth financial gate: never relay flagged content.
  if (item.contains_financials === true) {
    return failClosed('That request cannot be answered from the field tool.', 403);
  }
  const answer = typeof item.answer === 'string' ? item.answer : '';
  return json({
    ok: true,
    status: 'done',
    answer,
    contains_financials: false,
    // On a fail-closed poller result, answer is '' and error carries the honest reason.
    error: answer ? undefined : (item.error || 'No answer was generated.'),
  }, 200);
}
