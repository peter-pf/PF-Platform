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
const MAX_BODY_BYTES = 4 * 1024;
const MAX_QUERY_LEN = 1000;
const QUEUE_ITEM_TTL_SECS = 60 * 60; // KV item self-expires after 1h (cleanup)

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
  try {
    await env.PF_SCHEDULE.put(key, JSON.stringify(item), { expirationTtl: QUEUE_ITEM_TTL_SECS });
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

  let item;
  try {
    const rawItem = await env.PF_SCHEDULE.get(KEY_PREFIX + id);
    if (!rawItem) {
      // Expired or never existed. Honest, not fabricated.
      return json({ ok: false, status: 'not_found', answer: '', error: 'That question is no longer available. Please ask again.' }, 404);
    }
    item = JSON.parse(rawItem);
  } catch {
    return failClosed('The field assistant is temporarily unavailable.', 503);
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
