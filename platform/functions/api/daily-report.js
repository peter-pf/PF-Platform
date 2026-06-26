// Cloudflare Pages Function -- /api/daily-report
// FIELD OPERATIONS daily reports. This is the FIRST field_ops WRITE surface.
// A foreman/leader submits a daily report per project per day; the crew hours on
// it feed a timesheet view; the report carries an in-platform APPROVAL STATUS
// flow (submitted -> approved -> sent-to-HR). NO mail anywhere (the "sent for
// approval" step is a STATUS transition only). ZERO financials: this endpoint
// stores hours, narrative, production counts, safety - NO dollars, rates, or
// costs are accepted or returned.
//
// WHAT IT STORES
//   daily_reports_v1 -> JSON { reports:[{
//     id, date, projectId, projectName, foreman,
//     crew:[{name, hours, costCode}],        // HOURS only, NO pay rate / $
//     weather, workCompleted, columnsInstalled, lfInstalled, equipment,
//     delays, safety,
//     equipmentOwned:[{machine, hours}],      // OWNED machines on site + OPERATING hours (for maintenance) -- NO $
//     equipmentRental:[{category, hours}],    // RENTAL by category + OPERATING hours -- NO $
//     maintenance:[{category, item, hourAtFailure}], // 5 fixed rows (Excavator/Mast/Vibro/Drill/Rental Equipment) -- NO $
//     futureIssues:[{equipment, description}],// maintenance to identify later (feeds a Phase 2 compiled view) -- NO $
//     status,                                // 'draft'|'submitted'|'approved'|'sent-to-HR'
//     createdBy, createdAt, updatedAt,
//     submittedBy, submittedAt,              // set from session on submit
//     approvedBy, approvedAt,                // privileged-only transition
//     sentToHrBy, sentToHrAt                 // privileged-only transition (NO email)
//   }], meta:{updated} }
//   ALL fields are "v1 default - confirm with Brad".
//
// KV KEY: env.PF_SCHEDULE :: 'daily_reports_v1'.
//
// RBAC (the critical part):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FIELD_OPS area: requireArea(session, 'field_ops') on GET and POST. The
//     field_ops area = admin/partner/business_dev/field_ops, so the CREW can
//     read+write daily reports. /api/daily-report -> 'field_ops' in areaForPath.
//     This area exposes ZERO financials - it is operational only.
//   - APPROVAL transitions ('approve', 'send-to-hr') require a PRIVILEGED role
//     (admin/partner): a field_ops session can CREATE/UPDATE/SUBMIT a report but
//     CANNOT approve it or send it to HR. Enforced in-handler.
//   - WRITE hardening (mirrors precon-log/bd-interaction): body cap, strict JSON
//     -> 400, fields rebuilt + length-capped, angle brackets stripped, server-set
//     audit + submittedBy/At from session, no eval. Private no-store.
//   - NO mail, NO outbound fetch.

import { requireArea } from '../lib/auth.js';

const KV_KEY = 'daily_reports_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_REPORTS = 20000;
const MAX_CREW = 60;
const MAX_STR = 4000;        // narrative cap
const MAX_SHORT = 300;       // name/project/date/etc cap
const MAX_EQUIP_ROWS = 50;   // owned / rental equipment rows cap
const MAX_MAINT_ROWS = 20;   // maintenance rows cap (UI sends the 5 fixed categories)
const MAX_FUTURE_ROWS = 50;  // future-issue rows cap

const VALID_ACTIONS = { create: 1, update: 1, submit: 1, approve: 1, 'send-to-hr': 1 };
const VALID_STATUS = { draft: 1, submitted: 1, approved: 1, 'sent-to-HR': 1 };
const PRIVILEGED_ACTIONS = { approve: 1, 'send-to-hr': 1 };

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

// Crew worked-hours for ONE day: a non-negative number capped at 24. Returns a
// number or null. NEVER money. Use ONLY for crew.hours (a single-day timesheet
// line cannot exceed 24h). Do NOT use for equipment hour-meter readings.
function hours(v) {
  if (v == null || String(v).trim() === '') return null;
  // Parse BEFORE stripping so a negative value is actually rejected (stripping
  // the minus first would silently turn "-5" into 5).
  let n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  if (n > 24) n = 24;        // a single-day timesheet line cannot exceed 24h
  return Math.round(n * 100) / 100;
}

