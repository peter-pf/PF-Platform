// Cloudflare Pages Function — /api/time-off
// Time Off request management for field crew.
//
// GET:  caller's own requests + allocation summary for current year.
//       Owners also get all pending requests + all allocations.
// POST action=submit:  create a new request (uid always from session).
//       Rate-limited: 5/hr + 20/day per uid. Max 10 open pending per user.
//       Overlap guard: rejects if new dates overlap own pending or approved.
// POST action=cancel:  cancel own pending request (uid+status WHERE clause,
//       checks meta.changes===1).
//
// SECURITY:
//   - Origin / Sec-Fetch-Site guard (cross-site rejected).
//   - JSON Content-Type required on all POSTs.
//   - uid from session only. Fail-closed auth.
//   - D1 parameterised queries throughout.

import { requireArea } from '../lib/auth.js';
import { getGraphToken, graphConfigured, GRAPH } from '../lib/graph.js';

// ---------------------------------------------------------------------------
// Recipients — TEST → PROD flip
// ---------------------------------------------------------------------------
const TEST_RECIPIENTS = ['peter@pierfoundations.com'];
const PROD_RECIPIENTS = [
  'breinking@pierfoundations.com',
  'jreinking@pierfoundations.com',
  'dfranke@pierfoundations.com',
];
// >>> FLIPPED TO PROD <<<
const ACTIVE_RECIPIENTS = PROD_RECIPIENTS;

function resolveRecipients(env) {
  const raw = env && env.TIME_OFF_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map(s => s.trim())
      .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return ACTIVE_RECIPIENTS;
}

const MAIL_FROM    = 'peter@pierfoundations.com';
// Platform Time Off Review tab — owners approve/deny requests here.
const PLATFORM_TIME_OFF_REVIEW_URL = 'https://portal.pierfoundations.com/#time-off-review';
const FIELD_ORIGIN = 'https://field.pierfoundations.com';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Safe-string: strip angle brackets, cap length
function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

// Sanitise a free-text note for inclusion in a plain-text email:
// collapse \r\n and repeated whitespace to single spaces, then cap.
function sanitiseNote(raw) {
  return String(raw || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// Validate ISO date — round-trip check rejects invented dates like 2026-02-31
function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  try {
    return new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
  } catch { return false; }
}

// Validate that the date falls in [current year - 1, current year + 2]
function inAllowedYearRange(isoDate) {
  const year = parseInt(isoDate.slice(0, 4), 10);
  const cur = new Date().getUTCFullYear();
  return year >= cur - 1 && year <= cur + 2;
}

// Count WEEKDAYS (Mon–Fri) between two ISO dates (inclusive). Returns 0 on error.
function countWeekdays(startIso, endIso) {
  try {
    const start = new Date(startIso + 'T12:00:00Z');
    const end   = new Date(endIso   + 'T12:00:00Z');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  } catch { return 0; }
}

// Calendar days between two ISO dates (for span cap check)
function calendarDays(startIso, endIso) {
  try {
    const s = new Date(startIso + 'T12:00:00Z');
    const e = new Date(endIso   + 'T12:00:00Z');
    return Math.round((e - s) / 86400000) + 1;
  } catch { return 0; }
}

// Random UUID v4
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  a[6] = (a[6] & 0x0f) | 0x40; a[8] = (a[8] & 0x3f) | 0x80;
  const h = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// Count WEEKEND days (Sat + Sun) between two ISO dates (inclusive).
function countWeekendDays(startIso, endIso) {
  try {
    const start = new Date(startIso + 'T12:00:00Z');
    const end   = new Date(endIso   + 'T12:00:00Z');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getUTCDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  } catch { return 0; }
}

// Home Day: crew works on road, requests to be home on a WEEKEND.
// Allowed ONLY on Sat/Sun; any weekday in the span is rejected.
// Counts weekend days; does NOT deduct from vacation.
// Personal folds into Other (kept here for backward compat with old records).
const VALID_TYPES = ['Vacation', 'Home Day', 'Sick', 'Personal', 'Other'];

// Normalize legacy 'Personal' -> 'Other' for display of stored rows.
function normalizeType(row) {
  if (row && row.type === 'Personal') return { ...row, type: 'Other' };
  return row;
}

// ---------------------------------------------------------------------------
// Origin / Sec-Fetch-Site guard (POST only)
// ---------------------------------------------------------------------------
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
// KV rate limiting (mirrors forgot-password.js pattern)
// ---------------------------------------------------------------------------
const RL_HOURLY_MAX  = 5;
const RL_DAILY_MAX   = 20;
const RL_HOUR_TTL    = 3600;
const RL_DAY_TTL     = 86400;

async function checkRateLimit(kv, key, max, ttl) {
  if (!kv) return true; // fail open on missing KV
  try {
    const raw   = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: ttl });
    return true;
  } catch { return true; } // KV error → allow
}

