// Cloudflare Pages Function -- /api/project-photos
//
// LIVE, READ-ONLY gallery of a project's SharePoint "Project Photos" folder for
// the office Active-Projects detail view. Given a project number it resolves the
// project folder, reads its "02 - Project Photos" subfolder, and returns a JSON
// list of image items (newest first) each carrying a Graph THUMBNAIL url (fast
// grid load) + a full-size downloadUrl (click-to-view). No writes, ever.
//
// SECURITY MODEL (for the COO security review):
//  - Behind the auth gate (functions/_middleware.js): no session -> 401 before
//    this code runs. PLUS per-endpoint RBAC: requireArea(session, 'field_ops').
//    Project photos are field-operations media (jobsite pictures). field_ops =
//    admin/partner/business_dev/field_ops, consistent with the other project
//    field-ops surfaces (daily reports, field-upload, field-companion). Contains
//    ZERO financials. field_ops sees them; nothing more sensitive is exposed.
//  - NOT AN OPEN PROXY. The SharePoint drive is FIXED to env.SP_DRIVE_ID on the
//    server. The client supplies ONLY a project number ("NN-NNN"); it NEVER
//    supplies a drive id, path, host, or item id. The target folder is RESOLVED
//    server-side from the number via deterministic path listing + a fixed-shape
//    sub-path. Same "not an open proxy" model as functions/api/field-upload.js.
//  - App-only Graph creds live ONLY in CF env vars (shared minter in
//    functions/lib/graph.js). Never exposed to the browser. The URLs we DO return
//    are Graph's own SHORT-LIVED pre-authenticated thumbnail / download URLs
//    (time-limited, carry no app token) -- the standard, safe way to surface
//    SharePoint media to a browser.
//  - Fails CLOSED: Graph unconfigured (branch preview w/o secrets) -> HTTP 200
//    with an EMPTY list + source:'unconfigured' (the gallery shows a clean "no
//    photos" state, NEVER a fabricated image). A real upstream Graph failure with
//    no warm cache -> 200 empty + a soft error flag (honest empty > broken page).
//  - Folder-not-found (project has no photos folder yet) -> 200 empty list with
//    found:false, so the UI shows "No photos uploaded yet", not an error.
//
// INPUT (query): num = "NN-NNN" (e.g. 26-002)
// OUTPUT (JSON): { ok, found, count, source, photos:[{name,thumbnailUrl,
//                  fullUrl,lastModified,takenDateTime,size}] }

import { requireArea } from '../lib/auth.js';
import { GRAPH, graphConfigured, getGraphToken } from '../lib/graph.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Project number format "NN-NNN" (e.g. 26-002). Bounded; used ONLY for resolution.
const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;

// The fixed SharePoint Field-Operations Projects folder (parent of each project
// root that carries the "02 - Project Photos" subfolder). Verified live against
// the real drive: children are "26-002 - POET - Shelbyville, IN", ... plus a
// "001 - Completed Jobs" child folder.
const FO_PROJECTS_PATH = '05 - Field Operations/01 - Projects';
const COMPLETED_FOLDER_NAME = '001 - Completed Jobs';
// The photos subfolder name inside each project root.
const PHOTOS_SUBFOLDER = '02 - Project Photos';

// Image extensions we surface (lower-case, with dot).
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.gif', '.webp']);

// KV cache (optional, correctness-first): photos change infrequently. 5-min TTL,
// ?refresh=1 forces a fresh Graph read. Namespace bound as PF_SCHEDULE (same KV
// used elsewhere in the platform); we key by project number so entries never
// collide across projects.
const CACHE_TTL_SEC = 300;
const cacheKey = (num) => `project_photos_v1:${num}`;

// Does this folder name belong to the requested project number?
//   name === "26-002"  OR  "26-002 - ..."  OR  "26-002-..."
function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}

// Encode a Graph path: encode each SEGMENT (so spaces/& inside a folder name are
// escaped) but keep the "/" separators LITERAL.
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// List the FOLDER children of a drive item by PATH. Returns [{id,name}] (folders
// only). 404 (missing folder) -> []. Follows @odata.nextLink.
async function listFolderChildrenByPath(env, token, path) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  let url = `${GRAPH}/drives/${driveId}/root:/${encGraphPath(path)}:/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// List the FOLDER children of a drive item by ITEM ID (walk year folders under
// Completed Jobs). 404 -> []. Follows @odata.nextLink.
async function listFolderChildrenById(env, token, itemId) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  let url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Resolve the project folder drive-item id by DETERMINISTIC PATH LISTING (same
// idiom as field-upload.js resolveProjectFolder, but rooted at the FIELD
// OPERATIONS projects tree where the photos live):
//   1. ACTIVE: list children of "05 - Field Operations/01 - Projects" and match.
//   2. COMPLETED fallback: list ".../001 - Completed Jobs" (year folders), then
//      list each year folder and match inside it.
//   3. Nothing -> null.
// Returns { id, name } or null.
async function resolveProjectFolder(env, token, projectNumber) {
  const active = await listFolderChildrenByPath(env, token, FO_PROJECTS_PATH);
  const activeMatch = active.find((f) => nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  const completed = active.find((f) => f.name === COMPLETED_FOLDER_NAME);
  if (completed) {
    const yearFolders = await listFolderChildrenById(env, token, completed.id);
    for (const year of yearFolders) {
      const inYear = await listFolderChildrenById(env, token, year.id);
      const match = inYear.find((f) => nameMatchesProject(f.name, projectNumber));
      if (match) return { id: match.id, name: match.name };
    }
  }
  return null;
}

// Lower-case extension (with dot) of a filename, or ''.
function extOf(name) {
  const s = String(name || '');
  const dot = s.lastIndexOf('.');
  return dot >= 0 ? s.slice(dot).toLowerCase() : '';
}

// List the image children of the photos subfolder (by parent item id), expanding
// thumbnails so the grid can load fast. Returns the raw drive items (files only).
// NOTE: verified live -- requesting `$expand=thumbnails` WITHOUT a `$select`
// returns BOTH @microsoft.graph.downloadUrl AND the thumbnails collection
// (small/medium/large). Adding a $select suppressed the downloadUrl, so we do NOT
// $select here. Follows @odata.nextLink.
async function listPhotoItemsById(env, token, parentId) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  let url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$top=200&$expand=thumbnails`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list photos failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.file && IMG_EXT.has(extOf(it.name))) out.push(it);
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Pick the best available thumbnail url (prefer a mid size for the grid).
function pickThumb(item) {
  const th = (Array.isArray(item.thumbnails) && item.thumbnails[0]) || null;
  if (!th) return null;
  return (th.large && th.large.url) || (th.medium && th.medium.url) || (th.small && th.small.url) || null;
}

