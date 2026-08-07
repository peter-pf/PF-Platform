// Cloudflare Pages Function -- /api/contacts
// PF MASTER CONTACT DIRECTORY. Reads (and optionally writes back) the shared
// "PF Master Contact List.xlsx" that lives in SharePoint. This is the source of
// truth for the portal's contact typeahead: as a user types a contact name into
// a job's contact card, the SPA fetches this list once and filters it in-memory,
// then autofills name/title/company/office/cell/email from the chosen entry.
//
// SOURCE OF TRUTH (created separately, DO NOT recreate here):
//   PF Master Contact List.xlsx, sheet "Contacts", 15 columns A:O:
//     Contact ID | First Name | Last Name | Title | Company | Category |
//     Office Phone | Cell Phone | Email | Company Address | Company Website |
//     Notes | Active | Date Added | Last Updated
//   Contact ID scheme: C#### (C0001..). IDs are NEVER reused; a removed contact
//   is deactivated (Active=No), never deleted, to preserve history.
//   Rows whose First/Last Name or Company contains "EXAMPLE" are placeholder
//   rows and are skipped. Rows with Active != Yes are skipped on GET.
//
// READ PATH (GET /api/contacts):
//   - Serve from KV cache (key CONTACTS_KV_KEY) when fresh (< TTL). On a cache
//     miss / stale entry / ?refresh=1, refresh from the Graph Workbook API
//     (worksheets('Contacts')/usedRange), normalize, cache, and return.
//   - Returns { ok:true, contacts:[...], count, cachedAt, source }.
//   - If Graph is NOT configured (e.g. a branch PREVIEW with no secrets), returns
//     an EMPTY list with source:'unconfigured' and HTTP 200 so the typeahead just
//     shows nothing and manual entry is unaffected (NEVER a hard error that breaks
//     the page). Never fabricates contacts.
//
// WRITE PATH (POST /api/contacts):
//   - action:'add'  -> mint the next C#### id (scan existing max, never reuse),
//     append a row with Active=Yes + Date Added + Last Updated = today (MM/DD/YYYY).
//   - action:'update' (id given) -> patch that row's cells + bump Last Updated.
//   - Invalidates the KV cache on success. 423-lock (a human has the workbook open
//     in Excel) is caught and returned as a clear, non-corrupting error the UI can
//     show; the file is NEVER partially written.
//
// SECURITY:
//   - Behind the auth gate (_middleware.js). areaForPath('/api/contacts') = 'crm'
//     (admin/partner/business_dev). field_ops is BLOCKED by direct URL. The handler
//     ALSO calls requireArea(session,'crm') on GET + POST (defense-in-depth).
//   - App-only Graph token minted SERVER-SIDE (lib/graph.js); never exposed to the
//     browser. Drive is FIXED to env.SP_DRIVE_ID; the client supplies NO drive/host/
//     item id. Fails CLOSED on missing auth secret (middleware) + on any write when
//     Graph is unconfigured.

import { requireArea } from '../lib/auth.js';
import { GRAPH, graphConfigured, getGraphToken } from '../lib/graph.js';

// The master contact list driveItem id. FIXED on the server (never client-supplied).
// env override so ops can repoint without a code change; falls back to the known id.
const CONTACT_ITEM_DEFAULT = '016ISVH6Y3JVIORNELC5GJL5K43N55XK3B';
function contactItemId(env) {
  const v = env && env.PF_CONTACT_ITEM_ID;
  return (v && String(v).trim()) ? String(v).trim() : CONTACT_ITEM_DEFAULT;
}

const SHEET = 'Contacts';
const CONTACTS_KV_KEY = 'contacts_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 min soft cache
const MAX_BODY_BYTES = 16 * 1024;
const MAX_STR = 300;                  // per-cell cap
const MAX_NOTES = 2000;               // notes can be longer

// Column order MUST match the sheet header A:O exactly.
const COLS = [
  'contactId', 'firstName', 'lastName', 'title', 'company', 'category',
  'officePhone', 'cellPhone', 'email', 'companyAddress', 'companyWebsite',
  'notes', 'active', 'dateAdded', 'lastUpdated',
];
const NCOLS = COLS.length; // 15

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Clean a single cell to a bounded, angle-bracket-stripped string.
function s(v, cap = MAX_STR) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '').trim();
}

