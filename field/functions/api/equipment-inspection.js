// Cloudflare Pages Function -- /api/equipment-inspection
// FIELD OPERATIONS Daily Equipment Inspection form (Derek, 2026-10-25).
//
// On SUBMIT, the platform does THREE things:
//   1. Render the form into a PDF (server-side, see lib/equip-inspection-doc.js).
//   2. Auto-email that PDF to a mailing list (Graph sendMail AS peter@).
//   3. Save the same PDF into SharePoint:
//      05 - Field Operations/Equipment Checklist/<Machine Type>/<Serial>/<filename>
//
// ZERO FINANCIALS: this endpoint stores checklist answers, notes, and machine
// metadata ONLY. No dollar amounts, rates, or costs.
//
// DATA MODEL:
//   equip_inspections_v1 -> JSON { records:[{
//     id, machineType, date, projectId, jobNumber, inspectedBy,
//     ownedOrRented, serialNumber, machineHours,
//     items:[{key, answer, note}],
//     safeToOperate (boolean), deficienciesNotes,
//     status, createdBy, createdAt, updatedAt, updatedBy,
//     submittedBy, submittedAt,
//     pdfName, pdfWebUrl, emailedTo, sentAt
//   }] }
//
// RBAC: field_ops area.
// KV KEY: env.PF_SCHEDULE :: 'equip_inspections_v1'.
// D1: table equip_inspections (migration 0009_equip_inspections.sql -- separate).

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import {
  renderEquipInspectionPdf, pdfFilename,
  sendEquipInspectionEmail, buildEmailBody, uploadEquipInspectionPdf,
} from '../lib/equip-inspection-doc.js';
import {
  upsertRecord, loadRecordById, listRecords, countRecords,
  CHECKLIST_ITEMS, VALID_ITEM_KEYS, VALID_ANSWERS, MACHINE_TYPES,
} from '../lib/equip-inspection-store.js';

// ===========================================================================
// RECIPIENTS -- flip TEST -> PRODUCTION once Derek approves PDF layout
// ===========================================================================
const TEST_RECIPIENTS = ['pfpeter@agentmail.to'];
const PROD_RECIPIENTS = [
  'dfranke@pierfoundations.com',
  'jreinking@pierfoundations.com',
  'breinking@pierfoundations.com',
];
// >>> FLIP HERE <<< : stays TEST until Derek approves layout.
const ACTIVE_RECIPIENTS = TEST_RECIPIENTS;

function resolveRecipients(env) {
  const raw = env && env.EQUIP_INSPECTION_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return ACTIVE_RECIPIENTS;
}

// ---------------------------------------------------------------------------
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RECORDS   = 20000;
const MAX_STR       = 2000;
const MAX_SHORT     = 300;
const MAX_ITEMS     = 60;   // generous cap for all machine types combined

const VALID_ACTIONS = { create: 1, update: 1, submit: 1 };
const VALID_OWNED_RENTED = { 'Owned': 1, 'Rented': 1 };

