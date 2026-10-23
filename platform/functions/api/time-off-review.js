// Cloudflare Pages Function — /api/time-off-review
// Owner-only (admin + partner): review all absence requests and manage allocations.
//
// GET:  all absence requests + all employee allocations.
// POST action=approve: approve a pending request (race-safe WHERE status='pending').
// POST action=deny:    deny a pending request (race-safe + optional denial_reason).
// POST action=set-allocation: upsert days for (uid, year). Validates uid exists.
//
// SECURITY:
//   - schedule_admin area = admin + partner ONLY (field_ops, business_dev BLOCKED).
//   - Origin / Sec-Fetch-Site guard on all POSTs.
//   - JSON Content-Type required on all POSTs.
//   - uid from session only — never trusts caller-supplied reviewer uid.
//   - Parameterised D1 queries throughout (no string interpolation in SQL).
//   - KV rate limit on approve/deny: max 60 decisions per session uid per hour.

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Strip angle brackets + cap length (XSS / over-long input defence).
function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

const PLATFORM_ORIGIN = 'https://portal.pierfoundations.com';

function isCrossSite(request) {
  const sfs = request.headers.get('Sec-Fetch-Site') || '';
  if (sfs === 'cross-site') return true;
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    const host = request.headers.get('Host') || '';
    const isPreview = /\.pf-platform\.pages\.dev$/i.test(host);
    const allowed = [PLATFORM_ORIGIN];
    if (isPreview) allowed.push(`https://${host}`);
    if (!allowed.includes(origin)) return true;
  }
  return false;
}

// KV rate-limit: max `limit` writes per `windowMs` for a given key.
// Returns true if the caller is over limit, false if allowed.
// Precondition: kv MUST be non-null; check env.PF_SCHEDULE before calling.
async function isRateLimited(kv, key, limit, windowMs) {
  if (!kv) return false; // guard (should not reach here; caller checks kv first)
  const now = Date.now();
  const raw = await kv.get(key);
  const state = raw ? JSON.parse(raw) : { ts: now, count: 0 };
  if (now - state.ts > windowMs) {
    // Window expired — reset.
    await kv.put(key, JSON.stringify({ ts: now, count: 1 }), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
    return false;
  }
  if (state.count >= limit) return true;
  await kv.put(key, JSON.stringify({ ts: state.ts, count: state.count + 1 }), { expirationTtl: Math.ceil(windowMs / 1000) + 60 });
  return false;
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
                FROM absence_requests ORDER BY created_at DESC LIMIT 1000`)
      .all();

    const { results: allocations } = await env.DB
      .prepare('SELECT uid, year, allocated_days, updated_by, updated_at FROM employee_allocations ORDER BY uid, year DESC')
      .all();

    // Enrich: pull display names for allocation rows so the UI can label each row.
    const { results: users } = await env.DB
      .prepare('SELECT id, name, role FROM users ORDER BY name')
      .all();

    return json({
      ok: true,
      requests: requests || [],
      allocations: allocations || [],
      users: (users || []).map(u => ({ uid: u.id, name: u.name, role: u.role })),
    });
  } catch (e) {
    console.error('time_off_review_get_error', e?.message);
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

  // JSON Content-Type required.
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return json({ ok: false, error: 'Content-Type must be application/json.' }, 415);
  }
  // Cross-site rejection.
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
  const now = new Date().toISOString();

  // ---- Approve (race-safe) -----------------------------------------------
  if (action === 'approve') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);

    // Self-review block: owners may not approve their own requests.
    const reqRow = await env.DB
      .prepare('SELECT uid FROM absence_requests WHERE id=?').bind(id).first();
    if (reqRow && reqRow.uid === session.uid) {
      return json({ ok: false, error: 'Another owner must review your own request.' }, 403);
    }

    // Rate-limit: max 60 approve/deny decisions per uid per hour.
    // Fail-closed: PF_SCHEDULE missing → 503 (do not allow unlimited writes).
    if (!env.PF_SCHEDULE) return json({ ok: false, error: 'KV binding unavailable.' }, 503);
    if (await isRateLimited(env.PF_SCHEDULE, `tor_action:${session.uid}`, 60, 3600_000)) {
      return json({ ok: false, error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    const result = await env.DB
      .prepare(`UPDATE absence_requests
                SET status='approved', updated_at=?,
                    approved_by=?, approved_by_name=?, approved_at=?
                WHERE id=? AND status='pending' AND uid != ?`)
      .bind(now, session.uid, s(session.name || '', 200), now, id, session.uid)
      .run();

    if (!result.meta || result.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT status FROM absence_requests WHERE id=?').bind(id).first();
      if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
      return json({ ok: false, error: `Request is already '${s(row.status, 20)}'.` }, 409);
    }
    return json({ ok: true, id, status: 'approved' });
  }

  // ---- Deny (race-safe) --------------------------------------------------
  if (action === 'deny') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);
    const reason = s(body.denial_reason || '', 300);

    // Self-review block: owners may not deny their own requests.
    const reqRow = await env.DB
      .prepare('SELECT uid FROM absence_requests WHERE id=?').bind(id).first();
    if (reqRow && reqRow.uid === session.uid) {
      return json({ ok: false, error: 'Another owner must review your own request.' }, 403);
    }

    if (!env.PF_SCHEDULE) return json({ ok: false, error: 'KV binding unavailable.' }, 503);
    if (await isRateLimited(env.PF_SCHEDULE, `tor_action:${session.uid}`, 60, 3600_000)) {
      return json({ ok: false, error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    const result = await env.DB
      .prepare(`UPDATE absence_requests
                SET status='denied', updated_at=?,
                    denied_by=?, denied_by_name=?, denied_at=?,
                    denial_reason=?
                WHERE id=? AND status='pending' AND uid != ?`)
      .bind(now, session.uid, s(session.name || '', 200), now, reason, id, session.uid)
      .run();

    if (!result.meta || result.meta.changes !== 1) {
      const row = await env.DB.prepare('SELECT status FROM absence_requests WHERE id=?').bind(id).first();
      if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
      return json({ ok: false, error: `Request is already '${s(row.status, 20)}'.` }, 409);
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

    // Validate uid exists.
    const userRow = await env.DB
      .prepare('SELECT id FROM users WHERE id=?').bind(empUid).first();
    if (!userRow) {
      return json({ ok: false, error: `No user found with uid '${s(empUid, 60)}'.` }, 404);
    }

    await env.DB
      .prepare(`INSERT INTO employee_allocations (uid, year, allocated_days, created_by, created_at, updated_by, updated_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(uid, year) DO UPDATE
                SET allocated_days=excluded.allocated_days,
                    updated_by=excluded.updated_by,
                    updated_at=excluded.updated_at`)
      .bind(empUid, year, days, session.uid, now, session.uid, now)
      .run();

    return json({ ok: true, uid: empUid, year, allocated_days: days });
  }

  return json({ ok: false, error: `Unknown action '${s(action, 50)}'.` }, 400);
}
