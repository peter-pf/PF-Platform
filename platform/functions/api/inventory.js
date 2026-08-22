// Cloudflare Pages Function -- /api/inventory
// EDITABLE OVERLAY for the Inventory tab (mod-inventory in index.html).
// The tab renders the read-only seed feed (data/inventory.js) MERGED with a small
// KV override map. Two override kinds, both stored HERE (the seed stays immutable):
//
//   1) qty    -- the per-(location,item) "Actual Qty on Hand" (v1; unchanged).
//   2) fields -- per-ITEM field overrides so the office can SELF-CORRECT the seed
//                data (description, manufacturer, part#, alt sources, notes, and the
//                per-location required stock reqTrailer/reqHome). Added 2026-08-13
//                for Derek's temporary full-row Edit mode (CHANGE B).
//
// WHY store field edits in KV (not by rewriting data/inventory.js): the seed is a
// static feed committed to the repo. Persisting Derek's corrections as a KV overlay
// lets edits survive WITHOUT a code change / redeploy per correction, mirrors the
// existing qty-override pattern, and keeps the seed as an auditable baseline. When
// the corrections settle, the office overrides can be folded back into the seed and
// the overrides cleared. (Documented approach + limitation in the branch summary.)
//
// WHAT IT STORES
//   inventory_qty_v1 -> JSON {
//     version, meta:{updated},
//     qty:    { "<locationId>::<itemId>": { qty:<number|null>, updatedAt, updatedBy } },
//     fields: { "<itemId>":               { <fieldOverrides...>, updatedAt, updatedBy } }
//   }
//   (KV_KEY kept as 'inventory_qty_v1' so the existing qty overrides are preserved.)
//   Clearing a qty (null/'') DELETES its key. Clearing a field (null/'') removes just
//   that field from the item's override; emptying the last field DELETES the item key.
//
// KEY SCHEMES:
//   qty    key = `${locationId}::${itemId}` (per-location; required for Actual qty).
//   fields key = `${itemId}` (per-item; description/mfr/part#/etc. are intrinsic to
//                the item, not the location, so one override serves both locations).
//   Both are treated as OPAQUE validated strings (length-capped, angle-stripped,
//   prototype-pollution guarded); the server does NOT re-derive them.
//
// SECURITY MODEL (unchanged):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - READ (GET): 'general' area = admin/partner/business_dev/field_ops. The whole
//     company can VIEW; ZERO financials in this feed.
//   - WRITE (POST): OFFICE ONLY. requireArea(session, 'financials') =
//     admin/partner/business_dev; field_ops is BLOCKED from EDITING (403). Applies to
//     BOTH the qty action AND the new fields action. Fails CLOSED on missing session.
//   - updatedAt + updatedBy are ALWAYS server-set from the session (never the body).
//   - WRITE hardening: body-size cap -> 413, strict JSON -> 400, keys rebuilt +
//     length-capped + angle-stripped, prototype-pollution guard, qty validated as a
//     finite non-negative number (or null), field values length-capped strings (or
//     null to clear), only an ALLOWLIST of field names accepted, entry caps -> 413,
//     private no-store. NO mail, NO outbound fetch.
//
// v2 SEAM (NOT built here): qty becomes a per-location CONSUMPTION + TRANSFER LEDGER.
// The field overrides fold back into the seed / metadata DB. Same /api/inventory path.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'inventory_qty_v1';
const MAX_BODY_BYTES = 32 * 1024;   // 32KB request cap
const MAX_QTY_ENTRIES = 5000;       // total qty override entries cap
const MAX_FIELD_ENTRIES = 5000;     // total per-item field override entries cap
const MAX_KEY = 200;                // composite key length cap
const MAX_QTY_VALUE = 1e9;          // sane upper bound on a quantity
const MAX_FIELD_LEN = 2000;         // per text-field value length cap

// Editable per-item text fields (CHANGE B + CHANGE D). "reqTrailer"/"reqHome" are
// numeric and handled separately below. Anything NOT in these allowlists is rejected.
//   CHANGE D (2026-08-22, Derek's expandable item detail pane):
//     purchaseLink -- URL to buy the part (rendered as a clickable link when set).
//     orderContact -- company/phone/name to call to place an order (free text).
//   These join the existing per-item overrides so the detail pane's new fields
//   persist through the SAME setFields path (no new write mechanism). URL/text are
//   still length-capped + angle-stripped server-side; the UI escapes on render and
//   only treats an http(s) value as a navigable link.
const TEXT_FIELDS = ['description', 'manufacturer', 'mfrPart', 'altSources', 'notes',
                     'purchaseLink', 'orderContact'];
