// Cloudflare Pages Function -- /api/pipeline-state
// Persistence layer for the BID-RESOLUTION FORK + DEAD SET (PF Platform item A).
//
// WHAT IT STORES
//   Per-job resolution OVERRIDES on top of the auto-built precon pipeline
//   (data/precon-pipeline.js, which is regenerated from the Project Bid Log and
//   must NOT be hand-edited). A job's resolution is keyed by its stable project
//   number (jobId). Shape:
//       overrides[jobId] = {
//         status: 'awarded' | 'not_awarded' | 'active',
//         deadSet: bool,           // true once Not-Awarded; false after Reactivate
//         resolvedAt: ISO string,  // when the resolution was set
//         resolvedBy: string,      // who set it (session name/uid) -- audit
//         reactivatedAt?: ISO      // last time it was sent back to active
//       }
//   The front-end overlays these overrides on the auto pipeline at render time:
//     - status=awarded     -> job shown as Awarded (visible to Project Mgmt)
//     - status=not_awarded  -> job moves to the persistent Dead Set view
//     - status=active       -> job returns to Actively Bidding
//
// SECURITY MODEL (for the COO security review):
//   - This endpoint is ALREADY behind the server-side auth gate in
//     functions/_middleware.js. Every request carries a valid pf_session (or the
//     legacy shared gate). Unauthenticated callers are 401'd before they get here.
//   - PRECONSTRUCTION area: this is a bid/opportunity action. requireArea(session,
//     'preconstruction') is enforced HERE (defense-in-depth) AND the path
//     /api/pipeline-state is classified 'preconstruction' in lib/auth.js
//     areaForPath(), so the middleware ALSO gates it. Allowed: admin, partner,
//     business_dev. field_ops is BLOCKED (preconstruction area does not include
//     field_ops) -- by direct URL too. Fails CLOSED (no session -> 403).
//   - WRITE hardening (mirrors api/schedule.js):
//       * Payload size cap (MAX_BODY_BYTES).
//       * Strict JSON parse in try/catch -> 400, never crash.
//       * Schema validation/sanitization -- we rebuild a clean record field by
//         field, coerce types, cap counts/lengths. No arbitrary client keys are
//         persisted. NO eval / Function() -- data is data.
//       * Optimistic concurrency via meta.updated stamp (same scheme as schedule).
//       * Responses are private, no-store.
//   - KV binding: env.PF_SCHEDULE (shared namespace, DISTINCT key from the
//     scheduler). If the binding is missing, GET returns an empty fallback and
//     POST returns 503 (fail loud, never silently drop a save).

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'pipeline_state_v1';
const MAX_BODY_BYTES = 64 * 1024;   // resolution records are tiny; generous cap
const MAX_OVERRIDES = 2000;         // bounds storage / blast radius
const MAX_STR = 200;

const VALID_STATUS = { awarded: 1, not_awarded: 1, active: 1 };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- sanitizers -------------------------------------------------------------

function s(v) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > MAX_STR) str = str.slice(0, MAX_STR);
  return str.replace(/[<>]/g, ''); // strip angle brackets (front-end also escapes)
}

