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
  CHECKLIST_ITEMS, computeResult,
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
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RECORDS   = 20000;
const MAX_STR       = 2000;   // note / address / contact cap
const MAX_SHORT     = 300;    // name / project / date cap
const MAX_ITEMS     = 20;     // more than enough for 11 items
const MAX_ATTACH    = 30;     // attachment refs cap

const VALID_ANSWERS = { 'Yes': 1, 'No': 1, 'N/A': 1 };
const VALID_ITEM_KEYS = new Set(CHECKLIST_ITEMS.map((d) => d.key));

const VALID_ACTIONS = { create: 1, update: 1, submit: 1 };

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

// Rebuild a clean attachments array from client input (SP refs only).
function cleanAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const VALID_BUCKETS = { grade_photo: 1, proof_roll: 1 };
  for (const a of input.slice(0, MAX_ATTACH)) {
    if (!a || typeof a !== 'object') continue;
    const name   = s(a.name, MAX_SHORT);
    const itemId = s(a.itemId, MAX_SHORT);
    if (!name && !itemId) continue;
    const bucketRaw = s(a.bucket, MAX_SHORT);
    const bucket = VALID_BUCKETS[bucketRaw] ? bucketRaw : '';
    const wu = s(a.webUrl, MAX_STR);
    const webUrl = /^https:\/\//i.test(wu) ? wu : '';
    // itemKey ties this attachment to a checklist item (optional, for display).
    const key = s(a.key, 10);
    out.push({ key: VALID_ITEM_KEYS.has(key) ? key : '', name, itemId, webUrl, bucket });
  }
  return out;
}

// Build a clean record body from a parsed POST body and an optional base record.
function buildBody(src, base) {
  base = base || {};
  const items = src.items != null ? cleanItems(src.items) : (base.items || cleanItems(null));
  const { result, openItems } = computeResult(items);
  return {
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
    // Computed from items (server-set, never trusted from client).
    result,
    openItems,
  };
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

    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();

    if (action === 'create') {
      const total = await countRecords(env);
      if (total >= MAX_RECORDS) {
        return json({ status: 'error', message: 'Site readiness record storage is full.' }, 413);
      }
      const body = buildBody(parsed, {});
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

    if (action === 'update') {
      Object.assign(rec, buildBody(parsed, rec));
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
    Object.assign(rec, buildBody(parsed, rec));
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
