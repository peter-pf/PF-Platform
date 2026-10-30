// Cloudflare Pages Function -- /api/toolbox-talk
// FIELD OPERATIONS Safety Analysis form (previously "Toolbox Talk").
// Derek Franke (owner) requested rename + form expansion, 2026-10-30.
//
// DISPLAY NAME: "Safety Analysis"  (label changes only)
// STORAGE:      toolbox_talks table, toolbox_talk mailing-list key, SP folder UNCHANGED.
//
// On SUBMIT the platform does THREE things:
//   1. Render the form into a PDF (server-side, lib/toolbox-talk-doc.js).
//   2. Save that PDF to SharePoint: "05 - Field Operations/Toolbox Talks/{YYYY}/{filename}"
//   3. Email a copy (with PDF attached) to the ACTIVE_RECIPIENTS list.
//
// ZERO FINANCIALS: stores safety-meeting content only (attendees, topic, notes).
//
// SECURITY:
//   - id is generated server-side (crypto.randomUUID()) on create.
//     Client-supplied id is NEVER accepted on create.
//   - update/submit load the existing record and enforce:
//       (a) owner check: only the creator (or admin) may modify.
//       (b) submitted records are locked.
//   - id format is validated as UUID before any D1 lookup.
//   - Date is validated: must match YYYY-MM-DD and be a real calendar date.
//   - superintendent must be in SUPERINTENDENT_SET (or empty for drafts).
//   - hazard_checks keys must all be in HAZARD_KEYS allowlist.
//   - attendee names and titles are capped at 80 chars each; list capped at 50 entries.
//   - All free-text fields are server-side length-capped before storage.
//   - KV rate limit on submit (10/hour per uid).
//   - D1 failures return 503 (fail-closed; no silent KV fallback).
//
// RBAC: field_ops area.
// D1: table toolbox_talks (migrations 0010 + 0012).
// KV: PF_SCHEDULE -- used ONLY for rate-limiting (no photo blobs here).

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import {
  renderToolboxTalkPdf, pdfFilename, uploadTalkPdf,
  sendTalkEmail, buildEmailBody,
} from '../lib/toolbox-talk-doc.js';
import {
  upsertRecord, loadRecordById, listRecords, countRecords,
  PRESENTER_SET, PRESENTER_OPTIONS, TOPIC_KEYS, TOPIC_LABELS,
  SUPERINTENDENT_SET, SUPERINTENDENT_OPTIONS,
  HAZARD_KEYS,
} from '../lib/toolbox-talk-store.js';
import { resolveMailingList, resolveMailingListWithNames } from '../lib/mailing-lists.js';

// ---------------------------------------------------------------------------
// RECIPIENTS -- now read from the mailing_lists D1 table (migration 0011).
// ---------------------------------------------------------------------------
// The old TEST_RECIPIENTS / PROD_RECIPIENTS / ACTIVE_RECIPIENTS constants and
// the TOOLBOX_TALK_RECIPIENTS env-var override have been RETIRED.
// Seed (migration 0011): toolbox_talk: dfranke@pierfoundations.com
// FAIL-SAFE: if D1 unreachable or list empty, warning returned; email skipped.

// ---------------------------------------------------------------------------
const MAX_BODY_BYTES  = 64 * 1024;
const MAX_RECORDS     = 20000;
const MAX_STR         = 4000;     // long-form safety text
const MAX_SHORT       = 300;
const MAX_ATTENDEES   = 50;
const MAX_NAME        = 80;
const MAX_HIER        = 5;        // hierarchy of competency: max 5 entries

