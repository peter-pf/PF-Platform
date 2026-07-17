// Cloudflare Pages Function -- /api/daily-report
// FIELD OPERATIONS daily reports. This is the FIRST field_ops WRITE surface.
// A foreman/leader submits a daily report per project per day; the crew hours on
// it feed a timesheet view.
//
// NEW SUBMIT FLOW (Derek's spec, 2026-07): the OLD in-platform approval queue
// (submitted -> approved -> sent-to-HR STATUS transitions, NO mail) is REMOVED.
// On SUBMIT the platform now does EXACTLY THREE things and nothing else:
//   1. Render the daily report into a PDF (server-side, see lib/daily-report-doc).
//   2. Auto-email that PDF to a mailing list (Graph sendMail AS peter@).
//   3. Save the same PDF into the SharePoint "Daily Report Output (Test)" folder.
// A lightweight record is STILL written to KV for the portal's own history list,
// but every approval-state machine field is gone. ZERO financials: this endpoint
// stores hours, narrative, production counts, safety - NO dollars, rates, or
// costs are accepted, returned, or printed into the PDF.
//
// WHAT IT STORES
//   daily_reports_v1 -> JSON { reports:[{
//     id, date, projectId, projectName, foreman,
//     crew:[{name, hours, costCode}],        // HOURS only, NO pay rate / $
//     precipitation, temp,                   // weather split: precip dropdown + free-typed temp
//     weather,                               // LEGACY single weather field (old records only, still read)
//     workCompleted, columnsInstalled, lfInstalled, equipment,
//     delays, safety,
//     equipmentOwned:[{machine, hours}],      // OWNED machines on site + OPERATING (machine) hours -- NO $
//     equipmentRental:[{category, hours}],    // RENTAL by category + OPERATING (machine) hours -- NO $
//     maintenance:[{category, type, subcategory, item, hourAtFailure}], // per-category rows: Failure/Maintenance + subcategory + detail + machine hour -- NO $
//     futureIssues:[{equipment, description}],// maintenance to identify later (feeds a Phase 2 compiled view) -- NO $
//     attachments:[{name, itemId, webUrl, bucket}], // SharePoint file refs from /api/field-upload (Hand Logs / GUHM Data) -- refs only, bytes live in SharePoint, NO $
//     status,                                // 'draft'|'sent'  (no approval states anymore)
//     createdBy, createdAt, updatedAt,
//     submittedBy, submittedAt,              // set from session on submit
//     pdfName, pdfWebUrl, emailedTo, sentAt  // side-effect audit of the 3-step submit
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
//   - SUBMIT is available to any field_ops session (the crew files + distributes
//     their own report). There is NO privileged approval tier anymore.
//   - WRITE hardening (mirrors precon-log/bd-interaction): body cap, strict JSON
//     -> 400, fields rebuilt + length-capped, angle brackets stripped, server-set
//     audit + submittedBy/At from session, no eval. Private no-store.
//   - OUTBOUND: on SUBMIT ONLY, Graph sendMail + a single SharePoint PUT. Both use
//     the app-only token minted server-side (lib/graph.js). Graph creds +
//     SP_DRIVE_ID must all be present or submit FAILS CLOSED (5xx) - a report is
//     NEVER silently dropped.

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import {
  renderDailyReportPdf, pdfFilename,
  sendReportEmail, buildEmailBody, uploadReportPdf,
} from '../lib/daily-report-doc.js';

// ===========================================================================
// RECIPIENTS  --  *** THE ONE PLACE TO FLIP TEST -> PRODUCTION ***
// ===========================================================================
// During build/test the daily-report PDF email goes ONLY to Peter so the three
// partners are never bothered while the layout is being reviewed. Once Peter/Derek
// approve the layout, comment out TEST_RECIPIENTS and uncomment PROD_RECIPIENTS
// (or set env.DAILY_REPORT_RECIPIENTS to a comma-separated list, which overrides
// both). This is deliberately a single server-side constant - the client can
// NEVER influence who receives the report.
const TEST_RECIPIENTS = ['pfpeter@agentmail.to'];
const PROD_RECIPIENTS = [
  'dfranke@pierfoundations.com',
  'jreinking@pierfoundations.com',
  'breinking@pierfoundations.com',
];
// >>> FLIP HERE <<< : ACTIVE_RECIPIENTS = TEST_RECIPIENTS (test) or PROD_RECIPIENTS (go-live).
const ACTIVE_RECIPIENTS = TEST_RECIPIENTS;

// Resolve the recipient list: an env override wins (easiest ops flip, no deploy),
// otherwise the ACTIVE_RECIPIENTS constant above.
function resolveRecipients(env) {
  const raw = env && env.DAILY_REPORT_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return ACTIVE_RECIPIENTS;
}

