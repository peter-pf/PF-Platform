// Cloudflare Pages Function -- /api/coo-checklist
// SERVER-PERSISTED state for Peter's COO Knowledge Checklist (coo-checklist.html).
//
// WHY (Brad 2026-08-14): "built that in so you check them off when you feel you
// have the necessary and required information and know where to source it from
// within our SharePoint files." The checkoffs must survive across devices/sessions
// and be VISIBLE TO BRAD -- not just Peter's local browser. Historically the
// checklist saved ONLY to localStorage (per-browser), so a checkoff Peter made on
// one machine never reached Brad. This endpoint moves the source of truth to KV.
//
// WHAT IT STORES
//   coo_checklist_state  ->  JSON {
//     version: 1,
//     items: {                                  // map keyed by STABLE content-derived id
//       "<stableId>": { checked: bool,
//                       checkedBy: <who|null>,  // session name/uid at last change
//                       checkedAt: <ISO|null>,  // server-stamped time of last change
//                       note: <string> },       // optional short note (default '')
//       ...
//     },
//     _meta: { updatedBy, updatedAt }           // last writer + when (server-set)
//   }
//   stableId is a CONTENT-DERIVED slug minted by the client from the section title +
//   item text (see coo-checklist.html), e.g. "company-foundation-legal.ein-federal-
//   tax-id-state-tax-registrations". It does NOT shift if items are reordered or
//   inserted (unlike the old ordinal i0..i86). The server does NOT own the item
//   catalog -- it just stores checkoff state keyed by whatever stable ids the client
//   sends, validated to a safe shape + bounded in count. Unknown/stale ids simply
//   never match a rendered item (harmless; the render merges by id).
//
// KV KEY: env.PF_SCHEDULE :: 'coo_checklist_state'  (ONE global key -- this is a
//   single company-wide checklist, not per-project).
//
// RBAC (the critical part):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - financials_global area on GET and POST. This MATCHES the page gate already in
//     lib/auth.js PAGE_AREAS: '/coo-checklist.html' -> 'financials_global' (admin +
//     partner ONLY). COO knowledge is company oversight (foundation, legal,
//     financial-adjacent); business_dev AND field_ops are BLOCKED -- both from the
//     page and now from this endpoint by direct URL too. /api/coo-checklist ->
//     'financials_global' is also added to areaForPath (defense-in-depth with this
//     handler's requireArea).
//   - WRITE hardening (mirrors project-override): body cap, strict JSON -> 400,
//     stableId validated to a safe slug shape, note length-capped + angle-bracket
//     stripped, checkedBy/checkedAt set from the SESSION + server clock (never
//     client-supplied), item-count bounded. Private no-store.
//   - FAIL CLOSED: if KV is not bound, GET returns an empty state with fallback:true
//     (the client renders the DEFAULTS + an honest "not saved to server" indicator,
//     never fabricated checked state); POST returns 503 (client keeps the box in its
//     prior state + shows an honest error, NEVER "saved").
//   - NO mail, NO outbound fetch.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'coo_checklist_state';    // ONE global key (company-wide checklist)
const AREA = 'financials_global';        // admin + partner ONLY (matches the page gate)
const MAX_BODY_BYTES = 32 * 1024;        // a single checkoff (or a small bulk sync) fits easily
const MAX_ID = 200;                      // a stable content-derived id length cap
const MAX_NOTE = 2000;                   // an optional short note per item
const MAX_ITEMS = 500;                   // > the ~87 real items; bounds a crafted flood

// A stable id is a slug the client mints from section + item text. Constrain it
// tightly (it is a stored key): lowercase alphanumerics, hyphens, and ONE dot
// separating the section slug from the item slug. This rejects any crafted/oversized
// key while allowing the "section-slug.item-slug" scheme.
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Length-cap + angle-bracket strip a string (the UI also escapes). Mirrors s() in
// project-override.js.
function s(v, cap) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function cleanId(v) {
  const str = s(v, MAX_ID).trim();
  if (!ID_RE.test(str)) return '';
  return str;
}

