// Cloudflare Pages Function -- /api/opportunity
// BD CRM Opportunities: capture/edit, feasibility recommendation, go/pass
// decision, and the EMAIL-BRIDGE flags an external email daemon reads/writes.
//
// WHAT IT STORES (KV overlay on top of the read-only base data/opportunities.js):
//   opp_overlay_v1 -> JSON {
//     opportunities: [ {
//       id, fields:{...}, recommendation, recommendationReasons:[...], recRule,
//       emailStatus:'pending'|'sent', emailedAt, messageId,
//       decision:null|'prelim'|'passed', decidedBy, decidedAt, passReason,
//       preconHandoff:bool, addedBy, addedAt, updatedAt
//     } ],
//     meta:{updated}
//   }
//   New records get a server-issued id (ov_op_*) so they never collide with the
//   ingested base ids (op_*). The UI merges base + overlay.
//
// KV KEY: env.PF_SCHEDULE :: 'opp_overlay_v1' (shared namespace, distinct key).
//
// TWO AUTH TIERS (clearly separated; each action calls requireArea itself):
//   business_dev actions (the normal UI writes + reads):
//     GET (full overlay), POST {action:'create'|'update'|'decide'}
//   ADMIN-ONLY actions (the external email daemon authenticates as admin):
//     GET ?pending=1            -> opps with emailStatus=='pending'
//     POST {action:'mark-emailed'} -> sets emailStatus='sent', emailedAt=now
//   The middleware gates the PATH at business_dev (field_ops BLOCKED). The
//   admin-only actions additionally requireArea('opp_email_bridge') so a
//   business_dev session is DENIED them. Fails CLOSED.
//
// WRITE HARDENING (mirrors api/bd-record.js): body cap, strict JSON->400,
// fields rebuilt against a length cap, angle brackets stripped, server-set audit
// fields, no eval, private no-store.

import { requireArea } from '../lib/auth.js';
import { score, VERSION as FEAS_VERSION } from '../lib/feasibility.js';

const KV_KEY = 'opp_overlay_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RECORDS = 5000;
const MAX_FIELDS = 40;
const MAX_STR = 1000;
const MAX_NAME = 200;

const VALID_ACTIONS = { create: 1, update: 1, decide: 1, 'mark-emailed': 1 };
const ADMIN_ACTIONS = { 'mark-emailed': 1 };       // admin-only POST actions
const VALID_DECISION = { prelim: 1, passed: 1 };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = MAX_STR) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function rid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Clean a fields object: drop unknown-shaped input, cap count + length, strip <>.
function cleanFields(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(input)) {
    if (n >= MAX_FIELDS) break;
    const key = s(k, MAX_NAME);
    if (!key) continue;
    out[key] = s(input[k], MAX_STR);
    n++;
  }
  return out;
}

// KNOWN LIMITATION: this is a KV read-modify-write (load overlay -> mutate ->
// put). KV has no transaction, so two simultaneous writes can last-writer-wins
// and drop one. Acceptable for BD's low-concurrency opportunity flow; the
// durable fix is a D1 migration with a row per opportunity. No behavior change.
async function loadOverlay(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { opportunities: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return {
      opportunities: Array.isArray(p && p.opportunities) ? p.opportunities : [],
      meta: (p && p.meta) || { updated: null },
    };
  } catch {
    return { opportunities: [], meta: { updated: null } };
  }
}

async function saveOverlay(env, ov) {
  const stamp = new Date().toISOString();
  const state = { version: 1, opportunities: ov.opportunities, meta: { updated: stamp } };
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(state));
  return stamp;
}

function findOpp(ov, id) {
  for (const o of ov.opportunities) if (o.id === id) return o;
  return null;
}

// Compute + attach the feasibility recommendation to an overlay record.
function applyRecommendation(rec) {
  const r = score(rec);
  rec.recommendation = r.recommendation;
  rec.recommendationReasons = r.reasons;
  rec.recRule = r.rule;
  rec.recVersion = FEAS_VERSION;
  return rec;
}

