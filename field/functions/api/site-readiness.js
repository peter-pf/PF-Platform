// Cloudflare Pages Function -- /api/site-readiness
// FIELD OPERATIONS site readiness form (Derek 2026-10-20).
//
// A foreman/field ops manager fills out the site readiness checklist before
// PF mobilizes to a project. On SUBMIT the platform does EXACTLY THREE things:
//   1. Render the form into a PDF (server-side, see lib/site-readiness-doc.js).
//   2. Auto-email that PDF to a mailing list (Graph sendMail AS peter@).
//   3. Save the same PDF into the job's SharePoint "Site Readiness" subfolder.
//
// ZERO FINANCIALS: this endpoint stores checklist answers, notes, and attachment
// refs ONLY. No dollar amounts, rates, or costs.
//
// DATA MODEL:
//   site_readiness_v1 -> JSON { records:[{
//     id, date, projectId, projectName, gcContact, siteAddress, inspectedBy,
//     items:[{key, answer, note}],  // 12 checklist items; answer='Yes'|'No'|'N/A'|''
//     attachments:[{key,name,itemId,webUrl,bucket}], // SP refs from /api/field-upload
//     sigName, sigDate,
//     result,       // 'READY' | 'NOT READY' (computed, server-set on save)
//     openItems,    // [key, ...] items that are No or blank (computed, server-set)
//     status,       // 'draft' | 'sent'
//     createdBy, createdAt, updatedAt,
//     submittedBy, submittedAt,
//     pdfName, pdfWebUrl, emailedTo, sentAt
//   }] }
//
// RBAC: field_ops area (same as DFR).
// KV KEY: env.PF_SCHEDULE :: 'site_readiness_v1'.
// D1: table site_readiness (migration 0006_site_readiness.sql).

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import {
  renderSiteReadinessPdf, pdfFilename,
  sendSiteReadinessEmail, buildEmailBody, uploadSiteReadinessPdf,
} from '../lib/site-readiness-doc.js';
import {
  upsertRecord, loadRecordById, listRecords, countRecords,
  CHECKLIST_ITEMS, computeResult, R12_KEYS,
} from '../lib/site-readiness-store.js';

// ===========================================================================
// RECIPIENTS  --  *** THE ONE PLACE TO FLIP TEST -> PRODUCTION ***
// ===========================================================================
// TEST: PDF email goes ONLY to Peter until Derek approves the layout and gives
// the final mailing list. When ready, populate PROD_RECIPIENTS and flip
// ACTIVE_RECIPIENTS = PROD_RECIPIENTS (or set env var SITE_READINESS_RECIPIENTS).
const TEST_RECIPIENTS = ['pfpeter@agentmail.to'];
const PROD_RECIPIENTS = [
  'dfranke@pierfoundations.com',
  'jwillis@pierfoundations.com',
  'breinking@pierfoundations.com',
  'swillis@pierfoundations.com',
  'jreinking@pierfoundations.com',
];
// >>> FLIP HERE <<< : ACTIVE_RECIPIENTS = TEST_RECIPIENTS until Derek approves.
// Per Derek 10/21/2026. Flip ACTIVE_RECIPIENTS to PROD_RECIPIENTS on his go-live.
const ACTIVE_RECIPIENTS = TEST_RECIPIENTS;

function resolveRecipients(env) {
  const raw = env && env.SITE_READINESS_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return ACTIVE_RECIPIENTS;
}

// ---------------------------------------------------------------------------
const MAX_BODY_BYTES = 64 * 1024;  // bumped 32->64 to accommodate new fields + extra refs
const MAX_RECORDS   = 20000;
const MAX_STR       = 2000;   // note / address / contact cap
const MAX_SHORT     = 300;    // name / project / date cap
const MAX_ITEMS     = 30;     // more than enough for current 25 items (R12 added 1d-1h)
const MAX_ATTACH    = 60;     // bumped 30->60 for new bucket types (markup, sigs, safety)

const VALID_ANSWERS = { 'Yes': 1, 'No': 1, 'N/A': 1 };
const VALID_ITEM_KEYS = new Set(CHECKLIST_ITEMS.map((d) => d.key));

const VALID_ACTIONS = { create: 1, update: 1, submit: 1 };

// [SEC fix-round 2026-10-23]
const SP_HOST_PREFIX = 'https://pierfoundations.sharepoint.com/';
const GRAPH_ID_RE = /^[A-Za-z0-9!._\-]{1,300}$/;
const OPS_SECTION_KEYS = new Set(['stone', 'spoils']);

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

function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, ''); // strip angle brackets
}

