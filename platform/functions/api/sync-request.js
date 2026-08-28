// Cloudflare Pages Function -- /api/sync-request
// OFFICE "Sync Now" trigger for the whole-platform live-data refresh + redeploy.
//
// WHY A TRIGGER (not a live sync): the platform refresh pulls the master
// spreadsheets from SharePoint via the Microsoft Graph API and regenerates the
// data feeds with Python (openpyxl) + a `wrangler pages deploy` -- NONE of which
// can run inside a Cloudflare edge Function. So the on-demand path mirrors the
// PROVEN sibling pattern already in production (api/refresh-actuals.js +
// budget_actuals_daemon.sh): this endpoint WRITES a request flag to KV, and the
// container's local sync daemon POLLS that flag, clears it, runs
// platform_sync_boop.sh (SharePoint pull -> rebuild feeds -> wrangler deploy),
// and writes a STATUS record back to KV that the button reads to reflect honest
// state (running / done / failed) -- it NEVER fakes a success.
//
// WHAT IT DOES
//   POST /api/sync-request   -> set the sync_request_v1 flag (queue a sync)
//   GET  /api/sync-request   -> return { request, status } so the button can poll
//
// KV KEYS (namespace env.PF_SCHEDULE = 6c8bd3b9...):
//   sync_request_v1 -> JSON { requestedAt: <iso>, requestedBy: <session name> }
//                      The daemon fires when this key is PRESENT, then DELETES it.
//   sync_status_v1  -> JSON { state:'running'|'done'|'failed',
//                             startedAt, finishedAt, lastSync, by, error }
//                      Written by the daemon (start=running, end=done/failed).
//
// RBAC: OFFICE only. requireArea(session,'financials') (admin/partner/business_dev;
//   field_ops BLOCKED) on BOTH GET and POST -- same office tier the sibling
//   refresh-actuals button uses. The path is ALSO classified 'financials' in
//   lib/auth.js areaForPath(), so the middleware gates it too (defense-in-depth).
//   Fails CLOSED: no session / wrong role -> 403; no KV binding -> 503 (never a
//   fake "queued").
//
// HARDENING: no request body is trusted (POST takes no payload), no outbound
//   fetch, no eval. Responses are private, no-store.

import { requireArea } from '../lib/auth.js';

const REQ_KEY = 'sync_request_v1';
const STATUS_KEY = 'sync_status_v1';
// The daemon polls on a short heartbeat; a generous TTL guards against a request
// stranded if the daemon is momentarily down (it will still fire on next poll
// while the key lives; after that the button simply falls idle -- honest).
const REQUEST_TTL_SEC = 1800; // 30 min

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeParse(raw) {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
  catch { return null; }
}

// GET: report the current request flag + last status so the button can render
// "Sync Now" / "Syncing..." / "Synced (ts)" / "Sync failed" honestly.
export async function onRequestGet(context) {
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;
  const { env } = context;
  if (!env.PF_SCHEDULE) {
    return json({ status: 'error',
      message: 'Sync unavailable: KV binding PF_SCHEDULE not configured.' }, 503);
  }
  try {
    const [reqRaw, statusRaw] = await Promise.all([
      env.PF_SCHEDULE.get(REQ_KEY),
      env.PF_SCHEDULE.get(STATUS_KEY),
    ]);
    return json({ ok: true, request: safeParse(reqRaw), status: safeParse(statusRaw) });
  } catch (err) {
    console.error('api/sync-request GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// POST: set the sync_request_v1 flag. Office only. No body is read/trusted.
export async function onRequestPost(context) {
  const { env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials'); // office only; field_ops blocked
  if (denied) return denied;

  if (!env.PF_SCHEDULE) {
    return json({ status: 'error',
      message: 'Sync unavailable: KV binding PF_SCHEDULE not configured. Your request was NOT queued.' }, 503);
  }
  try {
    // If a sync is already running, do NOT queue a duplicate -- report the live state.
    const statusRaw = await env.PF_SCHEDULE.get(STATUS_KEY);
    const status = safeParse(statusRaw);
    if (status && status.state === 'running') {
      return json({ ok: true, queued: false, alreadyRunning: true, status,
        message: 'A sync is already running.' });
    }

    const who = (session && (session.name || session.uid))
      ? String(session.name || session.uid).slice(0, 200).replace(/[<>]/g, '') : 'unknown';
    const nowIso = new Date().toISOString();
    const reqObj = { requestedAt: nowIso, requestedBy: who };

    await env.PF_SCHEDULE.put(REQ_KEY, JSON.stringify(reqObj), { expirationTtl: REQUEST_TTL_SEC });

    return json({ ok: true, queued: true, request: reqObj,
      message: 'Sync queued. The portal will refresh within a couple of minutes.' });
  } catch (err) {
    console.error('api/sync-request POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
