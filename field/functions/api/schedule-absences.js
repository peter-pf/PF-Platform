// Cloudflare Pages Function — /api/schedule-absences
// Returns approved absences for the schedule tile (dashboard) and schedule page.
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Defaults to today through today+13 (2-week dashboard view).
//   Max range: 366 days. Bad input returns 400 (try/catch wrapped).
//
// RESPONSE:
//   { ok: true, from, to,
//     absences: [{ id, name, start_date, end_date, half_day, label }],
//     jobs: [] }
//
// PRIVACY: uid and type are NOT returned to the crew. Only the employee's
// display name and dates are exposed. Owners see type on /api/time-off (owner
// view) which is gated by the isOwner check in that handler.
//
// DESIGN NOTE (future job rows): jobs:[] placeholder reserved for metadata
// spreadsheet integration. Absence rows have no `type` field; job rows will
// use type='job'. The client switches on the presence of `label`.
//
// RBAC: schedule area = admin | partner | business_dev | field_ops.

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  try { return new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v; }
  catch { return false; }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function clampRange(from, to) {
  try {
    const s = new Date(from + 'T12:00:00Z');
    const e = new Date(to   + 'T12:00:00Z');
    const days = Math.round((e - s) / 86400000);
    if (days > 366) return { from, to: addDays(from, 366) };
    return { from, to };
  } catch { return { from, to: addDays(from, 13) }; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied  = requireArea(session, 'schedule');
  if (denied) return denied;

  if (!env.DB) return json({ ok: true, absences: [], jobs: [] });

  try {
    const url   = new URL(request.url);
    const today = todayIso();

    let from = url.searchParams.get('from') || today;
    let to   = url.searchParams.get('to')   || addDays(today, 13);

    if (!isIsoDate(from)) return json({ ok: false, error: 'Invalid from date.' }, 400);
    if (!isIsoDate(to))   return json({ ok: false, error: 'Invalid to date.'   }, 400);
    if (to < from) return json({ ok: false, error: 'to must be >= from.' }, 400);

    ({ from, to } = clampRange(from, to));

    // Only return name, start_date, end_date, half_day — no uid, no type (privacy)
    const { results } = await env.DB
      .prepare(`SELECT id, name, start_date, end_date, half_day
                FROM absence_requests
                WHERE status='approved'
                  AND start_date <= ?
                  AND end_date   >= ?
                ORDER BY start_date ASC, name ASC`)
      .bind(to, from).all();

    // Add a fixed label so the client can identify these rows
    const absences = (results || []).map(r => ({ ...r, label: 'Out' }));

    return json({ ok: true, from, to, absences, jobs: [] });
  } catch (e) {
    console.error('schedule_absences_error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}
