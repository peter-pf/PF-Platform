// Cloudflare Pages Function -- /api/precon-manual-bid
// MANUAL bid intake for the Actively Pricing module (Phase 1 of the Estimating
// intake flow). The Actively Pricing bucket normally renders ONLY from the synced
// Project Bid Log feed (window.PF_PRECON, read-only). This endpoint lets a
// privileged user ADD a brand-new bid (a fresh GC bid invite that is not yet in
// the spreadsheet) and REMOVE one, right in the platform, without touching the
// read-only feed.
//
// Mirrors the precon-bid-meta.js / precon-flag.js KV + write-hardening pattern.
// NO mail, NO outbound fetch. The fields here are project/GC/date/quantity intake
// (the same class of data the synced feed already carries); a manual bid's bidId
// is the SAME ng_<hash> scheme the client resolveKey() computes for a numberless
// feed bid, so all per-bid overlays (precon-bid-meta dates/gcs/bidPrice/hot/docs)
// and pipeline-state moves work on a manual bid identically.
//
// WHAT IT STORES
//   manual_bids_v1 -> JSON {
//     version: 1,
//     meta: { updated },
//     bids: [ {
//       id,                 // 'man_<n>' (server-side monotonic counter)
//       fields: {           // shaped like a feed bid's .fields map
//         'Project Name', 'City / State', 'General Contractor',
//         'Due Date', 'Design Completed Date',
//         'Total LF', 'Total Columns', 'Bid Total Value', 'Notes'
//       },
//       createdBy, createdAt,
//       archived              // soft-delete flag (true => excluded from GET)
//     } ]
//   }
//   Lives ONLY in KV; the read-only feed is never mutated.
//
// SECURITY MODEL (mirrors precon-bid-meta.js):
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401. PRECONSTRUCTION area enforced HERE via requireArea on GET AND POST AND
//     in lib/auth.js areaForPath('/api/precon-manual-bid') -> 'preconstruction'.
//     Allowed: admin, partner, business_dev. field_ops BLOCKED by direct URL too.
//     Fails CLOSED.
//   - WRITE hardening: body size cap (header + actual), strict JSON parse -> 400,
//     every string rebuilt + length-capped + angle-stripped, dates validated to
//     ISO YYYY-MM-DD (junk rejected), Project Name required (400 if empty),
//     id prototype-pollution guard on remove, total-bids cap, server-set
//     createdBy/createdAt. Private no-store. Unknown action -> 400.
//   - NO mail is sent and NO mail API is called.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'manual_bids_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MANUAL = 500;       // total (incl. archived) manual bids cap
const MAX_ID = 200;           // id cap (remove lookup key)
const MAX_SHORT = 200;        // standard string field cap
const MAX_NOTES = 4000;       // notes cap (longer free-text)

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Length-cap + angle-strip a string (the front-end ALSO escapes on render).
function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

// Validate / normalize a date to ISO YYYY-MM-DD, or '' to clear/omit. Anything
// that is not a clean ISO date (and not the empty value) is rejected -> null,
// and the caller returns 400. Same shape as precon-bid-meta.normIsoDate.
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

function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION: KV read-modify-write (load -> mutate -> put), no transaction,
// so two simultaneous writes can last-writer-wins and drop one. Acceptable for
// precon's low-concurrency editing; the durable fix is a D1 migration with a row
// per bid. No behavior change now. Mirrors the precon-bid-meta note.
async function loadStore(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { bids: [], counter: 0, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      bids: (parsed && Array.isArray(parsed.bids)) ? parsed.bids : [],
      counter: (parsed && Number.isInteger(parsed.counter)) ? parsed.counter : 0,
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { bids: [], counter: 0, meta: { updated: null } };
  }
}

// Re-sanitize ONE stored bid for output (defense-in-depth: never re-emit junk).
// Returns a clean { id, fields, createdBy, createdAt, archived } record.
function cleanBid(b) {
  b = b || {};
  const f = (b.fields && typeof b.fields === 'object') ? b.fields : {};
  return {
    id: s(b.id, MAX_ID),
    fields: {
      'Project Name': s(f['Project Name'], MAX_SHORT),
      'City / State': s(f['City / State'], MAX_SHORT),
      'General Contractor': s(f['General Contractor'], MAX_SHORT),
      'Due Date': s(f['Due Date'], 10),
      'Design Completed Date': s(f['Design Completed Date'], 10),
      'Total LF': s(f['Total LF'], MAX_SHORT),
      'Total Columns': s(f['Total Columns'], MAX_SHORT),
      'Bid Total Value': s(f['Bid Total Value'], MAX_SHORT),
      'Notes': s(f['Notes'], MAX_NOTES),
    },
    createdBy: s(b.createdBy, MAX_SHORT),
    createdAt: s(b.createdAt, 40),
    archived: !!b.archived,
  };
}