const FIELD_ORIGIN = 'https://field.pierfoundations.com';
function isCrossSite(request) {
  const sfs = request.headers.get('Sec-Fetch-Site') || '';
  if (sfs === 'cross-site') return true;
  const origin = request.headers.get('Origin') || '';
  if (origin) {
    const host = request.headers.get('Host') || '';
    const isPreview = /\.pf-field\.pages\.dev$/i.test(host);
    const allowed = [FIELD_ORIGIN];
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

// Serial number sanitization: alphanumerics and hyphens only, length cap.
function sanitizeSerial(raw) {
  if (!raw) return '';
  return String(raw).replace(/[^A-Za-z0-9\-]/g, '').slice(0, 40);
}

function cap(v, maxLen) {
  const s = String(v == null ? '' : v);
  return s.slice(0, maxLen);
}

function safeBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

// Clean and validate checklist items array.
function cleanItems(raw, machineType) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const it of raw.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').slice(0, 60);
    if (!VALID_ITEM_KEYS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const answer = String(it.answer || '');
    if (answer && !VALID_ANSWERS[answer]) continue;
    out.push({
      key,
      answer: answer || '',
      note: cap(it.note, MAX_STR),
    });
  }
  return out;
}

function buildBody(src, base, uid) {
  const now = new Date().toISOString();

  const machineType = MACHINE_TYPES.includes(src.machineType) ? src.machineType
    : (base && MACHINE_TYPES.includes(base.machineType) ? base.machineType : null);
  if (!machineType) return { err: 'invalid machineType' };

  const serial = sanitizeSerial(src.serialNumber != null ? src.serialNumber : (base && base.serialNumber) || '');
  const machineHours = src.machineHours != null ? Number(src.machineHours) : (base ? base.machineHours : null);

  const safeToOperate = safeBool(src.safeToOperate);

  return {
    body: {
      id:              base ? base.id : src.id,
      machineType,
      date:            cap(src.date != null ? src.date : (base && base.date) || '', MAX_SHORT),
      projectId:       cap(src.projectId != null ? src.projectId : (base && base.projectId) || '', MAX_SHORT),
      jobNumber:       cap(src.jobNumber != null ? src.jobNumber : (base && base.jobNumber) || '', MAX_SHORT),
      inspectedBy:     cap(src.inspectedBy != null ? src.inspectedBy : (base && base.inspectedBy) || '', MAX_SHORT),
      ownedOrRented:   VALID_OWNED_RENTED[src.ownedOrRented] ? src.ownedOrRented
                         : (base && VALID_OWNED_RENTED[base.ownedOrRented] ? base.ownedOrRented : ''),
      serialNumber:    serial,
      machineHours:    (machineHours != null && !isNaN(machineHours)) ? machineHours : null,
      items:           cleanItems(src.items || (base && base.items) || [], machineType),
      safeToOperate:   safeToOperate != null ? safeToOperate : (base ? base.safeToOperate : null),
      deficienciesNotes: cap(src.deficienciesNotes != null ? src.deficienciesNotes
                               : (base && base.deficienciesNotes) || '', MAX_STR),
      status:          base ? base.status : 'draft',
      createdBy:       base ? base.createdBy : uid,
      createdAt:       base ? base.createdAt : now,
      updatedAt:       now,
      updatedBy:       uid,
    },
  };
}

// ---------------------------------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;

  const authErr = requireArea(session, 'field_ops', env);
  if (authErr) return authErr;

  const uid = session.uid;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // ---- GET: list or fetch single record ------------------------------------
  if (method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      const rec = await loadRecordById(env, id);
      if (!rec) return jsonErr('Not found', 404);
      // Drafts scoped to owner
      if (rec.status === 'draft' && rec.createdBy !== uid && session.role !== 'admin') {
        return jsonErr('Not found', 404);
      }
      return json({ ok: true, record: rec });
    }
    const machineType = url.searchParams.get('machineType') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const records = await listRecords(env, { machineType, status, uid });
    return json({ ok: true, records });
  }

  // ---- POST: create / update / submit -------------------------------------
  if (method !== 'POST') return jsonErr('Method not allowed', 405);
  if (isCrossSite(request)) return jsonErr('Cross-site request blocked', 403);

  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return jsonErr('JSON body required', 400);

  const rawLen = Number(request.headers.get('Content-Length') || '0');
  if (rawLen > MAX_BODY_BYTES) return jsonErr('Request too large', 413);

  let src;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return jsonErr('Request too large', 413);
    src = JSON.parse(text);
  } catch {
    return jsonErr('Invalid JSON', 400);
  }
  if (!src || typeof src !== 'object') return jsonErr('Invalid payload', 400);

  const action = String(src.action || '');
  if (!VALID_ACTIONS[action]) return jsonErr('Invalid action', 400);

  const id = String(src.id || '');
  if (!id) return jsonErr('id required', 400);

  // Load existing for updates/submits
  let base = null;
  if (action === 'update' || action === 'submit') {
    base = await loadRecordById(env, id);
    if (!base) return jsonErr('Record not found', 404);
    // Owner check: only the creator (or admin) may update/submit
    if (base.createdBy !== uid && session.role !== 'admin') {
      return jsonErr('Not authorized to update this record', 403);
    }
    // Submitted records are locked
    if (base.status === 'submitted' && session.role !== 'admin') {
      return jsonErr('Record already submitted', 409);
    }
  }

  const { body, err } = buildBody(src, base, uid);
  if (err) return jsonErr(err, 400);

  // COUNT guard
  if (action === 'create') {
    const n = await countRecords(env);
    if (n >= MAX_RECORDS) return jsonErr('Record limit reached', 507);
  }

  if (action === 'create' || action === 'update') {
    body.status = 'draft';
    await upsertRecord(env, body);
    return json({ ok: true, id: body.id, status: body.status });
  }

  // ---- SUBMIT: render PDF, email, upload to SP ----------------------------
  if (action === 'submit') {
    body.status = 'submitted';
    body.submittedBy = uid;
    body.submittedAt = new Date().toISOString();

    // Generate PDF
    let pdfBytes;
    try {
      pdfBytes = renderEquipInspectionPdf(body);
    } catch (e) {
      console.error('[equip-inspection] PDF render failed:', e && e.message);
      return jsonErr('PDF generation failed', 500);
    }

    const filename = pdfFilename(body);
    body.pdfName = filename;

    // Graph: email + upload (non-blocking on failure, but logged)
    if (graphConfigured(env)) {
      let token;
      try { token = await getGraphToken(env); } catch (e) {
        console.error('[equip-inspection] Graph token failed:', e && e.message);
      }
      if (token) {
        const recipients = resolveRecipients(env);
        // Email
        try {
          await sendEquipInspectionEmail(token, body, pdfBytes, recipients);
          body.emailedTo = recipients.join(',');
          body.sentAt = new Date().toISOString();
        } catch (e) {
          console.error('[equip-inspection] sendMail failed:', e && e.message);
        }
        // SP upload
        try {
          const ref = await uploadEquipInspectionPdf(env, token, body, pdfBytes);
          body.pdfItemId = ref.itemId;
          body.pdfWebUrl = ref.webUrl;
        } catch (e) {
          console.error('[equip-inspection] SP upload failed:', e && e.message);
        }
      }
    }

    await upsertRecord(env, body);
    return json({ ok: true, id: body.id, status: 'submitted', pdfName: filename, pdfWebUrl: body.pdfWebUrl || null });
  }

  return jsonErr('Unknown action', 400);
}
