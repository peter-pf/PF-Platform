// Cloudflare Pages Function -- /api/project-invoicing
// PER-PROJECT INVOICING record for a project record's Section 10 "Financials" >
// "Project Invoicing" dropdown (Financials Phase 1b -- SIMPLE pay-app tracking, no
// document generation). Brad chose: SIMPLE pay app, TRACK IN PORTAL, ONE retainage
// % per project. This endpoint is the per-project invoicing store: the office
// enters two project-level inputs (subcontract value + one retainage %) plus a
// list of pay applications; each pay app carries an Amount This Period and a
// Status (Draft | Sent | Paid). All roll-ups (Invoiced/Paid/Retainage-held) are
// computed CLIENT-SIDE from this stored record; this endpoint does NO financial
// computation -- it is a plain read/write store keyed by project number.
//
// WHAT IT STORES
//   project_invoicing_v1:<num>  ->  JSON {
//     version: 1,
//     num,                                  // the project number this belongs to
//     subcontractValue: <number|null>,      // project-level input (dollars) or null
//     retainagePct: <number|null>,          // ONE retainage % per project or null
//     sov: [ {                              // the Billing Schedule of Values (line items)
//       item: <string>,                     // line item # / label (free text, capped)
//       division: <string>,                 // division / cost code (free text, capped)
//       description: <string>,              // description of work (free text, capped)
//       sub: <string>,                      // subcontractor (free text, capped)
//       originalSov: <number>,              // Original SOV dollars (>=0)
//       approvedCO: <number>                // Approved change orders dollars (may be 0)
//       // NOTE: Current Contract Amt (=original+CO), % Complete, Balance, Retainage
//       // Held and Invoiced to Date are DERIVED CLIENT-SIDE and are NOT stored here.
//     }, ... ],
//     payApps: [ {                          // ordered list of pay applications
//       num: <int>,                         // auto-increment per project (1,2,3...)
//       date: <string>,                     // application date (free text, capped)
//       period: <string>,                   // billing period label (free text, capped)
//       amount: <number>,                   // Amount This Period (dollars)
//       retainage: <number>,                // = amount * retainagePct (client-computed, re-derived + stored)
//       netDue: <number>,                   // = amount - retainage (client-computed, re-derived + stored)
//       status: 'Draft'|'Sent'|'Paid',
//       paidDate: <string>                  // set when status=Paid (free text, capped)
//     }, ... ],
//     _meta: { updatedBy, updatedAt }       // last writer + when (server-set)
//   }
//   NOTE ON retainage/netDue: the CLIENT computes them live as the user types the
//   amount (amount * retainagePct). The server RE-DERIVES them here from the
//   authoritative amount + project retainagePct and stores the derived values, so a
//   tampered client cannot store a retainage that disagrees with amount*pct. The
//   roll-ups the client shows are re-computed from these stored numbers at render.
//
// KV KEY: env.PF_SCHEDULE :: 'project_invoicing_v1:<num>'  (one key per project).
//
// RBAC (this is FINANCIAL data -- mirrors project-budget exactly):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FINANCIALS area (the office): requireArea(session, 'financials') on GET and
//     POST. financials = admin/partner/business_dev -- the office. field_ops is
//     BLOCKED (can neither read nor write), even by direct URL.
//     /api/project-invoicing -> 'financials' in areaForPath (defense-in-depth).
//   - WRITE hardening: body cap, strict JSON -> 400, all strings length-capped,
//     numbers coerced to finite non-negative (else 400), status whitelisted,
//     updatedBy/updatedAt from the SESSION (never client-supplied), no eval.
//     Private no-store.
//   - FAIL CLOSED: if KV is not bound, POST returns 503 (client keeps the user in
//     edit mode + honest error -- NEVER "saved") and GET returns 503 (honest error
//     -- NEVER fabricates a saved record). Corrupt stored JSON -> empty shell
//     (never a fabricated pay app), a fresh save overwrites it.
//   - NO mail, NO outbound fetch, NO KV list/polling (writes only on explicit Save;
//     modest free-tier write budget is fine).

import { requireArea } from '../lib/auth.js';