// ---- GET: return the non-archived manual bids ------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, bids: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no manual bids stored yet.' });
    }
    const store = await loadStore(env);
    const bids = store.bids
      .filter(function (b) { return b && !b.archived; })
      .map(cleanBid);
    return json({ ok: true, bids, meta: store.meta });
  } catch (err) {
    console.error('api/precon-manual-bid GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: add a manual bid, or remove (soft-delete) one -------------------
// Body (one of):
//   { action:'add', fields:{ 'Project Name'(required), 'City / State',
//       'General Contractor', 'Due Date'(ISO|''), 'Design Completed Date'(ISO|''),
//       'Total LF', 'Total Columns', 'Bid Total Value', 'Notes' } }
//   { action:'remove', id:'man_<n>' }   // soft-delete (archived:true)
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
    if (action !== 'add' && action !== 'remove') {
      return json({ status: 'error', message: 'Unknown action.' }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadStore(env);

    if (action === 'add') {
      // Total cap counts ALL records (incl. archived) so a hostile add loop cannot
      // grow the KV value unbounded via soft-deletes.
      if (store.bids.length >= MAX_MANUAL) {
        return json({ status: 'error', message: 'Manual bid store is full.' }, 413);
      }
      const inFields = (parsed && parsed.fields && typeof parsed.fields === 'object') ? parsed.fields : {};

      const projectName = s(inFields['Project Name'], MAX_SHORT).trim();
      if (!projectName) return json({ status: 'error', message: 'Project Name is required.' }, 400);

      const dueDate = normIsoDate(inFields['Due Date']);
      if (dueDate === null) return json({ status: 'error', message: "'Due Date' must be an ISO date (YYYY-MM-DD) or empty." }, 400);
      const designDate = normIsoDate(inFields['Design Completed Date']);
      if (designDate === null) return json({ status: 'error', message: "'Design Completed Date' must be an ISO date (YYYY-MM-DD) or empty." }, 400);

      const counter = (Number.isInteger(store.counter) ? store.counter : 0) + 1;
      const rec = {
        id: 'man_' + counter,
        fields: {
          'Project Name': projectName,
          'City / State': s(inFields['City / State'], MAX_SHORT),
          'General Contractor': s(inFields['General Contractor'], MAX_SHORT),
          'Due Date': dueDate,
          'Design Completed Date': designDate,
          'Total LF': s(inFields['Total LF'], MAX_SHORT),
          'Total Columns': s(inFields['Total Columns'], MAX_SHORT),
          'Bid Total Value': s(inFields['Bid Total Value'], MAX_SHORT),
          'Notes': s(inFields['Notes'], MAX_NOTES),
        },
        createdBy: (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown',
        createdAt: new Date().toISOString(),
        archived: false,
      };
      store.bids.push(rec);
      store.counter = counter;
    } else { // action === 'remove'
      const id = s(parsed && parsed.id, MAX_ID);
      if (!id) return json({ status: 'error', message: 'id is required.' }, 400);
      // Prototype-pollution guard (parity with precon-bid-meta's bidId guard);
      // id is compared, not used as an object key, but reject the dangerous values
      // anyway for defense-in-depth.
      if (isBadKey(id)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      let found = false;
      for (let i = 0; i < store.bids.length; i++) {
        const b = store.bids[i];
        if (b && String(b.id) === id) {
          if (!b.archived) { b.archived = true; }
          found = true;
          break;
        }
      }
      if (!found) return json({ status: 'error', message: 'Unknown id.' }, 400);
    }

    const stamp = new Date().toISOString();
    store.meta = { updated: stamp };
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
      version: 1,
      counter: store.counter,
      bids: store.bids,
      meta: store.meta,
    }));

    // Return the fresh non-archived set so the client can re-render without a
    // second round-trip (mirrors precon-bid-meta returning the updated map).
    const bids = store.bids
      .filter(function (b) { return b && !b.archived; })
      .map(cleanBid);
    return json({ ok: true, saved: true, action, bids, meta: store.meta });
  } catch (err) {
    console.error('api/precon-manual-bid POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
