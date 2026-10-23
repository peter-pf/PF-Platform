// Cloudflare Pages Function — /api/schedule-absences
// Returns approved absences for the schedule tile (dashboard) and
// the full schedule page. Everyone with field_ops access can read.
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Defaults to today through today+13 (2-week dashboard view).
//   The caller may pass ?from=&to= to request any range (max 366 days).
//   Returns only 'approved' absences — pending/denied/cancelled are excluded.
//   Returns ALL team members' approved absences (no per-user scoping here).
//
// RESPONSE:
//   { ok: true, from, to,
//     absences: [{ id, uid, name, start_date, end_date, half_day, type, day_count }] }
//
// DESIGN NOTE (future job rows):
//   The response envelope reserves a `jobs` field (empty array for now) so the
//   schedule UI can merge job schedule rows alongside absences once the metadata
//   spreadsheet integration lands. The absence rows use type='absence'; job rows
//   will use type='job' with a distinct set of fields. No behaviour change needed
//   in the client's render loop — it switches on `type`.
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
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Today in UTC as YYYY-MM-DD
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Add N calendar days to an ISO date string
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Clamp date range to max 366 days
function clampRange(from, to) {
  const MAX_DAYS = 366;
  const s = new Date(from + 'T12:00:00Z');
  const e = new Date(to   + 'T12:00:00Z');
  const days = Math.round((e - s) / 86400000);
  if (days > MAX_DAYS) {
    return { from, to: addDays(from, MAX_DAYS) };
  }
  return { from, to };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'schedule');
  if (denied) return denied;

  if (!env.DB) return json({ ok: true, absences: [], jobs: [] });

  const url = new URL(request.url);
  const today = todayIso();

  let from = url.searchParams.get('from') || today;
  let to   = url.searchParams.get('to')   || addDays(today, 13);

  if (!isIsoDate(from)) from = today;
  if (!isIsoDate(to))   to   = addDays(today, 13);
  if (to < from) to = addDays(from, 13);

  ({ from, to } = clampRange(from, to));

  try {
    // Overlapping absences: start_date <= to AND end_date >= from
    const { results } = await env.DB
      .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, day_count
                FROM absence_requests
                WHERE status = 'approved'
                  AND start_date <= ?
                  AND end_date   >= ?
                ORDER BY start_date ASC, name ASC`)
      .bind(to, from)
      .all();

    return json({
      ok: true,
      from,
      to,
      absences: (results || []),
      jobs: [],  // placeholder for future job schedule rows
    });
  } catch (e) {
    console.error('schedule-absences GET error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}
