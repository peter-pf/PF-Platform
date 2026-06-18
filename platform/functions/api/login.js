// Cloudflare Pages Function — /api/login
// Per-user login: validates email + password against the D1 `users` table using
// PBKDF2-HMAC-SHA256 (per-user salt, constant-time compare). On success, issues
// a signed HttpOnly session cookie carrying {uid, role}.
//
// SECURITY MODEL (for the COO security review):
//  - Passwords are verified against PBKDF2 hashes in D1. Plaintext is never
//    stored or logged. Comparison is constant-time (see lib/auth verifyPassword).
//  - On success we mint a stateless signed session (HMAC with PF_TOKEN_SECRET)
//    set as HttpOnly; Secure; SameSite=Strict.
//  - Generic failure message (no "user not found" vs "wrong password"
//    distinction) to avoid user enumeration. We also run a dummy hash when the
//    user is missing so response timing does not reveal account existence.
//  - Disabled accounts (active=0) are rejected.
//  - Fails CLOSED: missing D1 binding or PF_TOKEN_SECRET -> 503/500, never an
//    auth bypass.
//  - NOTE: /api/login itself is exempted from the session gate in
//    _middleware.js (you cannot have a session before you log in), but it is the
//    ONLY new exemption and it does its own validation here.

import {
  verifyPassword, mintSession, hashPassword, sessionCookie, RESET_SESSION_TTL_MS,
} from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

const MAX_BODY = 4 * 1024; // login payloads are tiny

// ---- [SEC-05] brute-force throttle (KV-backed) ------------------------------
// Lock after MAX_FAILS failed attempts within WINDOW_SEC, keyed per-IP AND
// per-email. Uses the existing PF_SCHEDULE KV binding (no new infra). If KV is
// unavailable we FAIL OPEN on the throttle only (login still requires a correct
// password) so a KV outage can't lock everyone out — the password check stands.
const MAX_FAILS = 10;
const WINDOW_SEC = 15 * 60; // 15 minutes

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
}

function rlKey(kind, value) {
  // Bound the key length; email/IP are already short. Lowercased upstream.
  return `login_fail:${kind}:${String(value).slice(0, 120)}`;
}

async function getFailCount(kv, key) {
  if (!kv) return 0;
  try {
    const raw = await kv.get(key);
    return raw ? (parseInt(raw, 10) || 0) : 0;
  } catch { return 0; }
}

async function bumpFail(kv, key) {
  if (!kv) return;
  try {
    const cur = await getFailCount(kv, key);
    // Reset the TTL window on each new failure (sliding window, simple + safe).
    await kv.put(key, String(cur + 1), { expirationTtl: WINDOW_SEC });
  } catch { /* throttle is best-effort */ }
}

async function clearFails(kv, keys) {
  if (!kv) return;
  for (const k of keys) {
    try { await kv.delete(k); } catch { /* best-effort */ }
  }
}

async function auditFailed(env, email, ip, reason) {
  if (!env.DB) return;
  try {
    await env.DB
      .prepare('INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)')
      .bind(null, 'login_failed', `email=${email} ip=${ip} reason=${reason}`, new Date().toISOString())
      .run();
  } catch { /* audit best-effort */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const SECRET = env.PF_TOKEN_SECRET;
  if (!SECRET) return json({ status: 'error', message: 'Server misconfigured.' }, 500);
  if (!env.DB) return json({ status: 'error', message: 'Login is temporarily unavailable.' }, 503);

  const kv = env.PF_SCHEDULE; // reuse existing KV binding for the throttle counter
  const ip = clientIp(request);

  // Parse body (JSON or form-encoded), size-capped.
  let email = '', password = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json({ status: 'error', message: 'Bad request.' }, 413);
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ status: 'error', message: 'Bad request.' }, 413);
      const body = JSON.parse(text);
      email = String(body.email || '').trim().toLowerCase();
      password = String(body.password || '');
    } else {
      const form = await request.formData();
      email = String(form.get('email') || '').trim().toLowerCase();
      password = String(form.get('password') || '');
    }
  } catch {
    return json({ status: 'error', message: 'Invalid request.' }, 400);
  }

  if (!email || !password) {
    return json({ status: 'error', message: 'Email and password are required.' }, 400);
  }

  // [SEC-05] Throttle check BEFORE doing expensive PBKDF2 work. Locked if EITHER
  // the IP or the email has exceeded the failure budget in the window.
  const ipKey = rlKey('ip', ip);
  const emailKey = rlKey('email', email);
  const [ipFails, emailFails] = await Promise.all([
    getFailCount(kv, ipKey),
    getFailCount(kv, emailKey),
  ]);
  if (ipFails >= MAX_FAILS || emailFails >= MAX_FAILS) {
    await auditFailed(env, email, ip, 'rate_limited');
    return json({
      status: 'error',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    }, 429);
  }

  try {
    const row = await env.DB
      .prepare('SELECT id, name, email, password_hash, salt, iterations, role, active, must_reset FROM users WHERE email = ?')
      .bind(email)
      .first();

    // Anti-enumeration: if no user, run a dummy hash so timing matches, then
    // return the same generic error as a wrong password.
    if (!row) {
      await hashPassword(password); // burn comparable time; result discarded
      await bumpFail(kv, ipKey);
      await bumpFail(kv, emailKey);
      await auditFailed(env, email, ip, 'no_such_user');
      return json({ status: 'error', message: 'Invalid email or password.' }, 401);
    }

    if (!row.active) {
      await auditFailed(env, email, ip, 'disabled');
      return json({ status: 'error', message: 'This account is disabled. Contact your administrator.' }, 403);
    }

    const ok = await verifyPassword(password, row.password_hash, row.salt, row.iterations);
    if (!ok) {
      await bumpFail(kv, ipKey);
      await bumpFail(kv, emailKey);
      await auditFailed(env, email, ip, 'bad_password');
      return json({ status: 'error', message: 'Invalid email or password.' }, 401);
    }

    // Success — clear the failure counters for this IP + email.
    await clearFails(kv, [ipKey, emailKey]);

    // [SEC-06] If the account must reset its (temporary) password, mint a
    // RESTRICTED session: it authenticates the user but the middleware lets it
    // reach ONLY the reset page/endpoint. A normal portal session is NOT granted.
    const mustReset = !!row.must_reset;
    const token = await mintSession(
      { uid: row.id, role: row.role, name: row.name, mustReset },
      SECRET,
      mustReset ? RESET_SESSION_TTL_MS : undefined
    );

    // Best-effort audit (never block login on audit failure).
    try {
      await env.DB
        .prepare('INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)')
        .bind(row.id, mustReset ? 'login_must_reset' : 'login', `role=${row.role} ip=${ip}`, new Date().toISOString())
        .run();
    } catch (e) { /* audit best-effort */ }

    return json(
      {
        status: 'ok',
        user: { id: row.id, name: row.name, email: row.email, role: row.role },
        must_reset: mustReset,
      },
      200,
      { 'Set-Cookie': sessionCookie(token, mustReset ? Math.floor(RESET_SESSION_TTL_MS / 1000) : undefined) }
    );
  } catch (err) {
    console.error('api/login error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// Reject non-POST.
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ status: 'error', message: 'Method not allowed.' }, 405);
}