// The SharePoint "Daily Reports Output (TEST)" folder drive-item id. FIXED on the
// server (never client-supplied). env override so production can point at the real
// folder without a code change; falls back to the known test folder id.
// NOTE: the full driveItem id is 34 chars. The spec quoted the first 20
// (016ISVH6546BCGQXTIBF); the live folder resolves to the full id below (verified
// via a Graph folder listing during the build test). Folder lives in SP_DRIVE_ID
// at /TEST - Write-Back Dev/Daily Reports Output (TEST).
const DAILY_OUTPUT_FOLDER_ID_DEFAULT = '016ISVH6546BCGQXTIBFFKDG4HC7AZI27B';
function outputFolderId(env) {
  const v = env && env.PF_DAILY_OUTPUT_FOLDER_ID;
  return (v && String(v).trim()) ? String(v).trim() : DAILY_OUTPUT_FOLDER_ID_DEFAULT;
}

const KV_KEY = 'daily_reports_v1';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_REPORTS = 20000;
const MAX_CREW = 60;
const MAX_STR = 4000;        // narrative cap
const MAX_SHORT = 300;       // name/project/date/etc cap
const MAX_EQUIP_ROWS = 50;   // owned / rental equipment rows cap
const MAX_MAINT_ROWS = 60;   // maintenance rows cap (5 categories, each can add rows)
const MAX_FUTURE_ROWS = 50;  // future-issue rows cap
const MAX_ATTACH_ROWS = 50;  // attachment refs cap (SharePoint drive-item refs)

// Approval actions ('approve','send-to-hr') are REMOVED. The remaining actions
// are create/update (draft persistence) and submit (the 3-step PDF+email+SP flow).
const VALID_ACTIONS = { create: 1, update: 1, submit: 1 };
const VALID_STATUS = { draft: 1, sent: 1 };

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

