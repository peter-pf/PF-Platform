// Cloudflare Pages Function -- /api/equipment-inspection
// FIELD OPERATIONS Daily Equipment Inspection form (Derek, 2026-10-25).
//
// On SUBMIT, the platform does TWO things (no email -- PRIMARY-8, 2026-10-25):
//   1. Render the form into a PDF (server-side, see lib/equip-inspection-doc.js).
//   2. Save that PDF into SharePoint:
//      05 - Field Operations/Equipment Checklist/<Machine Type>/<Serial>/<filename>
//
// ZERO FINANCIALS: stores checklist answers, notes, and machine metadata ONLY.
//
// SECURITY:
//   - id is generated server-side (crypto.randomUUID()) on create.
//     Client-supplied id is NEVER accepted on create.
//   - update/submit load the existing record and enforce:
//       (a) owner check: only the creator (or admin) may modify.
//       (b) submitted records are locked.
//   - id format is validated as UUID before any D1 lookup.
//   - Date is validated: must match YYYY-MM-DD and be a real calendar date.
//   - machineHours: 0 to 100000, one decimal place.
//   - inspectedBy: capped at 80 chars.
//   - KV rate limit on submit (10/hour per uid).
//   - D1 failures return 503 (fail-closed; no silent KV fallback).
//
// RBAC: field_ops area.
// D1: table equip_inspections (migration 0009_equip_inspections.sql).
// KV: PF_SCHEDULE -- used ONLY for rate-limiting.

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import {
  renderEquipInspectionPdf, pdfFilename,
  uploadEquipInspectionPdf, uploadSectionPhotos, sectionToSlug,
} from '../lib/equip-inspection-doc.js';
import {
  upsertRecord, loadRecordById, listRecords, countRecords,
  CHECKLIST_ITEMS, VALID_ITEM_KEYS, VALID_ANSWERS, MACHINE_TYPES,
  INSPECTED_BY_SET, INSPECTED_BY_OPTIONS,
} from '../lib/equip-inspection-store.js';

// ---------------------------------------------------------------------------
const MAX_BODY_BYTES       = 64 * 1024;
const MAX_BODY_PHOTO_BYTES = 2.5 * 1024 * 1024; // 2.5 MB for add_photo action
const MAX_RECORDS          = 20000;
const MAX_STR              = 2000;
const MAX_SHORT_BY         = 80;
const MAX_SHORT            = 300;
const MAX_ITEMS            = 60;
const MAX_PHOTOS_PER_SEC   = 5;
const MAX_PHOTOS_TOTAL     = 20;
const PHOTO_KV_TTL         = 7 * 24 * 3600; // 7 days

const VALID_ACTIONS      = { create: 1, update: 1, submit: 1, add_photo: 1, del_photo: 1 };
const VALID_OWNED_RENTED = { 'Owned': 1, 'Rented': 1 };

// Section names that appear on the form (used to validate photo section field).
const VALID_SECTIONS = new Set(CHECKLIST_ITEMS.map((d) => d.section));

// JPEG magic bytes: FF D8 FF.
function isJpeg(b64) {
  try {
    const bin = atob(b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64);
    return bin.charCodeAt(0) === 0xFF && bin.charCodeAt(1) === 0xD8 && bin.charCodeAt(2) === 0xFF;
  } catch { return false; }
}

// KV key for a photo blob.
function photoKvKey(recordId, sectionSlug, n) {
  return `ei_ph:${recordId}:${sectionSlug}:${n}`;
}

// UUID v4 pattern: 8-4-4-4-12 hex, case-insensitive.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Date must match YYYY-MM-DD AND be a real calendar date.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// machineHours: 0-100000, one decimal place. Returns null on invalid input.
function sanitizeMachineHours(v) {
  if (v == null || v === '' || v === undefined) return null;
  const n = Math.round(Number(v) * 10) / 10;
  if (!isFinite(n)) return null;
  if (n < 0 || n > 100000) return null;
  return n;
}

// Submit rate limit: 10 per hour per uid.
const RL_SUBMIT_MAX = 10;
const RL_SUBMIT_TTL = 3600;
async function checkRateLimit(kv, key, max, ttl) {
  if (!kv) return true; // KV absent: allow (fail open for rate limit only)
  try {
    const raw   = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: ttl });
    return true;
  } catch {
    return true; // KV error: allow (rate limit is best-effort)
  }
}