const NUM_FIELDS  = ['reqTrailer', 'reqHome'];

// CHANGE D -- item DETAIL IMAGES (part photo + storage-location photo).
// Two image slots per item, stored SEPARATELY from the field-override map so the
// (small) 32KB field body cap is never bloated by image bytes. Each slot lives in
// its OWN KV entry keyed `inventory_img_v1:<itemId>:<slot>` in the SAME PF_SCHEDULE
// binding. We store a data-URL string (small, client-downscaled JPEG/PNG/WebP) so a
// single GET can hand it straight to an <img src>. KV value ceiling is 25MB; we cap
// FAR below that (~900KB post-base64) so the store stays cheap + fast, and require
// the client to downscale before upload. This is the reuse-existing-KV path -- the
// two SharePoint upload endpoints (field-upload/project-photos) are PROJECT-scoped
// (resolve a project folder by number); inventory items are NOT project-scoped, so
// a per-item KV blob is the correct, existing-infrastructure home for these.
const IMG_SLOTS = ['partPhoto', 'locationPhoto'];
const IMG_KEY = (itemId, slot) => `inventory_img_v1:${itemId}:${slot}`;
// Max stored data-URL length. base64 ~= 4/3 of raw bytes; ~1.2MB string ~= 900KB
// image. Client downscales to <= ~1280px so a photo lands well under this.
const MAX_IMG_DATAURL_LEN = 1200000;
// Accept only image data-URLs the browser can render inline (no SVG => no script).
const IMG_DATAURL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
// Larger body cap for the image action ONLY (the field/qty actions keep 32KB).
const MAX_IMG_BODY_BYTES = 1400000;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_KEY) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, ''); // strip angle brackets (UI also escapes)
}

// key is used as an object key -> reject prototype-chain writes.
function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION (same as maintenance-status.js): KV read-modify-write, no
// transaction, so two simultaneous writes can last-writer-wins. Acceptable for the
// low-concurrency inventory edit flow; the durable fix is the v2 D1 ledger.
async function loadStore(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { qty: {}, fields: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      qty: (parsed && parsed.qty && typeof parsed.qty === 'object') ? parsed.qty : {},
      fields: (parsed && parsed.fields && typeof parsed.fields === 'object') ? parsed.fields : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { qty: {}, fields: {}, meta: { updated: null } };
  }
}

async function saveStore(env, store) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
    version: 2, qty: store.qty, fields: store.fields, meta: { updated: stamp },
  }));
  return stamp;
}

function who(session) {
  return (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
}

// CHANGE D helpers -- a validated itemId (used as a KV key segment) and slot name.
function cleanItemId(v) {
  const id = s(v, MAX_KEY);
  if (!id || isBadKey(id)) return '';
  // itemId keys a KV entry name; keep it to a safe, bounded charset (the seed ids
  // are slug+index like 'drill-6', 'mast-1'). Reject anything with ':' (our KV key
  // delimiter) or whitespace so a client can never collide/inject a foreign key.
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) return '';
  return id;
}
function cleanSlot(v) {
  const slot = String(v == null ? '' : v);
  return IMG_SLOTS.indexOf(slot) >= 0 ? slot : '';
}

// The set of image slots present for a given itemId (fast metadata list, no bytes).
// One KV list() call scoped to this item's image prefix. Returns e.g. ['partPhoto'].
async function imageSlotsForItem(env, itemId) {
  const out = [];
  try {
    const listed = await env.PF_SCHEDULE.list({ prefix: `inventory_img_v1:${itemId}:` });
    (listed && Array.isArray(listed.keys) ? listed.keys : []).forEach((k) => {
      const slot = k && k.name ? k.name.split(':').pop() : '';
      if (IMG_SLOTS.indexOf(slot) >= 0) out.push(slot);
    });
  } catch { /* fail closed: report no images rather than error the whole GET */ }
  return out;
}

