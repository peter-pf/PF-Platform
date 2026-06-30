// Cloudflare Pages Function -- /api/field-upload
// FIELD OPERATIONS raw-file upload to SharePoint via Microsoft Graph. The daily
// report form lets a foreman attach Hand Logs (paper QA/QC scans/photos) and GUHM
// Data (the raw .guh column-logger export) for the day. We stream the bytes
// straight to SharePoint into the project's QAQC folder, dated, bucketed by type,
// and return drive-item refs that get stored on the daily report record.
//
// SECURITY MODEL (for the COO security review):
//  - Behind the auth gate (functions/_middleware.js): no session -> 401 before
//    this code runs. PLUS per-endpoint RBAC: requireArea(session, 'field_ops') on
//    POST (the crew can upload; field_ops area exposes ZERO financials).
//  - NOT AN OPEN PROXY. The SharePoint drive is FIXED to env.SP_DRIVE_ID on the
//    server. The client NEVER supplies a drive id, path, host, or item id for the
//    upload target. The destination folder is RESOLVED server-side from the
//    project number via Graph search and a server-built, fixed-shape sub-path.
//    Same "not an open proxy" model as functions/api/doc.js.
//  - App-only Graph creds live ONLY in CF env vars (shared minter in
//    functions/lib/graph.js). Never exposed to the browser.
//  - Fails CLOSED: any of AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID
//    / SP_DRIVE_ID missing -> 503 (never silently proxy on a misconfiguration).
//  - HARD UPLOAD LIMITS: per-file <= 50MB, <= 25 files per request, extension
//    allow-list only, filename sanitized to a safe basename (no path separators,
//    no "..", no leading dots), conflictBehavior 'rename' so an upload can NEVER
//    overwrite an existing original. The bucket is a fixed enum ('handlogs' |
//    'guhma') -- not a free path. reportDate is validated to YYYY-MM-DD.
//
// INPUT (multipart/form-data):
//   projectNumber : "NN-NNN" (used to RESOLVE the project folder via search)
//   projectName   : bare project name (audit/echo only; never used to build paths)
//   bucket        : 'handlogs' | 'guhma'
//   reportDate    : 'YYYY-MM-DD'
//   file          : one or more file parts (repeat the field name)
//
// OUTPUT (JSON): { ok:true, refs:[{name,itemId,webUrl,bucket}], errors:[...] }

import { requireArea } from '../lib/auth.js';
import { GRAPH, graphConfigured, getGraphToken } from '../lib/graph.js';

// ---- limits / allow-list ---------------------------------------------------
const MAX_FILE_BYTES = 50 * 1024 * 1024;   // 50MB per file
const MAX_FILES = 25;                       // per request
const MAX_NAME_LEN = 200;                   // sanitized basename cap
const CHUNK_BYTES = 20 * 320 * 1024;        // 6.4MiB per Content-Range slice (multiple of 320KiB)
// Early whole-request guard (Content-Length). 25 files x 50MB is the theoretical
// max payload; ~120MB is a sane ceiling that stops an absurd request before we
// ever read the multipart body. The per-file 50MB cap still applies after parse.
const MAX_REQUEST_BYTES = 120 * 1024 * 1024;