// ---------------------------------------------------------------------------
// sendMail — plain-text, checks for 202 and logs failures
// ---------------------------------------------------------------------------
// Count calendar days between two ISO dates (inclusive). >= 1 when start <= end.
function countCalendarDays(startIso, endIso) {
  return calendarDays(startIso, endIso); // reuses existing helper
}

async function sendRequestEmail(env, { requesterName, type, startDate, endDate, halfDay, dayCount, note }) {
  if (!graphConfigured(env)) return;
  let token;
  try { token = await getGraphToken(env); } catch (e) {
    console.error('time_off_token_fail', e?.constructor?.name || 'Error'); return;
  }

  const datesStr = startDate === endDate
    ? fmtDate(startDate) + (halfDay ? ' (half day)' : '')
    : `${fmtDate(startDate)} - ${fmtDate(endDate)}`;
  // Home Day counts weekend days; everything else counts weekdays.
  const countStr = halfDay ? '0.5 days'
    : type === 'Home Day' ? `${dayCount} weekend day${dayCount === 1 ? '' : 's'}`
    : `${dayCount} weekday${dayCount === 1 ? '' : 's'}`;
  const cleanNote = sanitiseNote(note);
  const noteLine  = cleanNote ? `Employee note: ${cleanNote}` : '';

  const bodyText = [
    `${requesterName} has submitted a time off request.`,
    '',
    `Type:  ${type}`,
    `Dates: ${datesStr}  (${countStr})`,
    noteLine,
    '',
    'Log in to review this request:',
    PLATFORM_TIME_OFF_REVIEW_URL,
  ].filter(l => l !== undefined).join('\n');

  const recipients = resolveRecipients(env);
  // Subject includes type so owners can see Vacation vs Home Day at a glance.
  const subject    = `Time Off Request (${type}) — ${requesterName}: ${datesStr}`;
  const message    = {
    subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients: recipients.map(addr => ({ emailAddress: { address: addr } })),
  };

  const url = `${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (resp.status !== 202) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch {}
      console.error('time_off_sendmail_fail', resp.status, detail.slice(0, 80));
    }
  } catch (e) {
    console.error('time_off_sendmail_error', e?.constructor?.name || 'Error');
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// Allocation summary
// ---------------------------------------------------------------------------
// Default allocation when no explicit row exists. Matches the employee-facing
// "10 vacation days per year" policy. Owners can still override per person.
const DEFAULT_VACATION_DAYS = 10;

async function getAllocationSummary(db, uid, year) {
  const alloc = await db
    .prepare('SELECT allocated_days FROM employee_allocations WHERE uid = ? AND year = ?')
    .bind(uid, year).first();
  // Default to 10 when no explicit row; keeps "not set" message from appearing
  // for every employee before owners have configured individual values.
  const allocDays = alloc ? alloc.allocated_days : DEFAULT_VACATION_DAYS;

  // usedDays counts ONLY Vacation requests (not Home Day / Sick / Other).
  // Home Day and Sick do not deduct from the vacation allocation.
  const usedResult = await db
    .prepare(`SELECT COALESCE(SUM(day_count),0) AS total
              FROM absence_requests WHERE uid=? AND type='Vacation' AND status='approved'
              AND strftime('%Y',start_date)=?`)
    .bind(uid, String(year)).first();
  const usedDays = usedResult ? (usedResult.total || 0) : 0;

  // pendingDays: pending Vacation requests (not Home Day / Sick / Other).
  const pendResult = await db
    .prepare(`SELECT COALESCE(SUM(day_count),0) AS total
              FROM absence_requests WHERE uid=? AND type='Vacation' AND status='pending'
              AND strftime('%Y',start_date)=?`)
    .bind(uid, String(year)).first();
  const pendingDays = pendResult ? (pendResult.total || 0) : 0;

  return {
    year,
    allocatedDays: allocDays,
    usedDays,
    pendingDays,
    remaining: Math.max(0, allocDays - usedDays),
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const session = context.data && context.data.session;
  const denied  = requireArea(session, 'field_ops');
  if (denied) return denied;
  if (!env.DB) return json({ ok: false, error: 'No database available.' }, 503);

  try {
    const uid     = session.uid;
    const year    = new Date().getUTCFullYear();
    const isOwner = session.role === 'admin' || session.role === 'partner';

    const { results: ownRows } = await env.DB
      .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                       day_count, status, created_at, updated_at,
                       approved_by_name, approved_at, denied_by_name, denied_at, denial_reason
                FROM absence_requests WHERE uid=? ORDER BY created_at DESC LIMIT 200`)
      .bind(uid).all();

    const alloc = await getAllocationSummary(env.DB, uid, year);

    let pendingAll = [], allocations = [];
    if (isOwner) {
      const { results: pr } = await env.DB
        .prepare(`SELECT id, uid, name, start_date, end_date, half_day, type, note,
                         day_count, status, created_at,
                         approved_by_name, approved_at, denied_by_name, denied_at, denial_reason
                  FROM absence_requests WHERE status='pending'
                  ORDER BY created_at ASC LIMIT 500`)
        .all();
      pendingAll = pr || [];

      const { results: allocRows } = await env.DB
        .prepare('SELECT uid, year, allocated_days FROM employee_allocations ORDER BY uid, year DESC')
        .all();
      allocations = allocRows || [];
    }

    return json({ ok: true, ownRequests: (ownRows || []).map(normalizeType), allocation: alloc,
                  isOwner, pendingAll: isOwner ? pendingAll.map(normalizeType) : undefined,
                  allocations: isOwner ? allocations : undefined });
  } catch (e) {
    console.error('time_off_get_error', e?.message);
    return json({ ok: false, error: 'Internal error.' }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied  = requireArea(session, 'field_ops');
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

  // ---- Submit new request -----------------------------------------------
  if (action === 'submit') {
    const startDate = s(body.start_date, 10);
    const endDate   = s(body.end_date,   10);
    // half_day must be strictly boolean true or numeric 1
    const halfDay   = body.half_day === true || body.half_day === 1 ? 1 : 0;
    // Normalize legacy 'Personal' -> 'Other'; reject any other unknown type.
    const rawType = s(body.type, 20);
    const type    = rawType === 'Personal' ? 'Other' : rawType;
    if (!VALID_TYPES.includes(type)) {
      return json({ ok: false, error: 'Invalid request type.' }, 400);
    }
    const note      = sanitiseNote(body.note);

    // Date validation
    if (!isIsoDate(startDate)) return json({ ok: false, error: 'Invalid start_date.' }, 400);
    if (!isIsoDate(endDate))   return json({ ok: false, error: 'Invalid end_date.'   }, 400);
    if (!inAllowedYearRange(startDate) || !inAllowedYearRange(endDate)) {
      return json({ ok: false, error: 'Dates must be within the current year ±1–2.' }, 400);
    }
    if (endDate < startDate) return json({ ok: false, error: 'end_date must be >= start_date.' }, 400);
    if (halfDay && startDate !== endDate) {
      return json({ ok: false, error: 'Half-day requests must be a single day.' }, 400);
    }
    if (!halfDay && calendarDays(startDate, endDate) > 60) {
      return json({ ok: false, error: 'A single request may not span more than 60 days.' }, 400);
    }

    // Home Day: WEEKENDS ONLY (Sat/Sun). Reject if the span contains any weekday.
    // Day count = number of weekend days in the span.
    // Vacation: weekdays only; must contain at least one.
    // Sick / Other / Personal: count weekdays; reject all-weekend spans.
    let dayCount;
    if (halfDay) {
      dayCount = 0.5;
      // Half-day must obey the same day-of-week rules as full-day requests.
      const hdDow = new Date(startDate + 'T12:00:00Z').getUTCDay();
      const hdWeekend = hdDow === 0 || hdDow === 6;
      if (type === 'Home Day' && !hdWeekend) {
        return json({ ok: false, error: 'Home Days are for weekends. Use Vacation for weekdays.' }, 400);
      }
      if (type === 'Vacation' && hdWeekend) {
        return json({ ok: false, error: 'Vacation requests must fall on a weekday.' }, 400);
      }
    } else if (type === 'Home Day') {
      if (countWeekdays(startDate, endDate) > 0) {
        return json({ ok: false, error: 'Home Days are for weekends. Use Vacation for weekdays.' }, 400);
      }
      dayCount = countWeekendDays(startDate, endDate);
      if (dayCount <= 0) {
        return json({ ok: false, error: 'Home Day request must include at least one Saturday or Sunday.' }, 400);
      }
    } else {
      dayCount = countWeekdays(startDate, endDate);
      if (dayCount <= 0) {
        const msg = type === 'Vacation'
          ? 'Vacation requests must contain at least one weekday.'
          : 'Date range contains no weekdays.';
        return json({ ok: false, error: msg }, 400);
      }
    }

    // uid and name from session — NEVER from client
    const uid  = session.uid;
    const name = session.name || '';
    const kv   = env.PF_SCHEDULE;

    // KV rate limit: 5/hr and 20/day per uid
    const hrKey  = `to_rl:hr:${uid}`;
    const dayKey = `to_rl:day:${uid}`;
    const [hrOk, dayOk] = await Promise.all([
      checkRateLimit(kv, hrKey,  RL_HOURLY_MAX, RL_HOUR_TTL),
      checkRateLimit(kv, dayKey, RL_DAILY_MAX,  RL_DAY_TTL),
    ]);
    if (!hrOk)  return json({ ok: false, error: 'Too many requests this hour. Please wait before submitting again.' }, 429);
    if (!dayOk) return json({ ok: false, error: 'Daily request limit reached. Please try again tomorrow.' }, 429);

    // Cap open pending requests at 10 per user
    const pendingCount = await env.DB
      .prepare("SELECT COUNT(*) AS cnt FROM absence_requests WHERE uid=? AND status='pending'")
      .bind(uid).first();
    if (pendingCount && pendingCount.cnt >= 10) {
      return json({ ok: false, error: 'You have 10 pending requests. Please wait for existing requests to be actioned.' }, 429);
    }

    // Overlap guard: reject if new dates overlap any existing pending or approved request
    const overlap = await env.DB
      .prepare(`SELECT id FROM absence_requests
                WHERE uid=? AND status IN ('pending','approved')
                AND start_date <= ? AND end_date >= ?
                LIMIT 1`)
      .bind(uid, endDate, startDate).first();
    if (overlap) {
      return json({ ok: false, error: 'This date range overlaps an existing pending or approved request.' }, 409);
    }

    const id  = newId();
    const now = new Date().toISOString();

    try {
      await env.DB
        .prepare(`INSERT INTO absence_requests
                  (id, uid, name, start_date, end_date, half_day, type, note, day_count, status, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`)
        .bind(id, uid, name, startDate, endDate, halfDay, type, note, dayCount, now).run();
    } catch (e) {
      console.error('time_off_insert_error', e?.message);
      return json({ ok: false, error: 'Failed to save request.' }, 500);
    }

    context.waitUntil(sendRequestEmail(env, {
      requesterName: name || uid, type, startDate, endDate,
      halfDay: !!halfDay, dayCount, note,
    }));

    // Soft warning (not a block) if a Vacation request would exceed the remaining
    // balance. The request is still accepted; the owner can deny it if needed.
    let vacationWarning = null;
    if (type === 'Vacation' && !halfDay) {
      try {
        const allocCheck = await getAllocationSummary(env.DB, uid, new Date().getUTCFullYear());
        if (allocCheck.remaining !== null && dayCount > allocCheck.remaining) {
          vacationWarning = `This request (${dayCount} weekday${dayCount === 1 ? '' : 's'}) exceeds your remaining vacation balance (${allocCheck.remaining} day${allocCheck.remaining === 1 ? '' : 's'}).`;
        }
      } catch { /* non-fatal — warning is best-effort */ }
    }

    return json({ ok: true, id, status: 'pending', day_count: dayCount,
                  ...(vacationWarning ? { vacation_warning: vacationWarning } : {}) });
  }

  // ---- Cancel own pending request (race-safe) ----------------------------
  if (action === 'cancel') {
    const id = s(body.id, 36);
    if (!id) return json({ ok: false, error: 'id required.' }, 400);

    // Atomic: WHERE id AND uid AND status='pending' — prevents race + IDOR in one step
    const result = await env.DB
      .prepare(`UPDATE absence_requests SET status='cancelled', updated_at=?
                WHERE id=? AND uid=? AND status='pending'`)
      .bind(new Date().toISOString(), id, session.uid).run();

    if (!result.meta || result.meta.changes !== 1) {
      // Determine why: request not found, wrong owner, or already actioned
      const row = await env.DB
        .prepare('SELECT uid, status FROM absence_requests WHERE id=?')
        .bind(id).first();
      if (!row) return json({ ok: false, error: 'Request not found.' }, 404);
      if (row.uid !== session.uid) return json({ ok: false, error: 'You can only cancel your own requests.' }, 403);
      return json({ ok: false, error: `Cannot cancel a request with status '${row.status}'.` }, 409);
    }

    return json({ ok: true, id, status: 'cancelled' });
  }

  return json({ ok: false, error: `Unknown action '${action}'.` }, 400);
}
