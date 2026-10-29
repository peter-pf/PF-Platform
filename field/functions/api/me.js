// Cloudflare Pages Function — /api/me
// Returns the CURRENT caller's own identity {name, role, email} so the SPA can
// tailor its UI (e.g. hide financial modules from field_ops; show Mailing Lists
// menu only for the 3 owners). It returns NO business data — only the session the
// middleware already verified and injected into context.data.session, plus a
// D1 email lookup keyed on the session uid.
//
// SECURITY:
//  - The middleware has already authenticated the request before this runs
//    (the blanket /api/ auth-skip was removed). It populates
//    context.data.session for BOTH per-user sessions AND the shared-auth
//    fallback (synthetic {role:'admin'}). If somehow no session is present,
//    this fails CLOSED with 401 — never assumes a role.
//  - email is the caller's OWN address from D1. It is safe to expose because
//    the caller already provided it to log in. It is used by the SPA to show
//    owner-only UI (Mailing Lists menu). The server-side gate in
//    /api/mailing-lists re-validates ownership independently; /api/me alone
//    cannot grant access to anything.
//  - If D1 is unavailable, email is omitted gracefully (UI hides the menu;
//    the API gate still enforces by email lookup independently).

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

  // Look up the caller's own email from D1 so the SPA can do owner-gated UI.
  // This is a best-effort lookup: if DB is unavailable we still return a valid
  // session response (email will be absent).
  let email = null;
  const db = context.env && context.env.DB;
  if (db && session.uid) {
    try {
      const row = await db
        .prepare('SELECT email FROM users WHERE id = ?')
        .bind(session.uid)
        .first();
      if (row && row.email) email = String(row.email).trim().toLowerCase();
    } catch (e) {
      // Non-fatal: log and continue without email
      console.warn('[me] D1 email lookup failed:', e && e.message);
    }
  }

  return new Response(JSON.stringify({
    status: 'ok',
    uid: session.uid || session.name || '',
    name: session.name || '',
    role: session.role,
    email: email || '',
  }), { status: 200, headers });
}