// Project number format "NN-NNN" (e.g. 26-015). Bounded; used ONLY for search.
const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Allowed file extensions (lower-case, with dot). Reject anything else.
const ALLOWED_EXT = new Set(['.guh', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.zip', '.xlsx']);

// bucket key -> the human folder name created under the dated QAQC folder.
const BUCKETS = { handlogs: 'Hand Logs', guhma: 'GUHMA Data' };

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Sanitize an uploaded filename to a SAFE basename:
//  - take the last path segment only (strip any \ or / the client may inject)
//  - drop ".." and leading dots (no hidden files / traversal)
//  - keep only a conservative character set; collapse the rest to '_'
//  - enforce a length cap, preserving the (validated) extension
function safeBaseName(raw) {
  let name = String(raw == null ? '' : raw);
  // last segment after any kind of slash
  name = name.split(/[\\/]/).pop() || '';
  // strip control chars + anything other than a safe set
  name = name.replace(/[^A-Za-z0-9._ \-()]/g, '_');
  // collapse runs of dots so ".." (traversal) cannot survive, kill leading dots
  name = name.replace(/\.{2,}/g, '.').replace(/^\.+/, '');
  name = name.trim();
  if (!name) return '';
  if (name.length > MAX_NAME_LEN) {
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      const ext = name.slice(dot);
      name = name.slice(0, Math.max(1, MAX_NAME_LEN - ext.length)) + ext;
    } else {
      name = name.slice(0, MAX_NAME_LEN);
    }
  }
  return name;
}

function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

// The fixed SharePoint Projects folder (the parent of every project root).
const PROJECTS_PATH = '04 - Project Management/02 - Projects';
const COMPLETED_FOLDER_NAME = '001 - Completed Projects';

// Does this folder name belong to the requested project number?
//   name === "26-002"  OR  "26-002 - ..."  OR  "26-002-..."
function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}

// Encode a Graph path: encode each SEGMENT (so spaces/& inside a folder name are
// escaped) but keep the "/" separators LITERAL. encodeURIComponent on the whole
// string would turn "/" into %2F and break path addressing.
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// List the FOLDER children of a drive item by PATH. Graph path addressing is
// /drives/{id}/root:/<path>:/children -- each path SEGMENT is URL-encoded, the
// "/" separators and the wrapping colons are literal. Follows @odata.nextLink.
// Returns an array of {id, name, folder} (folders only).
async function listFolderChildrenByPath(env, token, path) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const encPath = encGraphPath(path); // per-segment encode, literal "/" separators
  let url = `${GRAPH}/drives/${driveId}/root:/${encPath}:/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;     // missing folder -> no children
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name, folder: it.folder });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// List the FOLDER children of a drive item by its ITEM ID (used to walk into the
// year folders under Completed Projects). Follows @odata.nextLink.
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
      if (it && it.folder) out.push({ id: it.id, name: it.name, folder: it.folder });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Resolve the project folder drive-item id by DETERMINISTIC PATH LISTING.
//
// Graph's root/search(q=...) is fuzzy full-text and was verified NOT to reliably
// surface the exact project folder (it returned loosely-related items and dropped
// the real one; parentReference.path also came back empty). So instead we LIST
// the fixed Projects folder and prefix-match the project number directly:
//   1. ACTIVE: list children of "04 - Project Management/02 - Projects" and match.
//      The active project roots ("26-002 - POET Projects - POET", ...) live here
//      directly, alongside a "001 - Completed Projects" child folder.
//   2. COMPLETED fallback: list "02 - Projects/001 - Completed Projects" (YEAR
//      folders, e.g. "2026"), then list each year folder and match inside it.
//   3. Nothing -> null (caller 404s with the clear message).
// Active wins by construction (step 1 before step 2). Returns { id, name } or null.
async function resolveProjectFolder(env, token, projectNumber) {
  // ---- 1. ACTIVE project tree ----
  const active = await listFolderChildrenByPath(env, token, PROJECTS_PATH);
  const activeMatch = active.find((f) => nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  // ---- 2. COMPLETED projects fallback (year folders -> project folders) ----
  const completedPath = `${PROJECTS_PATH}/${COMPLETED_FOLDER_NAME}`;
  const yearFolders = await listFolderChildrenByPath(env, token, completedPath);
  for (const year of yearFolders) {
    const inYear = await listFolderChildrenById(env, token, year.id);
    const match = inYear.find((f) => nameMatchesProject(f.name, projectNumber));
    if (match) return { id: match.id, name: match.name };
  }

  // ---- 3. not found ----
  return null;
}

// Find an existing child FOLDER with this exact name under `parentId`, or null.
async function findChildFolder(env, token, parentId, name) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const listUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=999`;
  const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listResp.ok) return null;
  const data = await listResp.json();
  const existing = (Array.isArray(data && data.value) ? data.value : [])
    .find((it) => it && it.folder && it.name === name);
  return existing ? existing.id : null;
}

