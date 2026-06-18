// Cloudflare Pages Function -- /api/doc
// Server-side AUTHENTICATED PROXY that streams a single SharePoint file's bytes
// through our auth gate, so a doc can be EMBEDDED inline in the portal
// (<iframe src="/api/doc?item=<id>">) instead of only linked out -- and it is
// always the LIVE file, never a stale uploaded copy.
//
// SECURITY MODEL (for the COO security review):
//  - This endpoint is ALREADY behind the server-side auth gate in
//    functions/_middleware.js. Every request must carry a valid signed
//    pf_auth_token cookie (or Basic Auth) -- external/unauthenticated callers
//    are rejected with 401 BEFORE they ever reach this code. We do NOT weaken
//    or bypass that gate here. (/api/* is covered by the middleware; this file
//    lives under /api/, so it inherits the gate.)
//  - NOT AN OPEN PROXY. The SharePoint drive is FIXED to env.SP_DRIVE_ID on the
//    server. We NEVER accept a drive id (or any URL/host) from the client -- the
//    only thing the client supplies is an `item` drive-item id, and only on OUR
//    drive. There is no way to point this at any other drive, site, or host.
//  - INPUT VALIDATION: the `item` param must match the SharePoint drive-item id
//    format (base32-ish: uppercase letters + digits, bounded length). Anything
//    else -> 400, before any Graph call. Optional allow-list (ALLOWED_ITEMS)
//    further restricts which ids may be fetched when configured.
//  - CONTENT ONLY: we fetch /items/{id}/content. No children/listing endpoint is
//    ever called, so this cannot enumerate or browse the drive -- it can only
//    return the bytes of a specific, validated item.
//  - Graph app-only creds (AZURE_CLIENT_ID / AZURE_CLIENT_SECRET /
//    AZURE_TENANT_ID) live ONLY in Cloudflare Pages env vars (server-side).
//    They are never sent to or exposed to the browser. Same client-credentials
//    flow + scope as tools/pf_email.py.
//  - Responses are private, no-store; served inline with the upstream
//    Content-Type so PDFs render in the iframe.
//  - Fails CLOSED: if any Graph env var is missing, return 503 (never silently
//    proxy on a misconfiguration).

import { requireArea } from '../lib/auth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL_TMPL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';

// SharePoint drive-item ids are uppercase base32-style tokens (letters+digits).
// The POET subcontract id is 34 chars (e.g. 016ISVH64RZ6FBDCIAMNELEB5CKPHJ2UW3).
// Accept a generous-but-bounded range and reject anything with other characters.
const ITEM_ID_RE = /^[A-Z0-9]{20,80}$/;

// In-memory token cache (per isolate). Avoids minting a new token on every
// request. Refreshed ~60s before expiry. Not shared across isolates -- that's
// fine; each just mints lazily.
let _tokenCache = { token: null, exp: 0 };

function txt(message, status = 200, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8',
               'Cache-Control': 'private, no-store', ...extraHeaders },
  });
}

// Optional allow-list of item ids (comma/space separated in env.PF_DOC_ALLOWED_ITEMS).
// When set, ONLY these ids may be fetched. When unset, any well-formed id on OUR
// drive is allowed (still auth-gated + drive-restricted + format-validated).
function isAllowed(itemId, env) {
  const raw = env.PF_DOC_ALLOWED_ITEMS;
  if (!raw) return true; // no allow-list configured -> format+drive restriction only
  const set = String(raw).split(/[\s,]+/).filter(Boolean);
  return set.includes(itemId);
}

async function getGraphToken(env) {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.exp > now + 60000) {
    return _tokenCache.token;
  }
  const body = new URLSearchParams({
    client_id: env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const tokenUrl = TOKEN_URL_TMPL.replace('{tenant}', encodeURIComponent(env.AZURE_TENANT_ID));
  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    throw new Error('token endpoint returned ' + resp.status);
  }
  const data = await resp.json();
  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  _tokenCache = { token: data.access_token, exp: now + ttlMs };
  return data.access_token;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // [SEC-03] Per-endpoint RBAC backstop. The doc proxy can surface contracts /
  // financials, so it is 'documents' (partner+admin only). field_ops is denied
  // here regardless of the middleware. Fails closed if no session.
  const denied = requireArea(context.data && context.data.session, 'documents');
  if (denied) return denied;

  try {
    // [fail closed] All Graph creds + the fixed drive id must be present.
    const need = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SP_DRIVE_ID'];
    for (const k of need) {
      if (!env[k]) {
        return txt('Document proxy unavailable: server is not configured.', 503);
      }
    }

    // The ONLY client input: the drive-item id. Drive is server-fixed.
    const url = new URL(request.url);
    const itemId = (url.searchParams.get('item') || '').trim();
    if (!itemId) {
      return txt('Missing required "item" parameter.', 400);
    }
    if (!ITEM_ID_RE.test(itemId)) {
      return txt('Invalid "item" identifier.', 400);
    }
    if (!isAllowed(itemId, env)) {
      return txt('This document is not permitted.', 403);
    }

    const token = await getGraphToken(env);

    // CONTENT ONLY, on OUR drive only. Drive id comes from env, never the client.
    const driveId = env.SP_DRIVE_ID; // already path-safe (no separators) but encode anyway
    const graphUrl = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;

    const upstream = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
      // Graph 302-redirects /content to a short-lived download URL; follow it.
      redirect: 'follow',
    });

    if (upstream.status === 404) {
      return txt('Document not found.', 404);
    }
    if (!upstream.ok) {
      console.error('api/doc upstream error:', upstream.status);
      return txt('Could not retrieve the document.', 502);
    }

    // Stream the bytes back inline with the upstream content type.
    const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    // inline so the iframe renders it (PDF viewer) rather than downloading.
    headers.set('Content-Disposition', 'inline');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    const len = upstream.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error('api/doc error:', err);
    return txt('An internal error occurred.', 500);
  }
}
