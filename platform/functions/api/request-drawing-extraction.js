// Cloudflare Pages Function -- /api/request-drawing-extraction
// OFFICE "Pull from Approved Drawings" trigger for the Testing section of a
// project record. Enqueues an OUT-OF-BAND extraction of the AP Testing criteria
// (AP Reaction Modulus, AP Design Diameter, Diameter of Plate, AP Design Load,
// AP Max Test Load) from the project's Approved Shop Dwgs PDF.
//
// WHY A TRIGGER (not a live extraction): the extraction pulls a multi-hundred-page
// PDF from SharePoint via Graph, renders a schedule-table region, and runs a
// HEADLESS VISION read -- NONE of which can run inside a Cloudflare edge Function.
// So this mirrors the PROVEN sibling pattern (api/sync-request.js + the local
// platform_sync_daemon): this endpoint WRITES a request flag to KV, and a
// container-side daemon (drawing_extract_daemon) POLLS that flag, runs
// platform/sync/extract-testing-criteria.py, writes the values into the project's
// siteReadiness override, and writes a STATUS record back to KV that the button
// reads for honest state (requested / running / done / needs_review / failed).
// A CF Worker NEVER runs vision -- Peter's engine does the read out-of-band.
//
// WHAT IT DOES
//   POST /api/request-drawing-extraction   body {num}  -> enqueue a pull for <num>
//   GET  /api/request-drawing-extraction?num=<n>       -> { request, status } to poll
//
// KV KEYS (namespace env.PF_SCHEDULE = 6c8bd3b9...), PER PROJECT:
//   drawing_extract_request_v1:<num> -> JSON { requestedAt, requestedBy }
//                      The daemon fires when this key is PRESENT, then DELETES it.
//   drawing_extract_status_v1:<num>  -> JSON { state:'requested'|'running'|'done'
//                      |'needs_review'|'failed', by, startedAt, finishedAt,
//                      values?, reasons?, error? }  (daemon owns running->terminal;
//                      this endpoint sets the initial 'requested').
// It ALSO stamps provenance into the project override so the record renders the
// pull state next to the Testing fields:
//   project_override_v1:<num> :: sections.siteReadiness.__testing_pull =
//       { status:'requested', requested_at, requested_by }
//   (written via the same read-modify-write shape project-override.js uses, and
//    validated identically by that endpoint's cleanTestingPull on any later save.)
//
// RBAC: OFFICE only. requireArea(session,'financials') (admin/partner/business_dev;
//   field_ops BLOCKED) on BOTH GET and POST -- same office tier as sync-request /
//   generate-test-sheet. The path is ALSO classified 'financials' in lib/auth.js
//   areaForPath() (defense-in-depth). Fails CLOSED: no session / wrong role -> 403;
//   no KV binding -> 503 (never a fake "queued").
//
// HARDENING: body cap, strict JSON -> 400, num tightly validated (it is part of a
//   KV key), no outbound fetch, no eval, updatedBy from the SESSION (never client).
//   Responses private, no-store. The __testing_pull stamp is best-effort: if it
//   fails, the enqueue STILL succeeds (the daemon is the source of truth for the
//   values; the provenance line is cosmetic) -- but a KV failure on the REQUEST
//   key itself fails the POST closed.

import { requireArea } from '../lib/auth.js';

const REQ_PREFIX = 'drawing_extract_request_v1:';
const STATUS_PREFIX = 'drawing_extract_status_v1:';
const OVERRIDE_PREFIX = 'project_override_v1:';
const REQUEST_TTL_SEC = 1800; // 30 min -- guards a request stranded if daemon is down

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
const MAX_BODY_BYTES = 4 * 1024; // POST body is tiny ({num}); reject anything larger

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeParse(raw) {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
  catch { return null; }
}

// A project number is part of the KV key, so it MUST be tightly constrained.
// Same shape as project-override.js cleanNum (digits/letters/hyphens, <=20).
function cleanNum(v) {
  const str = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(str)) return '';
  return str;
}

function reqKey(num) { return REQ_PREFIX + num; }
function statusKey(num) { return STATUS_PREFIX + num; }
function overrideKey(num) { return OVERRIDE_PREFIX + num; }

