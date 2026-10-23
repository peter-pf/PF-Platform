// Cloudflare Pages Function — /api/time-off-admin
// Owner-only: approve, deny, set allocations.
//
// GET:  all absence requests + all allocations.
// POST action=approve: approve pending (race-safe: WHERE id=? AND status='pending',
//       checks meta.changes===1 → 409 if already actioned).
// POST action=deny:    deny pending (same atomic WHERE; optional denial_reason).
// POST action=set-allocation: upsert days for (uid, year). Validates uid exists.
//
// SECURITY:
//   - schedule_admin area = admin + partner ONLY.
//   - Origin / Sec-Fetch-Site guard + JSON Content-Type on all POSTs.
//   - Parameterised D1 queries throughout.

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

const FIELD_ORIGIN = 'https://field.pierfoundations.com';

function isCrossSite(request) {
  const sfs = request.headers.get('Sec-Fetch-Site') || '';
  if (sfs === 'cross-site') return true;
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    const host = request.headers.get('Host') || '';
    const isPreview = /\.pf-field\.pages\.dev$/i.test(host);
    const allowed = [FIELD_ORIGIN];
    if (isPreview) allowed.push(`https://${host}`);
    if (!allowed.includes(origin)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const session = context.data && context.data.session;
  const denied  = requireArea(session, 'schedule_admin');
  if (denied) return denied;
  if (!env.DB) return json({ ok: false, error: 'No database available.' }, 503);

  try {
    const { results: requests } = await env.DB
      .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                       day_count, status, created_at, updated_at,
                       approved_by, approved_by_name, approved_at,
                       denied_by, denied_by_name, denied_at, denial_reason
                FROM absence_requests ORDER BY created_at DESC LIMIT 1000`)
      .all();

    const { results: allocations } = await env.DB
      .prepare('SELECT uid, year, allocated_days, updated_by, updated_at FROM employee_allocations ORDER BY uid, year DESC')
      .all();

    return json({ ok: true, requests: requests || [], allocations: allocations || [] });
  } catch (e) {
    console.error('time_off_admin_get_error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied  = requireArea(session, 'schedule_admin');
  if (denied) return denied;

  // JSON Content-Type required
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return json({ ok: false, error: 'Content-Type must be application/json.' }, 415);
  }
  // Cross-site rejection
  if (isCrossSite(request)) {
    return json({ ok: false, error: 'Cross-site requests not allowed.' }, 403);
  }
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
  const now    = new Date().toISOString();

  // ---- Approve (race-safe) -----------------------------------------------
  if (action === 'approve') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);

    const result = await env.DB
      .prepare(`UPDATE absence_requests
                SET status='approved', updated_at=?,
                    approved_by=?, approved_by_name=?, approved_at=?
                WHERE id=? AND status='pending'`)
      .bind(now, session.uid, session.name || '', now, id).run();

    if (!result.meta || result.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT status FROM absence_requests WHERE id=?').bind(id).first();
      if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
      return json({ ok: false, error: `Request is already '${row.status}'.` }, 409);
    }
    return json({ ok: true, id, status: 'approved' });
  }

  // ---- Deny (race-safe) --------------------------------------------------
  if (action === 'deny') {
    const id     = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);
    const reason = s(body.denial_reason || '', 300);

    const result = await env.DB
      .prepare(`UPDATE absence_requests
                SET status='denied', updated_at=?,
                    denied_by=?, denied_by_name=?, denied_at=?,
                    denial_reason=?
                WHERE id=? AND status='pending'`)
      .bind(now, session.uid, session.name || '', now, reason, id).run();

    if (!result.meta || result.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT status FROM absence_requests WHERE id=?').bind(id).first();
      if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
      return json({ ok: false, error: `Request is already '${row.status}'.` }, 409);
    }
    return json({ ok: true, id, status: 'denied' });
  }

  // ---- Set allocation (validates uid exists in users) --------------------
  if (action === 'set-allocation') {
    const empUid = s(body.uid, 200);
    const year   = parseInt(body.year, 10);
    const days   = parseFloat(body.allocated_days);

    if (!empUid) return json({ ok: false, error: 'uid required.' }, 400);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return json({ ok: false, error: 'Invalid year.' }, 400);
    }
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      return json({ ok: false, error: 'allocated_days must be 0–365.' }, 400);
    }

    // Validate uid exists in the users table
    const userRow = await env.DB
      .prepare('SELECT id FROM users WHERE id=?').bind(empUid).first();
    if (!userRow) {
      return json({ ok: false, error: `No user found with uid '${empUid}'.` }, 404);
    }

    await env.DB
      .prepare(`INSERT INTO employee_allocations (uid, year, allocated_days, created_by, created_at, updated_by, updated_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(uid, year) DO UPDATE
                SET allocated_days=excluded.allocated_days,
                    updated_by=excluded.updated_by,
                    updated_at=excluded.updated_at`)
      .bind(empUid, year, days, session.uid, now, session.uid, now).run();

    return json({ ok: true, uid: empUid, year, allocated_days: days });
  }

  return json({ ok: false, error: `Unknown action '${action}'.` }, 400);
}
