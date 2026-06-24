// Cloudflare Pages Function -- /api/bd-send
// BD quick-send: editable email TEMPLATES, an attachment-doc REGISTRY, and a
// QUEUE of pending sends. SENDING IS INTENTIONALLY OFF. This endpoint NEVER
// sends email and NEVER calls a mail API (no graph/smtp/mail fetch anywhere).
// The "queue send" action only writes a record with status 'queued'. A FUTURE
// external daemon (authenticating as admin) reads the queue and sends; this
// endpoint just exposes the bridge it will use.
//
// WHAT IT STORES (two KV keys on env.PF_SCHEDULE):
//   bd_templates_v1 -> { templates:[{id,name,subject,body}],
//                        docs:[{id,name,reference,status}], meta:{updated} }
//     Overlay on top of the read-only seed data/bd-templates.js. business_dev
//     can edit templates + set doc references.
//   bd_sends_v1     -> { sends:[{ id, to, contactId, templateId, attachments:[],
//                        renderedSubject, renderedBody, status, queuedBy,
//                        queuedAt, sentAt, messageId }], meta:{updated} }
//     status: 'queued' (set by BD) -> 'sent' (set by the admin daemon later).
//
// TWO AUTH TIERS (each action calls requireArea itself):
//   business_dev: GET (templates+docs+sends), POST {action:'save-template'|
//                 'save-doc'|'queue'}
//   ADMIN ONLY (the future send daemon): GET ?pending=1, POST {action:'mark-sent'}
//                 via the bd_send_bridge area.
//   The middleware gates the PATH at business_dev (field_ops BLOCKED). Admin
//   actions are re-checked with bd_send_bridge so business_dev is DENIED them.
//   Fails CLOSED.
//
// WRITE HARDENING (mirrors api/opportunity.js): body cap, strict JSON->400,
// rebuilt + length-capped fields, angle brackets stripped, audit fields
// server-set, no eval, private no-store.

import { requireArea } from '../lib/auth.js';

const KV_TEMPLATES = 'bd_templates_v1';
const KV_SENDS = 'bd_sends_v1';
const MAX_BODY_BYTES = 64 * 1024;     // a rendered email body can be larger
const MAX_RECORDS = 5000;
const MAX_STR = 8000;                 // template/email body cap
const MAX_SHORT = 300;
const MAX_LIST = 20;                  // attachments per send

const VALID_ACTIONS = { 'save-template': 1, 'save-doc': 1, 'queue': 1, 'mark-sent': 1 };
const ADMIN_ACTIONS = { 'mark-sent': 1 };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function rid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// KNOWN LIMITATION: KV read-modify-write (load -> mutate -> put), no transaction,
// so two simultaneous writes can last-writer-wins and drop one. Acceptable for
// BD's low-concurrency flow; the durable fix is a D1 migration. No behavior change.
async function loadKV(env, key, listProp) {
  const raw = await env.PF_SCHEDULE.get(key);
  if (!raw) return { [listProp]: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return { [listProp]: Array.isArray(p && p[listProp]) ? p[listProp] : [], meta: (p && p.meta) || { updated: null } };
  } catch {
    return { [listProp]: [], meta: { updated: null } };
  }
}

async function putKV(env, key, listProp, list) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(key, JSON.stringify({ version: 1, [listProp]: list, meta: { updated: stamp } }));
  return stamp;
}

// ---- GET --------------------------------------------------------------------
// ?pending=1 -> ADMIN ONLY: queued sends awaiting a real send (future daemon).
// (no query) -> business_dev: templates overlay + docs + all sends.
export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  try {
    const url = new URL(request.url);
    const pending = url.searchParams.get('pending');

    if (pending === '1' || pending === 'true') {
      const denied = requireArea(session, 'bd_send_bridge'); // ADMIN ONLY
      if (denied) return denied;
      if (!env.PF_SCHEDULE) {
        return json({ ok: true, sends: [], fallback: true,
          note: 'KV binding PF_SCHEDULE not available; no queued sends yet.' });
      }
      const st = await loadKV(env, KV_SENDS, 'sends');
      const items = st.sends.filter((x) => x.status === 'queued');
      return json({ ok: true, pending: true, count: items.length, sends: items });
    }

    const denied = requireArea(session, 'business_dev');
    if (denied) return denied;
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, templates: [], docs: [], sends: [], fallback: true,
        note: 'KV binding PF_SCHEDULE not available; templates+sends overlay empty.' });
    }
    const tpl = await loadKV(env, KV_TEMPLATES, 'templates');
    const tplRaw = await env.PF_SCHEDULE.get(KV_TEMPLATES);
    let docs = [];
    try { const p = JSON.parse(tplRaw || '{}'); docs = Array.isArray(p.docs) ? p.docs : []; } catch { docs = []; }
    const snd = await loadKV(env, KV_SENDS, 'sends');
    return json({ ok: true, templates: tpl.templates, docs, sends: snd.sends, meta: tpl.meta });
  } catch (err) {
    console.error('api/bd-send GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// load both lists in the templates KV (templates + docs share one key).
async function loadTemplatesDocs(env) {
  const raw = await env.PF_SCHEDULE.get(KV_TEMPLATES);
  if (!raw) return { templates: [], docs: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return {
      templates: Array.isArray(p.templates) ? p.templates : [],
      docs: Array.isArray(p.docs) ? p.docs : [],
      meta: p.meta || { updated: null },
    };
  } catch {
    return { templates: [], docs: [], meta: { updated: null } };
  }
}

async function putTemplatesDocs(env, templates, docs) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_TEMPLATES, JSON.stringify({ version: 1, templates, docs, meta: { updated: stamp } }));
  return stamp;
}

