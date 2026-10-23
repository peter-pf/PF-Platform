// site-readiness-store.js -- persistence layer for Site Readiness Form records.
//
// Mirrors daily-report-store.js exactly:
//   PRIMARY storage:  D1 (env.DB, table site_readiness) -- one row per record.
//   FALLBACK storage: KV (env.PF_SCHEDULE, key site_readiness_v1) -- full-list JSON.
//
// D1 table schema (migration 0006_site_readiness.sql):
//   id              TEXT PRIMARY KEY
//   project_number  TEXT   -- rec.projectId
//   inspection_date TEXT   -- rec.date
//   result          TEXT   -- 'READY' | 'NOT READY' | ''
//   status          TEXT   -- 'draft' | 'sent'
//   data            TEXT   -- full JSON blob
//   created_at      TEXT
//   updated_at      TEXT
//   updated_by      TEXT

export const KV_KEY = 'site_readiness_v1';

// ---- KV helpers (fallback) ---------------------------------------------------

export async function loadListFromKV(env) {
  if (!env || !env.PF_SCHEDULE) return { records: [], meta: { updated: null } };
  try {
    const raw = await env.PF_SCHEDULE.get(KV_KEY);
    if (!raw) return { records: [], meta: { updated: null } };
    const p = JSON.parse(raw);
    return {
      records: Array.isArray(p && p.records) ? p.records : [],
      meta: (p && p.meta) || { updated: null },
    };
  } catch {
    return { records: [], meta: { updated: null } };
  }
}

async function saveListToKV(env, records) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
    version: 1, records, meta: { updated: stamp },
  }));
  return stamp;
}

// ---- D1 helpers --------------------------------------------------------------

