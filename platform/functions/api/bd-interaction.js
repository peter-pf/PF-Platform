// Cloudflare Pages Function -- /api/bd-interaction
// Append + read the BD CRM INTERACTIONS log for a company or contact.
//
// WHAT IT STORES
//   A running conversation history per entity (a company OR a contact), keyed by
//   the entity's stable id from data/bd-records.js. Each interaction:
//       { id, date, who, channel, note, addedBy, addedAt }
//   Stored in KV as an append-only list per entity. The interactions live ONLY
//   in KV (the ingested bd-records.js base is read-only), so a re-sync of the
//   base never erases interactions.
//
// KV KEY SCHEME (env.PF_SCHEDULE, shared namespace, BD-distinct prefix):
//   bd_interactions__<entityType>__<entityId>   ->  JSON { items:[...], meta:{updated} }
//   entityType is 'company' | 'contact'. entityId is the bd-records.js id.
//
// SECURITY MODEL (for the COO security review):
//   - Behind the server-side auth gate in functions/_middleware.js: no valid
//     session -> 401 before reaching here.
//   - BUSINESS_DEV area: requireArea(session, 'business_dev') enforced HERE
//     (defense-in-depth) AND the path /api/bd-interaction is classified
//     'business_dev' in lib/auth.js areaForPath(), so the middleware ALSO gates
//     it. Allowed: admin, partner, business_dev. field_ops BLOCKED by direct URL
//     too. Fails CLOSED (no session -> 403).
//   - WRITE hardening (mirrors api/pipeline-state.js): payload size cap, strict
//     JSON parse -> 400, schema rebuilt field by field with type coercion +
//     length caps, no arbitrary client keys persisted, no eval/Function.
//   - Responses are private, no-store.

import { requireArea } from '../lib/auth.js';

const KV_PREFIX = 'bd_interactions__';
const MAX_BODY_BYTES = 16 * 1024;     // one interaction is tiny
const MAX_ITEMS = 1000;               // per-entity cap
const MAX_STR = 2000;                 // note cap
const MAX_SHORT = 200;                // who/channel/date cap

const VALID_ENTITY = { company: 1, contact: 1 };
const VALID_CHANNEL = {
  call: 1, email: 1, meeting: 1, text: 1, 'site visit': 1,
  linkedin: 1, event: 1, voicemail: 1, other: 1,
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
  // accept a YYYY-MM-DD (or parseable) date; fall back to today's date.
  const str = String(v == null ? '' : v).slice(0, 40);
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function entityKey(entityType, entityId) {
  return KV_PREFIX + entityType + '__' + entityId;
}

function rid() {
  return 'ix_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// KNOWN LIMITATION: this is a KV read-modify-write (load log -> push item ->
// put). KV has no transaction, so two simultaneous appends to the SAME entity
// can last-writer-wins and drop one. Acceptable for BD's low-concurrency log
// (one BD user per record at a time); the durable fix is a D1 migration with an
// INSERT per interaction. No behavior change now.
async function loadLog(env, key) {
  const raw = await env.PF_SCHEDULE.get(key);
  if (!raw) return { items: [], meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
    return { items, meta: (parsed && parsed.meta) || { updated: null } };
  } catch {
    return { items: [], meta: { updated: null } };
  }
}

// Validate + normalize the entity selector from query or body.
function readEntity(src) {
  const entityType = String((src && src.entityType) || '');
  const entityId = s(src && src.entityId, MAX_SHORT);
  if (!VALID_ENTITY[entityType]) return null;
  if (!entityId) return null;
  return { entityType, entityId };
}

// ---- GET: read one entity's interaction log -------------------------------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'business_dev');
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const ent = readEntity({
      entityType: url.searchParams.get('entityType'),
      entityId: url.searchParams.get('entityId'),
    });
    if (!ent) {
      return json({ status: 'error',
        message: "entityType ('company'|'contact') and entityId are required." }, 400);
    }
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, items: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no interactions stored yet.' });
    }
    const log = await loadLog(env, entityKey(ent.entityType, ent.entityId));
    return json({ ok: true, entityType: ent.entityType, entityId: ent.entityId,
      items: log.items, meta: log.meta });
  } catch (err) {
    console.error('api/bd-interaction GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: append one interaction -----------------------------------------
// Body: { entityType, entityId, date, who, channel, note }
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'business_dev');
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const ent = readEntity(parsed);
    if (!ent) {
      return json({ status: 'error',
        message: "entityType ('company'|'contact') and entityId are required." }, 400);
    }
    const note = s(parsed && parsed.note, MAX_STR);
    if (!note) return json({ status: 'error', message: 'note is required.' }, 400);

    let channel = String((parsed && parsed.channel) || 'other').toLowerCase();
    if (!VALID_CHANNEL[channel]) channel = 'other';

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const key = entityKey(ent.entityType, ent.entityId);
    const log = await loadLog(env, key);
    if (log.items.length >= MAX_ITEMS) {
      return json({ status: 'error', message: 'Interaction log is full for this record.' }, 413);
    }

    const who = s(parsed && parsed.who, MAX_SHORT);
    const addedBy = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = new Date().toISOString();
    const item = {
      id: rid(),
      date: isoDateOrToday(parsed && parsed.date),
      who: who,
      channel: channel,
      note: note,
      addedBy: addedBy,
      addedAt: stamp,
    };
    log.items.push(item);

    const newState = { version: 1, items: log.items, meta: { updated: stamp } };
    await env.PF_SCHEDULE.put(key, JSON.stringify(newState));

    return json({ ok: true, saved: true, entityType: ent.entityType, entityId: ent.entityId,
      item, items: log.items, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/bd-interaction POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
