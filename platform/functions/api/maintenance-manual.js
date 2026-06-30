// Cloudflare Pages Function -- /api/maintenance-manual
// MANUAL maintenance items for the compiled Field Operations Maintenance tab.
// The Maintenance tab (mod-maintenance in index.html) normally compiles its
// checklist ONLY from the maintenance[] + futureIssues[] rows of the read-only
// daily reports (GET /api/daily-report). Those rows can be checked off but never
// removed (they are an immutable audit record). This endpoint lets a privileged
// user ADD a brand-new maintenance item (one a foreman has not logged on a daily
// report -- a shop task, a scheduled service, a known failure to track) and
// REMOVE one, right in the platform, without touching the daily-report feed.
//
// Mirrors the precon-manual-bid.js KV + write-hardening pattern (read that file
// for the parent shape). NO mail, NO outbound fetch, ZERO financials -- a manual
// item carries a category, a type, a free-text description, and optional
// equipment/subcategory text only. No dollars, rates, costs, or hours.
//
// HOW IT JOINS THE CHECKLIST
//   A manual item's id ('mm_<n>') IS its itemKey on the maintenance-status
//   completion overlay (/api/maintenance-status). The client merges these items
//   into the SAME grouped checklist as the daily-report rows and checks them off
//   with the SAME overlay using itemKey = the manual item id. So completion,
//   the completedAt/completedBy record, and the fade-to-Completed behavior all
//   work on a manual item identically to a daily-report row. The difference: a
//   manual item is REMOVABLE here (soft delete); a daily-report row is not.
//
// WHAT IT STORES
//   maintenance_manual_v1 -> JSON {
//     version: 1,
//     counter: N,                 // monotonic id counter (mm_<counter>)
//     items: [ {
//       id,                       // 'mm_<n>'  (also the itemKey on the overlay)
//       category,                 // one of the 5 fixed maintenance categories
//       type,                     // 'Failure' | 'Maintenance' (default Maintenance)
//       item,                     // free-text description (required, capped)
//       subcategory,              // optional free-text
//       equipment,                // optional free-text
//       createdBy,                // SERVER-set from the session (never the body)
//       createdAt,                // SERVER-set ISO (never the body)
//       archived                  // soft-delete flag (true => excluded from GET)
//     } ],
//     meta: { updated }
//   }
//   Lives ONLY in KV (env.PF_SCHEDULE, same binding as the other field
//   endpoints); the read-only daily-report feed is never mutated.
//
// SECURITY MODEL (mirrors precon-manual-bid.js / maintenance-status.js):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FIELD_OPS area enforced HERE via requireArea on GET AND POST, AND in
//     lib/auth.js areaForPath('/api/maintenance-manual') -> 'field_ops' (same
//     readership as the daily reports + the maintenance-status overlay it joins:
//     admin/partner/business_dev/field_ops). Fails CLOSED.
//   - category is VALIDATED against the fixed list (reject anything else -> 400)
//     so a manual item can only ever land in one of the 5 known groups.
//   - createdBy + createdAt are ALWAYS server-set from the session -- NEVER read
//     from the request body, so a client cannot forge who/when.
//   - WRITE hardening: body size cap -> 413, strict JSON -> 400, every string
//     rebuilt + length-capped + angle-stripped, id prototype-pollution guard on
//     remove, total-items cap -> 413, private no-store.
//   - NO mail is sent and NO mail/outbound API is called. ZERO financials.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'maintenance_manual_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MANUAL = 500;       // total (incl. archived) manual items cap
const MAX_ID = 200;           // id cap (remove lookup key)
const MAX_SHORT = 200;        // standard string field cap
const MAX_ITEM = 1000;        // description cap (longer free-text)

// The 5 fixed maintenance categories. MUST mirror MAINTENANCE_CATEGORIES in
// functions/api/field-lists.js and CATEGORY_ORDER in the mod-maintenance client.
// A manual item's category MUST be one of these (rejected -> 400 otherwise).
const MAINTENANCE_CATEGORIES = ['Excavator', 'Mast', 'Vibro', 'Drill', 'Rental Equipment'];

// Allowed type values. Anything else normalizes to the default 'Maintenance'.
const TYPES = ['Failure', 'Maintenance'];
const DEFAULT_TYPE = 'Maintenance';

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

function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// Normalize a type value to one of TYPES, defaulting to 'Maintenance'.
function normType(v) {
  const t = s(v, 40).trim();
  return TYPES.indexOf(t) >= 0 ? t : DEFAULT_TYPE;
}

