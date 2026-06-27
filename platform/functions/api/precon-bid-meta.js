// Cloudflare Pages Function -- /api/precon-bid-meta
// Per-bid PRECONSTRUCTION metadata overlay for the Actively Pricing module.
// One KV map keyed by the stable bid id holds, per bid:
//   - date OVERRIDES (Prelim "Design Completed Date", "Bid Due Date" + the
//     "Award Date") so an addendum-shifted or backfilled date can be corrected
//     without touching the read-only feed;
//   - the BIDDING GCS list (multiple GCs can bid the same job);
//   - the AWARDED GC index (which GC of record won).
// Mirrors the precon-flag.js / precon-log.js KV + write-hardening pattern.
// NO mail, NO outbound fetch. ZERO financials (GC info + dates are not money).
//
// WHAT IT STORES
//   precon_bid_meta_v1 -> JSON {
//     meta: { updated },
//     bids: { <bidId>: {
//       dates:     { designCompletedDate?, dueDate?, awardDate?, projStart?, dateSubmitted? },  // ISO YYYY-MM-DD, only set ones present
//       gcs:       [ { company, contact, email, phone } ],
//       awardedGc: <int index into gcs, or -1>,
//       bidPrice:  <non-negative number as a string, or absent>,  // entered Bid Price
//       docs:      [ { label, url } ],  // per-job document links (http(s) ONLY)
//       by, at
//     } }
//   }
//   Lives ONLY in KV; the precon-pipeline.js base is read-only so a re-sync never
//   erases this overlay.
//
// BID ID SCHEME (consistent with precon-pipeline.js + the client resolveKey()):
//   bidId = 'num_<project number>' when the bid has a real number, else
//   'ng_<hash of name+gc>'. The CLIENT computes it (bidLogId/resolveKey) and
//   passes it; the server only validates + length-caps it (opaque key here).
//
// SECURITY MODEL:
//   - Behind the server-side auth gate (functions/_middleware.js): no session ->
//     401. PRECONSTRUCTION area enforced HERE via requireArea on GET AND POST AND
//     in lib/auth.js areaForPath('/api/precon-bid-meta') -> 'preconstruction'.
//     Allowed: admin, partner, business_dev. field_ops BLOCKED by direct URL too.
//     Fails CLOSED.
//   - WRITE hardening (mirrors api/precon-flag.js): body size cap, strict JSON
//     parse -> 400, every string rebuilt + length-capped + angle-stripped, dates
//     validated to ISO YYYY-MM-DD (junk rejected), gcs array capped, awardedGc
//     coerced to a bounded int, bidId prototype-pollution guard, server-set by/at.
//     Private no-store.
//   - NO mail is sent and NO mail API is called.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'precon_bid_meta_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_BIDS = 20000;     // total tracked bids cap
const MAX_SHORT = 300;      // bidId / company / contact / phone cap
const MAX_EMAIL = 200;      // email cap
const MAX_GCS = 12;         // bidding GCs per bid cap
const MAX_DOCS = 12;        // document links per bid cap
const MAX_DOC_LABEL = 120;  // document label cap
const MAX_DOC_URL = 500;    // document url cap

const VALID_DATE_FIELD = { designCompletedDate: 1, dueDate: 1, awardDate: 1, projStart: 1, dateSubmitted: 1 };
const MAX_PRICE = 1e12;     // sanity cap on the entered Bid Price ($1 trillion)

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

// Validate / normalize a date to ISO YYYY-MM-DD, or '' to clear. Anything that is
// not a clean ISO date (and not the empty clear-value) is rejected by the caller.
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

// Validate / normalize an entered Bid Price to a non-negative number STRING, or
// '' to clear. Accepts a number or a money-formatted string ('$12,500', '12500').
// Returns the canonical numeric string (e.g. '12500'); returns null on junk or a
// negative value (caller -> 400). Stored as a string to avoid float drift in JSON.
function normPrice(v) {
  if (v == null) return '';
  let str = String(v).trim();
  if (str === '') return '';
  // Strip currency symbol, thousands separators, and surrounding spaces.
  str = str.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(str)) return null; // only non-negative decimals; no '-', no junk
  const n = Number(str);
  if (!isFinite(n) || n < 0 || n > MAX_PRICE) return null;
  // Canonical string: drop a trailing '.0' style but keep cents if present.
  return String(n);
}

