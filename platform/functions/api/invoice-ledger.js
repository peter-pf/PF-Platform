// Cloudflare Pages Function -- /api/invoice-ledger
// INVOICE LEDGER (read-only, this slice) for the Budget-vs-Actual "Actual" drill-down.
//
// WHAT IT SERVES
//   GET /api/invoice-ledger?job=26-017
//     -> { ok:true, job, ledger: { "<normGroupTitle>|<costCode>": { invoices:[...], total } }, _meta }
//   The client, when the office clicks an Actual cell for a Budget-vs-Actual row,
//   looks up ledger[ baNormTitle(groupTitle) + '|' + costCode ] and lists each
//   invoice (vendor / date / invoice_no / amount) with a link that opens the PDF.
//
// KEY SHAPE (does NOT collide with project_budget_v1: or budget_actuals_refresh_request):
//   The drill-down is keyed by (job, normalized group title, cost code) EXACTLY as
//   the portal overlays workbook actuals (baNormTitle(group)+'|'+code in index.html,
//   _norm_title() in sync/budget_actual_parser.py). So a Budget-vs-Actual row maps
//   1:1 to its invoices with the same key the render loop already computes.
//
// DATA SOURCE (this slice): the static feed data/invoice-ledger.js (window.
//   PF_INVOICE_LEDGER), generated/backfilled by sync/build-invoice-ledger.py from
//   each project's Turnover Budget workbook (col D Actual + col F vendor + col G
//   notes) and the SharePoint '02 - Project Management/Expenses' PDFs. That static
//   file is ALSO loaded client-side, but this endpoint exists so the drill-down can
//   fetch a SINGLE job's ledger behind the 'financials' RBAC gate (field_ops
//   blocked), and so a future write path can move the store to KV
//   (invoice_ledger_v1:<num>) with ZERO client change. Read order:
//     1. KV env.PF_SCHEDULE :: 'invoice_ledger_v1:<num>'  (future write-back store)
//     2. else the bundled static feed passed in via env is not available to a
//        Function, so when KV is empty this endpoint returns an EMPTY ledger with
//        source:'static-feed' so the client falls back to window.PF_INVOICE_LEDGER.
//   FAIL CLOSED: on any error, honest JSON error -- never a fabricated invoice.
//
// RBAC: financials only. requireArea(session,'financials') (admin/partner/
//   business_dev; field_ops BLOCKED) -- mirrors project-budget / refresh-actuals.
//   Also gated at the path in areaForPath() (defense in depth). Behind the auth
//   gate in _middleware.js (no session -> 401).
// NO mail, NO outbound fetch, NO eval.

import { requireArea } from '../lib/auth.js';

const KV_PREFIX = 'invoice_ledger_v1:';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// A project number: "YY-NNN" style, tightly constrained (it's part of the KV key).
function cleanNum(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(s)) return '';
  return s;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials');   // office only; field_ops blocked
  if (denied) return denied;

  const url = new URL(request.url);
  const num = cleanNum(url.searchParams.get('job'));
  if (!num) return json({ status: 'error', message: 'Missing or invalid job parameter.' }, 400);

  // KV is optional in this read-only slice: when the ledger has been migrated to
  // KV (future write-back) we serve it; when not, we return an EMPTY ledger tagged
  // source:'static-feed' so the client falls back to the bundled window.PF_INVOICE_LEDGER.
  if (!env.PF_SCHEDULE) {
    return json({ ok: true, job: num, ledger: {}, source: 'static-feed',
      message: 'KV not bound; use the bundled static ledger (window.PF_INVOICE_LEDGER).' });
  }
  try {
    const raw = await env.PF_SCHEDULE.get(KV_PREFIX + num);
    if (!raw) {
      return json({ ok: true, job: num, ledger: {}, source: 'static-feed',
        message: 'No KV ledger for this job; use the bundled static ledger.' });
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      // Corrupt KV value: fail closed to the static feed rather than serve garbage.
      return json({ ok: true, job: num, ledger: {}, source: 'static-feed',
        message: 'KV ledger unreadable; use the bundled static ledger.' });
    }
    const ledger = (parsed && typeof parsed.ledger === 'object' && parsed.ledger) ? parsed.ledger : {};
    return json({ ok: true, job: num, ledger, source: 'kv', _meta: parsed._meta || null });
  } catch (err) {
    console.error('api/invoice-ledger GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
