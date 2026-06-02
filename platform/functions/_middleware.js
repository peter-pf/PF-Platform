// Cloudflare Pages Functions middleware — server-side authentication
// This runs BEFORE any page is served. No client-side bypass possible.
//
// Security model (hardened 2026-06-02 after triple-check review):
//  - Credentials come ONLY from env vars. If unset, the app fails CLOSED
//    (500) rather than falling back to a known password. [SEC-003]
//  - The session token is HMAC-SHA256 signed with PF_TOKEN_SECRET, so it
//    cannot be forged by hand-crafting base64 JSON. [SEC-001]
//  - /api/* is NOT exempt from auth — it is protected by the same token
//    check, so same-origin authenticated fetches work but external callers
//    are rejected. [SEC-002]

// Paths that don't require auth (static, non-sensitive)
const PUBLIC_PATHS = ['/favicon.ico', '/robots.txt'];

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // [SEC-003] Fail closed: require all auth config to be present. Never fall
  // back to a hardcoded credential — a misconfigured deploy must deny access,
  // not silently run on a publicly-known password.
  const USER = env.PF_AUTH_USER;
  const PASS = env.PF_AUTH_PASS;
  const SECRET = env.PF_TOKEN_SECRET;
  if (!USER || !PASS || !SECRET) {
    return new Response('Server misconfigured: authentication is not available.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Skip auth for genuinely public, non-sensitive paths only.
  if (PUBLIC_PATHS.some(p => url.pathname === p)) {
    return context.next();
  }

  // Check for a valid signed auth cookie first.
  const cookie = request.headers.get('Cookie') || '';
  const authToken = getCookie(cookie, 'pf_auth_token');
  if (authToken && await verifyToken(authToken, SECRET)) {
    return context.next();
  }

  // Otherwise check for a Basic Auth header (initial login).
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Basic ')) {
    let username = '', password = '';
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(':');
      username = decoded.slice(0, idx);
      password = decoded.slice(idx + 1);
    } catch {
      // malformed header -> fall through to 401
    }

    if (timingSafeEqual(username, USER) && timingSafeEqual(password, PASS)) {
      const response = await context.next();
      const newResponse = new Response(response.body, response);
      const token = await mintToken(username, SECRET);
      newResponse.headers.set('Set-Cookie',
        `pf_auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
      );
      // Don't let CDNs cache authenticated responses. [SEC-005]
      newResponse.headers.set('Cache-Control', 'private, no-store');
      return newResponse;
    }
  }

  // No valid auth — challenge.
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PF Operations Platform"',
      'Content-Type': 'text/plain'
    }
  });
}

function getCookie(cookieString, name) {
  const match = cookieString.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : null;
}

// ---- Signed token helpers (HMAC-SHA256 via Web Crypto) [SEC-001] ----

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(payloadB64, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return base64url(new Uint8Array(sig));
}

async function mintToken(user, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    user,
    exp: Date.now() + TOKEN_TTL_MS
  })));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    // Recompute signature and constant-time compare BEFORE trusting payload.
    const expected = await hmac(payload, secret);
    if (!timingSafeEqual(sig, expected)) return false;

    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

// Constant-time string comparison to avoid timing side-channels.
function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