// ---- GET: two modes -----------------------------------------------------------
//  (a) default: read the whole override map (loaded alongside the seed feed) PLUS
//      an `images` presence map { "<itemId>": ["partPhoto",...] } so the client
//      knows which detail-pane slots have a stored photo (without shipping bytes).
//  (b) ?img=<itemId>&slot=<partPhoto|locationPhoto>: STREAM that one image's stored
//      data-URL back as raw image bytes (Content-Type from the data-URL). 404 if
//      absent. This is what the detail pane's <img src> points at.
// READ is everyone-viewable ('general') in BOTH modes -- images carry no financials.
export async function onRequestGet(context) {
  const { env, request } = context;
  const denied = requireArea(context.data && context.data.session, 'general');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, qty: {}, fields: {}, images: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no inventory overrides stored yet.' });
    }

    // Parse the query for the image-serving mode. Guard a missing/invalid url
    // (defensive: the real CF request always has one) so we fall back to the map.
    let imgItem = null, slotParam = null;
    try {
      const url = new URL(request.url);
      imgItem = url.searchParams.get('img');
      slotParam = url.searchParams.get('slot');
    } catch { imgItem = null; }
    if (imgItem != null) {
      // ---- mode (b): serve one stored image as raw bytes ----
      const itemId = cleanItemId(imgItem);
      const slot = cleanSlot(slotParam);
      if (!itemId || !slot) return json({ status: 'error', message: 'Bad image request.' }, 400);
      const dataUrl = await env.PF_SCHEDULE.get(IMG_KEY(itemId, slot));
      if (!dataUrl || !IMG_DATAURL_RE.test(dataUrl)) {
        return json({ status: 'error', message: 'Image not found.' }, 404);
      }
      const comma = dataUrl.indexOf(',');
      const mime = dataUrl.slice(5, dataUrl.indexOf(';')); // e.g. image/png
      const b64 = dataUrl.slice(comma + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { status: 200, headers: {
        'Content-Type': mime,
        // private + short cache: it's session-gated media; the client also
        // cache-busts with ?v=<updatedAt> when a new image is uploaded.
        'Cache-Control': 'private, max-age=300',
      } });
    }

    // ---- mode (a): the override map + an images presence map ----
    const store = await loadStore(env);
    // Only items that actually carry an image key appear in the presence map.
    const images = {};
    try {
      const listed = await env.PF_SCHEDULE.list({ prefix: 'inventory_img_v1:' });
      (listed && Array.isArray(listed.keys) ? listed.keys : []).forEach((k) => {
        const parts = k && k.name ? k.name.split(':') : [];
        // key shape: inventory_img_v1:<itemId>:<slot>
        if (parts.length !== 3) return;
        const itemId = parts[1], slot = parts[2];
        if (!itemId || IMG_SLOTS.indexOf(slot) < 0) return;
        (images[itemId] = images[itemId] || []).push(slot);
      });
    } catch { /* fail closed: no images reported rather than 500 the whole GET */ }
    return json({ ok: true, qty: store.qty, fields: store.fields, images, meta: store.meta });
  } catch (err) {
    console.error('api/inventory GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: two actions, both OFFICE-ONLY (financials area) --------------------
//  action:'set'    -> set/clear ONE (location,item) Actual Qty on Hand (v1, qty map).
//                     Body: { action:'set', key:'<loc>::<item>', qty:<number|null> }
//  action:'setFields' -> set/clear per-ITEM field overrides (CHANGE B, fields map).
//                     Body: { action:'setFields', item:'<itemId>', fields:{...} }
//                     Each field value: string (text) / number (reqTrailer/reqHome)
//                     to SET, or null/'' to CLEAR that one field.
//  action:'setImage'  -> set/clear ONE detail-pane image slot (CHANGE D, KV blob).
//                     Body: { action:'setImage', item:'<itemId>',
//                             slot:'partPhoto'|'locationPhoto', dataUrl:'<data:image/...>'|null }
//                     dataUrl null/'' CLEARS (deletes) the slot. This action has its
//                     own LARGER body cap (image bytes); set/setFields keep 32KB.
// field_ops -> 403 for ALL actions. Fails CLOSED on missing session.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  // EDIT gate: office only (admin/partner/business_dev). field_ops -> 403.
  const denied = requireArea(session, 'financials');
  if (denied) return denied;
  try {
    // Body-size gate is action-aware: the image action carries a downscaled photo
    // (~<=900KB) so it uses MAX_IMG_BODY_BYTES; every other action keeps the tight
    // 32KB cap. We peek Content-Length first (cheap reject of an absurd payload)
    // using the larger ceiling, then re-check the actual text length per-action.
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_IMG_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const action = String((parsed && parsed.action) || '');

    // Per-action body cap (defense in depth against a mislabeled huge non-image body).
    const cap = (action === 'setImage') ? MAX_IMG_BODY_BYTES : MAX_BODY_BYTES;
    if (text.length > cap) return json({ status: 'error', message: 'Payload too large.' }, 413);

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    if (action === 'set') {
      return await handleSetQty(env, session, parsed);
    }
    if (action === 'setFields') {
      return await handleSetFields(env, session, parsed);
    }
    if (action === 'setImage') {
      return await handleSetImage(env, session, parsed);
    }
    return json({ status: 'error', message: "action must be 'set', 'setFields', or 'setImage'." }, 400);
  } catch (err) {
    console.error('api/inventory POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- action:'setImage' -- set/clear ONE detail-pane image slot (CHANGE D) -----
// Stores the (client-downscaled) image as a data-URL in its OWN KV entry keyed
// `inventory_img_v1:<itemId>:<slot>`. dataUrl null/'' DELETES the slot. Office-only
// (the POST gate above already enforced 'financials'). Validates: known slot, safe
// itemId, an image/* base64 data-URL under the length cap. Returns the cache-bust
// stamp so the client can point <img src> at ?img=...&v=<updatedAt>.
async function handleSetImage(env, session, parsed) {
  const itemId = cleanItemId(parsed && parsed.item);
  if (!itemId) return json({ status: 'error', message: 'A valid item is required.' }, 400);
  const slot = cleanSlot(parsed && parsed.slot);
  if (!slot) return json({ status: 'error', message: 'slot must be partPhoto or locationPhoto.' }, 400);

  const raw = parsed && parsed.dataUrl;
  const kvKey = IMG_KEY(itemId, slot);

  // CLEAR: null / '' / undefined -> delete the stored image.
  if (raw === null || raw === '' || typeof raw === 'undefined') {
    await env.PF_SCHEDULE.delete(kvKey);
    return json({ ok: true, saved: true, item: itemId, slot, cleared: true,
      updatedAt: new Date().toISOString() });
  }

  const dataUrl = String(raw);
  if (dataUrl.length > MAX_IMG_DATAURL_LEN) {
    return json({ status: 'error', message: 'Image too large. Please use a smaller photo.' }, 413);
  }
  if (!IMG_DATAURL_RE.test(dataUrl)) {
    return json({ status: 'error', message: 'Only PNG/JPEG/WebP/GIF images are accepted.' }, 400);
  }

  const stamp = new Date().toISOString();
  // Store the data-URL plus a tiny sidecar of provenance is NOT needed here (the
  // bytes ARE the value); updatedAt is returned for cache-busting the <img src>.
  await env.PF_SCHEDULE.put(kvKey, dataUrl);
  return json({ ok: true, saved: true, item: itemId, slot, cleared: false, updatedAt: stamp });
}

// ---- action:'set' -- Actual Qty on Hand (unchanged behavior) -----------------
async function handleSetQty(env, session, parsed) {
  const key = s(parsed && parsed.key, MAX_KEY);
  if (!key) return json({ status: 'error', message: 'key is required.' }, 400);
  if (isBadKey(key)) return json({ status: 'error', message: 'Invalid key.' }, 400);
  if (key.indexOf('::') < 1) return json({ status: 'error', message: 'Malformed key.' }, 400);

  let clear = false;
  let qty = null;
  const rawQty = parsed && parsed.qty;
  if (rawQty === null || rawQty === '' || typeof rawQty === 'undefined') {
    clear = true;
  } else {
    const n = Number(rawQty);
    if (!Number.isFinite(n) || n < 0 || n > MAX_QTY_VALUE) {
      return json({ status: 'error', message: 'qty must be a number between 0 and 1e9, or null to clear.' }, 400);
    }
    qty = n;
  }

  const store = await loadStore(env);

  if (clear) {
    delete store.qty[key];
  } else {
    if (!Object.prototype.hasOwnProperty.call(store.qty, key)
        && Object.keys(store.qty).length >= MAX_QTY_ENTRIES) {
      return json({ status: 'error', message: 'Inventory override store is full.' }, 413);
    }
    store.qty[key] = {
      qty,
      updatedAt: new Date().toISOString(),  // SERVER-SET, never from the body
      updatedBy: who(session),              // SERVER-SET from the session
    };
  }

  const stamp = await saveStore(env, store);
  return json({ ok: true, saved: true, key, qty: clear ? null : qty, cleared: clear, meta: { updated: stamp } });
}

// ---- action:'setFields' -- per-item field overrides (CHANGE B) ---------------
// Accepts an object of field -> value. Only allowlisted fields are honored; unknown
// fields are IGNORED (not an error, so a client can send a whole row safely). A value
// of null/'' clears that field. Text fields are length-capped + angle-stripped;
// reqTrailer/reqHome accept a non-negative integer or null (=> "TBD"/no requirement).
async function handleSetFields(env, session, parsed) {
  const itemId = s(parsed && parsed.item, MAX_KEY);
  if (!itemId) return json({ status: 'error', message: 'item is required.' }, 400);
  if (isBadKey(itemId)) return json({ status: 'error', message: 'Invalid item.' }, 400);

  const inFields = (parsed && parsed.fields && typeof parsed.fields === 'object' && !Array.isArray(parsed.fields))
    ? parsed.fields : null;
  if (!inFields) return json({ status: 'error', message: 'fields object is required.' }, 400);

  // Build the set of clean changes (value) + clears (null) from the allowlists.
  const setVals = {};   // field -> cleaned value to store
  const clears = [];    // field names to remove
  let sawAny = false;

  for (const f of TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(inFields, f)) continue;
    sawAny = true;
    const raw = inFields[f];
    // null/undefined = CLEAR (delete override -> fall back to seed value).
    // '' = a TEXT field DELIBERATELY BLANKED: store the empty string (key present)
    //      so it persists as blank and does NOT revert to the seed on re-render/reload.
    //      '' is a valid bounded value; s('') === '' after strip/cap, still sanitized.
    if (raw === null || typeof raw === 'undefined') { clears.push(f); continue; }
    setVals[f] = s(raw, MAX_FIELD_LEN);
  }
  for (const f of NUM_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(inFields, f)) continue;
    sawAny = true;
    const raw = inFields[f];
    if (raw === null || raw === '' || typeof raw === 'undefined') { clears.push(f); continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_QTY_VALUE || Math.floor(n) !== n) {
      return json({ status: 'error', message: f + ' must be a non-negative whole number, or null to clear.' }, 400);
    }
    setVals[f] = n;
  }

  if (!sawAny) return json({ status: 'error', message: 'No editable fields provided.' }, 400);

  const store = await loadStore(env);
  const existing = (store.fields[itemId] && typeof store.fields[itemId] === 'object') ? store.fields[itemId] : null;

  // Cap NEW item overrides (re-editing an existing item never grows the map).
  if (!existing && Object.keys(store.fields).length >= MAX_FIELD_ENTRIES) {
    return json({ status: 'error', message: 'Inventory field-override store is full.' }, 413);
  }

  const rec = existing ? Object.assign({}, existing) : {};
  for (const f of clears) delete rec[f];
  Object.assign(rec, setVals);

  // If every override field was cleared, drop the item key entirely.
  const dataKeys = Object.keys(rec).filter(k => k !== 'updatedAt' && k !== 'updatedBy');
  if (dataKeys.length === 0) {
    delete store.fields[itemId];
    const stamp = await saveStore(env, store);
    return json({ ok: true, saved: true, item: itemId, fields: {}, cleared: true, meta: { updated: stamp } });
  }

  rec.updatedAt = new Date().toISOString();  // SERVER-SET
  rec.updatedBy = who(session);              // SERVER-SET
  store.fields[itemId] = rec;

  const stamp = await saveStore(env, store);
  const out = {};
  for (const k of dataKeys) out[k] = rec[k];
  return json({ ok: true, saved: true, item: itemId, fields: out, cleared: false, meta: { updated: stamp } });
}