function isoDateOrToday(v) {
  const str = String(v == null ? '' : v).slice(0, 40);
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function rid() {
  return 'sr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Rebuild a clean items array from client input.
function cleanItems(input) {
  if (!Array.isArray(input)) {
    // Default: empty answers for all known items.
    return CHECKLIST_ITEMS.map((d) => ({ key: d.key, answer: '', note: '' }));
  }
  const out = [];
  const seen = new Set();
  for (const it of input.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const key = s(it.key, 10);
    if (!VALID_ITEM_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const answerRaw = s(it.answer, 10);
    const answer = VALID_ANSWERS[answerRaw] ? answerRaw : '';
    out.push({ key, answer, note: s(it.note, MAX_STR) });
  }
  // Ensure all known items are present (fill any the client omitted with blank).
  for (const def of CHECKLIST_ITEMS) {
    if (!seen.has(def.key)) {
      out.push({ key: def.key, answer: '', note: '' });
    }
  }
  return out;
}

// Rebuild a clean 4b-detail sub-items object from client input.
// { unloadStreet, overheadUtils, specialNotes } — free text, no XSS via s().
function cleanItem4bDetail(input) {
  if (!input || typeof input !== 'object') return { unloadStreet: '', overheadUtils: '', specialNotes: '' };
  return {
    unloadStreet:  s(input.unloadStreet,  MAX_STR),
    overheadUtils: s(input.overheadUtils, MAX_STR),
    specialNotes:  s(input.specialNotes,  MAX_STR),
  };
}

// Rebuild a clean ops sign-off record with idempotent server stamp.
// [SEC fix-round 2026-10-23 R2]: stamps ONLY on first capture (base.signedAt absent).
// Admin edits never overwrite the original signer: base.signedAt is always preserved.
function cleanOpsSignoffItemStamped(src, base, session, nowIso) {
  src  = (src  && typeof src  === 'object') ? src  : {};
  base = (base && typeof base === 'object') ? base : {};
  const cleaned = {
    desc:      s(src.desc      != null ? src.desc      : (base.desc      || ''), MAX_STR),
    superName: s(src.superName != null ? src.superName : (base.superName || ''), MAX_SHORT),
    pfMgrName: s(src.pfMgrName != null ? src.pfMgrName : (base.pfMgrName || ''), MAX_SHORT),
  };
  // Always preserve the existing server stamp from the stored record.
  // Client-supplied stamp fields are never accepted (prevented upstream by separate srcOps/baseOps).
  if (base.signedAt)       cleaned.signedAt       = s(String(base.signedAt),       MAX_SHORT);
  if (base.capturedByUid)  cleaned.capturedByUid  = s(String(base.capturedByUid),  MAX_SHORT);
  if (base.capturedByName) cleaned.capturedByName = s(String(base.capturedByName), MAX_SHORT);
  // Stamp on first capture only: sign-off has content AND stored record has no stamp yet.
  const hasContent = !!(cleaned.desc || cleaned.superName || cleaned.pfMgrName);
  if (session && nowIso && hasContent && !base.signedAt) {
    cleaned.signedAt       = nowIso;
    cleaned.capturedByUid  = s(String(session.uid  || ''), MAX_SHORT);
    cleaned.capturedByName = s(String(session.name || ''), MAX_SHORT);
  }
  return cleaned;
}

// Preserve a legacy ops sign-off item (R9 stone/spoils) from the STORED RECORD only.
// [SEC fix-round 2026-10-23 R2]: caller must pass base.opsSignoffs[key], never the merged src.
function cleanOpsSignoffItemLegacy(stored) {
  if (!stored || typeof stored !== 'object') return { desc: '', superName: '', pfMgrName: '' };
  const out = {
    desc:      s(stored.desc,      MAX_STR),
    superName: s(stored.superName, MAX_SHORT),
    pfMgrName: s(stored.pfMgrName, MAX_SHORT),
  };
  // Preserve original server-stamped fields from the stored record.
  if (stored.signedAt)       out.signedAt       = s(String(stored.signedAt),       MAX_SHORT);
  if (stored.capturedByUid)  out.capturedByUid  = s(String(stored.capturedByUid),  MAX_SHORT);
  if (stored.capturedByName) out.capturedByName = s(String(stored.capturedByName), MAX_SHORT);
  return out;
}

// Rebuild clean ops sign-offs.
// [SEC fix-round 2026-10-23 R2]: takes srcOps (client) and baseOps (stored record) separately.
// Legacy stone/spoils keys come ONLY from baseOps — client can never forge or inject them.
// R10 primary: sitePlan stamped once on first capture.
// Migration: R9 stonePlacement -> sitePlan if srcOps has no explicit sitePlan.
function cleanOpsSignoffs(srcOps, baseOps, session, nowIso) {
  srcOps  = (srcOps  && typeof srcOps  === 'object') ? srcOps  : {};
  baseOps = (baseOps && typeof baseOps === 'object') ? baseOps : {};
  // R10 primary: sitePlan. Migrate R9 stonePlacement if no sitePlan in src.
  const srcSP  = srcOps.sitePlan  != null ? srcOps.sitePlan  : (srcOps.stonePlacement  || null);
  const baseSP = baseOps.sitePlan != null ? baseOps.sitePlan : null;
  const out = { sitePlan: cleanOpsSignoffItemStamped(srcSP, baseSP, session, nowIso) };
  // Back-compat: legacy keys ONLY from stored record. Client src.opsSignoffs.stonePlacement is ignored.
  if (baseOps.stonePlacement  != null) out.stonePlacement  = cleanOpsSignoffItemLegacy(baseOps.stonePlacement);
  if (baseOps.spoilsPlacement != null) out.spoilsPlacement = cleanOpsSignoffItemLegacy(baseOps.spoilsPlacement);
  return out;
}

// Rebuild a clean attachments array from client input (SP refs only).
// [SEC fix-round 2026-10-23]: webUrl must be on SP host; itemId must match GRAPH_ID_RE;
// OPS_SECTION_KEYS ('stone','spoils') preserved for PDF section routing.
function cleanAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const VALID_BUCKETS = new Set([
    'grade_photo', 'proof_roll', 'photos',
    'staking_photo', 'safety_cert', 'sr_markup', 'sr_signature',
    // R11: section 1 and 4 photo buckets (site-readiness-store.js uploadBucketForItem)
    'photo_1a', 'photo_1b', 'photo_1c', 'photo_4b', 'photo_4c',
  ]);
  for (const a of input.slice(0, MAX_ATTACH)) {
    if (!a || typeof a !== 'object') continue;
    const name     = s(a.name, MAX_SHORT);
    const rawId    = s(a.itemId, MAX_SHORT);
    const itemId   = GRAPH_ID_RE.test(rawId) ? rawId : '';
    if (!name && !itemId) continue;
    const bucketRaw = s(a.bucket, MAX_SHORT);
    const bucket    = VALID_BUCKETS.has(bucketRaw) ? bucketRaw : '';
    const wu        = s(a.webUrl, MAX_STR);
    const webUrl    = wu.startsWith(SP_HOST_PREFIX) ? wu : '';
    const rawKey    = s(a.key, 20);
    const key       = OPS_SECTION_KEYS.has(rawKey)
      ? rawKey
      : (VALID_ITEM_KEYS.has(rawKey) ? rawKey : '');
    out.push({ key, name, itemId, webUrl, bucket });
  }
  return out;
}

// Keys that must never be stored under a legacy record (schemaVersion absent).
// These keys have new meanings in R11/R12; on a legacy record '1b' still means
// "Spoil pile". Allowing the client to write 1b-1h on a legacy update would
// overwrite the spoil-pile answer or print "General conditions" under the legacy
// label in the PDF. Strip them from incoming src.items for legacy updates.
// [LOW R12 2026-10-23]
const SCHEMA_GUARDED_KEYS = new Set(['1b', '1c', '1d', '1e', '1f', '1g', '1h']);

// session + nowIso passed in on write paths so cleanOpsSignoffs can stamp server-side metadata.
function buildBody(src, base, session, nowIso) {
  base = base || {};

  // [SEC HIGH-2 R11 / R12 2026-10-23]: Server stamps schemaVersion on every NEW create.
  // R12 bumps from 11 to 12. Updates preserve the stored base.schemaVersion so legacy
  // records (stored without schemaVersion) remain legacy after re-save.
  // Client-supplied schemaVersion is NEVER trusted.
  const isCreate = Object.keys(base).length === 0;
  const schemaVersion = isCreate ? 12 : base.schemaVersion;
  const isLegacyUpdate = !isCreate && (schemaVersion == null || schemaVersion < 11);

  // [LOW R12 2026-10-23]: On a legacy update, strip schema-guarded keys from incoming
  // items before passing to cleanItems. The old 1b answer (spoil pile) must come ONLY
  // from the stored base.items — a client on the new form cannot overwrite it.
  let srcItems = src.items;
  if (isLegacyUpdate && Array.isArray(srcItems)) {
    srcItems = srcItems.filter((it) => !it || !SCHEMA_GUARDED_KEYS.has(String(it.key || '')));
  }

  const items = srcItems != null ? cleanItems(srcItems) : (base.items || cleanItems(null));
  const { result, openItems } = computeResult(items, schemaVersion);

  // [SEC fix-round 2026-10-23 R2]: pass srcOps and baseOps separately to cleanOpsSignoffs.
  // Legacy keys (stonePlacement/spoilsPlacement) must come ONLY from the stored record (base).
  // Object.assign merge removed — it allowed client to inject forged legacy stamp fields.
  const srcOps  = src.opsSignoffs  || null;
  const baseOps = base.opsSignoffs || null;

  // item4bDetail: back-compat field (R9). Preserve if present; never create for new records.
  const raw4bSrc = src.item4bDetail != null ? src.item4bDetail : null;
  const raw4bBase = base.item4bDetail || null;
  const raw4b = raw4bSrc != null ? raw4bSrc : raw4bBase;

  const body = {
    date:        isoDateOrToday(src.date != null ? src.date : base.date),
    projectId:   s(src.projectId != null ? src.projectId : base.projectId, MAX_SHORT),
    projectName: s(src.projectName != null ? src.projectName : base.projectName, MAX_SHORT),
    gcContact:   s(src.gcContact != null ? src.gcContact : base.gcContact, MAX_SHORT),
    siteAddress: s(src.siteAddress != null ? src.siteAddress : base.siteAddress, MAX_STR),
    inspectedBy: s(src.inspectedBy != null ? src.inspectedBy : base.inspectedBy, MAX_SHORT),
    items,
    attachments: src.attachments != null ? cleanAttachments(src.attachments) : (base.attachments || []),
    sigName:     s(src.sigName != null ? src.sigName : base.sigName, MAX_SHORT),
    sigDate:     isoDateOrToday(src.sigDate != null ? src.sigDate : base.sigDate),
    opsSignoffs: cleanOpsSignoffs(srcOps, baseOps, session, nowIso),
    result,
    openItems,
  };
  // schemaVersion: only include when defined (legacy records stored without it must stay legacy).
  if (schemaVersion !== undefined) body.schemaVersion = schemaVersion;
  // Preserve legacy item4bDetail if it has data (never drop on update).
  if (raw4b) body.item4bDetail = cleanItem4bDetail(raw4b);
  return body;
}

// ---- GET: list records -------------------------------------------------------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE && !env.DB) {
      return json({ ok: true, records: [], meta: { updated: null }, fallback: true,
        note: 'No data store (KV + D1) available on this deployment.' });
    }
    const url = new URL(request.url);
    const projectId = s(url.searchParams.get('projectId'), MAX_SHORT);
    const date      = s(url.searchParams.get('date'), MAX_SHORT);
    const result = await listRecords(env, {
      projectId: projectId || undefined,
      date: date || undefined,
    });
    return json({ ok: true, records: result.records, meta: result.meta });
  } catch (err) {
    console.error('api/site-readiness GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: create / update / submit ------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  if (isCrossSite(request)) {
    return json({ status: 'error', message: 'Cross-site request rejected.' }, 403);
  }
  const ctHeader = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!ctHeader.includes('application/json')) {
    return json({ status: 'error', message: 'Content-Type must be application/json.' }, 415);
  }

  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const action = String((parsed && parsed.action) || '');
    if (!VALID_ACTIONS[action]) {
      return json({ status: 'error', message: "action must be 'create', 'update' or 'submit'." }, 400);
    }

    if (!env.PF_SCHEDULE && !env.DB) {
      return json({ status: 'error',
        message: 'Persistence unavailable: neither KV (PF_SCHEDULE) nor D1 (DB) is configured.' }, 503);
    }

    // Prefer uid (stable) over display name for ownership comparisons.
    const who = (session && (session.uid || session.name)) ? s(session.uid || session.name) : 'unknown';
    const nowIso = new Date().toISOString();

    if (action === 'create') {
      const total = await countRecords(env);
      if (total >= MAX_RECORDS) {
        return json({ status: 'error', message: 'Site readiness record storage is full.' }, 413);
      }
      const body = buildBody(parsed, {}, session, nowIso);
      if (!body.projectId && !body.projectName) {
        return json({ status: 'error', message: 'A project is required.' }, 400);
      }
      const rec = Object.assign({
        id: rid(),
        status: 'draft',
        createdBy: who,
        createdAt: nowIso,
        updatedAt: nowIso,
        submittedBy: null, submittedAt: null,
        pdfName: null, pdfWebUrl: null, emailedTo: null, sentAt: null,
      }, body);
      const stamp = await upsertRecord(env, rec);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // update + submit require an id
    const id = s(parsed.id, MAX_SHORT);
    const rec = await loadRecordById(env, id);
    if (!rec) return json({ status: 'error', message: 'Site readiness record not found.' }, 404);

    // ---- OWNERSHIP CHECK (update + submit) ----------------------------------
    {
      const isAdmin = session && session.role === 'admin';
      // Legacy records were written with createdBy = session.name (display name).
      // New records are written with createdBy = session.uid (stable id).
      // Accept either so existing forms remain editable by their creator.
      const isOwner = rec.createdBy && (
        rec.createdBy === who ||
        (session && session.name && rec.createdBy === session.name)
      );
      if (!isAdmin && !isOwner) {
        return json({ status: 'forbidden', message: 'You may only edit your own site readiness forms.' }, 403);
      }
      if (action === 'update' && !isAdmin && rec.status === 'sent') {
        return json({ status: 'forbidden', message: 'A submitted form cannot be edited. Only admins may update sent records.' }, 403);
      }
    }

    if (action === 'update') {
      Object.assign(rec, buildBody(parsed, rec, session, nowIso));
      rec.updatedAt = nowIso;
      const stamp = await upsertRecord(env, rec);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- SUBMIT: 3-step flow (PDF -> email -> SharePoint) -------------------
    // FAIL CLOSED: if Graph/SharePoint not configured we do NOT flip to 'sent'.
    if (!graphConfigured(env)) {
      return json({ status: 'error',
        message: 'Submit is unavailable: the server email/SharePoint integration is not configured. Your draft is saved.' }, 503);
    }

    const recipients = resolveRecipients(env);
    if (!recipients.length) {
      return json({ status: 'error', message: 'Submit is unavailable: no recipient list is configured.' }, 503);
    }

    // Stamp submit audit (same first-submit / re-submit semantics as DFR).
    const isEdit = !!(rec.submittedAt || rec.status === 'sent');
    if (isEdit) {
      rec.editedBy = who;
      rec.editedAt = nowIso;
    } else {
      rec.submittedBy = who;
      rec.submittedAt = nowIso;
    }

    // Re-compute result at submit time (ensures it reflects the final saved answers).
    Object.assign(rec, buildBody(parsed, rec, session, nowIso));
    rec.updatedAt = nowIso;

    let token;
    try {
      token = await getGraphToken(env);
    } catch (e) {
      console.error('api/site-readiness submit: token mint failed:', e && e.message);
      return json({ status: 'error',
        message: 'Submit failed: could not reach the mail/SharePoint service. Your draft is saved.' }, 502);
    }

    // 1) Render PDF.
    let pdfBytes, filename;
    try {
      pdfBytes = renderSiteReadinessPdf(rec);
      filename = pdfFilename(rec);
    } catch (e) {
      console.error('api/site-readiness submit: pdf render failed:', e && e.message);
      return json({ status: 'error', message: 'Submit failed while building the PDF. Your draft is saved.' }, 500);
    }

    // 2) Email.
    try {
      // Subject == generated filename without the .pdf extension so they can never drift.
      const subject = filename.replace(/\.pdf$/i, '');
      const bodyText = buildEmailBody(rec);
      await sendSiteReadinessEmail(env, token, { recipients, subject, bodyText, pdfBytes, filename });
    } catch (e) {
      console.error('api/site-readiness submit: email failed:', e && e.message);
      return json({ status: 'error',
        message: 'Submit failed while sending the email. Your draft is saved; please retry.' }, 502);
    }

    // 3) Upload to SharePoint (project folder / Site Readiness subfolder).
    let uploaded;
    try {
      uploaded = await uploadSiteReadinessPdf(env, token, rec.projectId, filename, pdfBytes);
    } catch (e) {
      console.error('api/site-readiness submit: SharePoint upload failed:', e && e.message);
      // Email already went out; SP failed. Report partial failure.
      return json({ status: 'error',
        message: 'The form was emailed but could NOT be saved to SharePoint. Please retry or notify an admin.' }, 502);
    }

    // Both side effects succeeded -> finalize the record.
    rec.status = 'sent';
    rec.pdfName = filename;
    rec.pdfWebUrl = (uploaded && uploaded.webUrl) || null;
    rec.emailedTo = recipients.slice();
    rec.sentAt = new Date().toISOString();
    rec.updatedAt = rec.sentAt;

    const stamp = await upsertRecord(env, rec);
    return json({
      ok: true, saved: true, action, record: rec, meta: { updated: stamp },
      distribution: { emailedTo: recipients, pdf: filename, sharepoint: uploaded },
    });

  } catch (err) {
    console.error('api/site-readiness POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${m[2]}/${m[3]}/${m[1]}`;
}
