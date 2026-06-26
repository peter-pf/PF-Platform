// Cloudflare Pages Function -- /api/field-lists
// FIELD OPERATIONS reference lists (the Fleet/Lists data foundation the daily
// report form pulls from). Owned equipment, personnel, foremen, plus the FIXED
// rental + maintenance category lists. ZERO financials: these are NAMES and
// CATEGORIES only -- no dollars, rates, costs, or hours are stored here.
//
// WHY THIS EXISTS
//   The daily report form needs dropdowns of real machines / people / foremen.
//   Hard-coding them in the page would mean a code change every time the crew
//   changes. Instead the owners (admin/partner) curate these lists once; the
//   crew (field_ops) READS them to populate the form.
//
// WHAT IT STORES
//   field_lists_v1 -> JSON {
//     ownedEquipment: [ "Cat 336 Vibro Rig", ... ],   // owned machines (names)
//     personnel:      [ "John Willis", ... ],          // people (names)
//     foremen:        [ "John Willis", ... ],          // subset of personnel
//     maintenanceSubcategories: {                       // per-category subcategory
//       Excavator: [], Mast: [], Vibro: [], Drill: [], "Rental Equipment": []
//     },                                               // owner-curated; seed empty
//     meta:{ updated, updatedBy }
//   }
//   rentalCategories + maintenanceCategories are FIXED (server constants, not
//   user-editable) and are RETURNED on GET so the form has one source. The
//   maintenanceSubcategories object is keyed by the fixed maintenanceCategories
//   and its arrays ARE owner-editable (Derek populates them himself; seed empty).
//   ALL seed values are "v1 provisional - confirm with Derek".
//
// KV KEY: env.PF_SCHEDULE :: 'field_lists_v1' (same binding as daily-report).
//
// RBAC (the critical part):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - GET: requireArea(session, 'field_ops'). field_ops area = admin/partner/
//     business_dev/field_ops, so the CREW can READ the lists to fill the form.
//   - POST (edit a list OR a maintenance subcategory list): admin/partner ONLY,
//     enforced IN-HANDLER via isPrivileged(session). A field_ops (or business_dev)
//     session can READ but CANNOT edit -> 403. This mirrors how daily-report gates its
//     'approve'/'send-to-hr' transitions to privileged roles within one area.
//   - WRITE hardening: body cap, strict JSON -> 400, list rebuilt + item-capped,
//     angle brackets stripped, no eval, no outbound fetch, private no-store.
//   - NO mail, NO money. Just names + categories.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'field_lists_v1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_ITEMS = 300;       // cap any one list length
const MAX_ITEM_LEN = 200;    // cap a single name/string

// Editable lists (curated by owners). Names only -- NO $.
const EDITABLE_LISTS = { ownedEquipment: 1, personnel: 1, foremen: 1 };

// FIXED lists (stored as server constants, returned on GET, NOT user-editable
// in v1). These are categories, not dollars.
const RENTAL_CATEGORIES = ['Skid Steer', 'Wheel Loader', 'Telehandler', 'Excavator'];
const MAINTENANCE_CATEGORIES = ['Excavator', 'Mast', 'Vibro', 'Drill', 'Rental Equipment'];

// SEED DEFAULTS (v1 PROVISIONAL -- Derek will correct). Returned by GET when the
// KV record is empty so the form works before anyone edits the lists.
const SEED = {
  ownedEquipment: [
    'Cat 336 Vibro Rig',
    'CAT 308 (Drill)',
    '80K Excavator',
    'F450',
    'F550',
    '299 VSC Loader',
    'Trailer & Tooling',
  ],
  personnel: ['John Willis', 'Seth Willis', 'Jordan Lemay'],
  foremen: ['John Willis'],
};

// Build the seed maintenanceSubcategories object: each fixed category -> [].
// Derek populates these himself via the Field Lists UI, so they start EMPTY (the
// subcategory dropdown shows just a placeholder until he adds options).
function seedMaintenanceSubcategories() {
  const o = {};
  for (const c of MAINTENANCE_CATEGORIES) o[c] = [];
  return o;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Sanitize a single list item: string, length-capped, angle brackets stripped.
function item(v) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > MAX_ITEM_LEN) str = str.slice(0, MAX_ITEM_LEN);
  return str.replace(/[<>]/g, '').trim();
}

// Rebuild a clean list of non-empty, de-duplicated strings, length-capped.
function cleanList(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = Object.create(null);
  for (const raw of input.slice(0, MAX_ITEMS)) {
    const v = item(raw);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(v);
  }
  return out;
}

// Rebuild a clean maintenanceSubcategories object keyed by the FIXED maintenance
// categories. Any key not in MAINTENANCE_CATEGORIES is dropped; each value is a
// cleaned (de-duped, capped, angle-stripped) string list. Missing keys seed to [].
function cleanMaintSubcats(input) {
  const out = {};
  const src = (input && typeof input === 'object') ? input : {};
  for (const c of MAINTENANCE_CATEGORIES) {
    out[c] = cleanList(Array.isArray(src[c]) ? src[c] : []);
  }
  return out;
}