function isoOrNull(v) {
  if (v == null) return null;
  const str = String(v).slice(0, 40);
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function bool(v) {
  return v === true || v === 'true' || v === 1;
}

// Rebuild ONE clean resolution record. Returns null if invalid (dropped).
function sanitizeResolution(r) {
  if (!r || typeof r !== 'object') return null;
  const status = String(r.status || '');
  if (!VALID_STATUS[status]) return null;
  // deadSet is implied by status but we persist it explicitly for the Dead Set
  // view; coerce it to be consistent with status (not_awarded => dead).
  const deadSet = status === 'not_awarded' ? true : false;
  const out = {
    status,
    deadSet,
    resolvedAt: isoOrNull(r.resolvedAt) || new Date().toISOString(),
    resolvedBy: s(r.resolvedBy),
  };
  const react = isoOrNull(r.reactivatedAt);
  if (react) out.reactivatedAt = react;
  return out;
}

// Rebuild the full overrides map from stored/posted input. Unknown shapes drop.
function sanitizeOverrides(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const out = {};
  let count = 0;
  for (const rawKey of Object.keys(src)) {
    if (count >= MAX_OVERRIDES) break;
    const key = s(rawKey);
    if (!key) continue;
    const rec = sanitizeResolution(src[rawKey]);
    if (!rec) continue;
    out[key] = rec;
    count++;
  }
  return out;
}

// Read what the client claims it loaded (optimistic concurrency stamp).
function clientBaseVersion(input) {
  const meta = (input && input.meta && typeof input.meta === 'object') ? input.meta : {};
  return (typeof meta.updated === 'string') ? meta.updated : null;
}

// Load + parse current state from KV. Returns {overrides, meta} or null.
async function loadState(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      overrides: sanitizeOverrides(parsed.overrides),
      meta: (parsed.meta && typeof parsed.meta === 'object') ? parsed.meta : {},
    };
  } catch {
    return null;
  }
}

// ---- GET: read all resolution overrides -------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, overrides: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no resolution overrides yet.' });
    }
    const state = await loadState(env);
    if (!state) {
      return json({ ok: true, overrides: {}, meta: { updated: null } });
    }
    return json({ ok: true, overrides: state.overrides,
      meta: { updated: state.meta.updated || null } });
  } catch (err) {
    console.error('api/pipeline-state GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set ONE job's resolution -----------------------------------------
// Body: { jobId, status: 'awarded'|'not_awarded'|'active', meta:{updated} }
// Transition semantics:
//   active      -> clears deadSet, stamps reactivatedAt (return to bidding)
//   awarded     -> deadSet=false (moves into PM/awarded flow)
//   not_awarded -> deadSet=true  (moves to Dead Set)
async function handleWrite(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'preconstruction');
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) {
      return json({ status: 'error', message: 'Payload too large.' }, 413);
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return json({ status: 'error', message: 'Payload too large.' }, 413);
    }

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const jobId = s(parsed && parsed.jobId);
    const status = String(parsed && parsed.status || '');
    if (!jobId) return json({ status: 'error', message: 'jobId is required.' }, 400);
    if (!VALID_STATUS[status]) {
      return json({ status: 'error',
        message: "status must be 'awarded', 'not_awarded', or 'active'." }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    // Optimistic concurrency: if KV's stamp is newer than the client's, reject.
    const clientVersion = clientBaseVersion(parsed);
    const existing = await loadState(env);
    const currentVersion = existing && existing.meta ? existing.meta.updated : null;
    if (currentVersion && clientVersion && currentVersion !== clientVersion) {
      return json({ status: 'conflict',
        message: 'The pipeline resolutions changed since you loaded them. Reload before saving.',
        currentVersion, yourVersion: clientVersion,
        overrides: existing.overrides }, 409);
    }

    const overrides = existing ? existing.overrides : {};
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = new Date().toISOString();

    let record;
    if (status === 'active') {
      // Reactivate: back to the active pipeline, clear dead flag, audit when.
      record = {
        status: 'active',
        deadSet: false,
        resolvedAt: stamp,
        resolvedBy: who,
        reactivatedAt: stamp,
      };
    } else if (status === 'awarded') {
      record = { status: 'awarded', deadSet: false, resolvedAt: stamp, resolvedBy: who };
    } else { // not_awarded
      record = { status: 'not_awarded', deadSet: true, resolvedAt: stamp, resolvedBy: who };
    }
    overrides[jobId] = record;

    // Cap total stored overrides as a final guard.
    const keys = Object.keys(overrides);
    if (keys.length > MAX_OVERRIDES) {
      return json({ status: 'error', message: 'Too many resolution overrides stored.' }, 413);
    }

    const newState = { version: 1, overrides, meta: { updated: stamp } };
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(newState));

    return json({ ok: true, saved: true, jobId, record,
      overrides, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/pipeline-state write error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

export async function onRequestPost(context) {
  return handleWrite(context);
}
