// Cloudflare Pages Function — /api/me
// Returns the CURRENT caller's own identity {name, role} so the SPA can tailor
// its UI (e.g. hide financial modules from field_ops). It returns NO business
// data — only the session the middleware already verified and injected into
// context.data.session.
//
// SECURITY:
//  - The middleware has already authenticated the request before this runs
//    (the blanket /api/ auth-skip was removed). It populates
//    context.data.session for BOTH per-user sessions AND the shared-auth
//    fallback (synthetic {role:'admin'}). If somehow no session is present,
//    this fails CLOSED with 401 — never assumes a role.
//  - This endpoint is the UI-convenience layer ONLY. The real boundary is the
//    server-side area gate (areaForPath/roleCanAccess) on every page, API, and
//    /data/* file. A tampered or spoofed /api/me response cannot grant access
//    to anything; the data files themselves are gated by role.

export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
  };

  const session = context.data && context.data.session;
  if (!session || !session.role) {
    // Fail closed: no verified session => no identity.
    return new Response(JSON.stringify({
      status: 'unauthenticated',
      message: 'No active session.',
    }), { status: 401, headers });
  }

  return new Response(JSON.stringify({
    status: 'ok',
    name: session.name || '',
    role: session.role,
  }), { status: 200, headers });
}