// Rebuild one GC entry from untrusted input, length-capping every field.
function normGc(g) {
  g = g || {};
  return {
    company: s(g.company, MAX_SHORT),
    contact: s(g.contact, MAX_SHORT),
    email: s(g.email, MAX_EMAIL),
    phone: s(g.phone, MAX_SHORT),
  };
}

// Rebuild one DOCUMENT-link entry from untrusted input. Returns a sanitized
// { label, url } whose url is STRICTLY an http:// or https:// URL, or null when
// the url is anything else (javascript:, data:, vbscript:, file:, mailto:,
// relative, empty, or unparseable). A null return DROPS the entry (the caller
// filters them out) so a bad link can never be persisted or rendered. The label
// is length-capped + angle-stripped via s(); the url is length-capped first,
// then scheme-validated (so an over-long string cannot smuggle a bad scheme).
function normDoc(d) {
  d = d || {};
  const label = s(d.label, MAX_DOC_LABEL);
  let url = (d.url == null) ? '' : String(d.url);
  if (url.length > MAX_DOC_URL) url = url.slice(0, MAX_DOC_URL);
  url = url.trim();
  if (!url) return null;
  // Accept ONLY absolute http(s) URLs. URL parsing rejects relative/garbage; the
  // protocol allow-list rejects every dangerous scheme. Reject anything else.
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return { label, url };
}

function isBadKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}

// KNOWN LIMITATION: KV read-modify-write (load map -> set one bid -> put), no
// transaction, so two simultaneous writes to DIFFERENT bids can last-writer-wins
// and drop one. Acceptable for precon's low-concurrency editing; the durable fix
// is a D1 migration with a row per bid. No behavior change now.
async function loadMeta(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { bids: {}, meta: { updated: null } };
  try {
    const parsed = JSON.parse(raw);
    return {
      bids: (parsed && parsed.bids && typeof parsed.bids === 'object') ? parsed.bids : {},
      meta: (parsed && parsed.meta) || { updated: null },
    };
  } catch {
    return { bids: {}, meta: { updated: null } };
  }
}

