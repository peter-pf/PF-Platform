// Cloudflare Pages Function -- /api/project-budget
// PER-PROJECT BUDGET for the Budget vs Actual table in a project record's
// Section 10 "Financials" (Financials Phase 1). The BASE rows (the ~69 standard
// cost codes) come from the STATIC zeroed template window.PF_COST_CODE_TEMPLATE
// (data/cost-code-template.js, derived from the POET code list). That template
// ships every project's rows with money ZEROED. This endpoint is the SEPARATE
// per-project budget store: an office user enters/edits the BUDGET amount for any
// cost code and that value is stored here in KV, keyed by cost_code, then MERGED
// on top of the zeroed template at render time (a saved budget ALWAYS wins over
// the zero). Saved budgets survive reload and a future template regeneration, and
// are visible to the whole office. ACTUAL stays 0/blank in Phase 1 (Phase 2:
// invoice intake allocates line items to cost codes to populate Actual).
//
// WHAT IT STORES
//   project_budget_v1:<num>  ->  JSON {
//     version: 1,
//     num,                                  // the project number this belongs to
//     rows: { <row_key>: { budget: <number>, cost_code: <string> }, ... },
//     _meta: { updatedBy, updatedAt }       // last writer + when (server-set)
//   }
//   row_key is a STABLE per-template-row identity (e.g. "g3_r5" = group index 3,
//   row index 5). It is NOT the bare cost_code, because the standard cost-code
//   list REUSES some codes across categories (e.g. code 5405 appears in Material,
//   Labor AND Equipment groups) -- keying by cost_code would double-count a saved
//   budget across every row sharing that code. cost_code is stored alongside as a
//   label for readability/audit only. budget is a NUMBER (dollars). NO summing/
//   pricing/derivation happens here -- the client computes subtotals/variance from
//   (template rows + this budget overlay). ZERO financial computation server-side;
//   this is a plain per-row budget overlay keyed by stable row identity.
//
// KV KEY: env.PF_SCHEDULE :: 'project_budget_v1:<num>'  (one key per project).
//
// RBAC (the critical part -- this is FINANCIAL data):
//   - Behind the auth gate (functions/_middleware.js): no session -> 401.
//   - FINANCIALS area (the office): requireArea(session, 'financials') on GET and
//     POST. financials = admin/partner/business_dev -- the office. field_ops is
//     BLOCKED (can neither read nor write budgets), even by direct URL.
//     /api/project-budget -> 'financials' in areaForPath (defense-in-depth with
//     this handler's requireArea).
//   - WRITE hardening (mirrors project-override/daily-report): body cap, strict
//     JSON -> 400, cost_code validated/length-capped, budget coerced to a finite
//     number (else 400), updatedBy/updatedAt set from the SESSION (never
//     client-supplied), no eval. Private no-store.
//   - FAIL CLOSED: if KV is not bound, POST returns 503 (the client keeps the
//     user in edit mode and shows an honest error -- it NEVER shows "saved") and
//     GET returns 503 (an honest error -- it NEVER fabricates saved budgets).
//   - NO mail, NO outbound fetch.

import { requireArea } from '../lib/auth.js';

const KV_PREFIX = 'project_budget_v1:';
const MAX_BODY_BYTES = 128 * 1024;   // ~69 cost codes with budgets fits easily
const MAX_CODE = 40;                  // a cost-code string (stored as a label)
const MAX_ROWKEY = 40;                // a stable row identity (e.g. "g3_r12")
const MAX_ROWS = 500;                 // generous cap; the standard set is ~69

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// A project number: "YY-NNN" style, but we accept any short slug of
// digits/letters/hyphens so helical (25-2001) and any future scheme work. The
// number is part of the KV key, so it MUST be tightly constrained.
function cleanNum(v) {
  const str = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(str)) return '';
  return str;
}

// A cost code: short alphanumeric-ish slug (digits, letters, dot, dash, slash).
// Stored as a LABEL only (audit/readability); NOT the map key. Empty allowed.
function cleanCode(v) {
  if (v == null) return '';
  let str = String(v).trim();
  if (str.length > MAX_CODE) str = str.slice(0, MAX_CODE);
  if (!/^[A-Za-z0-9.\-/ ]{0,40}$/.test(str)) return '';
  return str;
}

// A stable row key: "g<int>_r<int>" (group index + row index in the template).
// This is the KV-MAP KEY, so tightly constrained. Empty -> invalid (skipped).
function cleanRowKey(v) {
  if (v == null) return '';
  let str = String(v).trim();
  if (str.length > MAX_ROWKEY) str = str.slice(0, MAX_ROWKEY);
  if (!/^g\d{1,3}_r\d{1,3}$/.test(str)) return '';
  return str;
}

