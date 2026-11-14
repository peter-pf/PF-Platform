// Cloudflare Pages Function — /api/hardware
// Returns hardware diagram metadata and parts list data as JSON.
//
// Security:
//  - Standard session gate fires in _middleware.js (admin-role users pass).
//  - Additional UID-level preview gate fires in _middleware.js via hardwareAllowed().
//  - This endpoint also re-checks the UID gate directly (belt + suspenders).
//  - Fail-closed: if context.data.session is absent, return 401.
//
// Response shape:
//  { ok: true, diagrams: [...] }   — full DIAGRAMS array
//  { ok: false, error: '...' }     — error

import { DIAGRAMS } from '../lib/hardware-data.js';
import { hardwareAllowed } from '../lib/hardware-access.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  const session = context.data?.session;
  if (!session) {
    return json({ ok: false, error: 'Authentication required.' }, 401);
  }

  // Belt-and-suspenders preview gate (middleware already checked, but we
  // re-check here so the endpoint is independently correct if ever accessed
  // via a code path that bypasses middleware).
  if (!hardwareAllowed(session)) {
    return json({ ok: false, error: 'Access to hardware diagrams is not yet enabled for your account.' }, 403);
  }

  return json({ ok: true, diagrams: DIAGRAMS });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}