const KV_PREFIX = 'project_invoicing_v1:';
const MAX_BODY_BYTES = 128 * 1024;   // a project's pay-app list fits easily
const MAX_STR = 80;                  // date / period / paidDate labels
const MAX_SOV_STR = 200;             // SOV description can be longer than a date label
const MAX_PAY_APPS = 200;            // generous cap; a job has a handful
const MAX_SOV_LINES = 300;           // generous cap; a job has a handful of SOV lines
const STATUSES = { Draft: 1, Sent: 1, Paid: 1 };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// A project number: digits/letters/hyphens only, part of the KV key so tightly
// constrained (matches project-budget's cleanNum).
function cleanNum(v) {
  const str = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(str)) return '';
  return str;
}

// A short free-text label (date / period / paidDate). Trimmed, length-capped,
// angle brackets stripped (defense-in-depth; the client also escapes on render).
function cleanStr(v) {
  if (v == null) return '';
  let str = String(v).trim().replace(/[<>]/g, '');
  if (str.length > MAX_STR) str = str.slice(0, MAX_STR);
  return str;
}

// A longer free-text label for SOV fields (description can be a sentence).
function cleanSovStr(v) {
  if (v == null) return '';
  let str = String(v).trim().replace(/[<>]/g, '');
  if (str.length > MAX_SOV_STR) str = str.slice(0, MAX_SOV_STR);
  return str;
}

// Coerce a money-ish value to a finite, non-negative number rounded to cents.
// Returns { ok, value }. Empty/null -> { ok:true, value:null } meaning "not set".
function cleanMoney(v, allowNull) {
  if (v === '' || v === null || v === undefined) {
    return allowNull ? { ok: true, value: null } : { ok: true, value: 0 };
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { ok: false, value: 0 };
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 1e12) return { ok: false, value: 0 };
  return { ok: true, value: rounded };
}

// Coerce a percent (0..100) to a finite non-negative number. Empty -> null.
function cleanPct(v) {
  if (v === '' || v === null || v === undefined) return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, value: null };
  const rounded = Math.round(n * 1000) / 1000; // up to 3 decimals of a percent
  return { ok: true, value: rounded };
}

function round2(n) { return Math.round(n * 100) / 100; }

function kvKey(num) { return KV_PREFIX + num; }

// Load the stored invoicing object for one project, or an empty shell.
async function loadRecord(env, num) {
  const empty = {
    num, subcontractValue: null, retainagePct: null, sov: [], payApps: [],
    _meta: { updatedBy: null, updatedAt: null },
  };
  const raw = await env.PF_SCHEDULE.get(kvKey(num));
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    return {
      num,
      subcontractValue: (typeof p.subcontractValue === 'number') ? p.subcontractValue : null,
      retainagePct: (typeof p.retainagePct === 'number') ? p.retainagePct : null,
      sov: Array.isArray(p.sov) ? p.sov : [],
      payApps: Array.isArray(p.payApps) ? p.payApps : [],
      _meta: (p && p._meta && typeof p._meta === 'object')
        ? p._meta : { updatedBy: null, updatedAt: null },
    };
  } catch {
    // Corrupt value -> empty shell (never fabricate). A fresh save overwrites it.
    return empty;
  }
}

