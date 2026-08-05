// Cloudflare Pages Function -- /api/project-photos
// FIELD OPERATIONS site-photo pull for the daily report. Given a project number
// and a date, this lists that project's "Project Photos" folder (in the top-level
// Field Operations tree) and returns the PHOTOS TAKEN THAT DAY so the daily
// report form can render a thumbnail strip of the day's jobsite pictures.
//
// SECURITY MODEL (for the COO security review):
//  - Behind the auth gate (functions/_middleware.js): no session -> 401 before
//    this code runs. PLUS per-endpoint RBAC: requireArea(session, 'field_ops').
//    field_ops area = admin/partner/business_dev/field_ops. READ-ONLY.
//  - NOT AN OPEN PROXY. The SharePoint drive is FIXED to env.SP_DRIVE_ID on the
//    server. The client supplies ONLY a project number (NN-NNN, validated) and a
//    date (YYYY-MM-DD, validated). The destination folder is RESOLVED server-side
//    from the project number by listing a fixed, server-built path -- the client
//    never supplies a drive id, item id, host, or path. Same model as
//    functions/api/field-upload.js.
//  - App-only Graph creds live ONLY in CF env vars (functions/lib/graph.js).
//  - Fails CLOSED: any of the Graph env vars missing -> 503.
//  - ZERO financials: photo file metadata + thumbnail URLs only.
//
// INPUT (query string):
//   projectNumber : "NN-NNN"       (used to RESOLVE the project folder)
//   date          : "YYYY-MM-DD"   (the report day; photos are filtered to it)
//
// OUTPUT (JSON):
//   { ok:true, photos:[{name,itemId,webUrl,thumbnailUrl,takenBasis}], count, folder }
//
// "THAT DAY" is determined per photo: prefer the crew filename date prefix
// (YYYYMMDD_..., e.g. 20260804_114208.jpg -> 2026-08-04), and fall back to the
// item's createdDateTime (upload time) when the filename has no date prefix.

import { requireArea } from '../lib/auth.js';
import { GRAPH, graphConfigured, getGraphToken } from '../lib/graph.js';

const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The Field Operations tree (same as field-upload.js's photo path).
const FIELD_OPS_PROJECTS_PATH = '05 - Field Operations/01 - Projects';
const FIELD_OPS_COMPLETED_FOLDER_NAME = '001 - Completed Jobs';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}
function isPhotoFolderName(name) {
  return typeof name === 'string' && /project photos\s*$/i.test(name.trim());
}
// Image extensions we surface as photos in the strip.
function isImageName(name) {
  return typeof name === 'string' && /\.(jpe?g|png|heic)$/i.test(name.trim());
}

