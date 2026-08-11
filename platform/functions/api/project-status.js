// Cloudflare Pages Function -- /api/project-status
// PROJECT LIFECYCLE STATUS override store for the office summary page
// drag-and-drop (Active -> Completed / Dead, and back).
//
// WHAT IT STORES
//   A single KV map keyed by project number. Each entry records where the
//   office manually MOVED a project (off its synced default of "active") plus
//   the captured lifecycle date:
//     statuses[<num>] = {
//       status: 'completed' | 'dead' | 'active',
//       date:   'YYYY-MM-DD',      // Date Project Completed / Date Project Died
//       movedAt: ISO string,        // when the move was made (audit)
//       movedBy: string             // session name/uid (audit)
//     }
//   The Active Projects list (window.PF_AWARDED) is a SYNCED, hand-un-editable
//   file. The front end OVERLAYS this map at render time:
//     - status=completed -> the project LEAVES Active and appears in Completed
//                           Projects, grouped by year of `date`.
//     - status=dead      -> the project LEAVES Active and appears in Dead
//                           Projects, grouped by year of `date`.
//     - status=active    -> the override is CLEARED (project returns to Active).
//                           A move-back deletes the entry entirely.
//   This is the SAME overlay-on-synced-data pattern as /api/project-override:
//   we never edit the synced /data/*.js; the override always wins at render.
//
// SECURITY MODEL (for the COO security review):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FINANCIALS area (the office): requireArea(session, 'financials') on GET
//     and POST. financials = admin/partner/business_dev -- the office. field_ops
//     is BLOCKED (can neither read nor write), even by direct URL. The path
//     /api/project-status is classified 'financials' in lib/auth.js areaForPath
//     (defense-in-depth with this handler's requireArea). Fails CLOSED.
//   - WRITE hardening (mirrors project-override / pipeline-state): body-size cap,
//     strict JSON parse -> 400 (never crash), status validated against a fixed
//     set, project number tightly constrained (it is part of nothing but data,
//     but still sanitized), date validated to YYYY-MM-DD, movedBy/movedAt set
//     from the SESSION (never client-supplied), angle brackets stripped, entry
//     count bounded. No eval / Function(). Responses private, no-store.
//   - Optimistic concurrency via meta.updated stamp (same scheme as
//     pipeline-state / schedule): a stale client write is 409'd.
//   - KV binding: env.PF_SCHEDULE (shared namespace, DISTINCT key). If the
//     binding is missing, GET returns an empty fallback and POST returns 503
//     (fail loud -- never silently drop a save, never fabricate success).

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'project_status_v1';
const MAX_BODY_BYTES = 32 * 1024;   // one tiny status record per write
const MAX_STATUSES = 5000;          // bounds storage / blast radius
const MAX_STR = 200;

// The only lifecycle statuses this store recognizes. 'active' is the CLEAR
// action (delete the override -> project returns to the synced Active list).
const VALID_STATUS = { completed: 1, dead: 1, active: 1 };

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

// A project number ("YY-NNN" style, but accept any short digits/letters/hyphen
// slug so helical (25-2001) and future schemes work). It is a KEY, so tightly
// constrained. Returns '' if invalid.
function cleanNum(v) {
  const str = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(str)) return '';
  return str;
}

// A captured lifecycle date. We store the plain YYYY-MM-DD string (no Date()
// round-trip -> no timezone off-by-one). Returns '' if not a valid calendar
// date in that exact shape.
function cleanDate(v) {
  const str = String(v == null ? '' : v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || y < 1900 || y > 9999) return '';
  return str;
}

function isoNow() { return new Date().toISOString(); }

// Rebuild ONE clean status record from stored input. Returns null if invalid.
function sanitizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const status = String(r.status || '');
  if (status !== 'completed' && status !== 'dead') return null; // 'active' is never stored
  const date = cleanDate(r.date);
  if (!date) return null;
  return {
    status,
    date,
    movedAt: (typeof r.movedAt === 'string' && r.movedAt) ? s(r.movedAt) : isoNow(),
    movedBy: s(r.movedBy),
  };
}

// Rebuild the full statuses map from stored input. Unknown/invalid entries drop.
function sanitizeStatuses(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const out = {};
  let count = 0;
  for (const rawKey of Object.keys(src)) {
    if (count >= MAX_STATUSES) break;
    const key = cleanNum(rawKey);
    if (!key) continue;
    const rec = sanitizeRecord(src[rawKey]);
    if (!rec) continue;
    out[key] = rec;
    count++;
  }
  return out;
}

function clientBaseVersion(input) {
  const meta = (input && input.meta && typeof input.meta === 'object') ? input.meta : {};
  return (typeof meta.updated === 'string') ? meta.updated : null;
}

async function loadState(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      statuses: sanitizeStatuses(parsed.statuses),
      meta: (parsed.meta && typeof parsed.meta === 'object') ? parsed.meta : {},
    };
  } catch {
    return null;
  }
}

// ---- GET: read all lifecycle-status overrides -------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, statuses: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no status overrides yet.' });
    }
    const state = await loadState(env);
    if (!state) return json({ ok: true, statuses: {}, meta: { updated: null } });
    return json({ ok: true, statuses: state.statuses,
      meta: { updated: state.meta.updated || null } });
  } catch (err) {
    console.error('api/project-status GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set ONE project's lifecycle status -------------------------------
// Body: { num, status: 'completed'|'dead'|'active', date?: 'YYYY-MM-DD', meta:{updated} }
//   completed / dead -> requires a valid `date`; stores the override.
//   active           -> CLEARS the override (project returns to Active). No date.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials');   // office only; field_ops blocked
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const num = cleanNum(parsed && parsed.num);
    if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

    const status = String((parsed && parsed.status) || '');
    if (!VALID_STATUS[status]) {
      return json({ status: 'error', message: "status must be 'completed', 'dead', or 'active'." }, 400);
    }

    // completed / dead REQUIRE a captured date. active is a clear (no date).
    let date = '';
    if (status !== 'active') {
      date = cleanDate(parsed && parsed.date);
      if (!date) return json({ status: 'error', message: 'A valid date (YYYY-MM-DD) is required.' }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment. Your change was NOT saved.' }, 503);
    }

    // Optimistic concurrency: reject if KV moved on since the client loaded.
    const clientVersion = clientBaseVersion(parsed);
    const existing = await loadState(env);
    const currentVersion = existing && existing.meta ? existing.meta.updated : null;
    if (currentVersion && clientVersion && currentVersion !== clientVersion) {
      return json({ status: 'conflict',
        message: 'The project statuses changed since you loaded them. Reload before saving.',
        currentVersion, yourVersion: clientVersion,
        statuses: existing.statuses }, 409);
    }

    const statuses = existing ? existing.statuses : {};
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = isoNow();

    if (status === 'active') {
      // Move back to Active = delete the override entirely (return to synced default).
      delete statuses[num];
    } else {
      statuses[num] = { status, date, movedAt: stamp, movedBy: who };
    }

    const keys = Object.keys(statuses);
    if (keys.length > MAX_STATUSES) {
      return json({ status: 'error', message: 'Too many status overrides stored.' }, 413);
    }

    const newState = { version: 1, statuses, meta: { updated: stamp } };
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(newState));

    return json({ ok: true, saved: true, num, status, date,
      statuses, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/project-status write error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
