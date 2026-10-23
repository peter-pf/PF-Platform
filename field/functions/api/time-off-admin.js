// Cloudflare Pages Function — /api/time-off-admin
// Owner-only operations: approve, deny, and set employee allocations.
//
// GET:
//   Returns all absence requests (all statuses) + all employee allocations.
//
// POST action=approve:
//   Approve a pending request. Marks it approved, records approver uid + name.
//
// POST action=deny:
//   Deny a pending request. Marks it denied, records denier uid + name.
//   Optional field denial_reason (max 300 chars).
//
// POST action=set-allocation:
//   Set employee's allocated days for a year. Body: { uid, year, allocated_days }.
//   The uid here is the EMPLOYEE's uid (not the caller). The caller must be admin
//   or partner for this to be reachable (schedule_admin area).
//
// RBAC: schedule_admin area = admin | partner ONLY.
//   The areaForPath mapping and the in-handler requireArea call together enforce
//   that only the 3 owners (Brad, Jonathan, Derek) can approve/deny/allocate.

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

// ---------------------------------------------------------------------------
// GET — all requests + all allocations
// ---------------------------------------------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'schedule_admin');
  if (denied) return denied;

  if (!env.DB) return json({ ok: false, error: 'No database available.' }, 503);

  try {
    const { results: requests } = await env.DB
      .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                       day_count, status, created_at, updated_at,
                       approved_by, approved_by_name, approved_at,
                       denied_by, denied_by_name, denied_at, denial_reason
                FROM absence_requests
                ORDER BY created_at DESC LIMIT 1000`)
      .all();

    const { results: allocations } = await env.DB
      .prepare('SELECT uid, year, allocated_days, updated_by, updated_at FROM employee_allocations ORDER BY uid, year DESC')
      .all();

    return json({ ok: true, requests: requests || [], allocations: allocations || [] });
  } catch (e) {
    console.error('time-off-admin GET error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST — approve / deny / set-allocation
// ---------------------------------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'schedule_admin');
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
  const now = new Date().toISOString();

  // ---- Approve ------------------------------------------------------------
  if (action === 'approve') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);

    const row = await env.DB
      .prepare('SELECT status FROM absence_requests WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
    if (row.status !== 'pending') {
      return json({ ok: false, error: `Request is already '${row.status}'.` }, 409);
    }

    await env.DB
      .prepare(`UPDATE absence_requests
                SET status = 'approved', updated_at = ?,
                    approved_by = ?, approved_by_name = ?, approved_at = ?
                WHERE id = ?`)
      .bind(now, session.uid, session.name || '', now, id)
      .run();

    return json({ ok: true, id, status: 'approved' });
  }

  // ---- Deny ---------------------------------------------------------------
  if (action === 'deny') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);
    const reason = s(body.denial_reason || '', 300);

    const row = await env.DB
      .prepare('SELECT status FROM absence_requests WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
    if (row.status !== 'pending') {
      return json({ ok: false, error: `Request is already '${row.status}'.` }, 409);
    }

    await env.DB
      .prepare(`UPDATE absence_requests
                SET status = 'denied', updated_at = ?,
                    denied_by = ?, denied_by_name = ?, denied_at = ?,
                    denial_reason = ?
                WHERE id = ?`)
      .bind(now, session.uid, session.name || '', now, reason, id)
      .run();

    return json({ ok: true, id, status: 'denied' });
  }

  // ---- Set allocation -----------------------------------------------------
  if (action === 'set-allocation') {
    const empUid = s(body.uid, 200);
    const year   = parseInt(body.year, 10);
    const days   = parseFloat(body.allocated_days);

    if (!empUid) return json({ ok: false, error: 'uid required.' }, 400);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return json({ ok: false, error: 'Invalid year.' }, 400);
    }
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      return json({ ok: false, error: 'allocated_days must be 0-365.' }, 400);
    }

    // Upsert
    await env.DB
      .prepare(`INSERT INTO employee_allocations (uid, year, allocated_days, created_by, created_at, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uid, year) DO UPDATE
                SET allocated_days = excluded.allocated_days,
                    updated_by     = excluded.updated_by,
                    updated_at     = excluded.updated_at`)
      .bind(empUid, year, days, session.uid, now, session.uid, now)
      .run();

    return json({ ok: true, uid: empUid, year, allocated_days: days });
  }

  return json({ ok: false, error: `Unknown action '${action}'.` }, 400);
}