// Best-effort: stamp sections.siteReadiness.__testing_pull = {status:'requested',...}
// into the project override so the record shows "Pulling..." provenance. This is a
// read-modify-write of the SAME store project-override.js owns; it preserves every
// existing field + reserved key (Object.assign), only setting __testing_pull. Never
// throws to the caller -- a failure here does not fail the enqueue.
async function stampTestingPullRequested(env, num, who, nowIso) {
  try {
    const raw = await env.PF_SCHEDULE.get(overrideKey(num));
    let rec;
    if (!raw) {
      rec = { version: 1, num, sections: {}, _meta: { updatedBy: null, updatedAt: null } };
    } else {
      const p = JSON.parse(raw);
      rec = {
        version: 1,
        num,
        sections: (p && p.sections && typeof p.sections === 'object') ? p.sections : {},
        _meta: (p && p._meta && typeof p._meta === 'object') ? p._meta : { updatedBy: null, updatedAt: null },
      };
    }
    const sr = (rec.sections.siteReadiness && typeof rec.sections.siteReadiness === 'object' && !Array.isArray(rec.sections.siteReadiness))
      ? rec.sections.siteReadiness : {};
    sr.__testing_pull = {
      source_pdf: { name: '', revision: '', date: '' },
      pulled_at: '',
      requested_at: nowIso,
      requested_by: who,
      status: 'requested',
      values: {},
      reasons: [],
    };
    rec.sections.siteReadiness = sr;
    rec._meta = { updatedBy: 'Approved-Drawings extraction (requested)', updatedAt: nowIso };
    await env.PF_SCHEDULE.put(overrideKey(num), JSON.stringify(rec));
  } catch (err) {
    // best-effort provenance -- never fail the enqueue over it
    console.error('request-drawing-extraction: __testing_pull stamp failed (non-fatal):', err);
  }
}

// GET: report the current request flag + last status for ?num=<n> so the button can
// render "Pull" / "Pulling..." / "Pulled" / "Needs review" / "Failed" honestly.
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;

  const url = new URL(request.url);
  const num = cleanNum(url.searchParams.get('num'));
  if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

  if (!env.PF_SCHEDULE) {
    return json({ status: 'error',
      message: 'Extraction unavailable: KV binding PF_SCHEDULE not configured.' }, 503);
  }
  try {
    const [reqRaw, statusRaw] = await Promise.all([
      env.PF_SCHEDULE.get(reqKey(num)),
      env.PF_SCHEDULE.get(statusKey(num)),
    ]);
    return json({ ok: true, num, request: safeParse(reqRaw), status: safeParse(statusRaw) });
  } catch (err) {
    console.error('api/request-drawing-extraction GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// POST {num}: enqueue a pull. Office only. If one is already running, don't duplicate.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials'); // office only; field_ops blocked
  if (denied) return denied;

  if (!env.PF_SCHEDULE) {
    return json({ status: 'error',
      message: 'Extraction unavailable: KV binding PF_SCHEDULE not configured. Your request was NOT queued.' }, 503);
  }
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const num = cleanNum(parsed && parsed.num);
    if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

    // If an extraction is already running for this project, do NOT queue a duplicate.
    const statusRaw = await env.PF_SCHEDULE.get(statusKey(num));
    const status = safeParse(statusRaw);
    if (status && (status.state === 'running' || status.state === 'requested')) {
      return json({ ok: true, queued: false, alreadyPending: true, num, status,
        message: 'An extraction is already pending for this project.' });
    }

    const who = (session && (session.name || session.uid))
      ? String(session.name || session.uid).slice(0, 200).replace(/[<>]/g, '') : 'unknown';
    const nowIso = new Date().toISOString();
    const reqObj = { requestedAt: nowIso, requestedBy: who };
    const statusObj = { state: 'requested', by: who, startedAt: nowIso };

    // Request key carries a TTL so a stranded request self-clears; status has no TTL
    // (it is the last-known state the button reads until the next pull).
    await env.PF_SCHEDULE.put(reqKey(num), JSON.stringify(reqObj), { expirationTtl: REQUEST_TTL_SEC });
    await env.PF_SCHEDULE.put(statusKey(num), JSON.stringify(statusObj));

    // Best-effort provenance stamp (never fails the enqueue).
    await stampTestingPullRequested(env, num, who, nowIso);

    return json({ ok: true, queued: true, num, request: reqObj, status: statusObj,
      message: 'Pull queued. The portal will fill the Testing values within a couple of minutes.' });
  } catch (err) {
    console.error('api/request-drawing-extraction POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