// Equipment OPERATING hours / hour-meter reading: a non-negative number with NO
// 24h cap (machine meters routinely read in the hundreds or thousands, e.g.
// 1450). Returns a number or null. NEVER money. A safety cap of 1,000,000 bounds
// abuse. Same parse-before-strip negative rejection as hours().
function meterHours(v) {
  if (v == null || String(v).trim() === '') return null;
  let n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  if (n > 1000000) n = 1000000; // bound abuse; real meters never approach this
  return Math.round(n * 10) / 10; // one decimal is plenty for a meter reading
}

// A whole-number production count (columns / LF), or null.
function count(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return isFinite(n) && n >= 0 ? n : null;
}

function isoDateOrToday(v) {
  const str = String(v == null ? '' : v).slice(0, 40);
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function rid() {
  return 'dr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Rebuild a clean crew array (HOURS ONLY - no pay rate / $ accepted).
function cleanCrew(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(0, MAX_CREW)) {
    if (!m || typeof m !== 'object') continue;
    const name = s(m.name, MAX_SHORT);
    if (!name) continue;
    out.push({ name, hours: hours(m.hours), costCode: s(m.costCode, MAX_SHORT) });
  }
  return out;
}

// Rebuild a clean OWNED-equipment array: [{machine, hours}]. `hours` here is the
// machine's OPERATING hours (hour-meter reading, NOT capped at 24), NOT money.
function cleanEquipmentOwned(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input.slice(0, MAX_EQUIP_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const machine = s(r.machine, MAX_SHORT);
    const h = meterHours(r.hours);
    if (!machine && h == null) continue; // skip wholly empty rows
    out.push({ machine, hours: h });
  }
  return out;
}

// Rebuild a clean RENTAL-equipment array: [{category, hours}]. `hours` = machine
// OPERATING hours (hour-meter reading, NOT capped at 24), NOT money. category is
// one of the rental categories (a label).
function cleanEquipmentRental(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input.slice(0, MAX_EQUIP_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const category = s(r.category, MAX_SHORT);
    const h = meterHours(r.hours);
    if (!category && h == null) continue;
    out.push({ category, hours: h });
  }
  return out;
}

// Rebuild a clean MAINTENANCE array: [{category, item, hourAtFailure}]. The UI
// sends one row per FIXED maintenance category. `hourAtFailure` = the machine
// hour-meter reading at the failure (NOT capped at 24), NOT money.
function cleanMaintenance(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input.slice(0, MAX_MAINT_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const category = s(r.category, MAX_SHORT);
    const it = s(r.item, MAX_STR);
    const h = meterHours(r.hourAtFailure);
    if (!category && !it && h == null) continue;
    out.push({ category, item: it, hourAtFailure: h });
  }
  return out;
}

// Rebuild a clean FUTURE-ISSUES array: [{equipment, description}]. Names + free
// text only -- NO $. These persist so a Phase 2 view can compile them.
function cleanFutureIssues(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input.slice(0, MAX_FUTURE_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const equipment = s(r.equipment, MAX_SHORT);
    const description = s(r.description, MAX_STR);
    if (!equipment && !description) continue;
    out.push({ equipment, description });
  }
  return out;
}

function isPrivileged(session) {
  const r = session && session.role;
  return r === 'admin' || r === 'partner';
}

// KNOWN LIMITATION: KV read-modify-write (load list -> mutate -> put), no
// transaction, so two simultaneous writes can last-writer-wins and drop one.
// Acceptable for the field daily-report flow (one foreman per report); the
// durable fix is a D1 migration with a row per report. No behavior change now.
async function loadList(env) {
  const raw = await env.PF_SCHEDULE.get(KV_KEY);
  if (!raw) return { reports: [], meta: { updated: null } };
  try {
    const p = JSON.parse(raw);
    return { reports: Array.isArray(p && p.reports) ? p.reports : [], meta: (p && p.meta) || { updated: null } };
  } catch {
    return { reports: [], meta: { updated: null } };
  }
}

async function saveList(env, reports) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({ version: 1, reports, meta: { updated: stamp } }));
  return stamp;
}