// Encode a Graph path per-segment, keeping "/" separators literal.
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// List folder children by PATH (folders only when filterFolders). Follows nextLink.
async function listChildrenByPath(env, token, path, select) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const encPath = encGraphPath(path);
  let url = `${GRAPH}/drives/${driveId}/root:/${encPath}:/children?$select=${encodeURIComponent(select)}&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children by path failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => out.push(it));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// List folder children by ITEM ID. Optional $expand (e.g. thumbnails). nextLink.
async function listChildrenById(env, token, itemId, select, expand) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const exp = expand ? `&$expand=${encodeURIComponent(expand)}` : '';
  let url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}/children?$select=${encodeURIComponent(select)}${exp}&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children by id failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => out.push(it));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Resolve the Field-Ops project folder by NN-NNN prefix, with a completed
// fallback. Twin of field-upload.js resolveFieldOpsProjectFolder.
async function resolveFieldOpsProjectFolder(env, token, projectNumber) {
  const active = await listChildrenByPath(env, token, FIELD_OPS_PROJECTS_PATH, 'name,id,folder');
  const activeMatch = active.find((f) => f.folder && nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  const completedPath = `${FIELD_OPS_PROJECTS_PATH}/${FIELD_OPS_COMPLETED_FOLDER_NAME}`;
  const yearFolders = await listChildrenByPath(env, token, completedPath, 'name,id,folder');
  for (const year of yearFolders) {
    if (!year.folder) continue;
    if (nameMatchesProject(year.name, projectNumber)) return { id: year.id, name: year.name };
    const inYear = await listChildrenById(env, token, year.id, 'name,id,folder');
    const match = inYear.find((f) => f.folder && nameMatchesProject(f.name, projectNumber));
    if (match) return { id: match.id, name: match.name };
  }
  return null;
}

// Find the child folder ending in "Project Photos".
async function resolvePhotoFolder(env, token, projectFolderId) {
  const kids = await listChildrenById(env, token, projectFolderId, 'name,id,folder');
  const match = kids.find((f) => f.folder && isPhotoFolderName(f.name));
  return match ? { id: match.id, name: match.name } : null;
}

// The photo's "day": prefer a YYYYMMDD_ filename prefix (crew camera naming),
// fall back to createdDateTime (upload time) as a UTC calendar day.
function photoDay(item) {
  const m = /^(\d{4})(\d{2})(\d{2})[_\-.]/.exec(String(item && item.name || ''));
  if (m) return { day: `${m[1]}-${m[2]}-${m[3]}`, basis: 'filename' };
  const c = item && item.createdDateTime;
  if (c) {
    const dt = new Date(c);
    if (!Number.isNaN(dt.getTime())) return { day: dt.toISOString().slice(0, 10), basis: 'created' };
  }
  return { day: null, basis: 'unknown' };
}

// Pull a usable thumbnail URL out of the expanded thumbnails collection.
function thumbUrl(item) {
  const t = item && Array.isArray(item.thumbnails) ? item.thumbnails[0] : null;
  if (!t) return '';
  const pick = t.large || t.medium || t.small;
  const u = pick && pick.url ? String(pick.url) : '';
  return /^https:\/\//i.test(u) ? u : '';
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;

  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (!graphConfigured(env)) {
    return json({ status: 'error', message: 'Photos are unavailable: the server is not configured.' }, 503);
  }

  try {
    const url = new URL(request.url);
    const projectNumber = String(url.searchParams.get('projectNumber') || '').trim();
    const date = String(url.searchParams.get('date') || '').trim();

    if (!PROJ_NUM_RE.test(projectNumber)) {
      return json({ status: 'error', message: 'A valid project number is required.' }, 400);
    }
    if (!DATE_RE.test(date)) {
      return json({ status: 'error', message: 'A valid date (YYYY-MM-DD) is required.' }, 400);
    }

    const token = await getGraphToken(env);

    const proj = await resolveFieldOpsProjectFolder(env, token, projectNumber);
    if (!proj) {
      return json({ status: 'error', message: 'Could not find that project in the Field Operations area.' }, 404);
    }
    const photoFolder = await resolvePhotoFolder(env, token, proj.id);
    if (!photoFolder) {
      // No photo folder -> return an empty (honest) set, not an error, so the
      // daily-report UI simply shows "no photos" rather than a failure.
      return json({ ok: true, photos: [], count: 0, folder: null, note: 'No Project Photos folder for this project.' });
    }

    const items = await listChildrenById(
      env, token, photoFolder.id,
      'name,id,webUrl,file,createdDateTime', 'thumbnails',
    );

    const photos = [];
    for (const it of items) {
      if (it.folder) continue;                 // skip subfolders
      if (!isImageName(it.name)) continue;      // photos only
      const { day, basis } = photoDay(it);
      if (day !== date) continue;               // only that day's photos
      const webUrl = /^https:\/\//i.test(String(it.webUrl || '')) ? it.webUrl : '';
      photos.push({
        name: it.name,
        itemId: it.id,
        webUrl,
        thumbnailUrl: thumbUrl(it),
        takenBasis: basis,
      });
    }
    // Newest-looking first (filename/time order is naturally chronological; sort
    // by name descending groups the day's shots latest-first).
    photos.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

    return json({ ok: true, photos, count: photos.length, folder: photoFolder.name, project: proj.name });
  } catch (err) {
    console.error('api/project-photos error:', err && err.message);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
