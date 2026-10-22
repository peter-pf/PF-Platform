// Cloudflare Pages Function — /api/forgot-password
// Issues a one-time password reset link emailed to the user.
//
// SECURITY MODEL:
//   - PUBLIC endpoint: no session required.
//   - ACCEPTS ONLY application/json. Form-encoded or other content types are
//     rejected with the generic response (no email sent, no DB write).
//   - REJECTS cross-site requests: Sec-Fetch-Site: cross-site, or an Origin
//     header that does not match the field portal host. Allows the preview host
//     when the request itself arrives on *.pf-field.pages.dev.
//   - ALWAYS returns the same generic response regardless of whether the email
//     matches a user — prevents account enumeration via response body, status
//     code, OR TIMING. The response is returned BEFORE any DB lookup or email
//     send. All work after the rate-limit check runs in context.waitUntil()
//     (background task) so the response path is identically fast for every
//     caller.
//   - Rate limiting: 3 req/email/hr + 20 req/IP/hr (KV counters).
//     Per-email key: rl:fp:<sha256(normalizedEmail)>
//     Per-IP key:    rl:fpip:<ip>
//   - Token is 32 bytes of random data (URL-safe base64). Only the SHA-256
//     hash is stored in D1 — the raw token travels in the email link and is
//     never written to disk.
//   - Reset link uses a URL fragment (#token=...) so the token does NOT appear
//     in the HTTP Referrer header if the user navigates away from the reset page.
//   - New token is INSERTED before old tokens are invalidated. Old unused
//     tokens for the same email are marked used AFTER the new row is committed.
//   - Expiry: 30 minutes from issue.
//   - Tokens, emails, and user IDs never appear in server logs or error
//     messages. Error logging: event-class name only.
//   - Fails CLOSED: missing DB / Graph creds → generic response (no info
//     leakage).

import { b64urlEncode } from '../lib/auth.js';
import { getGraphToken, graphConfigured, GRAPH } from '../lib/graph.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

// Generic response returned in ALL cases (success, unknown email, rate limit,
// rejected content type, cross-site, error). Always HTTP 200.
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
const RATE_LIMIT_IP_MAX = 20;          // per IP per hour (was 10 — raised to match reset-by-token)
const RATE_WINDOW_SECONDS = 3600;      // 1 hour window
const MAIL_FROM = 'peter@pierfoundations.com';
const FIELD_PORTAL_ORIGIN = 'https://field.pierfoundations.com';

// SHA-256 a Uint8Array. Returns base64url string.
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return b64urlEncode(new Uint8Array(digest));
}

// SHA-256 a UTF-8 string. Returns base64url string (used for email key hashing).
async function sha256str(s) {
  return sha256(new TextEncoder().encode(s));
}

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