// ---- GET: read the whole bid-meta map (loaded alongside the bids) -----------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, bids: {}, meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no bid meta stored yet.' });
    }
    const store = await loadMeta(env);
    return json({ ok: true, bids: store.bids, meta: store.meta });
  } catch (err) {
    console.error('api/precon-bid-meta GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: set one bid's meta via a sub-action -----------------------------
// Body (one of):
//   { action:'setDate',      bidId, field:'designCompletedDate'|'dueDate'|'awardDate'|'projStart'|'dateSubmitted', value:ISO|'' }
//   { action:'setGcs',       bidId, gcs:[ {company,contact,email,phone}, ... ] }
//   { action:'setAwardedGc', bidId, index:int }
//   { action:'setBidPrice',  bidId, value:number|moneyString|'' }
//   { action:'setDocs',      bidId, docs:[ {label,url(http(s))}, ... ] }
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
    if (action !== 'setDate' && action !== 'setGcs' && action !== 'setAwardedGc' && action !== 'setBidPrice' && action !== 'setDocs') {
      return json({ status: 'error', message: 'Unknown action.' }, 400);
    }

    const bidId = s(parsed && parsed.bidId, MAX_SHORT);
    if (!bidId) return json({ status: 'error', message: 'bidId is required.' }, 400);
    // Prototype-pollution guard: bidId is used as an object key on store.bids, so
    // reject keys that would write to the prototype chain.
    if (isBadKey(bidId)) return json({ status: 'error', message: 'Invalid bidId.' }, 400);

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const store = await loadMeta(env);
    if (!store.bids[bidId] && Object.keys(store.bids).length >= MAX_BIDS) {
      return json({ status: 'error', message: 'Bid meta store is full.' }, 413);
    }

    // Start from the existing record (or a fresh, prototype-free shape).
    const prev = store.bids[bidId] || {};
    const rec = {
      dates: (prev.dates && typeof prev.dates === 'object') ? {
        designCompletedDate: s(prev.dates.designCompletedDate, 10) || undefined,
        dueDate: s(prev.dates.dueDate, 10) || undefined,
        awardDate: s(prev.dates.awardDate, 10) || undefined,
        projStart: s(prev.dates.projStart, 10) || undefined,
        dateSubmitted: s(prev.dates.dateSubmitted, 10) || undefined,
      } : {},
      gcs: Array.isArray(prev.gcs) ? prev.gcs.slice(0, MAX_GCS).map(normGc) : [],
      awardedGc: Number.isInteger(prev.awardedGc) ? prev.awardedGc : -1,
      // Carry existing document links forward (re-sanitized: any entry whose url
      // is no longer a valid http(s) URL is dropped, never re-emitted).
      docs: Array.isArray(prev.docs)
        ? prev.docs.slice(0, MAX_DOCS).map(normDoc).filter(function (x) { return x; })
        : [],
    };
    // Carry the existing Bid Price forward (re-validated). Only persisted when set;
    // an invalid stored value is dropped rather than re-emitted.
    const prevPrice = normPrice(prev.bidPrice);
    if (prevPrice) rec.bidPrice = prevPrice;
    // Drop any undefined date keys so we only persist set ones.
    if (rec.dates.designCompletedDate === undefined) delete rec.dates.designCompletedDate;
    if (rec.dates.dueDate === undefined) delete rec.dates.dueDate;
    if (rec.dates.awardDate === undefined) delete rec.dates.awardDate;
    if (rec.dates.projStart === undefined) delete rec.dates.projStart;
    if (rec.dates.dateSubmitted === undefined) delete rec.dates.dateSubmitted;

    if (action === 'setDate') {
      const field = String((parsed && parsed.field) || '');
      if (!VALID_DATE_FIELD[field]) {
        return json({ status: 'error', message: "field must be 'designCompletedDate', 'dueDate', 'awardDate', 'projStart' or 'dateSubmitted'." }, 400);
      }
      const iso = normIsoDate(parsed && parsed.value);
      if (iso === null) return json({ status: 'error', message: 'value must be an ISO date (YYYY-MM-DD) or empty.' }, 400);
      if (iso === '') delete rec.dates[field];
      else rec.dates[field] = iso;
    } else if (action === 'setGcs') {
      const arr = (parsed && Array.isArray(parsed.gcs)) ? parsed.gcs : null;
      if (!arr) return json({ status: 'error', message: 'gcs must be an array.' }, 400);
      if (arr.length > MAX_GCS) return json({ status: 'error', message: 'Too many GCs (max ' + MAX_GCS + ').' }, 400);
      rec.gcs = arr.map(normGc);
      // Keep awardedGc in range after the list changes.
      if (rec.awardedGc >= rec.gcs.length) rec.awardedGc = -1;
    } else if (action === 'setAwardedGc') {
      let idx = parseInt(parsed && parsed.index, 10);
      if (!Number.isInteger(idx)) return json({ status: 'error', message: 'index must be an integer.' }, 400);
      if (idx < -1) idx = -1;
      if (idx >= rec.gcs.length) return json({ status: 'error', message: 'index is out of range for the GC list.' }, 400);
      rec.awardedGc = idx;
    } else if (action === 'setBidPrice') {
      const price = normPrice(parsed && parsed.value);
      if (price === null) return json({ status: 'error', message: 'value must be a non-negative number or empty.' }, 400);
      if (price === '') delete rec.bidPrice;
      else rec.bidPrice = price;
    } else if (action === 'setDocs') {
      const arr = (parsed && Array.isArray(parsed.docs)) ? parsed.docs : null;
      if (!arr) return json({ status: 'error', message: 'docs must be an array.' }, 400);
      if (arr.length > MAX_DOCS) return json({ status: 'error', message: 'Too many documents (max ' + MAX_DOCS + ').' }, 400);
      // Sanitize every entry; drop any whose url is not a valid http(s) URL so a
      // bad scheme (javascript:/data:/...) or relative/empty link is never stored.
      rec.docs = arr.map(normDoc).filter(function (x) { return x; });
    }

    rec.by = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    rec.at = new Date().toISOString();
    store.bids[bidId] = rec;

    const stamp = rec.at;
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, bids: store.bids, meta: { updated: stamp } }));
    return json({ ok: true, saved: true, bidId, action, bids: store.bids, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/precon-bid-meta POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
