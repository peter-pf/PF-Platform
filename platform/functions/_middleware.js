// Cloudflare Pages Functions middleware — server-side authentication.
// Runs BEFORE any page is served. No client-side bypass possible.
//
// Security model (hardened 2026-06-02; per-user sessions added 2026-06-18):
//  - Two valid credentials are accepted, IN PRIORITY ORDER:
//      (1) NEW per-user signed session cookie (pf_session) — issued by
//          /api/login after a PBKDF2 password check against D1. Carries the
//          user's role, which is injected into context.data.session/role so
//          downstream Functions can enforce role-based access SERVER-SIDE.
//      (2) EXISTING shared gate (legacy pf_auth_token cookie OR Basic Auth
//          with PF_AUTH_USER/PASS). KEPT as a fallback during cutover so NO
//          ONE IS LOCKED OUT. A shared-gate session is treated as role=admin
//          for continuity (it is the whole-portal password). [cutover]
//  - PF_TOKEN_SECRET signs both token types (HMAC-SHA256), so they cannot be
//    forged. Signatures are constant-time compared before payloads are trusted.
//  - /api/* is protected by the same check (same-origin authenticated fetches
//    work; external callers are rejected) EXCEPT /api/login (you can't have a
//    session before you log in).
//  - Fails CLOSED: missing PF_TOKEN_SECRET -> 500. Missing shared creds only
//    disables the shared fallback; per-user login still works if DB is bound.
//
// IMPORTANT (cutover safety): this build does NOT remove the shared gate. Once
// every user has a per-user login and Brad confirms, the Basic-Auth block can
// be deleted in a follow-up — but not here.

import {
  verifySession, getCookie, areaForPath, roleCanAccess, isRestrictedSession,
} from './lib/auth.js';

// Paths that don't require auth at all.
// NOTE: Cloudflare Pages serves "foo.html" at the clean URL "/foo" (308), so we
// allow-list BOTH forms for the non-sensitive auth/denied pages. /denied is here
// (not sensitive) so a denied-area redirect can't loop for an authenticated user.
const PUBLIC_PATHS = ['/favicon.ico', '/robots.txt',
  '/login.html', '/login', '/denied.html', '/denied'];

// Paths that bypass the SESSION gate (they ARE the auth surface).
const AUTH_ENDPOINTS = ['/api/login', '/api/logout'];

// The reset page + endpoint a RESTRICTED (must_reset) session is allowed to use.
const RESET_PAGE = '/reset-password.html';
const RESET_ENDPOINT = '/api/reset-password';
const DENIED_PAGE = '/denied.html';

