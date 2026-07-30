// Cloudflare Pages Function -- /api/refresh-actuals
// INSTANT "Refresh actuals" trigger for the per-project Budget-vs-Actual feed.
//
// WHY A TRIGGER (not a live parse): the actuals feed (data/budget-actuals.js) is
// produced by parsing each project's Turnover Budget .xlsm with a Python formula-
// graph parser (openpyxl) on the container -- that cannot run inside a Cloudflare
// edge Function. So the fresh-on-demand path mirrors the proven field-companion
// KV-queue bridge: this endpoint WRITES a refresh request to KV (namespace
// PF_SCHEDULE), and the container's budget_actuals_daemon.sh polls that key, then
// rebuilds + redeploys the feed within seconds. The button then reloads the feed.
//
// WHAT IT DOES
//   POST /api/refresh-actuals            -> queue a full-feed rebuild (all projects)
//   POST /api/refresh-actuals?job=26-017 -> queue, tagged with the requested job
//   GET  /api/refresh-actuals            -> report the last request + queue status
//
// KV KEY (namespace env.PF_SCHEDULE): 'budget_actuals_refresh_request' ->
//   JSON { id: <iso ts>, job: <string|'all'>, by: <session name>, at: <iso ts> }
//   The daemon fires whenever `id` advances past the id it last processed.
//
// RBAC: office only. requireArea(session,'financials') (admin/partner/business_dev;
//   field_ops BLOCKED) on BOTH GET and POST. Behind the auth gate (_middleware.js).
// FAIL CLOSED: no KV binding -> 503 honest error (never a fake "queued"). No mail,
//   no outbound fetch, no eval.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'budget_actuals_refresh_request';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Optional job tag: "YY-NNN" style short slug, else 'all'. Tightly constrained.
function cleanJob(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 'all';
  if (!/^[A-Za-z0-9-]{1,20}$/.test(s)) return '';
  return s;
}

export async function onRequestGet(context) {
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;
  const { env } = context;
  if (!env.PF_SCHEDULE) {
    return json({ status: 'error', message: 'Refresh unavailable: KV binding PF_SCHEDULE not configured.' }, 503);
  }
  try {
    const raw = await env.PF_SCHEDULE.get(KV_KEY);
    const last = raw ? JSON.parse(raw) : null;
    return json({ ok: true, lastRequest: last });
  } catch (err) {
    console.error('api/refresh-actuals GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials');   // office only; field_ops blocked
  if (denied) return denied;

  if (!env.PF_SCHEDULE) {
    return json({ status: 'error',
      message: 'Refresh unavailable: KV binding PF_SCHEDULE not configured. Your request was NOT queued.' }, 503);
  }
  try {
    const url = new URL(request.url);
    const job = cleanJob(url.searchParams.get('job'));
    if (job === '') return json({ status: 'error', message: 'Invalid job parameter.' }, 400);

    const who = (session && (session.name || session.uid))
      ? String(session.name || session.uid).slice(0, 200).replace(/[<>]/g, '') : 'unknown';
    const nowIso = new Date().toISOString();
    const reqObj = { id: nowIso, job, by: who, at: nowIso };

    // The daemon fires when `id` advances. A short expiration is fine -- the daemon
    // polls on a ~60s heartbeat, well within the TTL.
    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(reqObj), { expirationTtl: 900 });

    return json({ ok: true, queued: true, request: reqObj,
      message: 'Refresh queued. The updated actuals will appear within about a minute.' });
  } catch (err) {
    console.error('api/refresh-actuals POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