// ---- POST -------------------------------------------------------------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
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
      return json({ status: 'error',
        message: "action must be 'save-template', 'save-doc', 'queue', or 'mark-sent'." }, 400);
    }

    // AUTH TIER per action.
    if (ADMIN_ACTIONS[action]) {
      const denied = requireArea(session, 'bd_send_bridge'); // ADMIN ONLY
      if (denied) return denied;
    } else {
      const denied = requireArea(session, 'business_dev');
      if (denied) return denied;
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();

    // ---- SAVE-TEMPLATE (business_dev): add or update an email template ----
    if (action === 'save-template') {
      const td = await loadTemplatesDocs(env);
      const name = s(parsed.name, MAX_SHORT);
      if (!name) return json({ status: 'error', message: 'A template name is required.' }, 400);
      const rec = {
        id: s(parsed.id, MAX_SHORT) || rid('tpl_ov_'),
        name,
        subject: s(parsed.subject, MAX_STR),
        body: s(parsed.body, MAX_STR),
        updatedBy: who,
        updatedAt: nowIso,
      };
      const i = td.templates.findIndex((t) => t.id === rec.id);
      if (i >= 0) td.templates[i] = rec; else td.templates.push(rec);
      if (td.templates.length > MAX_RECORDS) return json({ status: 'error', message: 'Too many templates.' }, 413);
      const stamp = await putTemplatesDocs(env, td.templates, td.docs);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- SAVE-DOC (business_dev): set a doc-registry reference ----
    if (action === 'save-doc') {
      const td = await loadTemplatesDocs(env);
      const id = s(parsed.id, MAX_SHORT);
      const name = s(parsed.name, MAX_SHORT);
      if (!id && !name) return json({ status: 'error', message: 'A doc id or name is required.' }, 400);
      const reference = s(parsed.reference, MAX_STR);
      const rec = {
        id: id || rid('doc_ov_'),
        name: name,
        reference: reference,
        status: reference ? 'provided' : 'pending',
        updatedBy: who,
        updatedAt: nowIso,
      };
      const i = td.docs.findIndex((d) => d.id === rec.id);
      if (i >= 0) { rec.name = rec.name || td.docs[i].name; td.docs[i] = rec; } else td.docs.push(rec);
      const stamp = await putTemplatesDocs(env, td.templates, td.docs);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- QUEUE (business_dev): record a pending send. NO EMAIL IS SENT. ----
    if (action === 'queue') {
      const st = await loadKV(env, KV_SENDS, 'sends');
      if (st.sends.length >= MAX_RECORDS) return json({ status: 'error', message: 'Send queue is full.' }, 413);
      const renderedSubject = s(parsed.renderedSubject, MAX_STR);
      const renderedBody = s(parsed.renderedBody, MAX_STR);
      const to = s(parsed.to, MAX_SHORT);
      if (!renderedBody) return json({ status: 'error', message: 'A rendered email body is required.' }, 400);
      const attachments = Array.isArray(parsed.attachments)
        ? parsed.attachments.slice(0, MAX_LIST).map((a) => s(a, MAX_SHORT)).filter(Boolean)
        : [];
      const rec = {
        id: rid('snd_'),
        to,
        contactId: s(parsed.contactId, MAX_SHORT),
        templateId: s(parsed.templateId, MAX_SHORT),
        attachments,
        renderedSubject,
        renderedBody,
        status: 'queued',          // QUEUE ONLY — sending is off
        queuedBy: who,
        queuedAt: nowIso,
        sentAt: null,
        messageId: null,
      };
      st.sends.push(rec);
      const stamp = await putKV(env, KV_SENDS, 'sends', st.sends);
      return json({ ok: true, saved: true, queued: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- MARK-SENT (ADMIN ONLY: the future send daemon) ----
    if (action === 'mark-sent') {
      const st = await loadKV(env, KV_SENDS, 'sends');
      const id = s(parsed.id, MAX_SHORT);
      const rec = st.sends.find((x) => x.id === id);
      if (!rec) return json({ status: 'error', message: 'Send record not found.' }, 404);
      rec.status = 'sent';
      rec.sentAt = nowIso;
      if (parsed.messageId) rec.messageId = s(parsed.messageId, MAX_SHORT);
      const stamp = await putKV(env, KV_SENDS, 'sends', st.sends);
      return json({ ok: true, saved: true, action, id: rec.id, status: rec.status,
        sentAt: rec.sentAt, meta: { updated: stamp } });
    }

    return json({ status: 'error', message: 'Unhandled action.' }, 400);
  } catch (err) {
    console.error('api/bd-send POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
