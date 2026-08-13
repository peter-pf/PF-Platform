// Cloudflare Pages Function -- /api/pm-project
// AWARD -> PROJECT MANAGEMENT handoff (the assembly line). When a precon bid is
// marked Awarded (the existing pipeline-state fork) or an opportunity is decided
// to prelim->awarded, the platform assigns the NEXT project number and creates a
// PM project record that CARRIES the BD + precon history (linked by id). KV
// overlay on top of the existing project space; NO mail.
//
// WHAT IT STORES
//   pm_projects_v1 -> JSON { projects:[{
//     id, projectNumber, name, gc, value, status,         // status: 'current' (default)
//     sourceBidId,            // precon bidLogId (Project Number else hash name+gc)
//     sourceOppId,            // opportunity overlay id, if it came from an opp
//     history,                // free carry-through of BD/precon context (capped)
//     awardedAt, awardedBy, createdAt, updatedAt
//   }], meta:{updated} }
//
// PROJECT NUMBER SCHEME (v1, confirm with Brad):
//   "YY-NNN" (e.g. 26-018). The NEXT number is derived from the MAX existing NNN
//   for the CURRENT year across BOTH (a) the existing base numbers the client
//   sends (from project-master.json / awarded-projects.js) and (b) numbers this
//   overlay already assigned. Zero padded to 3 digits. A new calendar year
//   restarts at 001. Idempotency: if a sourceBidId already has a PM project, the
//   existing record is returned (the same award is never assigned twice).
//
// KV KEY: env.PF_SCHEDULE :: 'pm_projects_v1'.
//
// SECURITY MODEL:
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - PROJECTS/PRECON area: requireArea(session, 'preconstruction') on ALL
//     methods (the handoff is a precon action; preconstruction = admin/partner/
//     business_dev) AND /api/pm-project -> 'preconstruction' in areaForPath.
//     field_ops + unauth -> 403 (by direct URL too). Fails CLOSED.
//   - WRITE hardening: body cap, strict JSON -> 400, fields rebuilt + capped,
//     angle brackets stripped, audit + awardedBy from session, no eval. Private
//     no-store. The history blob is length-capped + angle-bracket stripped.
//   - NO mail, NO outbound fetch.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'pm_projects_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RECORDS = 5000;
const MAX_STR = 300;
const MAX_HISTORY = 8000;     // carried BD/precon context blob cap
const VALID_ACTIONS = { create: 1, update: 1, complete: 1 };
const VALID_STATUS = { current: 1, completed: 1 };

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

function rid() {
  return 'pm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Parse a "YY-NNN" project number -> { yy, n } or null.
function parseNum(pn) {
  const m = String(pn || '').trim().match(/^(\d{2})-(\d{1,4})$/);
  if (!m) return null;
  return { yy: m[1], n: parseInt(m[2], 10) };
}

// Compute the next "YY-NNN" for `yy`, given a set of taken numbers.
function nextNumber(yy, takenNs) {
  let max = 0;
  takenNs.forEach((n) => { if (n > max) max = n; });
  const next = max + 1;
  return yy + '-' + String(next).padStart(3, '0');
}

// Current 2-digit year in PF's local time (Eastern / Indiana). A project number
// is a human-meaningful job number, so it must follow Brad's calendar, not UTC.
// (A UTC clock would mint next year's number on the evening of Dec 31 Eastern.)
function currentYY() {
  let y;
  try {
    y = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric',
    }).format(new Date());
  } catch (e) {
    y = String(new Date().getUTCFullYear());
  }
  return String(y).slice(-2);
}

// KNOWN LIMITATION: KV read-modify-write (load -> assign number -> put), no
// transaction, so two simultaneous awards could in theory derive the same next
// number and last-writer-wins. Acceptable for PF's low-concurrency award flow
// (awards are deliberate, rare, one user at a time); the durable fix is a D1
// migration with a sequence/unique constraint. No behavior change now.
async function loadList(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { projects: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return { projects: Array.isArray(p && p.projects) ? p.projects : [], meta: (p && p.meta) || { updated: null } };
  } catch {
    return { projects: [], meta: { updated: null } };
  }
}

async function saveList(env, projects) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, projects, meta: { updated: stamp } }));
  return stamp;
}