// Is this an HTML navigation request (vs. an asset/API fetch)?
function isHtmlNav(request) {
  const accept = request.headers.get('Accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
}

// Build a uniform 403 for either an API call (JSON) or an HTML nav (redirect to
// the on-brand denied page).
function deny(request) {
  if (isHtmlNav(request)) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': DENIED_PAGE, 'Cache-Control': 'private, no-store' },
    });
  }
  return new Response(JSON.stringify({
    status: 'forbidden',
    message: 'You do not have access to this area.',
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // legacy shared-token TTL (24h)

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const SECRET = env.PF_TOKEN_SECRET;
  if (!SECRET) {
    return new Response('Server misconfigured: authentication is not available.', {
      status: 500, headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Genuinely public paths (login page, favicon).
  if (PUBLIC_PATHS.some(p => path === p)) return context.next();
  // The auth endpoints validate themselves; don't gate them here.
  if (AUTH_ENDPOINTS.some(p => path === p || path.startsWith(p))) return context.next();

  const cookie = request.headers.get('Cookie') || '';

  // ---- (1) NEW per-user session cookie ------------------------------------
  const sessionToken = getCookie(cookie, 'pf_session');
  if (sessionToken) {
    const session = await verifySession(sessionToken, SECRET);
    if (session) {
      // Inject identity + role for downstream Functions (server-side RBAC).
      context.data = context.data || {};
      context.data.session = session;
      context.data.role = session.role;

      // ---- RESTRICTED (must_reset) session: reset surface ONLY ----
      // A user with a temporary password authenticated correctly but may NOT
      // use the portal. They can reach only the reset page + reset endpoint.
      if (isRestrictedSession(session)) {
        // Allow ONLY: the reset page, the reset endpoint, logout, and the
        // static assets (css/js/img) the reset page needs to render.
        const isAsset = path !== '/' && !path.endsWith('.html') &&
                        !path.startsWith('/api/') && areaForPath(path) === 'general';
        const allowedForReset =
          path === RESET_PAGE ||
          path === '/reset-password' ||   // clean-URL form of RESET_PAGE
          path === RESET_ENDPOINT ||
          path === '/api/logout' ||
          isAsset;
        if (allowedForReset) {
          return context.next();
        }
        // Anything else: send HTML navs to the reset page, APIs get 403.
        if (isHtmlNav(request)) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': RESET_PAGE, 'Cache-Control': 'private, no-store' },
          });
        }
        return new Response(JSON.stringify({
          status: 'must_reset',
          message: 'You must set a new password before continuing.',
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        });
      }

      // ---- Normal session: server-side area gate for PAGES *and* APIs ----
      // Default-deny lives in areaForPath(): an unmapped path resolves to an
      // admin-only area, so sensitive *.html and /api routes are blocked for
      // field_ops by direct URL. Sensitive ENDPOINTS ALSO call requireArea().
      const area = areaForPath(path);
      if (!roleCanAccess(session.role, area)) {
        return deny(request);
      }
      return context.next();
    }
    // Invalid/expired session cookie: fall through to other methods (do NOT
    // hard-fail — a stale cookie shouldn't lock out the shared fallback).
  }

  // ---- (2a) EXISTING shared signed cookie (legacy) ------------------------
  const legacyToken = getCookie(cookie, 'pf_auth_token');
  if (legacyToken && await verifyLegacyToken(legacyToken, SECRET)) {
    context.data = context.data || {};
    // shared whole-portal gate => admin continuity. Provide a synthetic session
    // so per-endpoint requireArea() backstops treat the shared gate as admin.
    context.data.session = { uid: 'shared', role: 'admin', name: 'Shared Access' };
    context.data.role = 'admin';
    return context.next();
  }

  // ---- (2b) EXISTING shared Basic Auth (legacy, initial login) ------------
  // TODO REMOVE AFTER CUTOVER (SEC-04): the shared Basic-Auth credential grants
  // role=admin to anyone who knows the whole-portal password. KEPT intentionally
  // so no one is locked out during the per-user cutover. Peter will rotate the
  // shared password and DELETE this block (and the legacy pf_auth_token block
  // above) once every user has a per-user login. Do not extend this fallback.
  const USER = env.PF_AUTH_USER;
  const PASS = env.PF_AUTH_PASS;
  const auth = request.headers.get('Authorization');
  if (USER && PASS && auth && auth.startsWith('Basic ')) {
    let username = '', password = '';
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(':');
      username = decoded.slice(0, idx);
      password = decoded.slice(idx + 1);
    } catch { /* malformed -> fall through */ }

    if (timingSafeEqual(username, USER) && timingSafeEqual(password, PASS)) {
      // Synthetic admin session for per-endpoint requireArea() backstops.
      context.data = context.data || {};
      context.data.session = { uid: 'shared', role: 'admin', name: 'Shared Access' };
      context.data.role = 'admin';
      const response = await context.next();
      const newResponse = new Response(response.body, response);
      const token = await mintLegacyToken(username, SECRET);
      newResponse.headers.set('Set-Cookie',
        `pf_auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
      newResponse.headers.set('Cache-Control', 'private, no-store');
      return newResponse;
    }
  }

  // No valid auth. For browser navigations, send to the per-user login page.
  // For API/asset requests, return 401 (and keep the Basic-Auth challenge so
  // the legacy fallback still works for anyone mid-cutover).
  const accept = request.headers.get('Accept') || '';
  if (request.method === 'GET' && accept.includes('text/html')) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/login.html', 'Cache-Control': 'private, no-store' },
    });
  }
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PF Operations Platform"',
      'Content-Type': 'text/plain',
    },
  });
}

// ---- Legacy shared-token helpers (unchanged signing scheme) ---------------
function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(payloadB64, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return base64url(new Uint8Array(sig));
}

async function mintLegacyToken(user, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    user, exp: Date.now() + TOKEN_TTL_MS,
  })));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyLegacyToken(token, secret) {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = await hmac(payload, secret);
    if (!timingSafeEqual(sig, expected)) return false;
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