// Get-or-create a single child folder named `name` under parent item `parentId`.
// [ROBUSTNESS] We list first (idempotent), and CREATE with conflictBehavior
// 'fail' so two concurrent same-day uploads do NOT fork "<date>" and "<date> 1".
// If the create 409s (a racing request created it first), we re-list and reuse
// the now-existing folder id, collapsing both requests onto ONE folder.
async function ensureChildFolder(env, token, parentId, name) {
  const found = await findChildFolder(env, token, parentId, name);
  if (found) return found;

  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const createUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children`;
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (createResp.status === 409) {
    // A concurrent request won the race and created it. Re-list and reuse.
    const reuse = await findChildFolder(env, token, parentId, name);
    if (reuse) return reuse;
    throw new Error('folder conflict but folder not found on re-list');
  }
  if (!createResp.ok) throw new Error('folder create failed ' + createResp.status);
  const created = await createResp.json();
  return created.id;
}

// Ensure the full destination path exists under the project folder and return the
// final (bucket) folder id:
//   <projectFolder>/03 - Engineering & Design/QAQC/<reportDate>/<bucket folder>
async function ensureDestination(env, token, projectFolderId, reportDate, bucketFolder) {
  const eng = await ensureChildFolder(env, token, projectFolderId, '03 - Engineering & Design');
  const qaqc = await ensureChildFolder(env, token, eng, 'QAQC');
  const dated = await ensureChildFolder(env, token, qaqc, reportDate);
  const bucket = await ensureChildFolder(env, token, dated, bucketFolder);
  return bucket;
}

// Upload one file via a Graph UPLOAD SESSION (chunked). Simple PUT caps ~4MB and
// our files can be 16-21MB+, so we always use a session. conflictBehavior
// 'rename' so an upload NEVER overwrites an existing original. Returns the final
// driveItem ({id, name, webUrl}).
async function uploadViaSession(env, token, folderId, fileName, bytes) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  // createUploadSession on the new item path under the folder.
  const sessUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(fileName)}:/createUploadSession`;
  const sessResp = await fetch(sessUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } }),
  });
  if (!sessResp.ok) throw new Error('createUploadSession failed ' + sessResp.status);
  const sess = await sessResp.json();
  const uploadUrl = sess.uploadUrl;
  if (!uploadUrl) throw new Error('no uploadUrl in session');

  const total = bytes.length;
  let offset = 0;
  let last = null;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_BYTES, total);
    const slice = bytes.subarray(offset, end);
    // NOTE: the upload session URL is pre-authenticated (carries its own token in
    // the query string); we do NOT send the Authorization header to it.
    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: slice,
    });
    if (putResp.status === 200 || putResp.status === 201) {
      last = await putResp.json(); // final chunk returns the driveItem
    } else if (putResp.status === 202) {
      // accepted, more chunks expected; body has nextExpectedRanges (ignored)
    } else {
      throw new Error('chunk upload failed ' + putResp.status);
    }
    offset = end;
  }
  if (!last) throw new Error('upload completed without a final item');
  return { id: last.id, name: last.name, webUrl: last.webUrl };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;

  // [RBAC] field_ops area = admin/partner/business_dev/field_ops. Crew can upload.
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  // [fail closed] Graph creds + fixed drive id must all be present.
  if (!graphConfigured(env)) {
    return json({ status: 'error', message: 'Upload is unavailable: the server is not configured.' }, 503);
  }

  try {
    // [SEC LOW-02] Early whole-request guard: reject an oversized upload by its
    // Content-Length BEFORE we read/parse the multipart body. Mirrors the
    // Content-Length guard in daily-report.js. The per-file 50MB cap still applies.
    const reqLen = Number(request.headers.get('Content-Length') || '0');
    if (reqLen > MAX_REQUEST_BYTES) {
      return json({ status: 'error', message: 'Upload is too large.' }, 413);
    }

    const ct = request.headers.get('Content-Type') || '';
    if (!ct.toLowerCase().includes('multipart/form-data')) {
      return json({ status: 'error', message: 'Expected multipart/form-data.' }, 400);
    }

    let form;
    try { form = await request.formData(); }
    catch { return json({ status: 'error', message: 'Could not read the upload.' }, 400); }

    const projectNumber = String(form.get('projectNumber') || '').trim();
    const projectName = String(form.get('projectName') || '').slice(0, 200);
    const bucketKey = String(form.get('bucket') || '').trim().toLowerCase();
    const reportDate = String(form.get('reportDate') || '').trim();

    if (!PROJ_NUM_RE.test(projectNumber)) {
      return json({ status: 'error', message: 'A valid project number is required.' }, 400);
    }
    if (!Object.prototype.hasOwnProperty.call(BUCKETS, bucketKey)) {
      return json({ status: 'error', message: "bucket must be 'handlogs' or 'guhma'." }, 400);
    }
    if (!DATE_RE.test(reportDate)) {
      return json({ status: 'error', message: 'A valid report date (YYYY-MM-DD) is required.' }, 400);
    }
    // Defense in depth: confirm the date actually parses to that same calendar day.
    const d = new Date(reportDate + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== reportDate) {
      return json({ status: 'error', message: 'Invalid report date.' }, 400);
    }

    // Gather file parts. The client repeats the field name "file".
    const parts = form.getAll('file').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
    if (!parts.length) {
      return json({ status: 'error', message: 'No files were provided.' }, 400);
    }
    if (parts.length > MAX_FILES) {
      return json({ status: 'error', message: `Too many files (max ${MAX_FILES} per upload).` }, 413);
    }

    const token = await getGraphToken(env);

    // Resolve the project folder ONCE, then ensure the dated bucket path.
    const proj = await resolveProjectFolder(env, token, projectNumber);
    if (!proj) {
      return json({ status: 'error', message: 'Could not find that project folder in SharePoint.' }, 404);
    }
    const bucketFolderName = BUCKETS[bucketKey];
    const destFolderId = await ensureDestination(env, token, proj.id, reportDate, bucketFolderName);

    const refs = [];
    const errors = [];
    for (const part of parts) {
      const safeName = safeBaseName(part.name);
      if (!safeName) { errors.push({ name: String(part.name || ''), error: 'Unsafe or empty filename.' }); continue; }
      const ext = extOf(safeName);
      if (!ALLOWED_EXT.has(ext)) { errors.push({ name: safeName, error: 'File type not allowed.' }); continue; }

      const buf = new Uint8Array(await part.arrayBuffer());
      if (buf.length === 0) { errors.push({ name: safeName, error: 'Empty file.' }); continue; }
      if (buf.length > MAX_FILE_BYTES) { errors.push({ name: safeName, error: 'File exceeds 50MB.' }); continue; }

      try {
        const item = await uploadViaSession(env, token, destFolderId, safeName, buf);
        refs.push({ name: item.name, itemId: item.id, webUrl: item.webUrl, bucket: bucketKey });
      } catch (e) {
        console.error('field-upload single-file error:', e && e.message);
        errors.push({ name: safeName, error: 'Upload failed.' });
      }
    }

    if (!refs.length) {
      return json({ status: 'error', message: 'No files were uploaded.', errors }, 502);
    }
    return json({ ok: true, refs, errors, project: { number: projectNumber, name: projectName, folder: proj.name } });
  } catch (err) {
    console.error('api/field-upload error:', err && err.message);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
