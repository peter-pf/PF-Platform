// Cloudflare Pages Function — /api/reset-by-token
// Validates a password-reset token and sets the new password.
//
// SECURITY MODEL:
//   - PUBLIC endpoint: no session required.
//   - IP rate limit: 20 requests/IP/hour (KV counter, key rl:rbtip:<ip>).
//   - The raw token is passed as {token, password, confirm} in the POST body.
//   - We SHA-256 hash the incoming token and compare against the stored token_hash.
//   - ATOMIC single-use: token is consumed with
//       UPDATE ... SET used_at=datetime('now') WHERE id=? AND used_at IS NULL AND expires_at>?
//     then meta.changes is checked === 1 before writing the password. This
//     prevents two concurrent requests from both succeeding.
//   - Password and confirm are validated BEFORE consuming the token.
//   - On any failure: generic "This link is invalid or has expired." — no detail.
//   - On success: hash new password (PBKDF2), update users, mark token used,
//     clear must_reset, write revocation marker to KV (invalidates outstanding
//     sessions), write audit row. Do NOT auto-login.
//     Respond {status:'ok', redirect: '/login.html?reset=1'}.
//   - Minimum password length: 12 characters.
//   - Token never logged or reflected back.
//   - Error logging: event class name only, never email or token.
//   - Does NOT change the existing /api/reset-password (must_reset) flow.

import {
  hashPassword, b64urlEncode, revokeOldSessions,
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
const RATE_LIMIT_IP_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;

// KV rate-limit counter. Returns true if under limit, false if over.
async function checkRateLimit(kv, key, max) {
  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS });
    return true;
  } catch {
    return true; // KV error → allow (fail open for rate-limiting only)
  }
}

// SHA-256 hash a base64url-decoded token. Returns base64url hash string.
async function sha256FromRaw(rawToken) {
  const pad = rawToken.length % 4 === 0 ? '' : '='.repeat(4 - (rawToken.length % 4));
  const bin = atob(rawToken.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return b64urlEncode(new Uint8Array(digest));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) return json(INVALID_RESPONSE);

  // ── IP rate limit ──────────────────────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ||
             (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
             'unknown';
  if (env.PF_SCHEDULE) {
    const ipKey = `rl:rbtip:${ip}`;
    const ipOk = await checkRateLimit(env.PF_SCHEDULE, ipKey, RATE_LIMIT_IP_MAX);
    if (!ipOk) return json(INVALID_RESPONSE);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let rawToken = '', password = '', confirm = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json(INVALID_RESPONSE);
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(INVALID_RESPONSE);
      const body = JSON.parse(text);
      rawToken = String(body.token    || '');
      password = String(body.password || '');
      confirm  = String(body.confirm  || '');
    } else {
      const form = await request.formData();
      rawToken = String(form.get('token')    || '');
      password = String(form.get('password') || '');
      confirm  = String(form.get('confirm')  || '');
    }
  } catch {
    return json(INVALID_RESPONSE);
  }

  // ── Token format check ─────────────────────────────────────────────────────
  if (!rawToken || rawToken.length < 10 || rawToken.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    return json(INVALID_RESPONSE);
  }

  // ── Validate new password BEFORE consuming the token ───────────────────────
  // Returning a user-visible error here doesn't risk side-effects because
  // we have not touched the DB yet.
  if (!password || password.length < MIN_PW_LEN) {
    return json({ status: 'error', message: `Password must be at least ${MIN_PW_LEN} characters.` }, 400);
  }
  if (password !== confirm) {
    return json({ status: 'error', message: 'Passwords do not match.' }, 400);
  }

  // ── Hash the incoming token ────────────────────────────────────────────────
  let tokenHash;
  try {
    tokenHash = await sha256FromRaw(rawToken);
  } catch {
    return json(INVALID_RESPONSE);
  }

  // ── Look up the token row ──────────────────────────────────────────────────
  let row;
  try {
    row = await env.DB
      .prepare('SELECT id, user_email, expires_at, used_at FROM password_resets WHERE token_hash = ?')
      .bind(tokenHash)
      .first();
  } catch (e) {
    console.error('reset-by-token.token_lookup', e?.constructor?.name || 'Error');
    return json(INVALID_RESPONSE);
  }
  if (!row) return json(INVALID_RESPONSE);

  // ── ATOMIC single-use consume ──────────────────────────────────────────────
  // The WHERE guards (used_at IS NULL AND expires_at > now) make this atomic:
  // the first caller that matches gets changes=1; any concurrent caller (or a
  // replay of an already-used token) gets changes=0 and is rejected.
  // This prevents two concurrent requests from both succeeding.
  const now = Math.floor(Date.now() / 1000);
  let consumeResult;
  try {
    consumeResult = await env.DB
      .prepare(
        "UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND expires_at > ?"
      )
      .bind(row.id, now)
      .run();
  } catch (e) {
    console.error('reset-by-token.token_consume', e?.constructor?.name || 'Error');
    return json(INVALID_RESPONSE);
  }

  // meta.changes must be exactly 1 — anything else means the token was already
  // used, expired, or a concurrent request beat us to it.
  const changes = consumeResult?.meta?.changes ?? consumeResult?.changes ?? 0;
  if (changes !== 1) {
    return json(INVALID_RESPONSE);
  }

  // ── Look up the user ───────────────────────────────────────────────────────
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, name, role, active FROM users WHERE LOWER(email) = LOWER(?) AND active = 1')
      .bind(row.user_email)
      .first();
  } catch (e) {
    console.error('reset-by-token.user_lookup', e?.constructor?.name || 'Error');
    return json({ status: 'error', message: 'An internal error occurred. Please request a new reset link.' }, 500);
  }
  if (!user) {
    return json({ status: 'error', message: 'An internal error occurred. Please request a new reset link.' }, 500);
  }

  // ── Hash and set new password ──────────────────────────────────────────────
  // Token is already consumed above. If this write fails, the user must request
  // a new link (token is marked used, so it cannot be replayed).
  try {
    const { salt, hash, iterations } = await hashPassword(password);
    await env.DB
      .prepare('UPDATE users SET password_hash = ?, salt = ?, iterations = ?, must_reset = 0, updated_at = ? WHERE id = ?')
      .bind(hash, salt, iterations, new Date().toISOString(), user.id)
      .run();
  } catch (e) {
    console.error('reset-by-token.password_write', e?.constructor?.name || 'Error');
    return json({ status: 'error', message: 'An internal error occurred. Please request a new reset link.' }, 500);
  }

  // ── Revoke outstanding sessions ────────────────────────────────────────────
  // Any session the user had before this reset is invalidated. The middleware
  // checks the revocation marker and rejects sessions with iat < revEpoch.
  // Best-effort: KV unavailable → old sessions expire naturally (see auth.js).
  if (!await revokeOldSessions(user.id, env.PF_SCHEDULE || null)) {
    console.error('session_revoke_failed', 'KVUnavailable');
  }

  // ── Audit (best-effort) ────────────────────────────────────────────────────
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
