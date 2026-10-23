// Cloudflare Pages Function — /api/time-off
// Time Off request management for field crew.
//
// GET:
//   Returns the calling user's own absence requests + allocation summary for
//   the current year (allocated, used/approved, pending, remaining).
//   Owners (admin/partner) receive ALL requests plus all allocations.
//
// POST action=submit:
//   Create a new absence request. uid is ALWAYS from the session — the client
//   cannot override whose request this is.
//   On success, sends a notification email to owners via Graph sendMail.
//
// POST action=cancel:
//   Cancel a pending request. Server verifies the request belongs to the caller
//   (uid match). No one can cancel another person's request this way.
//
// RBAC: field_ops area = admin | partner | business_dev | field_ops.
//   Owner-only sub-actions (approve/deny/allocate) live in /api/time-off-admin.
//
// SECURITY:
//   - uid from session only (session.uid). Never from request body.
//   - requireArea(session, 'field_ops') on every method.
//   - D1 parameterized queries throughout (no string concatenation in SQL).
//   - All string fields capped and sanity-checked server-side.
//   - Email body is plain text; note is already in a trusted string context there.
//   - HTML rendering is the client's responsibility via window.esc.

import { requireArea } from '../lib/auth.js';
import { getGraphToken, graphConfigured, GRAPH } from '../lib/graph.js';

// ---------------------------------------------------------------------------
// Recipients — mirroring the daily-report.js TEST/PROD pattern.
// Flip ACTIVE_RECIPIENTS to PROD_RECIPIENTS when Derek approves go-live.
// An env override (TIME_OFF_RECIPIENTS) wins without a redeploy.
// ---------------------------------------------------------------------------
const TEST_RECIPIENTS = ['peter@pierfoundations.com'];
const PROD_RECIPIENTS = [
  'breinking@pierfoundations.com',
  'jreinking@pierfoundations.com',
  'dfranke@pierfoundations.com',
];
// >>> FLIP HERE <<<
const ACTIVE_RECIPIENTS = TEST_RECIPIENTS;

function resolveRecipients(env) {
  const raw = env && env.TIME_OFF_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map(s => s.trim())
      .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return ACTIVE_RECIPIENTS;
}

const MAIL_FROM = 'peter@pierfoundations.com';
// Fixed production URL used in notification emails (never from client input)
const PORTAL_URL = 'https://field.pierfoundations.com/time-off.html';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Safe string: cap length, strip angle brackets
function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

// Validate ISO date string YYYY-MM-DD
function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Count calendar days between two ISO dates (inclusive). Returns 0 if invalid.
function countDays(startIso, endIso, halfDay) {
  if (halfDay) return 0.5;
  try {
    const start = new Date(startIso + 'T12:00:00Z');
    const end   = new Date(endIso   + 'T12:00:00Z');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  } catch {
    return 0;
  }
}

// Random UUID v4 (crypto.randomUUID available in Workers runtime)
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback (should not be needed in Workers runtime)
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const VALID_TYPES = ['Vacation', 'Sick', 'Personal', 'Other'];