function isPrivileged(session) {
  const r = session && session.role;
  return r === 'admin' || r === 'partner';
}

async function loadStored(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return (p && typeof p === 'object') ? p : null;
  } catch {
    return null;
  }
}

// Merge the stored (or seed) editable lists with the FIXED categories so GET has
// one source of truth for the form.
function buildResponse(stored) {
  const base = stored || {};
  return {
    ownedEquipment: cleanList(Array.isArray(base.ownedEquipment) ? base.ownedEquipment : SEED.ownedEquipment),
    personnel:      cleanList(Array.isArray(base.personnel)      ? base.personnel      : SEED.personnel),
    foremen:        cleanList(Array.isArray(base.foremen)        ? base.foremen        : SEED.foremen),
    rentalCategories: RENTAL_CATEGORIES.slice(),
    maintenanceCategories: MAINTENANCE_CATEGORIES.slice(),
    // Per-category subcategory lists (owner-editable). Seed = each category -> [].
    maintenanceSubcategories: cleanMaintSubcats(base.maintenanceSubcategories || seedMaintenanceSubcategories()),
    seeded: !stored, // true => caller is seeing the provisional SEED defaults
    meta: (base.meta && typeof base.meta === 'object') ? base.meta : { updated: null, updatedBy: null },
  };
}

// ---- GET: return all lists (field_ops + up can READ) -----------------------
export async function onRequestGet(context) {
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  const { env } = context;
  try {
    if (!env.PF_SCHEDULE) {
      // No KV binding: still return the SEED defaults so the form is usable.
      const r = buildResponse(null);
      r.fallback = true;
      r.note = 'KV binding PF_SCHEDULE not available; returning provisional seed lists.';
      return json(Object.assign({ ok: true }, r));
    }
    const stored = await loadStored(env);
    return json(Object.assign({ ok: true }, buildResponse(stored)));
  } catch (err) {
    console.error('api/field-lists GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: edit one list (admin/partner ONLY) ------------------------------
//   Name lists:    { list: 'ownedEquipment'|'personnel'|'foremen', items: [...] }
//   Subcategories: { list: 'maintenanceSubcategories', category: '<one of the
//                    fixed maintenanceCategories>', items: [...] }
//   `items` is the FULL replacement list for that target (the UI sends the
//   complete edited list). Hardened + de-duplicated server-side.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  // Path-area is field_ops (so the crew can GET), but EDITING is owners only:
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;
  if (!isPrivileged(session)) {
    return json({ status: 'forbidden',
      message: 'Only an owner can edit the field lists.' }, 403);
  }
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const listName = String((parsed && parsed.list) || '');
    const isSubcats = listName === 'maintenanceSubcategories';
    if (!EDITABLE_LISTS[listName] && !isSubcats) {
      return json({ status: 'error',
        message: "list must be 'ownedEquipment', 'personnel', 'foremen', or 'maintenanceSubcategories'." }, 400);
    }
    if (!Array.isArray(parsed.items)) {
      return json({ status: 'error', message: 'items must be an array.' }, 400);
    }
    // Subcategory edits target ONE fixed maintenance category; validate it.
    let category = '';
    if (isSubcats) {
      category = item(parsed.category);
      if (MAINTENANCE_CATEGORIES.indexOf(category) < 0) {
        return json({ status: 'error',
          message: 'category must be one of the maintenance categories.' }, 400);
      }
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    // Load existing editable lists (or start from seed), then replace the target.
    const stored = await loadStored(env);
    const current = {
      ownedEquipment: cleanList(stored && Array.isArray(stored.ownedEquipment) ? stored.ownedEquipment : SEED.ownedEquipment),
      personnel:      cleanList(stored && Array.isArray(stored.personnel)      ? stored.personnel      : SEED.personnel),
      foremen:        cleanList(stored && Array.isArray(stored.foremen)        ? stored.foremen        : SEED.foremen),
      maintenanceSubcategories: cleanMaintSubcats(stored && stored.maintenanceSubcategories),
    };

    if (isSubcats) {
      current.maintenanceSubcategories[category] = cleanList(parsed.items);
    } else {
      current[listName] = cleanList(parsed.items);
    }

    // Keep foremen as a subset of personnel (a foreman must be a known person).
    const peopleSet = Object.create(null);
    for (const p of current.personnel) peopleSet[p.toLowerCase()] = 1;
    current.foremen = current.foremen.filter((f) => peopleSet[f.toLowerCase()]);

    const who = (session && (session.name || session.uid)) ? item(session.name || session.uid) : 'unknown';
    const record = Object.assign({}, current, {
      meta: { updated: new Date().toISOString(), updatedBy: who },
    });
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(Object.assign({ version: 1 }, record)));

    return json(Object.assign({ ok: true, saved: true, list: listName,
      category: isSubcats ? category : undefined }, buildResponse(record)));
  } catch (err) {
    console.error('api/field-lists POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
