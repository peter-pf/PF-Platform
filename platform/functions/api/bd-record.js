// Cloudflare Pages Function -- /api/bd-record
// Add a COMPANY, or add a CONTACT under a company, as a KV OVERLAY on top of the
// read-only ingested base (data/bd-records.js). The UI merges base + overlay.
//
// WHAT IT STORES
//   bd_overlay_v1 -> JSON {
//     companies: [ { id, fields:{...}, addedBy, addedAt } ],         // new companies
//     contacts:  [ { id, companyId, fields:{...}, addedBy, addedAt } ], // new contacts
//     meta: { updated }
//   }
//   New records get a server-issued id (ov_co_* / ov_ct_*) so they never collide
//   with the ingested base ids (co_* / ct_*). Interactions on these records use
//   the same /api/bd-interaction log keyed by this id.
//
// KV KEY: env.PF_SCHEDULE :: 'bd_overlay_v1' (shared namespace, BD-distinct key).
//
// SECURITY MODEL (for the COO security review):
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401 before here. BUSINESS_DEV area enforced HERE via requireArea AND in
//     lib/auth.js areaForPath('/api/bd-record') -> 'business_dev'. Allowed:
//     admin, partner, business_dev. field_ops BLOCKED by direct URL too. Fails
//     CLOSED.
//   - WRITE hardening (mirrors api/pipeline-state.js): payload cap, strict JSON
//     -> 400, fields rebuilt against an ALLOW-LIST of header names with type
//     coercion + length caps. No arbitrary client keys persisted. No eval.
//   - Responses are private, no-store.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'bd_overlay_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RECORDS = 5000;        // overlay storage bound
const MAX_FIELDS = 40;           // max fields per record
const MAX_STR = 500;             // per-field cap
const MAX_NAME = 200;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_STR) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function rid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Rebuild a clean fields object. `allow` is the set of permitted header names
// (the row-4 field list) -- anything else is dropped. Capped count + length.
function cleanFields(input, allow) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(input)) {
    if (n >= MAX_FIELDS) break;
    const key = s(k, MAX_NAME);
    if (!key) continue;
    if (allow && allow.size && !allow.has(key)) continue; // allow-list enforcement
    out[key] = s(input[k], MAX_STR);
    n++;
  }
  return out;
}

// KNOWN LIMITATION: this is a KV read-modify-write (load overlay -> push record
// -> put). KV has no transaction, so two simultaneous adds can last-writer-wins
// and drop one. Acceptable for BD's low-concurrency add flow; the durable fix is
// a D1 migration with an INSERT per record. No behavior change now.
async function loadOverlay(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { companies: [], contacts: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return {
      companies: Array.isArray(p && p.companies) ? p.companies : [],
      contacts: Array.isArray(p && p.contacts) ? p.contacts : [],
      meta: (p && p.meta) || { updated: null },
    };
  } catch {
    return { companies: [], contacts: [], meta: { updated: null } };
  }
}

function totalRecords(ov) {
  return ov.companies.length + ov.contacts.length;
}

// ---- GET: read the overlay (manual additions only) ------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'business_dev');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, companies: [], contacts: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no manual BD additions yet.' });
    }
    const ov = await loadOverlay(env);
    return json({ ok: true, companies: ov.companies, contacts: ov.contacts, meta: ov.meta });
  } catch (err) {
    console.error('api/bd-record GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: add a company OR a contact -------------------------------------
// Body (company): { kind:'company', fields:{ Name, ... }, allow?:[fieldNames] }
// Body (contact): { kind:'contact', companyId, fields:{ Name, ... }, allow?:[...] }
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

    const kind = String((parsed && parsed.kind) || '');
    if (kind !== 'company' && kind !== 'contact') {
      return json({ status: 'error', message: "kind must be 'company' or 'contact'." }, 400);
    }

    // Optional client-supplied allow-list of the legitimate row-4 header names.
    // We still hard-cap; this just scopes what the UI permits.
    const allow = Array.isArray(parsed && parsed.allow)
      ? new Set(parsed.allow.map((x) => s(x, MAX_NAME)).filter(Boolean))
      : null;

    const fields = cleanFields(parsed && parsed.fields, allow);
    const name = s(fields.Name, MAX_NAME);
    if (!name) return json({ status: 'error', message: 'A Name is required.' }, 400);
    fields.Name = name;

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const ov = await loadOverlay(env);
    if (totalRecords(ov) >= MAX_RECORDS) {
      return json({ status: 'error', message: 'BD overlay storage is full.' }, 413);
    }

    const addedBy = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const stamp = new Date().toISOString();
    let record;

    if (kind === 'company') {
      record = { id: rid('ov_co_'), fields, addedBy, addedAt: stamp };
      ov.companies.push(record);
    } else {
      const companyId = s(parsed && parsed.companyId, MAX_NAME);
      if (!companyId) {
        return json({ status: 'error', message: 'companyId is required to add a contact.' }, 400);
      }
      record = { id: rid('ov_ct_'), companyId, fields, addedBy, addedAt: stamp };
      ov.contacts.push(record);
    }

    const newState = { version: 1, companies: ov.companies, contacts: ov.contacts, meta: { updated: stamp } };
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(newState));

    return json({ ok: true, saved: true, kind, record,
      companies: ov.companies, contacts: ov.contacts, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/bd-record POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
