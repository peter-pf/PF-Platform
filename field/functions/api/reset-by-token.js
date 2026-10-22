// Cloudflare Pages Function — /api/reset-by-token
// Validates a password-reset token and sets the new password.
//
// SECURITY MODEL:
//   - PUBLIC endpoint: no session required.
//   - The raw token is passed as {token, password, confirm} in the POST body.
//   - We SHA-256 hash the incoming token and compare against the stored token_hash.
//   - The token must be: non-expired (expires_at > now), unused (used_at IS NULL).
//   - On any failure: generic "This link is invalid or has expired." — no detail.
//   - On success: hash new password (PBKDF2), update users, mark token used,
//     clear must_reset, write audit row. Do NOT auto-login.
//     Respond {status:'ok', redirect: '/login.html?reset=1'}.
//   - Minimum password length: 12 characters.
//   - Token never logged or reflected back.
//   - Does NOT change the existing /api/reset-password (must_reset) flow.

import {
  hashPassword, b64urlEncode,
} from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const INVALID_RESPONSE = {
  status: 'invalid',
  message: 'This link is invalid or has expired.',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const MAX_BODY = 4 * 1024;
const MIN_PW_LEN = 12;

// SHA-256 hash a base64url-decoded token. Returns base64url hash string.
async function sha256FromRaw(rawToken) {
  // rawToken is a base64url string. Decode it back to bytes.
  const pad = rawToken.length % 4 === 0 ? '' : '='.repeat(4 - (rawToken.length % 4));
  const bin = atob(rawToken.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return b64urlEncode(new Uint8Array(digest));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json(INVALID_RESPONSE);
  }

  // Parse body
  let rawToken = '', password = '', confirm = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json(INVALID_RESPONSE);
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(INVALID_RESPONSE);
      const body = JSON.parse(text);
      rawToken = String(body.token || '');
      password = String(body.password || '');
      confirm  = String(body.confirm  || '');
    } else {
      const form = await request.formData();
      rawToken = String(form.get('token') || '');
      password = String(form.get('password') || '');
      confirm  = String(form.get('confirm')  || '');
    }
  } catch {
    return json(INVALID_RESPONSE);
  }

  // Validate token format (non-empty, reasonable length, base64url chars only)
  if (!rawToken || rawToken.length < 10 || rawToken.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    return json(INVALID_RESPONSE);
  }

  // Validate new password
  if (!password || password.length < MIN_PW_LEN) {
    return json({ status: 'error', message: `Password must be at least ${MIN_PW_LEN} characters.` }, 400);
  }
  if (password !== confirm) {
    return json({ status: 'error', message: 'Passwords do not match.' }, 400);
  }

  // Hash the incoming token to compare with stored hash
  let tokenHash;
  try {
    tokenHash = await sha256FromRaw(rawToken);
  } catch {
    return json(INVALID_RESPONSE);
  }

  // Look up the token row
  const now = Math.floor(Date.now() / 1000);
  let row;
  try {
    row = await env.DB
      .prepare('SELECT id, user_email, expires_at, used_at FROM password_resets WHERE token_hash = ?')
      .bind(tokenHash)
      .first();
  } catch {
    return json(INVALID_RESPONSE);
  }

  if (!row) return json(INVALID_RESPONSE);
  if (row.used_at !== null && row.used_at !== undefined) return json(INVALID_RESPONSE);
  if (row.expires_at <= now) return json(INVALID_RESPONSE);

  // Look up the user
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, name, role, active FROM users WHERE LOWER(email) = LOWER(?) AND active = 1')
      .bind(row.user_email)
      .first();
  } catch {
    return json(INVALID_RESPONSE);
  }
  if (!user) return json(INVALID_RESPONSE);

  // Mark token used FIRST (before writing new password — prevents replay if PW write fails)
  try {
    await env.DB
      .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run();
  } catch {
    return json(INVALID_RESPONSE);
  }

  // Hash and set new password; clear must_reset
  try {
    const { salt, hash, iterations } = await hashPassword(password);
    await env.DB
      .prepare('UPDATE users SET password_hash = ?, salt = ?, iterations = ?, must_reset = 0, updated_at = ? WHERE id = ?')
      .bind(hash, salt, iterations, new Date().toISOString(), user.id)
      .run();
  } catch {
    // Password write failed. Token is already marked used. User can request another reset.
    return json({ status: 'error', message: 'An internal error occurred. Please request a new reset link.' }, 500);
  }

  // Audit (best-effort)
  try {
    await env.DB
      .prepare('INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)')
      .bind(user.id, 'password_reset_by_token', `role=${user.role}`, new Date().toISOString())
      .run();
  } catch { /* best-effort */ }

  // Do NOT auto-login. Redirect to login page with a success hint.
  return json({ status: 'ok', redirect: '/login.html?reset=1' });
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed.' }), {
    status: 405, headers: JSON_HEADERS,
  });
}
