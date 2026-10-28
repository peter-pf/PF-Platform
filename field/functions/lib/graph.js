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

// ---------------------------------------------------------------------------
// Photo fetch helper: fetch image bytes for SharePoint attachment refs and
// return a sectionPhotos object for PDF embedding.
//
// Usage (submit paths in daily-report.js and site-readiness.js):
//   const sectionPhotos = await fetchAttachmentPhotos(
//     token, env.SP_DRIVE_ID, rec.attachments, BUCKET_TO_ITEM_KEY,
//     { maxPhotos: 24, timeoutMs: 4000 }
//   );
//   rec.sectionPhotos = sectionPhotos;
//   pdfBytes = renderPdf(rec);
//
// FAIL-SOFT: individual fetch errors (404, timeout, non-image content) are
// silently skipped — they never block the submit or PDF render.
// ---------------------------------------------------------------------------

/**
 * Fetch image bytes for a set of attachments and build a sectionPhotos map.
 *
 * @param {string}   token           - Bearer token from getGraphToken()
 * @param {string}   driveId         - SharePoint drive id (env.SP_DRIVE_ID)
 * @param {Array}    attachments     - [{name, itemId, bucket, ...}] from the record
 * @param {Object}   bucketToItemKey - maps bucket name → logical item key ('1a', 'photos', etc.)
 * @param {Object}   [opts]
 *   @param {number}   [opts.maxPhotos=24]  - total photo cap (safety limit)
 *   @param {number}   [opts.timeoutMs=4000] - per-fetch timeout in ms
 *   @param {Function} [opts.fetchFn]        - custom fetch (for unit tests)
 * @returns {Promise<Object>} sectionPhotos keyed by item key
 */
export async function fetchAttachmentPhotos(token, driveId, attachments, bucketToItemKey, opts) {
  const { maxPhotos = 24, timeoutMs = 4000, fetchFn = globalThis.fetch } = opts || {};

  // Collect unique photo tasks (up to maxPhotos).
  const tasks = [];
  for (const a of (attachments || [])) {
    if (tasks.length >= maxPhotos) break;
    if (!a || !a.itemId) continue;
    const itemKey = bucketToItemKey[a.bucket];
    if (!itemKey) continue;
    tasks.push({ itemId: a.itemId, itemKey });
  }

  if (!tasks.length) return {};

  // Fetch all in parallel; each fails-soft independently.
  const results = await Promise.all(
    tasks.map(({ itemId, itemKey }) =>
      _fetchOnePhoto(token, driveId, itemId, timeoutMs, fetchFn)
        .then((entry) => ({ itemKey, entry }))
        .catch(() => ({ itemKey, entry: null }))
    )
  );

  // Build sectionPhotos.
  const sectionPhotos = {};
  for (const { itemKey, entry } of results) {
    if (!entry) continue;
    if (!sectionPhotos[itemKey]) sectionPhotos[itemKey] = [];
    sectionPhotos[itemKey].push(entry);
  }
  return sectionPhotos;
}

// Fetch one image from SharePoint: try thumbnail endpoint first (gives JPEG
// ~800px), fall back to /content for direct jpeg/png.  Returns
// {data, w, h} on success, null on failure (fail-soft).
async function _fetchOnePhoto(token, driveId, itemId, timeoutMs, fetchFn) {
  const base         = `${GRAPH}/drives/${driveId}/items/${itemId}`;
  const thumbUrl     = `${base}/thumbnails/0/large/content`;
  const contentUrl   = `${base}/content`;

  for (let i = 0; i < 2; i++) {
    const url = i === 0 ? thumbUrl : contentUrl;
    let resp;
    try {
      const ac    = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        resp = await fetchFn(url, {
          headers: { Authorization: 'Bearer ' + token },
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null; // abort (timeout) or network error
    }

    if (!resp.ok) {
      if (resp.status === 404 && i === 0) continue; // no thumbnail → try /content
      return null;
    }

    const ct     = (resp.headers.get('Content-Type') || '').toLowerCase();
    const isJpeg = ct.includes('image/jpeg') || ct.includes('image/jpg');
    const isPng  = ct.includes('image/png');
    if (!isJpeg && !isPng) {
      if (i === 0) continue; // thumbnail may redirect to wrong type; try /content
      return null; // not an image (PDF, docx, etc.) — skip
    }

    try {
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const dims  = isJpeg ? _jpegDims(bytes) : _pngDims(bytes);
      const b64   = _uint8ToBase64(bytes);
      return { data: `data:${isJpeg ? 'image/jpeg' : 'image/png'};base64,${b64}`, w: dims.w, h: dims.h };
    } catch {
      return null;
    }
  }
  return null;
}

// Parse JPEG dimensions from SOF marker. Returns {w,h} or fallback {w:800,h:600}.
function _jpegDims(bytes) {
  const SOF = new Set([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF]);
  let i = 2; // skip SOI (FF D8)
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xFF) break;
    const m = bytes[i + 1];
    if (m === 0xD9) break;
    if (m >= 0xD0 && m <= 0xD9) { i += 2; continue; }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (SOF.has(m) && segLen >= 9 && i + 8 < bytes.length) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      if (w > 0 && h > 0) return { w, h };
    }
    i += 2 + segLen;
    if (segLen < 2) break;
  }
  return { w: 800, h: 600 };
}

// Parse PNG dimensions from IHDR chunk. Returns {w,h} or fallback {w:800,h:600}.
function _pngDims(bytes) {
  // Layout: 8-byte PNG sig + IHDR len(4) + "IHDR"(4) + width(4) + height(4)
  if (bytes.length < 24) return { w: 800, h: 600 };
  const w = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
  const h = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
  return { w: w || 800, h: h || 600 };
}

// Convert Uint8Array to base64.  Uses chunked String.fromCharCode to avoid
// stack overflow on large buffers (Workers safe).
function _uint8ToBase64(bytes) {
  const CHUNK = 8192;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