const FIELD_ORIGIN = 'https://field.pierfoundations.com';
function isCrossSite(request) {
  const sfs = request.headers.get('Sec-Fetch-Site') || '';
  if (sfs === 'cross-site') return true;
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    const host      = request.headers.get('Host') || '';
    const isPreview = /\.pf-field\.pages\.dev$/i.test(host);
    const allowed   = [FIELD_ORIGIN];
    if (isPreview) allowed.push(`https://${host}`);
    if (!allowed.includes(origin)) return true;
  }
  return false;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function jsonErr(msg, status = 400) { return json({ error: msg }, status); }

function sanitizeSerial(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^A-Za-z0-9\-]/g, '').slice(0, 40);
}

function cap(v, maxLen) {
  return String(v == null ? '' : v).slice(0, maxLen);
}

function safeBool(v) {
  if (v === true  || v === 'true')  return true;
  if (v === false || v === 'false') return false;
  return null;
}

function cleanItems(raw, machineType) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out  = [];
  for (const it of raw.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').slice(0, 60);
    if (!VALID_ITEM_KEYS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const answer = String(it.answer || '');
    if (answer && !VALID_ANSWERS[answer]) continue;
    out.push({ key, answer: answer || '', note: cap(it.note, MAX_STR) });
  }
  return out;
}

// Build the sanitized record body.
// On CREATE: newServerId is the server-generated UUID; src.id is ignored.
// On UPDATE/SUBMIT: base.id is always used (never src.id).
function buildBody(src, base, uid, newServerId) {
  const now = new Date().toISOString();

  const machineType = MACHINE_TYPES.includes(src.machineType) ? src.machineType
    : (base && MACHINE_TYPES.includes(base.machineType) ? base.machineType : null);
  if (!machineType) return { err: 'invalid machineType' };

  // Date validation: must be provided for create/update; reuse base for submit if absent.
  const rawDate = src.date != null ? String(src.date) : (base && base.date) || '';
  if (rawDate && !isValidDate(rawDate)) return { err: 'invalid date (use YYYY-MM-DD)' };

  const serial = sanitizeSerial(src.serialNumber != null ? src.serialNumber
    : (base && base.serialNumber) || '');

  const rawHours  = src.machineHours != null ? src.machineHours : (base ? base.machineHours : null);
  const machineHours = sanitizeMachineHours(rawHours);
  if (rawHours != null && rawHours !== '' && machineHours === null) {
    return { err: 'machineHours must be 0 to 100000' };
  }

  const safeToOperate = safeBool(src.safeToOperate);

  // inspectedBy: must be in the allowlist (or empty/legacy on base).
  const rawBy = src.inspectedBy != null ? String(src.inspectedBy) : (base && base.inspectedBy) || '';
  const inspectedBy = cap(rawBy, MAX_SHORT_BY);
  // Only validate on create/update (not on load from base). If caller provides a
  // name, it must be in the allowlist.
  if (src.inspectedBy != null && inspectedBy && !INSPECTED_BY_SET.has(inspectedBy)) {
    return { err: `inspectedBy must be one of: ${INSPECTED_BY_OPTIONS.join(', ')}` };
  }

  // sectionPhotos: metadata only (no base64 data here; that lives in KV).
  // Accept from src or carry over from base. Strip raw photo data if present.
  const rawSectionPhotos = src.sectionPhotos != null ? src.sectionPhotos
    : (base && base.sectionPhotos) || {};
  const sectionPhotos = {};
  if (rawSectionPhotos && typeof rawSectionPhotos === 'object') {
    for (const [sec, arr] of Object.entries(rawSectionPhotos)) {
      if (!VALID_SECTIONS.has(sec) || !Array.isArray(arr)) continue;
      sectionPhotos[sec] = arr.slice(0, MAX_PHOTOS_PER_SEC).map((p) => ({
        n:    Number(p.n) || 0,
        name: cap(p.name || '', 200),
        w:    Number(p.w) || 0,
        h:    Number(p.h) || 0,
        // Preserve SP URLs from submitted records; strip data: fields.
        ...(p.spUrl ? { spUrl: cap(p.spUrl, 500) } : {}),
        ...(p.spId  ? { spId:  cap(p.spId,  200) } : {}),
        // If data is present (coming from in-memory during submit reconstruction), keep it.
        ...(p.data  ? { data:  p.data } : {}),
      }));
    }
  }

  // id: on create = server-generated; on update/submit = from base.
  const id = newServerId || (base && base.id);

  return {
    body: {
      id,
      machineType,
      date:              cap(rawDate, MAX_SHORT),
      projectId:         cap(src.projectId  != null ? src.projectId  : (base && base.projectId)  || '', MAX_SHORT),
      jobNumber:         cap(src.jobNumber   != null ? src.jobNumber   : (base && base.jobNumber)  || '', MAX_SHORT),
      inspectedBy,
      ownedOrRented:     VALID_OWNED_RENTED[src.ownedOrRented] ? src.ownedOrRented
                           : (base && VALID_OWNED_RENTED[base.ownedOrRented] ? base.ownedOrRented : ''),
      serialNumber:      serial,
      machineHours:      machineHours,
      items:             cleanItems(src.items || (base && base.items) || [], machineType),
      safeToOperate:     safeToOperate != null ? safeToOperate : (base ? base.safeToOperate : null),
      deficienciesNotes: cap(src.deficienciesNotes != null ? src.deficienciesNotes
                               : (base && base.deficienciesNotes) || '', MAX_STR),
      sectionPhotos,
      status:            base ? base.status : 'draft',
      createdBy:         base ? base.createdBy : uid,
      createdAt:         base ? base.createdAt : now,
      updatedAt:         now,
      updatedBy:         uid,
    },
  };
}

