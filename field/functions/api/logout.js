// Cloudflare Pages Function — /api/logout
// Clears the per-user session cookie. Stateless sessions can't be revoked
// server-side without a denylist, so logout simply expires the cookie; the
// short TTL (12h) bounds residual validity.

import { clearSessionCookie } from '../lib/auth.js';

function redirectToLogin() {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login.html',
      'Set-Cookie': clearSessionCookie(),
      'Cache-Control': 'private, no-store',
    },
  });
}

function jsonOk() {
  return new Response(JSON.stringify({ status: 'ok', loggedOut: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}

// GET -> redirect to login (clears cookie). POST -> JSON ok (clears cookie).
export async function onRequestGet() { return redirectToLogin(); }
export async function onRequestPost() { return jsonOk(); }
