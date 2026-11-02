// Cloudflare Pages Functions middleware — server-side authentication.
// Runs BEFORE any page is served. No client-side bypass possible.
//
// Security model (hardened 2026-06-02; per-user sessions 2026-06-18;
//                  SEC-04 shared-fallback removed 2026-11-02):
//  - The ONLY valid credential is a per-user signed session cookie (pf_session)
//    issued by /api/login after a PBKDF2 password check against D1. It carries
//    the user's role, which is injected into context.data.session/role so
//    downstream Functions can enforce role-based access SERVER-SIDE.
//  - PF_TOKEN_SECRET signs all tokens (HMAC-SHA256); forging is not possible.
//    Signatures are constant-time compared before payloads are trusted.
//  - /api/* is protected by the same check (same-origin authenticated fetches
//    work; external callers are rejected) EXCEPT /api/login and /api/logout.
//  - Fails CLOSED: missing PF_TOKEN_SECRET -> 500.
//  - SEC-04 RESOLVED: the shared Basic-Auth / legacy pf_auth_token fallback
//    has been removed. All field crew must authenticate with individual accounts.
//    Brad confirmed 2026-11-02 (owner review reply). PF_AUTH_USER and
//    PF_AUTH_PASS secrets have been removed from the CF Pages pf-field env.

import {
  verifySession, getCookie, areaForPath, roleCanAccess, isRestrictedSession,
  checkSessionRevoked,
} from './lib/auth.js';

// Paths that don't require auth at all.
// NOTE: Cloudflare Pages serves "foo.html" at the clean URL "/foo" (308), so we
// allow-list BOTH forms for the non-sensitive auth/denied pages. /denied is here
// (not sensitive) so a denied-area redirect can't loop for an authenticated user.
// forgot-password and reset are public — no session is available for users who
// have forgotten their password. Both are allow-listed here AND their API
// endpoints are added to AUTH_ENDPOINTS so no session gate fires on them.
const PUBLIC_PATHS = ['/favicon.ico', '/robots.txt',
  '/login.html', '/login', '/denied.html', '/denied',
  '/forgot-password.html', '/forgot-password',
  '/reset.html', '/reset'];

// Paths that bypass the SESSION gate (they ARE the auth surface).
// /api/forgot-password and /api/reset-by-token are public (no session required —
// users have forgotten their password). They validate themselves internally.
const AUTH_ENDPOINTS = ['/api/login', '/api/logout',
  '/api/forgot-password', '/api/reset-by-token'];

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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const SECRET = env.PF_TOKEN_SECRET;
  if (!SECRET) {
    // PREVIEW-ONLY graceful degrade.
    // Cloudflare Pages binds env secrets PER-ENVIRONMENT. Production has
    // PF_TOKEN_SECRET bound; the PREVIEW environment has NO env vars bound
    // (env_vars: []), so on a preview deployment env.PF_TOKEN_SECRET is
    // undefined. Previously this returned a hard 500 ("Server misconfigured"),
    // which blocked the SPA from ever loading -> Brad could not review preview
    // builds. Because the Functions bundle DOES run on preview deploys, the
    // 500 fired before index.html was served, so the client-side isPreviewHost
    // office-view fallback never got a chance.
    //
    // Fix: when (and ONLY when) the secret is absent AND we are on a preview
    // host (*.pf-platform.pages.dev that is NOT the bare prod host, and not a
    // custom domain), SKIP the auth gate and serve the static SPA so the
    // preview renders for visual review. The client then applies its own
    // isPreviewHost -> office-view default (batch-3).
    //
    // PROD-SAFETY: production ALWAYS has PF_TOKEN_SECRET bound, so `!SECRET` is
    // never true in production -> this branch is unreachable on prod. The host
    // check is a belt-and-suspenders second gate: it excludes the bare prod
    // host and any custom domain. If somehow the prod secret were ever missing,
    // prod would STILL hard-fail closed (below) rather than open.
    const host = url.hostname.toLowerCase();
    const isPreviewHost =
      /\.pf-field\.pages\.dev$/i.test(host) && host !== 'pf-field.pages.dev';
    if (isPreviewHost) {
      return context.next();
    }
    return new Response('Server misconfigured: authentication is not available.', {
      status: 500, headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Genuinely public paths (login page, favicon).
  if (PUBLIC_PATHS.some(p => path === p)) return context.next();
  // The auth endpoints validate themselves; don't gate them here.
  // Exact match only — prevents a crafted sub-path (e.g. /api/login/extra)
  // from bypassing auth by matching a prefix.
  if (AUTH_ENDPOINTS.includes(path)) return context.next();

  const cookie = request.headers.get('Cookie') || '';

  // ---- (1) NEW per-user session cookie ------------------------------------
  const sessionToken = getCookie(cookie, 'pf_session');
  if (sessionToken) {
    const session = await verifySession(sessionToken, SECRET);
    if (session) {
      // ---- Session revocation check ----------------------------------------
      // After a password reset, revokeOldSessions() writes a KV marker at
      // `revoked:<uid>`. A session whose iat (issued-at) predates the revocation
      // epoch is invalid — force re-login. The check fails OPEN on KV error:
      // KV unavailable → treat as no revocation (see auth.js for the choice).
      if (await checkSessionRevoked(session, env.PF_SCHEDULE || null)) {
        // Send HTML navs to login; return 401 for API/fetch requests.
        if (isHtmlNav(request)) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': '/login.html', 'Cache-Control': 'private, no-store' },
          });
        }
        return new Response('Authentication required', {
          status: 401,
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'private, no-store' },
        });
      }

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
    // Invalid/expired session cookie: fall through to unauthenticated handling.
  }

  // No valid auth. For browser navigations, send to the per-user login page.
  const accept = request.headers.get('Accept') || '';
  if (request.method === 'GET' && accept.includes('text/html')) {
    // Preserve the requested page so login can return the user to it (deep links
    // like /field-sample.html no longer dead-end on the portal home after login).
    // Only pass a SAME-ORIGIN path (leading single slash, no scheme/backslash) to
    // avoid an open-redirect; login.html re-validates with the same rule.
    let loginUrl = '/login.html';
    const wanted = path + (url.search || '');
    if (/^\/[^/\\]/.test(wanted) && !wanted.startsWith('/login')) {
      loginUrl += '?next=' + encodeURIComponent(wanted);
    }
    return new Response(null, {
      status: 302,
      headers: { 'Location': loginUrl, 'Cache-Control': 'private, no-store' },
    });
  }
  return new Response('Authentication required', {
    status: 401,
    headers: { 'Content-Type': 'text/plain' },
  });
}