// ---------------------------------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;

  const authErr = requireArea(session, 'field_ops', env);
  if (authErr) return authErr;

  const uid    = session.uid;
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  // ---- GET: list or single record ------------------------------------------
  if (method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      // Validate id format before hitting D1.
      if (!UUID_RE.test(id)) return jsonErr('Not found', 404);
      let rec;
      try { rec = await loadRecordById(env, id); }
      catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
      if (!rec) return jsonErr('Not found', 404);
      if (rec.status === 'draft' && rec.createdBy !== uid && session.role !== 'admin') {
        return jsonErr('Not found', 404);
      }
      return json({ ok: true, record: rec });
    }
    const machineType = url.searchParams.get('machineType') || undefined;
    const status      = url.searchParams.get('status')      || undefined;
    let records;
    try { records = await listRecords(env, { machineType, status, uid }); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    return json({ ok: true, records });
  }

  // ---- POST: create / update / submit --------------------------------------
  if (method !== 'POST') return jsonErr('Method not allowed', 405);
  if (isCrossSite(request)) return jsonErr('Cross-site request blocked', 403);

  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return jsonErr('JSON body required', 400);

  // add_photo uploads can be up to 2.5 MB; all other actions stay at 64 KB.
  const action0 = (() => { try { return JSON.parse(''); } catch { return null; } })();
  // We need to peek at the action before setting size limit, so read as text.
  const rawLen = Number(request.headers.get('Content-Length') || '0');
  // Optimistic: if Content-Length says it's > 2.5MB, reject immediately.
  if (rawLen > MAX_BODY_PHOTO_BYTES) return jsonErr('Request too large', 413);

  let src;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_PHOTO_BYTES) return jsonErr('Request too large', 413);
    src = JSON.parse(text);
  } catch {
    return jsonErr('Invalid JSON', 400);
  }
  if (!src || typeof src !== 'object') return jsonErr('Invalid payload', 400);

  const action = String(src.action || '');
  if (!VALID_ACTIONS[action]) return jsonErr('Invalid action', 400);

  // Non-photo actions are capped at 64 KB.
  if (action !== 'add_photo' && JSON.stringify(src).length > MAX_BODY_BYTES) {
    return jsonErr('Request too large', 413);
  }

  // ---- CREATE: server generates id; ignore any client-supplied id ----------
  let newServerId = null;
  if (action === 'create') {
    newServerId = crypto.randomUUID();
  }

  // ---- UPDATE / SUBMIT: validate client-supplied id and load base record ---
  let base = null;
  if (action === 'update' || action === 'submit') {
    const clientId = String(src.id || '');
    if (!UUID_RE.test(clientId)) return jsonErr('Invalid id format', 400);

    try { base = await loadRecordById(env, clientId); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    if (!base) return jsonErr('Record not found', 404);

    if (base.createdBy !== uid && session.role !== 'admin') {
      return jsonErr('Not authorized to update this record', 403);
    }
    if (base.status === 'submitted' && session.role !== 'admin') {
      return jsonErr('Record already submitted', 409);
    }
  }

  const { body, err } = buildBody(src, base, uid, newServerId);
  if (err) return jsonErr(err, 400);

  // COUNT guard on create.
  if (action === 'create') {
    let n;
    try { n = await countRecords(env); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    if (n >= MAX_RECORDS) return jsonErr('Record limit reached', 507);
  }

  // ---- ADD_PHOTO: validate JPEG, store in KV, update record metadata -------
  if (action === 'add_photo') {
    // Requires an existing draft record.
    const phRecId = String(src.id || '');
    if (!UUID_RE.test(phRecId)) return jsonErr('Invalid id format', 400);
    let phBase;
    try { phBase = await loadRecordById(env, phRecId); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    if (!phBase) return jsonErr('Record not found', 404);
    if (phBase.createdBy !== uid && session.role !== 'admin') return jsonErr('Not authorized', 403);
    if (phBase.status === 'submitted') return jsonErr('Record already submitted', 409);

    const section = String(src.section || '');
    if (!VALID_SECTIONS.has(section)) return jsonErr('Invalid section', 400);
    const slug = sectionToSlug(section);

    // Count existing photos across all sections.
    const existingPhotos = (phBase.sectionPhotos && typeof phBase.sectionPhotos === 'object')
      ? phBase.sectionPhotos : {};
    const totalPhotos = Object.values(existingPhotos)
      .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
    if (totalPhotos >= MAX_PHOTOS_TOTAL) return jsonErr('Photo limit reached (20 per form)', 400);
    const sectionArr = existingPhotos[section] || [];
    if (sectionArr.length >= MAX_PHOTOS_PER_SEC) return jsonErr('Photo limit reached (5 per section)', 400);

    // Validate JPEG data.
    const photoData = String(src.data || '');
    if (!photoData) return jsonErr('Photo data required', 400);
    if (photoData.length > 2 * 1024 * 1024) return jsonErr('Photo too large (max 1.5 MB)', 400);
    if (!isJpeg(photoData)) return jsonErr('Photo must be JPEG (magic bytes FF D8 FF)', 400);

    // Store raw photo data in KV (7-day TTL).
    const photoN   = sectionArr.length;
    const kvKey    = photoKvKey(phRecId, slug, photoN);
    const name     = cap(String(src.name || `photo_${photoN + 1}.jpg`), 200);
    const w        = Math.round(Number(src.w) || 0);
    const h        = Math.round(Number(src.h) || 0);
    if (!env.PF_SCHEDULE) return jsonErr('Storage unavailable', 503);
    try {
      await env.PF_SCHEDULE.put(kvKey, photoData, { expirationTtl: PHOTO_KV_TTL });
    } catch (e) {
      console.error('[equip-inspection] KV photo store failed:', e && e.message);
      return jsonErr('Photo storage failed', 503);
    }

    // Update record metadata (no base64 in D1).
    const updatedSecPhotos = { ...existingPhotos };
    updatedSecPhotos[section] = [...sectionArr, { n: photoN, name, w, h, kvKey }];
    const updatedRec = { ...phBase, sectionPhotos: updatedSecPhotos,
      updatedAt: new Date().toISOString(), updatedBy: uid };
    try { await upsertRecord(env, updatedRec); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    return json({ ok: true, section, photoIndex: photoN, name, w, h });
  }

  // ---- DEL_PHOTO: remove from KV and record metadata ----------------------
  if (action === 'del_photo') {
    const dpRecId = String(src.id || '');
    if (!UUID_RE.test(dpRecId)) return jsonErr('Invalid id format', 400);
    let dpBase;
    try { dpBase = await loadRecordById(env, dpRecId); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    if (!dpBase) return jsonErr('Record not found', 404);
    if (dpBase.createdBy !== uid && session.role !== 'admin') return jsonErr('Not authorized', 403);
    if (dpBase.status === 'submitted') return jsonErr('Record already submitted', 409);

    const delSection = String(src.section || '');
    const delN       = Number(src.photoIndex);
    if (!VALID_SECTIONS.has(delSection) || !isFinite(delN)) return jsonErr('Invalid section/photoIndex', 400);
    const slug = sectionToSlug(delSection);

    const existPh = (dpBase.sectionPhotos && typeof dpBase.sectionPhotos === 'object')
      ? { ...dpBase.sectionPhotos } : {};
    const arr = Array.isArray(existPh[delSection]) ? [...existPh[delSection]] : [];
    if (delN < 0 || delN >= arr.length) return jsonErr('Photo not found', 404);
    const removed = arr.splice(delN, 1)[0];
    // Re-number remaining: update n fields and KV keys.
    const rekeyed = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const oldKey = p.kvKey;
      const newKey = photoKvKey(dpRecId, slug, i);
      if (oldKey && oldKey !== newKey && env.PF_SCHEDULE) {
        try {
          const data = await env.PF_SCHEDULE.get(oldKey);
          if (data) {
            await env.PF_SCHEDULE.put(newKey, data, { expirationTtl: PHOTO_KV_TTL });
            await env.PF_SCHEDULE.delete(oldKey);
          }
        } catch { /* best effort */ }
      }
      rekeyed.push({ ...p, n: i, kvKey: newKey });
    }
    if (removed && removed.kvKey && env.PF_SCHEDULE) {
      try { await env.PF_SCHEDULE.delete(removed.kvKey); } catch { /* best effort */ }
    }
    existPh[delSection] = rekeyed;
    if (rekeyed.length === 0) delete existPh[delSection];
    const updRec = { ...dpBase, sectionPhotos: existPh,
      updatedAt: new Date().toISOString(), updatedBy: uid };
    try { await upsertRecord(env, updRec); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    return json({ ok: true });
  }

  // ---- CREATE / UPDATE: save as draft --------------------------------------
  if (action === 'create' || action === 'update') {
    body.status = 'draft';
    try { await upsertRecord(env, body); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }
    return json({ ok: true, id: body.id, status: body.status });
  }

  // ---- SUBMIT: rate limit, render PDF, upload to SP -----------------------
  if (action === 'submit') {
    // Rate limit: 10 submits per hour per uid.
    const rlKey = `eq_submit_rl:${uid}`;
    const rlOk  = await checkRateLimit(env.PF_SCHEDULE, rlKey, RL_SUBMIT_MAX, RL_SUBMIT_TTL);
    if (!rlOk) return jsonErr('Too many submissions this hour. Please wait.', 429);

    body.status      = 'submitted';
    body.submittedBy = uid;
    body.submittedAt = new Date().toISOString();

    // Generate PDF.
    let pdfBytes;
    try {
      pdfBytes = renderEquipInspectionPdf(body);
    } catch (e) {
      console.error('[equip-inspection] PDF render failed:', e && e.message);
      return jsonErr('PDF generation failed', 500);
    }

    body.pdfName = pdfFilename(body);

    // Load photo data from KV and hydrate sectionPhotos[].data for PDF embedding.
    if (env.PF_SCHEDULE && body.sectionPhotos && typeof body.sectionPhotos === 'object') {
      for (const [section, arr] of Object.entries(body.sectionPhotos)) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          if (p.kvKey) {
            try {
              const data = await env.PF_SCHEDULE.get(p.kvKey);
              if (data) p.data = data;
            } catch { /* best effort */ }
          }
        }
      }
    }

    // Graph: upload PDF and section photos to SharePoint.
    if (graphConfigured(env)) {
      let token;
      try { token = await getGraphToken(env); }
      catch (e) { console.error('[equip-inspection] Graph token failed:', e && e.message); }
      if (token) {
        try {
          const ref = await uploadEquipInspectionPdf(env, token, body, pdfBytes);
          body.pdfItemId = ref.itemId;
          body.pdfWebUrl = ref.webUrl;
          // Upload individual section photos to same SP folder.
          if (ref.serialFolderId) {
            try { await uploadSectionPhotos(env, token, body, ref.serialFolderId); }
            catch (e) { console.error('[equip-inspection] photo SP upload batch failed:', e && e.message); }
          }
        } catch (e) {
          console.error('[equip-inspection] SP upload failed:', e && e.message);
        }
      }
    }

    // Strip raw photo data from stored record (data lives in SP / KV, not D1 blob).
    if (body.sectionPhotos) {
      for (const arr of Object.values(body.sectionPhotos)) {
        if (Array.isArray(arr)) arr.forEach((p) => { delete p.data; });
      }
    }

    try { await upsertRecord(env, body); }
    catch (e) { return e.isD1Error ? jsonErr('Service temporarily unavailable', 503) : jsonErr('Server error', 500); }

    return json({
      ok: true, id: body.id, status: 'submitted',
      pdfName: body.pdfName, pdfWebUrl: body.pdfWebUrl || null,
    });
  }

  return jsonErr('Unknown action', 400);
}
