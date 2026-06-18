// Cloudflare Pages Function — /api/reset-password
// [SEC-06] Forced password-change endpoint for accounts flagged must_reset.
//
// FLOW:
//  1. User logs in with a temporary password -> /api/login mints a RESTRICTED
//     session (mr=1). The middleware lets that session reach ONLY this endpoint
//     and /reset-password.html — never the portal.
//  2. The reset page POSTs {password, confirm} here.
//  3. We re-verify the session is valid AND restricted, hash the new password
//     (PBKDF2), clear must_reset, write an audit row, and mint a FRESH NORMAL
//     session (mr cleared) so the user lands in the portal.
//
// SECURITY MODEL:
//  - The session is validated server-side (HMAC) before anything else. A normal
//    (non-restricted) session is rejected with 400 — this endpoint exists only
//    to clear a temp password; ordinary password changes are a separate future
//    feature. A missing/invalid session -> 401.
//  - New password is hashed with PBKDF2 (lib/auth hashPassword). Plaintext is
//    never stored or logged. A minimum-strength check is enforced.
//  - Fails CLOSED: missing DB / secret -> 503/500, never a bypass.

import {
  verifySession, getCookie, hashPassword, mintSession, sessionCookie,
  isRestrictedSession, SESSION_COOKIE,
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

const MAX_BODY = 4 * 1024;
const MIN_PW_LEN = 12; // temp-password replacements must be reasonably strong

export async function onRequestPost(context) {
  const { request, env } = context;

  const SECRET = env.PF_TOKEN_SECRET;
  if (!SECRET) return json({ status: 'error', message: 'Server misconfigured.' }, 500);
  if (!env.DB) return json({ status: 'error', message: 'Reset is temporarily unavailable.' }, 503);

  // ---- Validate the restricted session (server-side) ----
  const cookie = request.headers.get('Cookie') || '';
  const token = getCookie(cookie, SESSION_COOKIE);
  const session = token ? await verifySession(token, SECRET) : null;
  if (!session) {
    return json({ status: 'error', message: 'Your session has expired. Please sign in again.' }, 401);
  }
  if (!isRestrictedSession(session)) {
    // A normal session shouldn't be here. Don't allow it to silently change pw.
    return json({ status: 'error', message: 'No password reset is required for this account.' }, 400);
  }

  // ---- Parse + validate the new password ----
  let password = '', confirm = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json({ status: 'error', message: 'Bad request.' }, 413);
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ status: 'error', message: 'Bad request.' }, 413);
      const body = JSON.parse(text);
      password = String(body.password || '');
      confirm = String(body.confirm || '');
    } else {
      const form = await request.formData();
      password = String(form.get('password') || '');
      confirm = String(form.get('confirm') || '');
    }
  } catch {
    return json({ status: 'error', message: 'Invalid request.' }, 400);
  }

  if (!password || password.length < MIN_PW_LEN) {
    return json({ status: 'error', message: `Password must be at least ${MIN_PW_LEN} characters.` }, 400);
  }
  if (password !== confirm) {
    return json({ status: 'error', message: 'Passwords do not match.' }, 400);
  }

  try {
    // Confirm the account still exists + is active before mutating it.
    const row = await env.DB
      .prepare('SELECT id, name, email, role, active FROM users WHERE id = ?')
      .bind(session.uid)
      .first();
    if (!row || !row.active) {
      return json({ status: 'error', message: 'This account is unavailable. Contact your administrator.' }, 403);
    }

    // Hash the NEW password and persist; clear must_reset.
    const { salt, hash, iterations } = await hashPassword(password);
    await env.DB
      .prepare('UPDATE users SET password_hash = ?, salt = ?, iterations = ?, must_reset = 0, updated_at = ? WHERE id = ?')
      .bind(hash, salt, iterations, new Date().toISOString(), row.id)
      .run();

    // Audit (best-effort).
    try {
      await env.DB
        .prepare('INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)')
        .bind(row.id, 'password_reset', `role=${row.role}`, new Date().toISOString())
        .run();
    } catch { /* best-effort */ }

    // Mint a FRESH NORMAL session (mustReset cleared) and send the user home.
    const newToken = await mintSession(
      { uid: row.id, role: row.role, name: row.name }, // no mustReset => normal
      SECRET
    );

    return json(
      { status: 'ok', message: 'Password updated.', redirect: '/' },
      200,
      { 'Set-Cookie': sessionCookie(newToken) }
    );
  } catch (err) {
    console.error('api/reset-password error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ status: 'error', message: 'Method not allowed.' }, 405);
}