const VALID_ACTIONS = { create: 1, update: 1, submit: 1 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Submit rate limit: 10 per hour per uid.
const RL_SUBMIT_MAX = 10;
const RL_SUBMIT_TTL = 3600;
async function checkRateLimit(kv, key, max, ttl) {
  if (!kv) return true;
  try {
    const raw   = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: ttl });
    return true;
  } catch {
    return true; // rate limit is best-effort
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

function cap(v, maxLen) {
  return String(v == null ? '' : v).slice(0, maxLen);
}

function s(v, maxLen) {
  if (v == null) return '';
  const str = String(v);
  return maxLen != null ? str.slice(0, maxLen) : str;
}

// Validate and clean the attendees array.
// Each entry: { name: string (required, max 80), title: string (optional, max 80), acknowledged: bool }
function cleanAttendees(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw.slice(0, MAX_ATTENDEES)) {
    if (!a || typeof a !== 'object') continue;
    const name = cap(a.name, MAX_NAME).trim();
    if (!name) continue;
    const title = cap(a.title != null ? a.title : '', MAX_NAME).trim();
    const ack = a.acknowledged === true || a.acknowledged === 'true';
    out.push({ name, title, acknowledged: ack });
  }
  return out;
}

// Validate and clean the hazard_checks array.
// Each entry must be a key in HAZARD_KEYS.
function cleanHazardChecks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const k of raw) {
    const key = String(k || '');
    if (HAZARD_KEYS.has(key)) out.push(key);
  }
  // deduplicate
  return [...new Set(out)];
}

// Validate and clean hierarchy_names: up to MAX_HIER strings, max 80 chars each.
function cleanHierarchyNames(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_HIER).map((n) => cap(n, MAX_NAME).trim());
}