// UUID v4 for the row primary key.
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

  // ── Content-Type guard (must be JSON) ──────────────────────────────────────
  // Form-encoded or other types are rejected with the generic response.
  // No DB write, no email send.
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return json(GENERIC_RESPONSE);
  }

  // ── Origin / Sec-Fetch-Site guard ──────────────────────────────────────────
  // Reject cross-site requests. Allow requests from the canonical field portal
  // origin (https://field.pierfoundations.com) or the preview origin when the
  // request itself arrives on a preview host.
  const secFetchSite = request.headers.get('Sec-Fetch-Site') || '';
  if (secFetchSite === 'cross-site') {
    return json(GENERIC_RESPONSE);
  }
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    const host = request.headers.get('Host') || '';
    const isPreviewHost = /\.pf-field\.pages\.dev$/i.test(host);
    const allowed = [FIELD_PORTAL_ORIGIN];
    if (isPreviewHost) allowed.push(`https://${host}`);
    if (!allowed.includes(origin)) {
      return json(GENERIC_RESPONSE);
    }
  }

  // ── Parse email ────────────────────────────────────────────────────────────
  let email = '';
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY) return json(GENERIC_RESPONSE);
    const text = await request.text();
    if (text.length > MAX_BODY) return json(GENERIC_RESPONSE);
    const body = JSON.parse(text);
    email = String(body.email || '').toLowerCase().trim();
  } catch {
    return json(GENERIC_RESPONSE);
  }

  if (!email || email.length > 254 || !email.includes('@')) {
    return json(GENERIC_RESPONSE);
  }

  // ── Rate limit: IP first (cheapest, no DB) ─────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ||
             (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
             'unknown';
  if (env.PF_SCHEDULE) {
    const ipKey = `rl:fpip:${ip}`;
    const ipOk = await checkRateLimit(env.PF_SCHEDULE, ipKey, RATE_LIMIT_IP_MAX);
    if (!ipOk) return json(GENERIC_RESPONSE);
  }

  // ── Rate limit: email (hashed to avoid storing PII in KV keys) ────────────
  if (env.PF_SCHEDULE) {
    const emailHash = await sha256str(email);
    const emailKey = `rl:fp:${emailHash}`;
    const emailOk = await checkRateLimit(env.PF_SCHEDULE, emailKey, RATE_LIMIT_EMAIL_MAX);
    if (!emailOk) return json(GENERIC_RESPONSE);
  }

  // ── Return generic response IMMEDIATELY ────────────────────────────────────
  // All remaining work (DB lookup, token ops, email send) runs in the background
  // so the response is identically fast for known and unknown emails.
  // This eliminates timing-based account enumeration.

  const background = async () => {
    if (!env.DB || !graphConfigured(env)) return; // fail closed

    // User lookup
    let user = null;
    try {
      user = await env.DB
        .prepare('SELECT id, name, email FROM users WHERE LOWER(email) = ? AND active = 1')
        .bind(email)
        .first();
    } catch (e) {
      console.error('forgot-password.user_lookup', e?.constructor?.name || 'Error');
      return;
    }
    if (!user) return; // unknown email — no action

    // Generate a 32-byte random token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const rawToken   = b64urlEncode(tokenBytes);
    const tokenHash  = await sha256(tokenBytes);
    const now        = Math.floor(Date.now() / 1000);
    const expiresAt  = now + TOKEN_EXPIRY_SECONDS;
    const id         = randomId();

    // Insert the NEW token FIRST, then invalidate old ones.
    // (Order matters: if invalidation runs first and the insert fails, the user
    // has no valid reset link. Insert first guarantees there is always at most
    // one active link at a time, but only after the new one is safely saved.)
    try {
      await env.DB
        .prepare(
          `INSERT INTO password_resets (id, user_email, token_hash, expires_at, created_at, request_ip)
           VALUES (?, ?, ?, ?, datetime('now'), ?)`
        )
        .bind(id, user.email, tokenHash, expiresAt, ip)
        .run();

      // Invalidate older unused tokens for this email (now that the new one is committed)
      await env.DB
        .prepare(
          "UPDATE password_resets SET used_at = datetime('now') WHERE user_email = ? AND used_at IS NULL AND id != ?"
        )
        .bind(user.email, id)
        .run();
    } catch (e) {
      console.error('forgot-password.token_write', e?.constructor?.name || 'Error');
      return;
    }

    // Send the reset email. Link uses a URL fragment so the token is never in
    // the HTTP Referrer header.
    const resetLink = `https://field.pierfoundations.com/reset.html#token=${rawToken}`;
    const emailBody =
      `Hi ${user.name || 'there'},\n\n` +
      `Someone requested a password reset for your PF Field Portal account.\n\n` +
      `Reset your password: ${resetLink}\n\n` +
      `This link expires in 30 minutes and can only be used once.\n\n` +
      `If you didn't request this, you can safely ignore this email. ` +
      `Your password has not been changed.\n\n` +
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
        // Email send failed — mark the token used so it can't be abused
        try {
          await env.DB
            .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
            .bind(id)
            .run();
        } catch { /* best-effort */ }
        console.error('forgot-password.send_failed', resp.status);
      }
    } catch (e) {
      // Graph error — invalidate the token, don't reveal the reason
      try {
        await env.DB
          .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
          .bind(id)
          .run();
      } catch { /* best-effort */ }
      console.error('forgot-password.graph_error', e?.constructor?.name || 'Error');
    }
  };

  // Schedule background work (CF Workers) or await it (Node test environment)
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(background());
  } else {
    await background();
  }

  return json(GENERIC_RESPONSE);
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed.' }), {
    status: 405, headers: JSON_HEADERS,
  });
}
