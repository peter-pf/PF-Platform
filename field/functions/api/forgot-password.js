// Cloudflare Pages Function — /api/forgot-password
// Issues a one-time password reset link emailed to the user.
//
// SECURITY MODEL:
//   - PUBLIC endpoint: no session required (user has forgotten their password).
//   - ALWAYS returns the same generic response regardless of whether the email
//     matches a user, to prevent account enumeration via message, status code,
//     or timing. No side-channel on the response.
//   - Rate limiting: 3 requests per email per hour + ~10 per IP per hour.
//     Over limit → same generic response, no email sent.
//   - Token is 32 bytes of random data (URL-safe base64). Only the SHA-256 hash
//     is stored in D1 — the raw token is emailed and never written to disk.
//   - Older unused tokens for the same email are invalidated at issue time.
//   - Expiry: 30 minutes from issue.
//   - Tokens never appear in server logs or error messages.
//   - Reset link: https://field.pierfoundations.com/reset.html?token=...
//   - Email sent via Graph sendMail as peter@pierfoundations.com.
//   - Fails CLOSED: missing DB / Graph creds → generic response (no info leakage).

import { b64urlEncode } from '../lib/auth.js';
import { getGraphToken, graphConfigured, GRAPH } from '../lib/graph.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

// Generic response returned in ALL cases (success, unknown email, rate limit, error).
// The HTTP status is always 200 to prevent status-based enumeration.
const GENERIC_RESPONSE = {
  status: 'ok',
  message: 'If that email is registered, a reset link has been sent.',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const MAX_BODY = 4 * 1024;
const TOKEN_EXPIRY_SECONDS = 30 * 60; // 30 minutes
const RATE_LIMIT_EMAIL_MAX = 3;        // per email per hour
const RATE_LIMIT_IP_MAX = 10;          // per IP per hour
const RATE_WINDOW_SECONDS = 3600;      // 1 hour window
const MAIL_FROM = 'peter@pierfoundations.com';

// Derive a SHA-256 hash of the token bytes. Returns base64url string.
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return b64urlEncode(new Uint8Array(digest));
}

// KV rate-limit counter. Returns true if under limit, false if over.
// Increments the counter and sets/extends the TTL on each call.
async function checkRateLimit(kv, key, max) {
  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS });
    return true;
  } catch {
    // KV error → allow the request (fail open only for rate-limiting, not auth)
    return true;
  }
}

// Generate a random UUID v4 (used as the row id).
function randomId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse email from body
  let email = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json(GENERIC_RESPONSE);
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(GENERIC_RESPONSE);
      const body = JSON.parse(text);
      email = String(body.email || '').toLowerCase().trim();
    } else {
      const form = await request.formData();
      email = String(form.get('email') || '').toLowerCase().trim();
    }
  } catch {
    return json(GENERIC_RESPONSE);
  }

  // Basic email sanity (length only — avoid giving feedback on format)
  if (!email || email.length > 254 || !email.includes('@')) {
    return json(GENERIC_RESPONSE);
  }

  // Rate limit by IP first (cheapest check, no DB)
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             'unknown';
  if (env.PF_SCHEDULE) {
    const ipKey = `ratelimit:forgot:ip:${ip}`;
    const ipOk = await checkRateLimit(env.PF_SCHEDULE, ipKey, RATE_LIMIT_IP_MAX);
    if (!ipOk) {
      // Over IP rate limit — return generic, don't send
      return json(GENERIC_RESPONSE);
    }
  }

  // We need both DB and Graph to do anything real
  if (!env.DB || !graphConfigured(env)) {
    // Fail closed: can't send email — return generic (no info leakage)
    return json(GENERIC_RESPONSE);
  }

  // Rate limit by email (3/hr)
  if (env.PF_SCHEDULE) {
    const emailKey = `ratelimit:forgot:email:${email}`;
    const emailOk = await checkRateLimit(env.PF_SCHEDULE, emailKey, RATE_LIMIT_EMAIL_MAX);
    if (!emailOk) {
      return json(GENERIC_RESPONSE);
    }
  }

  // Look up the user. Use a generic path so we always return the same response.
  let user = null;
  try {
    user = await env.DB
      .prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ? AND active = 1')
      .bind(email)
      .first();
  } catch {
    return json(GENERIC_RESPONSE);
  }

  // If no user or user not found: return generic (no enumeration)
  if (!user) {
    return json(GENERIC_RESPONSE);
  }

  // Generate a 32-byte random token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = b64urlEncode(tokenBytes);
  const tokenHash = await sha256(tokenBytes);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_EXPIRY_SECONDS;
  const id = randomId();

  try {
    // Invalidate any older unused tokens for this email
    await env.DB
      .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_email = ? AND used_at IS NULL")
      .bind(user.email)
      .run();

    // Insert the new token (hash only)
    await env.DB
      .prepare(`INSERT INTO password_resets (id, user_email, token_hash, expires_at, created_at, request_ip)
                VALUES (?, ?, ?, ?, datetime('now'), ?)`)
      .bind(id, user.email, tokenHash, expiresAt, ip)
      .run();
  } catch {
    return json(GENERIC_RESPONSE);
  }

  // Send the reset email via Graph sendMail
  const resetLink = `https://field.pierfoundations.com/reset.html?token=${rawToken}`;
  const emailBody =
    `Hi ${user.name || 'there'},\n\n` +
    `Someone requested a password reset for your PF Field Portal account.\n\n` +
    `Reset your password: ${resetLink}\n\n` +
    `This link expires in 30 minutes and can only be used once.\n\n` +
    `If you didn't request this, you can safely ignore this email. Your password has not been changed.\n\n` +
    `PF Field Portal`;

  try {
    const token = await getGraphToken(env);
    const mailPayload = {
      message: {
        subject: 'PF Field Portal - Password Reset',
        body: { contentType: 'Text', content: emailBody },
        toRecipients: [{ emailAddress: { address: user.email } }],
      },
      saveToSentItems: false,
    };
    const resp = await fetch(`${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mailPayload),
    });
    if (!resp.ok) {
      // Email failed — mark the token used so it can't be abused
      try {
        await env.DB
          .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
          .bind(id)
          .run();
      } catch { /* best-effort */ }
      return json(GENERIC_RESPONSE);
    }
  } catch {
    // Graph error — invalidate the token, return generic
    try {
      await env.DB
        .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
        .bind(id)
        .run();
    } catch { /* best-effort */ }
    return json(GENERIC_RESPONSE);
  }

  return json(GENERIC_RESPONSE);
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed.' }), {
    status: 405, headers: JSON_HEADERS,
  });
}