// ---------------------------------------------------------------------------
// Email notification on new request
// ---------------------------------------------------------------------------
async function sendRequestEmail(env, { requesterName, type, startDate, endDate, halfDay, dayCount, note }) {
  if (!graphConfigured(env)) return; // best-effort; do not fail the request

  let token;
  try { token = await getGraphToken(env); } catch { return; }

  const datesStr = startDate === endDate
    ? fmtDate(startDate) + (halfDay ? ' (half day)' : '')
    : `${fmtDate(startDate)} - ${fmtDate(endDate)}`;
  const countStr = halfDay ? '0.5 days' : `${dayCount} day${dayCount === 1 ? '' : 's'}`;
  const noteStr = note ? `\nNote: ${note}` : '';

  const bodyText = [
    `${requesterName} has submitted a time off request.`,
    '',
    `Type:  ${type}`,
    `Dates: ${datesStr}  (${countStr})`,
    noteStr,
    '',
    'Log in to approve or deny this request:',
    PORTAL_URL,
    '',
    '— PF Field Portal',
  ].join('\n');

  const recipients = resolveRecipients(env);
  const toRecipients = recipients.map(addr => ({ emailAddress: { address: addr } }));
  const subject = `Time Off Request — ${requesterName}: ${datesStr}`;

  const message = {
    subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients,
  };

  const url = `${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
  } catch { /* email is best-effort; request was already saved */ }
}

// Format YYYY-MM-DD -> MM/DD/YYYY
function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// Allocation summary for a given uid + year
// ---------------------------------------------------------------------------
async function getAllocationSummary(db, uid, year) {
  // Allocated days
  const alloc = await db
    .prepare('SELECT allocated_days FROM employee_allocations WHERE uid = ? AND year = ?')
    .bind(uid, year)
    .first();

  const allocDays = alloc ? alloc.allocated_days : null; // null = not set

  // Used days (approved, not cancelled/denied) for the calendar year
  const usedResult = await db
    .prepare(`SELECT COALESCE(SUM(day_count),0) AS total
              FROM absence_requests
              WHERE uid = ? AND status = 'approved'
              AND strftime('%Y', start_date) = ?`)
    .bind(uid, String(year))
    .first();
  const usedDays = usedResult ? (usedResult.total || 0) : 0;

  // Pending days
  const pendResult = await db
    .prepare(`SELECT COALESCE(SUM(day_count),0) AS total
              FROM absence_requests
              WHERE uid = ? AND status = 'pending'
              AND strftime('%Y', start_date) = ?`)
    .bind(uid, String(year))
    .first();
  const pendingDays = pendResult ? (pendResult.total || 0) : 0;

  const remaining = allocDays !== null ? Math.max(0, allocDays - usedDays) : null;

  return {
    year,
    allocatedDays: allocDays,  // null = not set
    usedDays,
    pendingDays,
    remaining,                 // null if allocation not set
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (!env.DB) return json({ ok: false, error: 'No database available.' }, 503);

  try {
    const uid  = session.uid;
    const year = new Date().getUTCFullYear();
    const isOwner = session.role === 'admin' || session.role === 'partner';

    // Own requests (all statuses, most-recent first)
    const { results: ownRows } = await env.DB
      .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                       day_count, status, created_at, updated_at,
                       approved_by_name, approved_at, denied_by_name, denied_at, denial_reason
                FROM absence_requests WHERE uid = ?
                ORDER BY created_at DESC LIMIT 200`)
      .bind(uid)
      .all();

    const alloc = await getAllocationSummary(env.DB, uid, year);

    // Owners also get all pending requests (to action in the UI)
    let pendingAll = [];
    let allocations = [];
    if (isOwner) {
      const { results: pr } = await env.DB
        .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                         day_count, status, created_at,
                         approved_by_name, approved_at, denied_by_name, denied_at, denial_reason
                  FROM absence_requests WHERE status = 'pending'
                  ORDER BY created_at ASC LIMIT 500`)
        .all();
      pendingAll = pr || [];

      const { results: allocRows } = await env.DB
        .prepare('SELECT uid, year, allocated_days FROM employee_allocations ORDER BY uid, year DESC')
        .all();
      allocations = allocRows || [];
    }

    return json({
      ok: true,
      ownRequests: (ownRows || []),
      allocation: alloc,
      isOwner,
      pendingAll: isOwner ? pendingAll : undefined,
      allocations: isOwner ? allocations : undefined,
    });
  } catch (e) {
    console.error('time-off GET error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (!env.DB) return json({ ok: false, error: 'No database available.' }, 503);

  let body;
  try {
    const text = await request.text();
    if (text.length > 8192) return json({ ok: false, error: 'Request too large.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400);
  }

  const action = s(body && body.action, 50);

  // ---- Submit new request ------------------------------------------------
  if (action === 'submit') {
    const startDate = s(body.start_date, 10);
    const endDate   = s(body.end_date,   10);
    const halfDay   = body.half_day ? 1 : 0;
    const type      = VALID_TYPES.includes(s(body.type, 20)) ? s(body.type, 20) : 'Vacation';
    const note      = s(body.note, 500);

    if (!isIsoDate(startDate)) return json({ ok: false, error: 'Invalid start_date.' }, 400);
    if (!isIsoDate(endDate))   return json({ ok: false, error: 'Invalid end_date.'   }, 400);
    if (endDate < startDate)   return json({ ok: false, error: 'end_date must be >= start_date.' }, 400);
    if (halfDay && startDate !== endDate) {
      return json({ ok: false, error: 'Half-day requests must be a single day (start = end).' }, 400);
    }

    const dayCount = countDays(startDate, endDate, halfDay);
    if (dayCount <= 0) return json({ ok: false, error: 'Invalid date range.' }, 400);

    // uid and name come from the session — NEVER from the client
    const uid  = session.uid;
    const name = session.name || '';
    const id   = newId();
    const now  = new Date().toISOString();

    try {
      await env.DB
        .prepare(`INSERT INTO absence_requests
                  (id, uid, name, start_date, end_date, half_day, type, note, day_count, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .bind(id, uid, name, startDate, endDate, halfDay, type, note, dayCount, now)
        .run();
    } catch (e) {
      console.error('time-off insert error', e?.message);
      return json({ ok: false, error: 'Failed to save request.' }, 500);
    }

    // Notify owners (best-effort; failure does not roll back the request)
    context.waitUntil(sendRequestEmail(env, {
      requesterName: name || uid,
      type,
      startDate,
      endDate,
      halfDay: !!halfDay,
      dayCount,
      note,
    }));

    return json({ ok: true, id, status: 'pending', day_count: dayCount });
  }

  // ---- Cancel own pending request ----------------------------------------
  if (action === 'cancel') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);

    // Verify ownership: uid must match, status must be 'pending'
    const row = await env.DB
      .prepare('SELECT uid, status FROM absence_requests WHERE id = ?')
      .bind(id)
      .first();

    if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
    if (row.uid !== session.uid) {
      return json({ ok: false, error: 'You can only cancel your own requests.' }, 403);
    }
    if (row.status !== 'pending') {
      return json({ ok: false, error: `Cannot cancel a request with status '${row.status}'.` }, 409);
    }

    await env.DB
      .prepare(`UPDATE absence_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), id)
      .run();

    return json({ ok: true, id, status: 'cancelled' });
  }

  return json({ ok: false, error: `Unknown action '${action}'.` }, 400);
}
