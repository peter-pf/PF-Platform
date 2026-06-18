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
  verifyPassword, mintSession, hashPassword, sessionCookie,
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

export async function onRequestPost(context) {
  const { request, env } = context;

  const SECRET = env.PF_TOKEN_SECRET;
  if (!SECRET) return json({ status: 'error', message: 'Server misconfigured.' }, 500);
  if (!env.DB) return json({ status: 'error', message: 'Login is temporarily unavailable.' }, 503);

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

  try {
    const row = await env.DB
      .prepare('SELECT id, name, email, password_hash, salt, iterations, role, active, must_reset FROM users WHERE email = ?')
      .bind(email)
      .first();

    // Anti-enumeration: if no user, run a dummy hash so timing matches, then
    // return the same generic error as a wrong password.
    if (!row) {
      await hashPassword(password); // burn comparable time; result discarded
      return json({ status: 'error', message: 'Invalid email or password.' }, 401);
    }

    if (!row.active) {
      return json({ status: 'error', message: 'This account is disabled. Contact your administrator.' }, 403);
    }

    const ok = await verifyPassword(password, row.password_hash, row.salt, row.iterations);
    if (!ok) {
      return json({ status: 'error', message: 'Invalid email or password.' }, 401);
    }

    // Success — mint session.
    const token = await mintSession(
      { uid: row.id, role: row.role, name: row.name },
      SECRET
    );

    // Best-effort audit (never block login on audit failure).
    try {
      await env.DB
        .prepare('INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)')
        .bind(row.id, 'login', `role=${row.role}`, new Date().toISOString())
        .run();
    } catch (e) { /* audit best-effort */ }

    return json(
      {
        status: 'ok',
        user: { id: row.id, name: row.name, email: row.email, role: row.role },
        must_reset: !!row.must_reset,
      },
      200,
      { 'Set-Cookie': sessionCookie(token) }
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
