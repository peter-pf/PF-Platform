// Cloudflare Pages Function -- /api/precon-action
// Preconstruction ACTION ITEMS: date-based to-dos with a completion log. Single
// KV list overlay (like bd_overlay_v1). Feeds the bid calendar / agenda view.
// NO mail, NO outbound fetch.
//
// WHAT IT STORES
//   precon_actions_v1 -> JSON { actions:[{
//     id, title, dueDate, assignee, linkedBidId, priority, status, note,
//     createdBy, createdAt, updatedAt, completedBy, completedAt, deleted
//   }], meta:{updated} }
//   priority is DERIVED from dueDate on write (overdue / due-soon / upcoming /
//   none) so it is never a hardcoded calendar date. status: 'open' | 'done'.
//   Soft delete: deleted=true (kept for the completion/audit log, hidden in UI).
//
// KV KEY: env.PF_SCHEDULE :: 'precon_actions_v1'.
//
// SECURITY MODEL:
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - PRECONSTRUCTION area enforced HERE via requireArea on ALL methods AND in
//     lib/auth.js areaForPath('/api/precon-action') -> 'preconstruction'.
//     admin/partner/business_dev allowed; field_ops + unauth -> 403 (by direct
//     URL too). Fails CLOSED.
//   - WRITE hardening (mirrors api/precon-log.js): body cap, strict JSON -> 400,
//     fields rebuilt + length-capped, angle brackets stripped, server-set audit +
//     completedBy/At from the session, no eval. Private no-store.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'precon_actions_v1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_ITEMS = 5000;
const MAX_STR = 4000;          // note cap
const MAX_SHORT = 300;         // title/assignee/bidId/date cap

const VALID_ACTIONS = { create: 1, complete: 1, update: 1, delete: 1, reopen: 1 };
const VALID_STATUS = { open: 1, done: 1 };

// Priority derivation thresholds (days). v1 defaults.
const DUE_SOON_DAYS = 7;

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
  return str.replace(/[<>]/g, ''); // strip angle brackets (UI also escapes)
}

function isoDateOrEmpty(v) {
  const str = String(v == null ? '' : v).slice(0, 40);
  if (!str.trim()) return '';
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

// Derive priority from a due date string + "now". Never a hardcoded date.
function derivePriority(dueDate, nowMs) {
  if (!dueDate) return 'none';
  const due = new Date(dueDate + 'T00:00:00Z');
  if (Number.isNaN(due.getTime())) return 'none';
  // Anchor BOTH ends to UTC midnight so this matches the client rule exactly.
  // Measuring from the raw instant would flip a due-today item to overdue after
  // midday UTC, disagreeing with the on-screen badge.
  const n = new Date(nowMs);
  const todayMs = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const days = Math.round((due.getTime() - todayMs) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

function rid() {
  return 'pa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// KNOWN LIMITATION: KV read-modify-write (load list -> mutate -> put), no
// transaction, so two simultaneous writes can last-writer-wins and drop one.
// Acceptable for precon's low-concurrency to-do flow; the durable fix is a D1
// migration with a row per action. No behavior change now.
async function loadList(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { actions: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return { actions: Array.isArray(p && p.actions) ? p.actions : [], meta: (p && p.meta) || { updated: null } };
  } catch {
    return { actions: [], meta: { updated: null } };
  }
}

async function saveList(env, actions) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, actions, meta: { updated: stamp } }));
  return stamp;
}

function findAction(list, id) {
  for (const a of list.actions) if (a.id === id) return a;
  return null;
}

// Recompute priority for every action against "now" (priority is a derived view,
// stored for convenience but always refreshed on read so it never goes stale).
function withFreshPriority(actions, nowMs) {
  return actions.map((a) => Object.assign({}, a, { priority: derivePriority(a.dueDate, nowMs) }));
}

// ---- GET: list all (non-deleted) actions, priority refreshed --------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, actions: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no action items yet.' });
    }
    const list = await loadList(env);
    const now = Date.now();
    const visible = withFreshPriority(list.actions.filter((a) => !a.deleted), now);
    return json({ ok: true, actions: visible, meta: list.meta });
  } catch (err) {
    console.error('api/precon-action GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: create / complete / update / reopen / delete (soft) -------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'preconstruction');
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
      return json({ status: 'error',
        message: "action must be 'create', 'complete', 'update', 'reopen', or 'delete'." }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const list = await loadList(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (action === 'create') {
      if (list.actions.length >= MAX_ITEMS) {
        return json({ status: 'error', message: 'Action item storage is full.' }, 413);
      }
      const title = s(parsed.title, MAX_SHORT);
      if (!title) return json({ status: 'error', message: 'A title is required.' }, 400);
      const dueDate = isoDateOrEmpty(parsed.dueDate);
      const rec = {
        id: rid(),
        title,
        dueDate,
        assignee: s(parsed.assignee, MAX_SHORT),
        linkedBidId: s(parsed.linkedBidId, MAX_SHORT),
        priority: derivePriority(dueDate, nowMs),
        status: 'open',
        note: s(parsed.note, MAX_STR),
        createdBy: who,
        createdAt: nowIso,
        updatedAt: nowIso,
        completedBy: null,
        completedAt: null,
        deleted: false,
      };
      list.actions.push(rec);
      const stamp = await saveList(env, list.actions);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // all other actions need an id
    const id = s(parsed.id, MAX_SHORT);
    const rec = findAction(list, id);
    if (!rec) return json({ status: 'error', message: 'Action item not found.' }, 404);

    if (action === 'complete') {
      rec.status = 'done';
      rec.completedBy = who;
      rec.completedAt = nowIso;
      rec.updatedAt = nowIso;
    } else if (action === 'reopen') {
      rec.status = 'open';
      rec.completedBy = null;
      rec.completedAt = null;
      rec.updatedAt = nowIso;
    } else if (action === 'update') {
      if (parsed.title != null) {
        const title = s(parsed.title, MAX_SHORT);
        if (!title) return json({ status: 'error', message: 'A title is required.' }, 400);
        rec.title = title;
      }
      if (parsed.dueDate != null) rec.dueDate = isoDateOrEmpty(parsed.dueDate);
      if (parsed.assignee != null) rec.assignee = s(parsed.assignee, MAX_SHORT);
      if (parsed.linkedBidId != null) rec.linkedBidId = s(parsed.linkedBidId, MAX_SHORT);
      if (parsed.note != null) rec.note = s(parsed.note, MAX_STR);
      if (parsed.status != null) {
        const st = String(parsed.status);
        if (!VALID_STATUS[st]) return json({ status: 'error', message: "status must be 'open' or 'done'." }, 400);
        rec.status = st;
      }
      rec.priority = derivePriority(rec.dueDate, nowMs);
      rec.updatedAt = nowIso;
    } else if (action === 'delete') {
      rec.deleted = true;     // soft delete (kept for audit)
      rec.updatedAt = nowIso;
    }

    const stamp = await saveList(env, list.actions);
    return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/precon-action POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