// Is this a placeholder EXAMPLE row? (skip on read + never counted for max id).
function isExample(row) {
  const hay = ((row.firstName || '') + ' ' + (row.lastName || '') + ' ' + (row.company || '')).toUpperCase();
  return hay.indexOf('EXAMPLE') !== -1;
}
function isActive(row) {
  const a = String(row.active || '').trim().toLowerCase();
  // Active when explicitly Yes/Y/True/1, OR blank (treat blank as active so a
  // freshly hand-typed row without the Active column set still shows). Only an
  // explicit No/False/0 deactivates.
  if (a === 'no' || a === 'n' || a === 'false' || a === '0' || a === 'inactive') return false;
  return true;
}

// Today as MM/DD/YYYY (matches the sheet's date convention).
function todayMDY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
}

// ---- Graph Workbook helpers ------------------------------------------------
// Build the workbook base URL for the fixed contact file on the fixed drive.
function wbBase(env) {
  return `${GRAPH}/drives/${encodeURIComponent(env.SP_DRIVE_ID)}/items/${encodeURIComponent(contactItemId(env))}/workbook`;
}

// A 423 (Locked) from Graph means a human has the workbook open in Excel. Detect
// it from the HTTP status OR the Graph error code so the caller can surface a
// clean "try again" instead of corrupting the file.
function isLocked(status, bodyText) {
  if (status === 423) return true;
  const t = String(bodyText || '');
  return /resourceLocked|notAllowed|fileLocked|locked/i.test(t) && /lock/i.test(t);
}

async function graphFetch(url, token, opts = {}) {
  const resp = await fetch(url, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      opts.body != null ? { 'Content-Type': 'application/json' } : {}
    ),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  return resp;
}

// Read the used range of the Contacts sheet and normalize to contact objects.
// Returns { contactsAll:[...normalized rows incl inactive/example], maxIdNum, headerLen }.
// (We keep ALL rows here for id-minting + row addressing; GET filters afterwards.)
async function readSheet(env, token) {
  const url = wbBase(env) +
    `/worksheets('${SHEET}')/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount,text`;
  const resp = await graphFetch(url, token);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error('workbook read failed: ' + resp.status);
    err.status = resp.status;
    err.locked = isLocked(resp.status, txt);
    throw err;
  }
  const data = await resp.json();
  const text = Array.isArray(data.text) ? data.text : [];
  const rows = [];
  let maxIdNum = 0;
  // Row 0 is the header. Data rows start at index 1 (sheet row 2).
  for (let i = 1; i < text.length; i++) {
    const r = text[i] || [];
    // Skip a wholly-blank row.
    if (!r.some((c) => c != null && String(c).trim() !== '')) continue;
    const row = {};
    for (let c = 0; c < NCOLS; c++) {
      row[COLS[c]] = s(r[c], COLS[c] === 'notes' ? MAX_NOTES : MAX_STR);
    }
    row._sheetRow = i + 1; // 1-based Excel row number for targeted writes
    // Track the max numeric C#### id across ALL rows (incl. examples/inactive)
    // so a minted id NEVER collides with an existing one.
    const m = /^C(\d+)$/i.exec(row.contactId);
    if (m) { const n = parseInt(m[1], 10); if (n > maxIdNum) maxIdNum = n; }
    rows.push(row);
  }
  return { contactsAll: rows, maxIdNum };
}

// The public shape returned to the browser (drop internal _sheetRow).
function publicRow(row) {
  const out = {};
  for (const k of COLS) out[k] = row[k] || '';
  // Convenience display name (first + last) for the typeahead.
  out.name = (out.firstName + ' ' + out.lastName).trim();
  return out;
}

// ---- KV cache --------------------------------------------------------------
async function readCache(env) {
  if (!env.PF_SCHEDULE) return null;
  try {
    const raw = await env.PF_SCHEDULE.get(CONTACTS_KV_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.contacts) || typeof p.cachedAt !== 'number') return null;
    return p;
  } catch { return null; }
}
async function writeCache(env, contacts) {
  if (!env.PF_SCHEDULE) return;
  try {
    await env.PF_SCHEDULE.put(CONTACTS_KV_KEY, JSON.stringify({
      version: 1, cachedAt: Date.now(), contacts,
    }));
  } catch { /* cache is best-effort; a failure just means next read refreshes */ }
}
async function invalidateCache(env) {
  if (!env.PF_SCHEDULE) return;
  try { await env.PF_SCHEDULE.delete(CONTACTS_KV_KEY); } catch { /* ignore */ }
}