// ---- GET: return the stored invoicing record for ?num=<project_number> -------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const num = cleanNum(url.searchParams.get('num'));
    if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

    // FAIL CLOSED: financial data. If KV is not bound we CANNOT know the saved
    // record, so return an honest 503 rather than pretending "no invoicing".
    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Invoicing store unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }
    const rec = await loadRecord(env, num);
    return json({
      ok: true, num,
      subcontractValue: rec.subcontractValue,
      retainagePct: rec.retainagePct,
      sov: rec.sov,
      payApps: rec.payApps,
      _meta: rec._meta,
    });
  } catch (err) {
    console.error('api/project-invoicing GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: save the whole invoicing record for a project --------------------
//   body: { num, subcontractValue, retainagePct,
//           sov: [ {item, division, description, sub, originalSov, approvedCO}, ... ],
//           payApps: [ {num?, date, period, amount, status, paidDate}, ... ] }
// The SOV stores ONLY the entry fields (item/division/description/sub/originalSov/
// approvedCO). The derived columns (Current Contract Amt, % Complete, Balance,
// Retainage Held, Invoiced to Date) are NOT stored -- the client re-derives them.
// The whole record is replaced (client sends the full current state). Server
// re-numbers pay apps sequentially (1..N in submitted order), re-derives retainage
// (= amount * retainagePct) and netDue (= amount - retainage) from the
// authoritative amount + project retainagePct, whitelists status, and stamps
// updatedBy/updatedAt from the session. Returns the FULL saved record so the client
// re-renders from server truth.
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

    const scv = cleanMoney(parsed && parsed.subcontractValue, true);
    if (!scv.ok) return json({ status: 'error', message: 'Subcontract Value must be a non-negative number.' }, 400);

    const pct = cleanPct(parsed && parsed.retainagePct);
    if (!pct.ok) return json({ status: 'error', message: 'Retainage % must be a number between 0 and 100.' }, 400);

    const inApps = (parsed && Array.isArray(parsed.payApps)) ? parsed.payApps : [];
    if (inApps.length > MAX_PAY_APPS) return json({ status: 'error', message: 'Too many pay applications.' }, 413);

    // Re-derive each pay app from the authoritative amount + project retainagePct.
    // A pay app with a non-numeric amount is REJECTED (fail closed on bad money --
    // never silently drop or coerce garbage to 0).
    const pctFrac = (pct.value == null ? 0 : pct.value) / 100;
    const payApps = [];
    for (let i = 0; i < inApps.length; i++) {
      const a = inApps[i] || {};
      const amt = cleanMoney(a.amount, false);
      if (!amt.ok) {
        return json({ status: 'error', message: 'Pay app #' + (i + 1) + ' amount must be a non-negative number.' }, 400);
      }
      let status = String(a.status == null ? 'Draft' : a.status).trim();
      if (!STATUSES[status]) status = 'Draft';
      const retainage = round2(amt.value * pctFrac);
      const netDue = round2(amt.value - retainage);
      const paidDate = (status === 'Paid') ? cleanStr(a.paidDate) : '';
      payApps.push({
        num: i + 1,                        // server owns numbering (1..N, submit order)
        date: cleanStr(a.date),
        period: cleanStr(a.period),
        amount: amt.value,
        retainage: retainage,
        netDue: netDue,
        status: status,
        paidDate: paidDate,
      });
    }

    // Sanitize the Billing SOV lines. Store ONLY the entry fields; never store the
    // derived columns (client re-derives Current/%/Balance/Retainage/Invoiced). A
    // line with a non-numeric Original SOV or Approved CO is REJECTED (fail closed).
    const inSov = (parsed && Array.isArray(parsed.sov)) ? parsed.sov : [];
    if (inSov.length > MAX_SOV_LINES) return json({ status: 'error', message: 'Too many schedule of values lines.' }, 413);
    const sov = [];
    for (let i = 0; i < inSov.length; i++) {
      const s = inSov[i] || {};
      const orig = cleanMoney(s.originalSov, false);
      if (!orig.ok) {
        return json({ status: 'error', message: 'SOV line #' + (i + 1) + ' Original SOV must be a non-negative number.' }, 400);
      }
      const co = cleanMoney(s.approvedCO, false);
      if (!co.ok) {
        return json({ status: 'error', message: 'SOV line #' + (i + 1) + ' Approved CO must be a non-negative number.' }, 400);
      }
      sov.push({
        item: cleanStr(s.item),
        division: cleanStr(s.division),
        description: cleanSovStr(s.description),
        sub: cleanStr(s.sub),
        originalSov: orig.value,
        approvedCO: co.value,
      });
    }

    // FAIL CLOSED: no KV -> we cannot persist. Do NOT report success.
    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment. Your invoicing was NOT saved.' }, 503);
    }

    const who = (session && (session.name || session.uid))
      ? String(session.name || session.uid).slice(0, 200).replace(/[<>]/g, '') : 'unknown';
    const nowIso = new Date().toISOString();

    const toStore = {
      version: 1,
      num,
      subcontractValue: scv.value,
      retainagePct: pct.value,
      sov,
      payApps,
      _meta: { updatedBy: who, updatedAt: nowIso },
    };
    await env.PF_SCHEDULE.put(kvKey(num), JSON.stringify(toStore));

    return json({
      ok: true, saved: true, num,
      subcontractValue: toStore.subcontractValue,
      retainagePct: toStore.retainagePct,
      sov: toStore.sov,
      payApps: toStore.payApps,
      _meta: toStore._meta,
    });
  } catch (err) {
    console.error('api/project-invoicing POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