// Rebuild a clean MAINTENANCE array:
//   [{category, type, subcategory, item, hourAtFailure}].
// The UI sends one or more rows per FIXED maintenance category (each category is
// a header that can hold several rows). `type` = 'Failure'|'Maintenance' (a
// label), `subcategory` = a per-category label chosen from the owner-curated
// maintenanceSubcategories list, `item` = free-text detail, `hourAtFailure` = the
// machine hour-meter reading (NOT capped at 24), NOT money. BACKWARD COMPATIBLE:
// old rows are {category, item, hourAtFailure} (no type/subcategory) and still
// read fine (type/subcategory become '').
function cleanMaintenance(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input.slice(0, MAX_MAINT_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const category = s(r.category, MAX_SHORT);
    const type = s(r.type, MAX_SHORT);
    const subcategory = s(r.subcategory, MAX_SHORT);
    const it = s(r.item, MAX_STR);
    const h = meterHours(r.hourAtFailure);
    if (!category && !type && !subcategory && !it && h == null) continue;
    out.push({ category, type, subcategory, item: it, hourAtFailure: h });
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

// Rebuild a clean ATTACHMENTS array: [{name, itemId, webUrl, bucket}]. These are
// SharePoint drive-item references produced by /api/field-upload (the raw bytes
// already live in SharePoint; we store only the refs here). NO $ -- file metadata
// only. bucket is constrained to the known upload buckets. Same angle-bracket
// strip + length caps as every other field; webUrl is bounded to MAX_STR.
const VALID_ATTACH_BUCKETS = { handlogs: 1, guhma: 1 };
function cleanAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input.slice(0, MAX_ATTACH_ROWS)) {
    if (!a || typeof a !== 'object') continue;
    const name = s(a.name, MAX_SHORT);
    const itemId = s(a.itemId, MAX_SHORT);
    if (!name && !itemId) continue;       // skip wholly empty refs
    const bucketRaw = s(a.bucket, MAX_SHORT);
    const bucket = VALID_ATTACH_BUCKETS[bucketRaw] ? bucketRaw : '';
    // [SEC MED-01] webUrl is later rendered into an href. Only persist an https://
    // URL so a crafted javascript:/data: scheme can never be stored and replayed.
    // Anything that does not start with https:// is blanked (the ref still keeps
    // its name/itemId, just no clickable link).
    const wu = s(a.webUrl, MAX_STR);
    const webUrl = /^https:\/\//i.test(wu) ? wu : '';
    out.push({ name, itemId, webUrl, bucket });
  }
  return out;
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

// ---- POST: create / update / submit ----------------------------------------
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
        message: "action must be 'create', 'update' or 'submit'." }, 400);
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
        // Weather split into precipitation (dropdown) + temp (free text). The
        // legacy single 'weather' field is preserved for OLD records (read-through
        // from base) but the form no longer writes it.
        precipitation: s(src.precipitation != null ? src.precipitation : base.precipitation, MAX_SHORT),
        temp: s(src.temp != null ? src.temp : base.temp, MAX_SHORT),
        weather: s(base.weather, MAX_SHORT),
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
        // SharePoint file refs uploaded via /api/field-upload (Hand Logs / GUHM
        // Data). Refs only (name/itemId/webUrl/bucket) -- the bytes live in
        // SharePoint, NOT in KV. NO $.
        attachments: (src.attachments != null) ? cleanAttachments(src.attachments) : (base.attachments || []),
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
        // side-effect audit (populated on submit): PDF name + SharePoint url,
        // who it was emailed to, and when the 3-step submit completed.
        pdfName: null, pdfWebUrl: null, emailedTo: null, sentAt: null,
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
      const stamp = await saveList(env, list.reports);
      return json({ ok: true, saved: true, action, record: rec, meta: { updated: stamp } });
    }

    // ---- SUBMIT: the 3-step flow (PDF -> email -> SharePoint) ---------------
    // NO approval queue. On submit we render the PDF, email it, and save it to
    // SharePoint. FAIL CLOSED: if Graph/SharePoint are not configured we do NOT
    // flip the record to 'sent' and we do NOT silently drop the report - the
    // caller gets a 5xx and the draft is preserved so they can retry.
    // action === 'submit'
    if (!graphConfigured(env)) {
      // Graph creds / SP_DRIVE_ID missing -> cannot email or upload. Fail closed.
      return json({ status: 'error',
        message: 'Submit is unavailable: the server email/SharePoint integration is not configured. Your draft is saved.' }, 503);
    }

    const recipients = resolveRecipients(env);
    if (!recipients.length) {
      return json({ status: 'error', message: 'Submit is unavailable: no recipient list is configured.' }, 503);
    }

    // Stamp submit audit onto a working copy used to render (so the PDF footer
    // and email reflect the submit), but only persist 'sent' AFTER both side
    // effects succeed.
    rec.submittedBy = who;
    rec.submittedAt = nowIso;

    let token;
    try {
      token = await getGraphToken(env);
    } catch (e) {
      console.error('api/daily-report submit: token mint failed:', e && e.message);
      return json({ status: 'error', message: 'Submit failed: could not reach the mail/SharePoint service. Your draft is saved.' }, 502);
    }

    // 1) Render the PDF (pure computation; ZERO $).
    let pdfBytes, filename;
    try {
      pdfBytes = renderDailyReportPdf(rec);
      filename = pdfFilename(rec);
    } catch (e) {
      console.error('api/daily-report submit: pdf render failed:', e && e.message);
      return json({ status: 'error', message: 'Submit failed while building the PDF. Your draft is saved.' }, 500);
    }

    // 2) Email the PDF to the mailing list (AS peter@). 3) Upload to SharePoint.
    //    Run both; require BOTH to succeed before flipping the record to 'sent'.
    let uploaded;
    try {
      const subject = `PF Daily Report - ${rec.projectName || rec.projectId || 'Project'} - ${rec.date || ''}`.trim();
      const bodyText = buildEmailBody(rec);
      await sendReportEmail(env, token, { recipients, subject, bodyText, pdfBytes, filename });
    } catch (e) {
      console.error('api/daily-report submit: email failed:', e && e.message);
      return json({ status: 'error', message: 'Submit failed while sending the email. Your draft is saved; please retry.' }, 502);
    }
    try {
      uploaded = await uploadReportPdf(env, token, outputFolderId(env), filename, pdfBytes);
    } catch (e) {
      console.error('api/daily-report submit: SharePoint upload failed:', e && e.message);
      // Email already went out, but SharePoint failed. Report the partial failure
      // clearly rather than claiming success. The record stays a draft.
      return json({ status: 'error',
        message: 'The report was emailed but could NOT be saved to SharePoint. Please retry or notify an admin.' }, 502);
    }

    // Both side effects succeeded -> finalize the record.
    rec.status = 'sent';
    rec.pdfName = filename;
    rec.pdfWebUrl = (uploaded && uploaded.webUrl) || null;
    rec.emailedTo = recipients.slice();
    rec.sentAt = new Date().toISOString();
    rec.updatedAt = rec.sentAt;

    const stamp = await saveList(env, list.reports);
    return json({
      ok: true, saved: true, action, record: rec, meta: { updated: stamp },
      distribution: { emailedTo: recipients, pdf: filename, sharepoint: uploaded },
    });
  } catch (err) {
    console.error('api/daily-report POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
