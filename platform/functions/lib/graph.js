// Shared Microsoft Graph helpers for the PF Platform (Cloudflare Pages Functions).
//
// This isolates the Graph app-only (client_credentials) token minter so multiple
// endpoints can reuse it WITHOUT duplicating the secret-handling logic, and
// WITHOUT touching functions/api/doc.js (which keeps its own private copy so this
// shared module can never regress the live document proxy).
//
// SECURITY MODEL (for the COO security review):
//  - App-only creds (AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID)
//    live ONLY in Cloudflare Pages env vars (server-side). They are never sent
//    to or exposed to the browser. Same client-credentials flow + .default scope
//    as functions/api/doc.js and tools/pf_email.py.
//  - The SharePoint drive is FIXED to env.SP_DRIVE_ID on the server. Callers of
//    these helpers pass drive-item ids / server-built paths only; a drive id or
//    host is NEVER accepted from the client.
//  - In-memory token cache is PER ISOLATE (not shared across isolates). Each
//    isolate mints lazily and refreshes ~60s before expiry.
//  - Helpers throw on misconfiguration / upstream failure; the calling endpoint
//    is responsible for translating that into a fail-CLOSED 503/5xx response.

export const GRAPH = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL_TMPL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';

// Per-isolate token cache. Mirrors the doc.js pattern exactly.
let _tokenCache = { token: null, exp: 0 };

// The Graph creds + fixed drive id that MUST all be present for any Graph call.
export const GRAPH_ENV_KEYS = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SP_DRIVE_ID'];

// Returns true only if every required Graph/SharePoint env var is present.
export function graphConfigured(env) {
  return GRAPH_ENV_KEYS.every((k) => !!(env && env[k]));
}

// Mint (or return cached) an app-only Graph access token via client_credentials.
// Throws on a missing config or a non-OK token endpoint response.
export async function getGraphToken(env) {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.exp > now + 60000) {
    return _tokenCache.token;
  }
  if (!env.AZURE_CLIENT_ID || !env.AZURE_CLIENT_SECRET || !env.AZURE_TENANT_ID) {
    throw new Error('graph creds missing');
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