// Load the stored checklist state object, or an empty shell. Never throws:
// corrupt/absent value -> empty (we NEVER fabricate checked state).
async function loadState(env) {
  const empty = { items: {}, _meta: { updatedBy: null, updatedAt: null } };
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    const items = (p && p.items && typeof p.items === 'object' && !Array.isArray(p.items)) ? p.items : {};
    const _meta = (p && p._meta && typeof p._meta === 'object')
      ? p._meta : { updatedBy: null, updatedAt: null };
    // Normalize each stored entry defensively (in case an older/hand-edited value
    // has a stray shape). Only keep well-formed ids.
    const out = {};
    for (const k of Object.keys(items).slice(0, MAX_ITEMS)) {
      const id = cleanId(k);
      if (!id) continue;
      const e = items[k];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      out[id] = {
        checked: e.checked === true,
        checkedBy: (e.checkedBy == null ? null : s(e.checkedBy, MAX_ID)),
        checkedAt: (e.checkedAt == null ? null : s(e.checkedAt, 40)),
        note: s(e.note, MAX_NOTE),
      };
    }
    return { items: out, _meta };
  } catch {
    return empty; // corrupt -> empty; a fresh save overwrites it
  }
}

// ---- GET: return the full saved checkoff state --------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, AREA);
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      // No KV binding: no server state exists. Benign empty read -- but flag
      // fallback:true so the client shows an honest "not saved to server"
      // indicator and NEVER treats the absence as "everything unchecked = truth".
      return json({ ok: true, items: {}, _meta: { updatedBy: null, updatedAt: null }, fallback: true });
    }
    const st = await loadState(env);
    return json({ ok: true, items: st.items, _meta: st._meta });
  } catch (err) {
    console.error('api/coo-checklist GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: upsert one checkoff (or a small bulk) ------------------------------
// Two accepted body shapes:
//   (A) single upsert:  { id, checked, note? }
//   (B) bulk upsert:     { items: { "<id>": { checked, note? }, ... } }
// Each affected id's entry is REPLACED (checked + note), and checkedBy/checkedAt are
// stamped from the SESSION + server clock. Ids the body does NOT mention are left
// untouched (per-id merge). Returns the FULL saved state so the client re-renders
// from server truth.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, AREA);   // admin + partner ONLY; BD + field_ops blocked
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    // Build the set of (id -> {checked, note}) upserts from either body shape.
    // Malformed => reject the WHOLE save closed (never a partial write).
    const upserts = {};
    if (parsed && parsed.items != null) {
      // (B) bulk
      if (typeof parsed.items !== 'object' || Array.isArray(parsed.items)) {
        return json({ status: 'error', message: 'items must be an object.' }, 400);
      }
      const keys = Object.keys(parsed.items);
      if (keys.length > MAX_ITEMS) return json({ status: 'error', message: 'Too many items.' }, 413);
      for (const rawId of keys) {
        const id = cleanId(rawId);
        if (!id) return json({ status: 'error', message: 'Invalid item id.' }, 400);
        const e = parsed.items[rawId];
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
          return json({ status: 'error', message: 'Invalid item entry.' }, 400);
        }
        upserts[id] = { checked: e.checked === true, note: s(e.note, MAX_NOTE) };
      }
    } else {
      // (A) single
      const id = cleanId(parsed && parsed.id);
      if (!id) return json({ status: 'error', message: 'A valid item id is required.' }, 400);
      upserts[id] = {
        checked: !!(parsed && parsed.checked),
        note: s(parsed && parsed.note, MAX_NOTE),
      };
    }
    if (Object.keys(upserts).length === 0) {
      return json({ status: 'error', message: 'Nothing to save.' }, 400);
    }

    // FAIL CLOSED: no KV -> we cannot persist. Do NOT report success.
    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment. Your checkoff was NOT saved.' }, 503);
    }

    const st = await loadState(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid, MAX_ID) : 'unknown';
    const nowIso = new Date().toISOString();

    for (const id of Object.keys(upserts)) {
      st.items[id] = {
        checked: upserts[id].checked,
        checkedBy: who,
        checkedAt: nowIso,
        note: upserts[id].note,
      };
    }

    // Bound total stored items (defense against a slow accumulation of stale ids).
    if (Object.keys(st.items).length > MAX_ITEMS) {
      return json({ status: 'error', message: 'Too many items stored.' }, 413);
    }

    st._meta = { updatedBy: who, updatedAt: nowIso };
    const toStore = { version: 1, items: st.items, _meta: st._meta };
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(toStore));

    return json({ ok: true, saved: true, items: st.items, _meta: st._meta });
  } catch (err) {
    console.error('api/coo-checklist POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