// The sort/display date: prefer EXIF photo.takenDateTime, else lastModifiedDateTime.
function photoDate(item) {
  const taken = item.photo && item.photo.takenDateTime;
  return taken || item.lastModifiedDateTime || null;
}

// Shape a drive item into the browser payload (no ids/paths leaked; only Graph's
// own short-lived pre-authenticated media URLs).
function shapePhoto(item) {
  return {
    name: item.name || '',
    thumbnailUrl: pickThumb(item),
    fullUrl: item['@microsoft.graph.downloadUrl'] || null,
    lastModified: item.lastModifiedDateTime || null,
    takenDateTime: (item.photo && item.photo.takenDateTime) || null,
    size: typeof item.size === 'number' ? item.size : null,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;

  // Per-endpoint RBAC (defense-in-depth; the middleware also gates the path).
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  const url = new URL(request.url);
  const num = (url.searchParams.get('num') || '').trim();
  const refresh = url.searchParams.get('refresh') === '1';

  if (!PROJ_NUM_RE.test(num)) {
    return json({ ok: false, error: 'bad_project_number', photos: [], count: 0, found: false }, 400);
  }

  // Graph not configured (e.g. a preview branch without secrets): honest empty,
  // never an error, never a fabricated image.
  if (!graphConfigured(env)) {
    return json({ ok: true, source: 'unconfigured', found: false, count: 0, photos: [] });
  }

  const kv = env.PF_SCHEDULE || null;

  // Cache read (best-effort). Serves the last good payload for TTL; ?refresh=1
  // bypasses. Thumbnail/download URLs are short-lived, so keep the TTL modest.
  if (kv && !refresh) {
    try {
      const cached = await kv.get(cacheKey(num));
      if (cached) {
        const body = JSON.parse(cached);
        body.source = 'cache';
        return json(body);
      }
    } catch (_) { /* cache miss/parse error -> fall through to live */ }
  }

  let token;
  try {
    token = await getGraphToken(env);
  } catch (e) {
    // Token mint failed. Fail closed but honest: empty list + soft error.
    return json({ ok: false, source: 'graph_error', found: false, count: 0, photos: [], error: 'auth' }, 200);
  }

  try {
    const folder = await resolveProjectFolder(env, token, num);
    if (!folder) {
      // Project folder not found in Field Operations tree yet.
      const body = { ok: true, source: 'live', found: false, count: 0, photos: [] };
      return json(body);
    }

    // Find the "02 - Project Photos" subfolder under the project root (by id).
    const subs = await listFolderChildrenById(env, token, folder.id);
    const photosFolder = subs.find((f) => f.name === PHOTOS_SUBFOLDER);
    if (!photosFolder) {
      // Project exists but has no photos folder yet -> clean empty state.
      const body = { ok: true, source: 'live', found: false, count: 0, photos: [], project: folder.name };
      if (kv) { try { await kv.put(cacheKey(num), JSON.stringify(body), { expirationTtl: CACHE_TTL_SEC }); } catch (_) {} }
      return json(body);
    }

    const items = await listPhotoItemsById(env, token, photosFolder.id);
    const photos = items
      .map(shapePhoto)
      .sort((a, b) => {
        const da = Date.parse(a.takenDateTime || a.lastModified || 0) || 0;
        const db = Date.parse(b.takenDateTime || b.lastModified || 0) || 0;
        return db - da; // newest first
      });

    const body = { ok: true, source: 'live', found: true, count: photos.length, photos, project: folder.name };
    if (kv) { try { await kv.put(cacheKey(num), JSON.stringify(body), { expirationTtl: CACHE_TTL_SEC }); } catch (_) {} }
    return json(body);
  } catch (e) {
    // Upstream Graph failure with no warm cache: honest empty, not a broken page.
    return json({ ok: false, source: 'graph_error', found: false, count: 0, photos: [], error: 'read' }, 200);
  }
}