// ---- GET: list PM overlay projects ----------------------------------------
export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'preconstruction');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, projects: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no PM overlay projects yet.' });
    }
    const list = await loadList(env);
    return json({ ok: true, projects: list.projects, meta: list.meta });
  } catch (err) {
    console.error('api/pm-project GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: create (award handoff) / update / complete ----------------------
// create body: { action:'create', name, gc?, value?, sourceBidId?, sourceOppId?,
//                history?, existingNumbers?:[..], year?:'YY' }
//   existingNumbers: the base project numbers the client knows (from
//   project-master.json / awarded-projects.js) so the next number never collides
//   with the live space. year overrides the current year (rare; e.g. backdating).
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
      return json({ status: 'error', message: "action must be 'create', 'update', or 'complete'." }, 400);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const list = await loadList(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();

    if (action === 'create') {
      const name = s(parsed.name, MAX_STR);
      if (!name) return json({ status: 'error', message: 'A project name is required.' }, 400);

      // IDEMPOTENCY: if this sourceBidId already has a PM project, return it.
      const sourceBidId = s(parsed.sourceBidId, MAX_STR);
      if (sourceBidId) {
        const existing = list.projects.find((p) => p.sourceBidId && p.sourceBidId === sourceBidId);
        if (existing) {
          return json({ ok: true, saved: false, alreadyLinked: true, action, record: existing,
            meta: list.meta });
        }
      }

      if (list.projects.length >= MAX_RECORDS) {
        return json({ status: 'error', message: 'PM project storage is full.' }, 413);
      }

      // ---- derive the next project number (YY-NNN) ----
      const yy = (/^\d{2}$/.test(String(parsed.year || ''))) ? String(parsed.year) : currentYY();
      const takenNs = [];
      // base numbers the client sent (project-master.json / awarded-projects.js)
      if (Array.isArray(parsed.existingNumbers)) {
        parsed.existingNumbers.forEach((pn) => { const p = parseNum(pn); if (p && p.yy === yy) takenNs.push(p.n); });
      }
      // numbers this overlay already assigned (so re-runs never collide)
      list.projects.forEach((p) => { const pp = parseNum(p.projectNumber); if (pp && pp.yy === yy) takenNs.push(pp.n); });

      // Feature 2 (Brad 2026-08-13): the client may pass an EXPLICIT projectNumber
      // (the office CONFIRMED or OVERRODE the prefilled suggestion). Honor it when it
      // is a valid YY-NNN AND not already taken in the overlay; otherwise FAIL SAFE to
      // the server's derived next number (never assign a malformed/duplicate number).
      let projectNumber;
      const requested = parseNum(parsed.projectNumber);
      const overlayHas = (pn) => list.projects.some((p) => String(p.projectNumber || '') === String(pn));
      if (requested && String(parsed.projectNumber).trim() && !overlayHas(String(parsed.projectNumber).trim())) {
        projectNumber = String(parsed.projectNumber).trim();
      } else {
        projectNumber = nextNumber(yy, takenNs);
      }

      const rec = {
        id: rid(),
        projectNumber,
        name,
        gc: s(parsed.gc, MAX_STR),
        value: s(parsed.value, MAX_STR),
        status: 'current',
        sourceBidId,
        sourceOppId: s(parsed.sourceOppId, MAX_STR),
        history: s(parsed.history, MAX_HISTORY),
        awardedAt: nowIso,
        awardedBy: who,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      list.projects.push(rec);
      const stamp = await saveList(env, list.projects);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // update / complete need an id
    const id = s(parsed.id, MAX_STR);
    const rec = list.projects.find((p) => p.id === id);
    if (!rec) return json({ status: 'error', message: 'PM project not found.' }, 404);

    if (action === 'complete') {
      rec.status = 'completed';
      rec.completedAt = nowIso;
      rec.completedBy = who;
      rec.updatedAt = nowIso;
    } else { // update
      if (parsed.name != null) {
        const name = s(parsed.name, MAX_STR);
        if (!name) return json({ status: 'error', message: 'A project name is required.' }, 400);
        rec.name = name;
      }
      if (parsed.gc != null) rec.gc = s(parsed.gc, MAX_STR);
      if (parsed.value != null) rec.value = s(parsed.value, MAX_STR);
      if (parsed.history != null) rec.history = s(parsed.history, MAX_HISTORY);
      if (parsed.status != null) {
        const st = String(parsed.status);
        if (!VALID_STATUS[st]) return json({ status: 'error', message: "status must be 'current' or 'completed'." }, 400);
        rec.status = st;
      }
      rec.updatedAt = nowIso;
    }

    const stamp = await saveList(env, list.projects);
    return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/pm-project POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