// Refresh the cache from Graph and return the ACTIVE, non-example contacts.
async function refreshFromGraph(env) {
  const token = await getGraphToken(env);
  const { contactsAll } = await readSheet(env, token);
  const active = contactsAll
    .filter((r) => !isExample(r) && isActive(r))
    .map(publicRow);
  await writeCache(env, active);
  return active;
}

// ---- GET: list the active contact directory --------------------------------
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = requireArea(context.data && context.data.session, 'crm');
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';

    // If Graph is not configured (branch preview / no secrets), return an EMPTY
    // list gracefully. The typeahead degrades to "no suggestions"; manual entry
    // is unaffected. We NEVER fabricate contacts and NEVER hard-error the page.
    if (!graphConfigured(env)) {
      // Still try the KV cache: if a prior configured deploy populated it, serve
      // that rather than nothing. Otherwise empty.
      const cached = await readCache(env);
      if (cached && cached.contacts.length) {
        return json({ ok: true, contacts: cached.contacts, count: cached.contacts.length,
          cachedAt: cached.cachedAt, source: 'cache-unconfigured' });
      }
      return json({ ok: true, contacts: [], count: 0, cachedAt: null, source: 'unconfigured',
        note: 'Contact directory backend is not configured on this deployment.' });
    }

    if (!forceRefresh) {
      const cached = await readCache(env);
      if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return json({ ok: true, contacts: cached.contacts, count: cached.contacts.length,
          cachedAt: cached.cachedAt, source: 'cache' });
      }
    }

    // Cache miss / stale / forced -> refresh from Graph.
    try {
      const contacts = await refreshFromGraph(env);
      return json({ ok: true, contacts, count: contacts.length,
        cachedAt: Date.now(), source: 'graph' });
    } catch (e) {
      // Graph read failed. If a (stale) cache exists, serve it rather than nothing
      // (an honest stale list beats a broken typeahead). Otherwise empty + note.
      const cached = await readCache(env);
      if (cached && cached.contacts.length) {
        return json({ ok: true, contacts: cached.contacts, count: cached.contacts.length,
          cachedAt: cached.cachedAt, source: 'cache-stale',
          note: 'Live refresh unavailable; served last-known contacts.' });
      }
      const locked = !!(e && e.locked);
      return json({ ok: true, contacts: [], count: 0, cachedAt: null,
        source: locked ? 'locked' : 'error',
        note: locked
          ? 'The contact list is open in Excel; suggestions are briefly unavailable.'
          : 'Could not load the contact directory right now.' });
    }
  } catch (err) {
    console.error('api/contacts GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

// ---- POST: add / update a contact (write-back to the Excel Contacts sheet) --
const VALID_ACTIONS = { add: 1, update: 1 };

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'crm');
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const action = String((parsed && parsed.action) || '');
    if (!VALID_ACTIONS[action]) {
      return json({ status: 'error', message: "action must be 'add' or 'update'." }, 400);
    }

    // Write-back needs Graph. FAIL CLOSED (do NOT pretend success) if unconfigured.
    if (!graphConfigured(env)) {
      return json({ status: 'error',
        message: 'Saving to the contact directory is not available on this deployment.' }, 503);
    }

    // Build a clean field set from the input (only known columns; bounded + stripped).
    const inp = parsed.contact && typeof parsed.contact === 'object' ? parsed.contact : parsed;
    const clean = {
      firstName: s(inp.firstName),
      lastName: s(inp.lastName),
      title: s(inp.title),
      company: s(inp.company),
      category: s(inp.category),
      officePhone: s(inp.officePhone),
      cellPhone: s(inp.cellPhone),
      email: s(inp.email),
      companyAddress: s(inp.companyAddress),
      companyWebsite: s(inp.companyWebsite),
      notes: s(inp.notes, MAX_NOTES),
    };
    // Require at least a name or a company so we never append an empty row.
    if (!clean.firstName && !clean.lastName && !clean.company) {
      return json({ status: 'error', message: 'A first name, last name, or company is required.' }, 400);
    }

    let token;
    try { token = await getGraphToken(env); }
    catch (e) {
      console.error('api/contacts POST: token mint failed:', e && e.message);
      return json({ status: 'error', message: 'Could not reach the contact directory service. Please retry.' }, 502);
    }

    // Read the current sheet (for id-minting + row addressing). This read also
    // surfaces a 423 lock early, before any write.
    let sheet;
    try { sheet = await readSheet(env, token); }
    catch (e) {
      if (e && e.locked) {
        return json({ status: 'error',
          message: 'The contact list is open in Excel. Close it and retry; nothing was changed.' }, 423);
      }
      console.error('api/contacts POST: sheet read failed:', e && e.message);
      return json({ status: 'error', message: 'Could not read the contact directory. Please retry.' }, 502);
    }

    const today = todayMDY();

    if (action === 'add') {
      const nextNum = sheet.maxIdNum + 1;
      const id = 'C' + String(nextNum).padStart(4, '0');
      // Values row in EXACT column order A:O.
      const rowVals = [[
        id, clean.firstName, clean.lastName, clean.title, clean.company, clean.category,
        clean.officePhone, clean.cellPhone, clean.email, clean.companyAddress,
        clean.companyWebsite, clean.notes, 'Yes', today, today,
      ]];
      // Append after the current used range. usedRange rows are 1..N (incl header),
      // so the next free Excel row is (existing data rows + header) + 1. We computed
      // _sheetRow on each row; the highest data _sheetRow + 1 is the target. If there
      // are no data rows yet, header is row 1 so target is row 2.
      let targetRow = 2;
      for (const r of sheet.contactsAll) if (r._sheetRow >= targetRow) targetRow = r._sheetRow + 1;
      const addr = `${SHEET}!A${targetRow}:O${targetRow}`;
      const url = wbBase(env) + `/worksheets('${SHEET}')/range(address='${encodeURIComponent(addr)}')`;
      const resp = await graphFetch(url, token, { method: 'PATCH', body: { values: rowVals } });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        if (isLocked(resp.status, txt)) {
          return json({ status: 'error',
            message: 'The contact list is open in Excel. Close it and retry; nothing was changed.' }, 423);
        }
        console.error('api/contacts add: write failed', resp.status, txt.slice(0, 200));
        return json({ status: 'error', message: 'Could not save the contact. Please retry.' }, 502);
      }
      await invalidateCache(env);
      const savedRow = Object.assign({ contactId: id, active: 'Yes', dateAdded: today, lastUpdated: today }, clean);
      return json({ ok: true, saved: true, action, contact: publicRow(savedRow) });
    }

    // action === 'update' : patch an existing row by Contact ID.
    const id = s(inp.contactId || parsed.id);
    if (!/^C\d+$/i.test(id)) {
      return json({ status: 'error', message: 'A valid Contact ID (C####) is required to update.' }, 400);
    }
    const existing = sheet.contactsAll.find((r) => String(r.contactId).toUpperCase() === id.toUpperCase());
    if (!existing) {
      return json({ status: 'error', message: 'Contact not found.' }, 404);
    }
    // Preserve id, Date Added, and Active; bump Last Updated. Overwrite the editable
    // columns with the cleaned values.
    const rowVals = [[
      existing.contactId, clean.firstName, clean.lastName, clean.title, clean.company,
      clean.category, clean.officePhone, clean.cellPhone, clean.email,
      clean.companyAddress, clean.companyWebsite, clean.notes,
      existing.active || 'Yes', existing.dateAdded || today, today,
    ]];
    const addr = `${SHEET}!A${existing._sheetRow}:O${existing._sheetRow}`;
    const url = wbBase(env) + `/worksheets('${SHEET}')/range(address='${encodeURIComponent(addr)}')`;
    const resp = await graphFetch(url, token, { method: 'PATCH', body: { values: rowVals } });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      if (isLocked(resp.status, txt)) {
        return json({ status: 'error',
          message: 'The contact list is open in Excel. Close it and retry; nothing was changed.' }, 423);
      }
      console.error('api/contacts update: write failed', resp.status, txt.slice(0, 200));
      return json({ status: 'error', message: 'Could not save the contact. Please retry.' }, 502);
    }
    await invalidateCache(env);
    const savedRow = Object.assign({}, existing, clean, { lastUpdated: today });
    delete savedRow._sheetRow;
    return json({ ok: true, saved: true, action, contact: publicRow(savedRow) });
  } catch (err) {
    console.error('api/contacts POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