function rowToRec(row) {
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

async function tryD1Write(env, sql, params) {
  if (!env || !env.DB) return false;
  try {
    await env.DB.prepare(sql).bind(...params).run();
    return true;
  } catch (e) {
    console.warn('[site-readiness-store] D1 write failed, falling back to KV:', e && e.message);
    return false;
  }
}

async function tryD1First(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const row = await env.DB.prepare(sql).bind(...params).first();
    return row;
  } catch (e) {
    console.warn('[site-readiness-store] D1 read failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

async function tryD1All(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const result = await env.DB.prepare(sql).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.warn('[site-readiness-store] D1 query failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

// ---- Public API --------------------------------------------------------------

// Upsert a single site-readiness record.
// Returns an ISO timestamp string.
export async function upsertRecord(env, rec) {
  const nowIso = new Date().toISOString();
  const updatedBy = rec.updatedBy || rec.createdBy || '';

  const ok = await tryD1Write(
    env,
    `INSERT OR REPLACE INTO site_readiness
       (id, project_number, inspection_date, result, status, data, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.projectId || '',
      rec.date || '',
      rec.result || '',
      rec.status || 'draft',
      JSON.stringify(rec),
      rec.createdAt || nowIso,
      nowIso,
      updatedBy,
    ]
  );
  if (ok) return nowIso;

  // KV fallback.
  const list = await loadListFromKV(env);
  const idx = list.records.findIndex((r) => r.id === rec.id);
  if (idx >= 0) {
    list.records[idx] = rec;
  } else {
    list.records.push(rec);
  }
  return saveListToKV(env, list.records);
}

// Load a single record by id. Returns the record object or null.
export async function loadRecordById(env, id) {
  const row = await tryD1First(
    env, 'SELECT data FROM site_readiness WHERE id = ?', [id]
  );
  if (row !== undefined) return rowToRec(row);

  const list = await loadListFromKV(env);
  return list.records.find((r) => r.id === id) || null;
}

// List records with optional filters.
// Returns { records: [], meta: { updated } }.
export async function listRecords(env, { projectId, date } = {}) {
  const clauses = [];
  const bindings = [];
  if (projectId) { clauses.push('project_number = ?'); bindings.push(projectId); }
  if (date)      { clauses.push('inspection_date = ?'); bindings.push(date); }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const sql = 'SELECT data FROM site_readiness' + where +
              ' ORDER BY inspection_date DESC, created_at DESC';

  const rows = await tryD1All(env, sql, bindings);
  if (rows !== undefined) {
    return {
      records: rows.map(rowToRec).filter(Boolean),
      meta: { updated: new Date().toISOString() },
    };
  }

  // KV fallback.
  const list = await loadListFromKV(env);
  let records = list.records;
  if (projectId) records = records.filter((r) => r.projectId === projectId);
  if (date)      records = records.filter((r) => r.date === date);
  return { records, meta: list.meta };
}

// Count total records (for the MAX_RECORDS cap on 'create').
export async function countRecords(env) {
  const row = await tryD1First(env, 'SELECT COUNT(*) AS n FROM site_readiness', []);
  if (row !== undefined) return (row && Number(row.n)) || 0;

  const list = await loadListFromKV(env);
  return list.records.length;
}

// ---- Result computation (shared between store and API) ----------------------

// The canonical checklist item definitions.
// answer: 'Yes' | 'No' | 'N/A' | '' (blank = unanswered)
// READY requires every item to be 'Yes' or 'N/A'.
// NOT READY if any item is 'No' or blank.
// R10 (Derek 2026-10-23): 7-section checklist structure.
// R11 (Derek 2026-10-23): Section 1 renamed "Site Prep and Conditions"; old 1b
//   (Spoil pile) removed (covered by 5b); 1a gets photo upload; new 1b/1c added.
//   Photo uploads added to 4b and 4c. Old 1b backward compat: pre-R11 records
//   stored key '1b' = Spoil pile. Records created by R11+ have schemaVersion: 11.
//   PDF uses schemaVersion to render the old 1b under a legacy label.
// Section 4 renamed Trucking Plan; new sections 5 Stone & Spoils Plan, 6 Safety.
// Section 7 Site Photos is not a checklist item — it is the photos upload widget.
export const CHECKLIST_ITEMS = [
  // Section 1: Site Prep and Conditions (R11: renamed; 1a photo added; old 1b removed; new 1b+1c added)
  //                                       (R12: added 1d-1h; no photo uploads; schemaVersion guard required)
  { key: '1a', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Temp construction stone drive from street to pad (each truck entry)',
    hasUpload: true, uploadLabel: 'Photo of temp construction stone drive' },
  // NOTE: old 1b 'Spoil pile locations identified off the building pad' removed in R11.
  // Pre-R11 records hold key '1b' with the spoil-pile meaning; PDF uses schemaVersion
  // to detect and label it correctly as legacy. New 1b = general conditions.
  { key: '1b', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'General conditions, soil type, etc.',
    hasUpload: true, uploadLabel: 'General conditions photo' },
  { key: '1c', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Areas of concern',
    hasUpload: true, uploadLabel: 'Areas of concern photo' },
  // R12: 1d-1h — standard dropdown+notes, no photo upload
  // schemaVersion guard: scored/rendered only for records with schemaVersion >= 12.
  { key: '1d', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Pad firm enough for the rig to track and set up (no soft spots or ruts)' },
  { key: '1e', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Standing water or drainage issues on the pad' },
  { key: '1f', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Adjacent structures or neighbors close enough to be sensitive to vibration' },
  { key: '1g', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Crew parking and equipment laydown area identified' },
  { key: '1h', section: '1', sectionLabel: 'Site Prep and Conditions',
    label: 'Site hours or noise restrictions from the GC or city' },
  // Section 2: Utilities
  { key: '2a', section: '2', sectionLabel: 'Utilities',
    label: 'Private utilities located and marked by GC' },
  { key: '2b', section: '2', sectionLabel: 'Utilities',
    label: 'Public utilities located and marked (PF)' },
  { key: '2c', section: '2', sectionLabel: 'Utilities',
    label: "No new underground utilities installed within 10' of building pad until PF scope complete" },
  // Section 3: Building Pad
  { key: '3a', section: '3', sectionLabel: 'Building Pad',
    label: 'At working grade elevation per GC (variance >3" may be change order)',
    hasUpload: true, uploadLabel: 'Grade stake / elevation photo' },
  { key: '3b', section: '3', sectionLabel: 'Building Pad',
    label: "Pad overbuilt 10' on all sides" },
  { key: '3c', section: '3', sectionLabel: 'Building Pad',
    label: '4"-6" stone working platform placed' },
  { key: '3d', section: '3', sectionLabel: 'Building Pad',
    label: 'Proof rolled and inspected by 3rd party testing agency',
    hasUpload: true, uploadLabel: 'Passing proof-roll letter from 3rd party' },
  { key: '3e', section: '3', sectionLabel: 'Building Pad',
    label: 'Staking & Layout: building pad has been staked',
    hasUpload: true, uploadLabel: 'If staking is complete, attach photos of the staking here.' },
  // Section 4: Trucking Plan (R10: renamed from PF General Operations; items rebuilt)
  { key: '4a', section: '4', sectionLabel: 'Trucking Plan',
    label: 'Trucking access discussed with GC' },
  { key: '4b', section: '4', sectionLabel: 'Trucking Plan',
    label: 'Unload / load location? On street or on site? Additional materials required if on street?',
    hasUpload: true, uploadLabel: 'Unload / load location photo' },
  { key: '4c', section: '4', sectionLabel: 'Trucking Plan',
    label: 'Overhead utilities in the way?',
    hasUpload: true, uploadLabel: 'Overhead utilities photo' },
  { key: '4d', section: '4', sectionLabel: 'Trucking Plan',
    label: 'Special notes about directions in and out of the job site' },
  // Section 5: Stone & Spoils Plan (R10: new)
  { key: '5a', section: '5', sectionLabel: 'Stone & Spoils Plan',
    label: 'Stone placement location' },
  { key: '5b', section: '5', sectionLabel: 'Stone & Spoils Plan',
    label: 'Spoils placement location' },
  { key: '5c', section: '5', sectionLabel: 'Stone & Spoils Plan',
    label: 'Spoils removal plan: any additional PF coordination required or GC plan to remove spoils' },
  // 5d = site plan markup upload + single sign-off block (canvas rendered in HTML, not a plain item)
  { key: '5d', section: '5', sectionLabel: 'Stone & Spoils Plan',
    label: 'Site plan markup',
    hasUpload: true, uploadLabel: 'Site plan markup image (drawn on canvas)' },
  // Section 6: Safety (R10: new; was 4d "Safety training")
  { key: '6a', section: '6', sectionLabel: 'Safety',
    label: 'Additional safety training required for PF before on site?',
    hasUpload: true, uploadLabel: 'Save training material to the project\'s OneDrive safety folder' },
];

// Derive the upload bucket key from an item key.
export function uploadBucketForItem(itemKey) {
  // Section 1 photo buckets (R11)
  if (itemKey === '1a') return 'photo_1a';
  if (itemKey === '1b') return 'photo_1b';
  if (itemKey === '1c') return 'photo_1c';
  // Section 3 uploads (existing)
  if (itemKey === '3a') return 'grade_photo';
  if (itemKey === '3d') return 'proof_roll';
  if (itemKey === '3e') return 'staking_photo';
  // Section 4 photo buckets (R11)
  if (itemKey === '4b') return 'photo_4b';
  if (itemKey === '4c') return 'photo_4c';
  // Section 5/6 uploads (existing)
  if (itemKey === '5d') return 'sr_markup';
  if (itemKey === '6a') return 'safety_cert';
  return null;
}

// Keys introduced in R12. Only scored when schemaVersion >= 12.
// Pre-R12 records (R11, legacy) must not show these as open items.
export const R12_KEYS = new Set(['1d', '1e', '1f', '1g', '1h']);

// Compute the overall result from an items array.
// Each item: { key, answer } where answer is 'Yes' | 'No' | 'N/A' | ''.
// schemaVersion: the record's stored schemaVersion (number or undefined).
//   R12 items (1d-1h) are only included in scoring when schemaVersion >= 12.
//   Pre-R12 records (v11, legacy) are non-breaking: 1d-1h are skipped entirely.
// Returns { result: 'READY'|'NOT READY', openItems: [key, ...] }.
export function computeResult(items, schemaVersion) {
  const isR12 = typeof schemaVersion === 'number' && schemaVersion >= 12;
  const openItems = [];
  for (const def of CHECKLIST_ITEMS) {
    // Skip R12-only keys for pre-R12 records so they never count as open.
    if (R12_KEYS.has(def.key) && !isR12) continue;
    const item = (items || []).find((it) => it && it.key === def.key);
    const answer = (item && item.answer) ? String(item.answer).trim() : '';
    if (answer !== 'Yes' && answer !== 'N/A') {
      openItems.push(def.key);
    }
  }
  return {
    result: openItems.length === 0 ? 'READY' : 'NOT READY',
    openItems,
  };
}