// ---- GET --------------------------------------------------------------------
// ?pending=1 -> ADMIN ONLY (email daemon): opps awaiting email.
// (no query) -> business_dev: the full overlay.
export async function onRequestGet(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  try {
    const url = new URL(request.url);
    const pending = url.searchParams.get('pending');

    if (pending === '1' || pending === 'true') {
      const denied = requireArea(session, 'opp_email_bridge'); // ADMIN ONLY
      if (denied) return denied;
      if (!env.PF_SCHEDULE) {
        return json({ ok: true, opportunities: [], fallback: true,
          note: 'KV binding PF_SCHEDULE not available; no opportunities yet.' });
      }
      const ov = await loadOverlay(env);
      const items = ov.opportunities
        .filter((o) => o.emailStatus === 'pending')
        .map((o) => ({
          id: o.id,
          fields: o.fields,
          recommendation: o.recommendation,
          recommendationReasons: o.recommendationReasons,
          recRule: o.recRule,
          emailStatus: o.emailStatus,
          addedBy: o.addedBy,
          addedAt: o.addedAt,
        }));
      return json({ ok: true, pending: true, opportunities: items, count: items.length });
    }

    // Normal full read — business_dev.
    const denied = requireArea(session, 'business_dev');
    if (denied) return denied;
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, opportunities: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no opportunity overlay yet.' });
    }
    const ov = await loadOverlay(env);
    return json({ ok: true, opportunities: ov.opportunities, meta: ov.meta });
  } catch (err) {
    console.error('api/opportunity GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
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
        message: "action must be 'create', 'update', 'decide', or 'mark-emailed'." }, 400);
    }

    // AUTH TIER: admin-only action vs business_dev action. Enforced per-action.
    if (ADMIN_ACTIONS[action]) {
      const denied = requireArea(session, 'opp_email_bridge'); // ADMIN ONLY
      if (denied) return denied;
    } else {
      const denied = requireArea(session, 'business_dev');     // create/update/decide
      if (denied) return denied;
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const ov = await loadOverlay(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();

    // ---- CREATE (business_dev) ----
    if (action === 'create') {
      if (ov.opportunities.length >= MAX_RECORDS) {
        return json({ status: 'error', message: 'Opportunity overlay storage is full.' }, 413);
      }
      const fields = cleanFields(parsed.fields);
      const name = s(fields['Project Name'] || fields.projectName || '', MAX_NAME);
      if (!name) return json({ status: 'error', message: 'A Project Name is required.' }, 400);
      fields['Project Name'] = name;

      let rec = {
        id: rid('ov_op_'),
        fields,
        emailStatus: 'pending',
        emailedAt: null,
        messageId: null,
        decision: null,
        decidedBy: null,
        decidedAt: null,
        passReason: null,
        preconHandoff: false,
        addedBy: who,
        addedAt: nowIso,
        updatedAt: nowIso,
      };
      rec = applyRecommendation(rec);
      ov.opportunities.push(rec);
      const stamp = await saveOverlay(env, ov);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- UPDATE (business_dev) ----
    if (action === 'update') {
      const id = s(parsed.id, MAX_NAME);
      const rec = findOpp(ov, id);
      if (!rec) return json({ status: 'error', message: 'Opportunity not found.' }, 404);
      const fields = cleanFields(parsed.fields);
      const name = s(fields['Project Name'] || rec.fields['Project Name'] || '', MAX_NAME);
      if (!name) return json({ status: 'error', message: 'A Project Name is required.' }, 400);
      fields['Project Name'] = name;
      rec.fields = fields;
      rec.updatedAt = nowIso;
      applyRecommendation(rec);  // recompute on edit
      const stamp = await saveOverlay(env, ov);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- DECIDE (business_dev): go-to-precon prelim OR pass ----
    if (action === 'decide') {
      const id = s(parsed.id, MAX_NAME);
      const decision = String(parsed.decision || '');
      if (!VALID_DECISION[decision]) {
        return json({ status: 'error', message: "decision must be 'prelim' or 'passed'." }, 400);
      }
      const rec = findOpp(ov, id);
      if (!rec) return json({ status: 'error', message: 'Opportunity not found.' }, 404);
      rec.decision = decision;
      rec.decidedBy = who;
      rec.decidedAt = nowIso;
      rec.updatedAt = nowIso;
      if (decision === 'prelim') {
        rec.preconHandoff = true;   // flag for the later precon prelim handoff
        rec.passReason = null;
      } else { // passed
        rec.preconHandoff = false;
        rec.passReason = s(parsed.passReason || '', MAX_STR);
      }
      const stamp = await saveOverlay(env, ov);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- MARK-EMAILED (ADMIN ONLY: the email daemon) ----
    if (action === 'mark-emailed') {
      const id = s(parsed.id, MAX_NAME);
      const rec = findOpp(ov, id);
      if (!rec) return json({ status: 'error', message: 'Opportunity not found.' }, 404);
      rec.emailStatus = 'sent';
      rec.emailedAt = nowIso;
      if (parsed.messageId) rec.messageId = s(parsed.messageId, MAX_NAME);
      rec.updatedAt = nowIso;
      const stamp = await saveOverlay(env, ov);
      return json({ ok: true, saved: true, action, id: rec.id,
        emailStatus: rec.emailStatus, emailedAt: rec.emailedAt, meta: { updated: stamp } });
    }

    return json({ status: 'error', message: 'Unhandled action.' }, 400);
  } catch (err) {
    console.error('api/opportunity POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