// Coerce a budget value to a finite, non-negative number rounded to cents.
// Returns { ok, value }. An empty string / null means "no budget for this code"
// which the caller treats as a delete (0). Anything non-numeric -> not ok.
function cleanBudget(v) {
  if (v === '' || v === null || v === undefined) return { ok: true, value: 0 };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, value: 0 };
  if (n < 0) return { ok: false, value: 0 };
  // round to cents to avoid float drift; cap to a sane ceiling to bound abuse
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 1e12) return { ok: false, value: 0 };
  return { ok: true, value: rounded };
}

function kvKey(num) { return KV_PREFIX + num; }

// Load the stored budget object for one project, or an empty shell.
async function loadBudget(env, num) {
  const raw = await env.PF_SCHEDULE.get(kvKey(num));
  if (!raw) return { num, rows: {}, _meta: { updatedBy: null, updatedAt: null } };
  try {
    const p = JSON.parse(raw);
    const rows = (p && p.rows && typeof p.rows === 'object') ? p.rows : {};
    const _meta = (p && p._meta && typeof p._meta === 'object')
      ? p._meta : { updatedBy: null, updatedAt: null };
    return { num, rows, _meta };
  } catch {
    // Corrupt value -> treat as empty (never fabricate). A fresh save overwrites it.
    return { num, rows: {}, _meta: { updatedBy: null, updatedAt: null } };
  }
}

// ---- GET: return the stored per-cost-code budgets for ?num=<project_number> ---
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const num = cleanNum(url.searchParams.get('num'));
    if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

    // FAIL CLOSED: financial data. If KV is not bound we CANNOT know the saved
    // budgets, so we return an honest 503 rather than pretending "no budget".
    // (Contrast with project-override's benign empty read -- a missing budget
    // store here would silently hide real financial figures, so we fail closed.)
    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Budget store unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }
    const rec = await loadBudget(env, num);
    return json({ ok: true, num, rows: rec.rows, _meta: rec._meta });
  } catch (err) {
    console.error('api/project-budget GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: merge/save per-cost-code budgets ---------------------------------
//   body: { num, rows: [ { row_key, cost_code, budget }, ... ] }
// Merges each { row_key, budget } into the stored rows map (per-row merge: a row
// the client omits is LEFT as-is; a row set to 0/'' clears that row's budget to
// 0). row_key is the stable template row identity ("g<idx>_r<idx>"); cost_code is
// stored alongside as a label. Stamps updatedBy (session) + updatedAt. Returns the
// FULL saved budget object so the client can re-render from server truth.
export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials');   // office only; field_ops blocked
  if (denied) return denied;
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

    const inRows = (parsed && Array.isArray(parsed.rows)) ? parsed.rows : null;
    if (!inRows) return json({ status: 'error', message: 'rows[] is required.' }, 400);
    if (inRows.length > MAX_ROWS) return json({ status: 'error', message: 'Too many rows.' }, 413);

    // Build a clean per-ROW budget delta from the client input, keyed by the stable
    // row_key (NOT cost_code -- codes are reused across categories). Reject the whole
    // request if any provided budget value is non-numeric (fail closed on bad
    // financial input -- never silently drop or coerce garbage to 0).
    const delta = {};
    for (const r of inRows) {
      const rowKey = cleanRowKey(r && r.row_key);
      if (!rowKey) continue; // rows with no/invalid row_key are skipped (e.g. subtotal marker rows)
      const b = cleanBudget(r && r.budget);
      if (!b.ok) {
        return json({ status: 'error', message: 'Budget for row "' + rowKey + '" must be a non-negative number.' }, 400);
      }
      delta[rowKey] = { budget: b.value, cost_code: cleanCode(r && r.cost_code) };
    }

    // FAIL CLOSED: no KV -> we cannot persist. Do NOT report success.
    if (!env.PF_SCHEDULE) {
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment. Your budget was NOT saved.' }, 503);
    }

    const rec = await loadBudget(env, num);

    // Per-code merge (KV read-modify-write; single-writer acceptable for a project
    // budget edited by one office user at a time -- same known limitation as
    // daily-report/project-override; a D1 migration is the durable fix).
    const merged = Object.assign({}, rec.rows, delta);
    rec.rows = merged;

    if (Object.keys(rec.rows).length > MAX_ROWS) {
      return json({ status: 'error', message: 'Too many cost codes.' }, 413);
    }

    const who = (session && (session.name || session.uid))
      ? String(session.name || session.uid).slice(0, 200).replace(/[<>]/g, '') : 'unknown';
    const nowIso = new Date().toISOString();
    rec._meta = { updatedBy: who, updatedAt: nowIso };

    const toStore = { version: 1, num: rec.num, rows: rec.rows, _meta: rec._meta };
    await env.PF_SCHEDULE.put(kvKey(num), JSON.stringify(toStore));

    return json({ ok: true, saved: true, num, rows: rec.rows, _meta: rec._meta });
  } catch (err) {
    console.error('api/project-budget POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