// Build a sanitized record body.
// On CREATE: newServerId is server-generated; src.id is IGNORED.
// On UPDATE/SUBMIT: base.id is ALWAYS used (never src.id).
function buildBody(src, base, uid, newServerId) {
  const now = new Date().toISOString();

  const rawDate = src.date != null ? String(src.date) : (base && base.date) || '';
  if (rawDate && !isValidDate(rawDate)) return { err: 'invalid date (use YYYY-MM-DD)' };

  const rawTopic = src.topic != null ? String(src.topic) : (base && base.topic) || '';
  if (rawTopic && !TOPIC_KEYS.has(rawTopic)) {
    return { err: `topic must be one of: ${[...TOPIC_KEYS].join(', ')}` };
  }

  const rawPresenter = src.presenter != null
    ? String(src.presenter) : (base && base.presenter) || '';
  if (rawPresenter && !PRESENTER_SET.has(rawPresenter)) {
    return { err: `presenter must be one of: ${PRESENTER_OPTIONS.join(', ')}` };
  }

  const rawSuperintendent = src.superintendent != null
    ? String(src.superintendent) : (base && base.superintendent) || '';
  if (rawSuperintendent && !SUPERINTENDENT_SET.has(rawSuperintendent)) {
    return { err: `superintendent must be one of: ${SUPERINTENDENT_OPTIONS.join(', ')}` };
  }

  // Validate hazard check keys
  const rawHazardChecks = src.hazardChecks != null
    ? src.hazardChecks : (base && base.hazardChecks) || [];
  if (!Array.isArray(rawHazardChecks)) return { err: 'hazardChecks must be an array' };
  for (const k of rawHazardChecks) {
    if (!HAZARD_KEYS.has(String(k || ''))) {
      return { err: 'Invalid hazard selection.' };
    }
  }

  const id = newServerId || (base && base.id);

  return {
    body: {
      id,
      projectId:       cap(src.projectId    != null ? src.projectId    : (base && base.projectId)    || '', MAX_SHORT),
      projectName:     cap(src.projectName  != null ? src.projectName  : (base && base.projectName)  || '', MAX_SHORT),
      date:            cap(rawDate, MAX_SHORT),
      time:            cap(src.time         != null ? src.time         : (base && base.time)         || '', 10),
      location:        cap(src.location     != null ? src.location     : (base && base.location)     || '', MAX_SHORT),
      superintendent:  cap(rawSuperintendent, MAX_NAME),
      presenter:       cap(rawPresenter, MAX_NAME),
      topic:           cap(rawTopic, MAX_SHORT),
      topicOther:      cap(src.topicOther   != null ? src.topicOther   : (base && base.topicOther)   || '', MAX_SHORT),
      keyPoints:       cap(src.keyPoints    != null ? src.keyPoints    : (base && base.keyPoints)    || '', MAX_STR),
      hazards:         cap(src.hazards      != null ? src.hazards      : (base && base.hazards)      || '', MAX_STR),
      questions:       cap(src.questions    != null ? src.questions    : (base && base.questions)    || '', MAX_STR),
      actions:         cap(src.actions      != null ? src.actions      : (base && base.actions)      || '', MAX_STR),
      jsaSteps:        cap(src.jsaSteps     != null ? src.jsaSteps     : (base && base.jsaSteps)     || '', MAX_STR),
      jsaHazards:      cap(src.jsaHazards   != null ? src.jsaHazards   : (base && base.jsaHazards)   || '', MAX_STR),
      jsaPreventative: cap(src.jsaPreventative != null ? src.jsaPreventative : (base && base.jsaPreventative) || '', MAX_STR),
      hazardChecks:    cleanHazardChecks(rawHazardChecks),
      hierarchyNames:  cleanHierarchyNames(
        src.hierarchyNames != null ? src.hierarchyNames : (base && base.hierarchyNames) || []
      ),
      attendees:       cleanAttendees(src.attendees != null ? src.attendees : (base && base.attendees) || []),
      status:          base ? base.status : 'draft',
      pdfName:         base ? (base.pdfName || null) : null,
      pdfWebUrl:       base ? (base.pdfWebUrl || null) : null,
      emailedTo:       base ? (base.emailedTo || null) : null,
      sentAt:          base ? (base.sentAt || null) : null,
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

  const uid    = session.uid;
  const url    = new URL(request.url);
  const method = request.method.toUpperCase();

  // ---- GET: list or single record ------------------------------------------
  if (method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      if (!UUID_RE.test(id)) return jsonErr('Not found', 404);
      let rec;
      try { rec = await loadRecordById(env, id); }
      catch (e) { return jsonErr('Service temporarily unavailable', 503); }
      if (!rec) return jsonErr('Not found', 404);
      if (rec.status === 'draft' && rec.createdBy !== uid && session.role !== 'admin') {
        return jsonErr('Not found', 404);
      }
      const safeRec = Object.assign({}, rec, {
        pdfWebUrl: /^https:\/\//i.test(String(rec.pdfWebUrl || '')) ? rec.pdfWebUrl : null,
      });
      return json({ ok: true, record: safeRec });
    }
    const projectId = url.searchParams.get('projectId') || undefined;
    const date      = url.searchParams.get('date')      || undefined;
    let result;
    try { result = await listRecords(env, { projectId, date }); }
    catch (e) { return jsonErr('Service temporarily unavailable', 503); }
    const isAdmin = session.role === 'admin';
    const filtered = (result.records || []).filter((r) => {
      if (r.status === 'submitted') return true;
      if (isAdmin) return true;
      return r.createdBy === uid;
    }).map((r) => Object.assign({}, r, {
      pdfWebUrl: /^https:\/\//i.test(String(r.pdfWebUrl || '')) ? r.pdfWebUrl : null,
    }));
    return json({ ok: true, records: filtered });
  }

  // ---- POST: create / update / submit --------------------------------------
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

  // ---- CREATE: server generates id ----------------------------------------
  let newServerId = null;
  if (action === 'create') {
    newServerId = crypto.randomUUID();
  }

  // ---- UPDATE / SUBMIT: validate id and load base -------------------------
  let base = null;
  if (action === 'update' || action === 'submit') {
    const clientId = String(src.id || '');
    if (!UUID_RE.test(clientId)) return jsonErr('Invalid id format', 400);

    try { base = await loadRecordById(env, clientId); }
    catch (e) { return jsonErr('Service temporarily unavailable', 503); }
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
    catch (e) { return jsonErr('Service temporarily unavailable', 503); }
    if (n >= MAX_RECORDS) return jsonErr('Record limit reached', 507);
  }

  // ---- CREATE / UPDATE: save as draft -------------------------------------
  if (action === 'create' || action === 'update') {
    body.status = 'draft';
    try { await upsertRecord(env, body); }
    catch (e) { return jsonErr('Service temporarily unavailable', 503); }
    return json({ ok: true, id: body.id, status: body.status });
  }

  // ---- SUBMIT: rate limit, PDF, SP upload, email --------------------------
  if (action === 'submit') {
    // Rate limit: 10 submits per hour per uid.
    const rlKey = `tt_submit_rl:${uid}`;
    const rlOk  = await checkRateLimit(env.PF_SCHEDULE, rlKey, RL_SUBMIT_MAX, RL_SUBMIT_TTL);
    if (!rlOk) return jsonErr('Too many submissions this hour. Please wait.', 429);

    // Required fields on submit.
    if (!body.date)           return jsonErr('Date is required', 400);
    if (!body.superintendent) return jsonErr('Superintendent is required', 400);

    body.status      = 'submitted';
    body.submittedBy = uid;
    body.submittedAt = new Date().toISOString();

    body.pdfName = pdfFilename(body);

    // Render PDF.
    let pdfBytes;
    try {
      pdfBytes = renderToolboxTalkPdf(body);
    } catch (e) {
      console.error('[toolbox-talk] PDF render failed:', e && e.message);
      return jsonErr('PDF generation failed', 500);
    }

    // Upload PDF to SharePoint.
    if (graphConfigured(env)) {
      let token;
      try { token = await getGraphToken(env); }
      catch (e) { console.error('[toolbox-talk] Graph token failed:', e && e.message); }
      if (token) {
        try {
          const spItem = await uploadTalkPdf(env, token, body, body.pdfName, pdfBytes);
          body.pdfWebUrl = spItem.webUrl || null;
          body.pdfItemId = spItem.id    || null;
        } catch (e) {
          console.error('[toolbox-talk] SP upload failed:', e && e.message);
        }
      }
    }

    // Email the PDF. Recipients from D1 mailing_lists table.
    let ttEmailWarning = null;
    const { recipients, warning: ttMailingWarning } = await resolveMailingListWithNames(env.DB, 'toolbox_talk');
    if (ttMailingWarning) {
      ttEmailWarning = ttMailingWarning;
    } else if (recipients.length && graphConfigured(env)) {
      let token;
      try { token = await getGraphToken(env); }
      catch (e) {
        console.error('[toolbox-talk] Graph token (email) failed:', e && e.message);
        ttEmailWarning = 'Email not sent: could not reach mail service. The record and PDF were saved.';
      }
      if (token) {
        try {
          const subject = `Safety Analysis - ${body.projectName || body.projectId || 'Project'} - ${body.date}`;
          const bodyText = buildEmailBody(body);
          await sendTalkEmail(env, token, {
            recipients: recipients.map((r) => r.email), subject, bodyText, pdfBytes, filename: body.pdfName,
          });
          body.emailedTo = recipients.slice();
          body.sentAt    = new Date().toISOString();
        } catch (e) {
          console.error('[toolbox-talk] Email send failed:', e && e.message);
          ttEmailWarning = 'Email not sent: send failed. The record and PDF were saved. Please notify your supervisor.';
        }
      }
    }

    try { await upsertRecord(env, body); }
    catch (e) { return jsonErr('Service temporarily unavailable', 503); }

    return json({
      ok:          true,
      id:          body.id,
      status:      'submitted',
      pdfName:     body.pdfName,
      pdfWebUrl:   body.pdfWebUrl  || null,
      emailedTo:   body.emailedTo  || null,
      sentAt:      body.sentAt     || null,
      emailWarning: ttEmailWarning || undefined,
    });
  }

  return jsonErr('Unknown action', 400);
}