// ---- GET: list reports (optional ?projectId= / ?date= filters) -------------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  try {
    if (!env.PF_SCHEDULE) {
      return json({ ok: true, reports: [], meta: { updated: null }, fallback: true,
        note: 'KV binding PF_SCHEDULE not available; no daily reports yet.' });
    }
    const url = new URL(request.url);
    const projectId = s(url.searchParams.get('projectId'), MAX_SHORT);
    const date = s(url.searchParams.get('date'), MAX_SHORT);
    const list = await loadList(env);
    let reports = list.reports;
    if (projectId) reports = reports.filter((r) => r.projectId === projectId);
    if (date) reports = reports.filter((r) => r.date === date);
    return json({ ok: true, reports, meta: list.meta });
  } catch (err) {
    console.error('api/daily-report GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: create / update / submit / approve / send-to-hr -----------------
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');   // crew can read+write here
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
        message: "action must be 'create', 'update', 'submit', 'approve', or 'send-to-hr'." }, 400);
    }

    // Approval-tier actions require admin/partner. A field_ops session can
    // create/update/submit but NOT approve or send to HR.
    if (PRIVILEGED_ACTIONS[action] && !isPrivileged(session)) {
      return json({ status: 'forbidden',
        message: 'Only an owner can approve or send a daily report to HR.' }, 403);
    }

    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    const list = await loadList(env);
    const who = (session && (session.name || session.uid)) ? s(session.name || session.uid) : 'unknown';
    const nowIso = new Date().toISOString();

    // ---- build a clean report body from the (operational, non-financial) input
    function buildBody(src, base) {
      base = base || {};
      return {
        date: isoDateOrToday(src.date != null ? src.date : base.date),
        projectId: s(src.projectId != null ? src.projectId : base.projectId, MAX_SHORT),
        projectName: s(src.projectName != null ? src.projectName : base.projectName, MAX_SHORT),
        foreman: s(src.foreman != null ? src.foreman : base.foreman, MAX_SHORT),
        crew: (src.crew != null) ? cleanCrew(src.crew) : (base.crew || []),
        weather: s(src.weather != null ? src.weather : base.weather, MAX_SHORT),
        workCompleted: s(src.workCompleted != null ? src.workCompleted : base.workCompleted, MAX_STR),
        columnsInstalled: (src.columnsInstalled != null) ? count(src.columnsInstalled) : (base.columnsInstalled != null ? base.columnsInstalled : null),
        lfInstalled: (src.lfInstalled != null) ? count(src.lfInstalled) : (base.lfInstalled != null ? base.lfInstalled : null),
        equipment: s(src.equipment != null ? src.equipment : base.equipment, MAX_STR),
        delays: s(src.delays != null ? src.delays : base.delays, MAX_STR),
        safety: s(src.safety != null ? src.safety : base.safety, MAX_STR),
        // ---- structured fleet/maintenance fields (HOURS = operating hours, NO $) ----
        equipmentOwned: (src.equipmentOwned != null) ? cleanEquipmentOwned(src.equipmentOwned) : (base.equipmentOwned || []),
        equipmentRental: (src.equipmentRental != null) ? cleanEquipmentRental(src.equipmentRental) : (base.equipmentRental || []),
        maintenance: (src.maintenance != null) ? cleanMaintenance(src.maintenance) : (base.maintenance || []),
        futureIssues: (src.futureIssues != null) ? cleanFutureIssues(src.futureIssues) : (base.futureIssues || []),
      };
    }

    if (action === 'create') {
      if (list.reports.length >= MAX_REPORTS) {
        return json({ status: 'error', message: 'Daily report storage is full.' }, 413);
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
        approvedBy: null, approvedAt: null,
        sentToHrBy: null, sentToHrAt: null,
      }, body);
      list.reports.push(rec);
      const stamp = await saveList(env, list.reports);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // all other actions need an id
    const id = s(parsed.id, MAX_SHORT);
    const rec = list.reports.find((r) => r.id === id);
    if (!rec) return json({ status: 'error', message: 'Daily report not found.' }, 404);

    if (action === 'update') {
      Object.assign(rec, buildBody(parsed, rec));
      rec.updatedAt = nowIso;
    } else if (action === 'submit') {
      rec.status = 'submitted';
      rec.submittedBy = who;       // from the session
      rec.submittedAt = nowIso;
      rec.updatedAt = nowIso;
    } else if (action === 'approve') {
      rec.status = 'approved';
      rec.approvedBy = who;
      rec.approvedAt = nowIso;
      rec.updatedAt = nowIso;
    } else if (action === 'send-to-hr') {
      // IN-PLATFORM STATUS ONLY - no email is sent.
      rec.status = 'sent-to-HR';
      rec.sentToHrBy = who;
      rec.sentToHrAt = nowIso;
      rec.updatedAt = nowIso;
    }

    const stamp = await saveList(env, list.reports);
    return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
  } catch (err) {
    console.error('api/daily-report POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