// KNOWN LIMITATION: KV read-modify-write (load -> mutate -> put), no transaction,
// so two simultaneous writes can last-writer-wins and drop one. Acceptable for
// the low-concurrency maintenance editing flow; the durable fix is a D1 migration
// with a row per item. No behavior change now. Mirrors the precon-manual-bid note.
async function loadStore(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { items: [], counter: 0, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      items: (parsed && Array.isArray(parsed.items)) ? parsed.items : [],
      counter: (parsed && Number.isInteger(parsed.counter)) ? parsed.counter : 0,
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { items: [], counter: 0, meta: { updated: null } };
  }
}

// Re-sanitize ONE stored item for output (defense-in-depth: never re-emit junk).
// Drops any item whose category is not in the fixed list (so a future category
// change cannot strand orphan items in an unknown group). Returns a clean record
// or null (caller filters nulls).
function cleanItem(it) {
  it = it || {};
  const category = s(it.category, MAX_SHORT);
  if (MAINTENANCE_CATEGORIES.indexOf(category) < 0) return null;
  return {
    id: s(it.id, MAX_ID),
    category: category,
    type: normType(it.type),
    item: s(it.item, MAX_ITEM),
    subcategory: s(it.subcategory, MAX_SHORT),
    equipment: s(it.equipment, MAX_SHORT),
    createdBy: s(it.createdBy, MAX_SHORT),
    createdAt: s(it.createdAt, 40),
    archived: !!it.archived,
  };
}

// ---- GET: return the non-archived manual items -----------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, items: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no manual maintenance items stored yet.' });
    }
    const store = await loadStore(env);
    const items = store.items
      .filter(function (it) { return it && !it.archived; })
      .map(cleanItem)
      .filter(function (it) { return it !== null; });
    return json({ ok: true, items, meta: store.meta });
  } catch (err) {
    console.error('api/maintenance-manual GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: add a manual item, or remove (soft-delete) one ------------------
// Body (one of):
//   { action:'add', category(required, one of the 5), type('Failure'|'Maintenance',
//       default 'Maintenance'), item(required free-text), subcategory, equipment }
//   { action:'remove', id:'mm_<n>' }   // soft-delete (archived:true)
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
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
      if (store.items.length >= MAX_MANUAL) {
        return json({ status: 'error', message: 'Manual maintenance store is full.' }, 413);
      }

      const category = s(parsed && parsed.category, MAX_SHORT).trim();
      if (MAINTENANCE_CATEGORIES.indexOf(category) < 0) {
        return json({ status: 'error',
          message: 'category must be one of the maintenance categories.' }, 400);
      }
      const itemText = s(parsed && parsed.item, MAX_ITEM).trim();
      if (!itemText) return json({ status: 'error', message: 'Item description is required.' }, 400);

      const counter = (Number.isInteger(store.counter) ? store.counter : 0) + 1;
      const rec = {
        id: 'mm_' + counter,
        category: category,
        type: normType(parsed && parsed.type),
        item: itemText,
        subcategory: s(parsed && parsed.subcategory, MAX_SHORT),
        equipment: s(parsed && parsed.equipment, MAX_SHORT),
        createdBy: (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown',
        createdAt: new Date().toISOString(),
        archived: false,
      };
      store.items.push(rec);
      store.counter = counter;
    } else { // action === 'remove'
      const id = s(parsed && parsed.id, MAX_ID);
      if (!id) return json({ status: 'error', message: 'id is required.' }, 400);
      // Prototype-pollution guard (parity with precon-manual-bid's id guard); id is
      // compared, not used as an object key, but reject the dangerous values anyway.
      if (isBadKey(id)) return json({ status: 'error', message: 'Invalid id.' }, 400);
      let found = false;
      for (let i = 0; i < store.items.length; i++) {
        const it = store.items[i];
        if (it && String(it.id) === id) {
          if (!it.archived) { it.archived = true; }
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
      items: store.items,
      meta: store.meta,
    }));

    // Return the fresh non-archived set so the client can re-render without a
    // second round-trip (mirrors precon-manual-bid returning the updated list).
    const items = store.items
      .filter(function (it) { return it && !it.archived; })
      .map(cleanItem)
      .filter(function (it) { return it !== null; });
    return json({ ok: true, saved: true, action, items, meta: store.meta });
  } catch (err) {
    console.error('api/maintenance-manual POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
