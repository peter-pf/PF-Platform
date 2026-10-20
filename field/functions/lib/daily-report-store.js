// daily-report-store.js — shared persistence layer for daily reports.
//
// IDENTICAL COPY must be kept in sync with field/functions/lib/daily-report-store.js.
// Edit BOTH files together. A future build step can enforce this.
//
// PRIMARY storage:  D1 (env.DB, table daily_reports) — one row per report.
//   INSERT OR REPLACE is atomic per row, so concurrent writes to DIFFERENT
//   reports are fully independent. This fixes the KV lost-write bug: two portals
//   (platform + field) or two forepeople submitting at the same time can no longer
//   overwrite each other's records.
//
// FALLBACK storage: KV (env.PF_SCHEDULE, key daily_reports_v1) — full-list JSON.
//   Used if env.DB is missing, the table doesn't exist yet (pre-migration), or a
//   D1 query throws. Writes AND reads fall back transparently. This lets the field
//   portal keep working on preview deployments where D1 isn't bound, and ensures
//   a smooth cut-over (deploy functions first, run backfill, D1 takes over).
//
// D1 table schema (migration 0005_daily_reports.sql):
//   id TEXT PRIMARY KEY
//   project_number TEXT   -- rec.projectId (for fast WHERE project_number=? filter)
//   report_date    TEXT   -- rec.date       (for fast WHERE report_date=? filter)
//   status         TEXT   -- 'draft' | 'sent'
//   data           TEXT   -- full JSON blob of the report (single source of truth)
//   created_at     TEXT   -- ISO timestamp from rec.createdAt
//   updated_at     TEXT   -- ISO timestamp, refreshed on every upsert
//   updated_by     TEXT   -- session name/uid of last writer

export const KV_KEY = 'daily_reports_v1';

// ---- KV helpers (fallback) ---------------------------------------------------

export async function loadListFromKV(env) {
  if (!env || !env.PF_SCHEDULE) return { reports: [], meta: { updated: null } };
  try {
    const raw = await env.PF_SCHEDULE.get(KV_KEY);
    if (!raw) return { reports: [], meta: { updated: null } };
    const p = JSON.parse(raw);
    return {
      reports: Array.isArray(p && p.reports) ? p.reports : [],
      meta: (p && p.meta) || { updated: null },
    };
  } catch {
    return { reports: [], meta: { updated: null } };
  }
}

async function saveListToKV(env, reports) {
  const stamp = new Date().toISOString();
  await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify({
    version: 1, reports, meta: { updated: stamp },
  }));
  return stamp;
}

// ---- D1 helpers --------------------------------------------------------------

function rowToRec(row) {
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// Try to run a D1 write. Returns true on success, false on any error
// (caller then falls back to KV).
async function tryD1Write(env, sql, params) {
  if (!env || !env.DB) return false;
  try {
    await env.DB.prepare(sql).bind(...params).run();
    return true;
  } catch (e) {
    console.warn('[daily-report-store] D1 write failed, falling back to KV:', e && e.message);
    return false;
  }
}

// Try to run a D1 SELECT that returns one row. Returns the row or null.
// Returns undefined (not null) if D1 is unavailable (caller falls back to KV).
async function tryD1First(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const row = await env.DB.prepare(sql).bind(...params).first();
    return row; // may be null if not found
  } catch (e) {
    console.warn('[daily-report-store] D1 read failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

// Try to run a D1 SELECT that returns multiple rows. Returns an array or
// undefined if D1 is unavailable.
async function tryD1All(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const result = await env.DB.prepare(sql).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.warn('[daily-report-store] D1 query failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

// ---- Public API --------------------------------------------------------------

// Upsert a single report record.
// Returns an ISO timestamp string marking when the write completed.
export async function upsertReport(env, rec) {
  const nowIso = new Date().toISOString();
  const updatedBy = rec.updatedBy || rec.createdBy || '';

  const ok = await tryD1Write(
    env,
    `INSERT OR REPLACE INTO daily_reports
       (id, project_number, report_date, status, data, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.projectId || '',
      rec.date || '',
      rec.status || 'draft',
      JSON.stringify(rec),
      rec.createdAt || nowIso,
      nowIso,
      updatedBy,
    ]
  );
  if (ok) return nowIso;

  // KV fallback: read-modify-write on the full list.
  const list = await loadListFromKV(env);
  const idx = list.reports.findIndex((r) => r.id === rec.id);
  if (idx >= 0) {
    list.reports[idx] = rec;
  } else {
    list.reports.push(rec);
  }
  return saveListToKV(env, list.reports);
}

// Load a single report by id.
// Returns the report object or null if not found.
export async function loadReportById(env, id) {
  const row = await tryD1First(
    env, 'SELECT data FROM daily_reports WHERE id = ?', [id]
  );
  if (row !== undefined) return rowToRec(row); // D1 path (row may be null = not found)

  // KV fallback.
  const list = await loadListFromKV(env);
  return list.reports.find((r) => r.id === id) || null;
}

// List reports with optional filters.
// Returns { reports: [], meta: { updated } }.
export async function listReports(env, { projectId, date } = {}) {
  const clauses = [];
  const bindings = [];
  if (projectId) { clauses.push('project_number = ?'); bindings.push(projectId); }
  if (date)      { clauses.push('report_date = ?');    bindings.push(date); }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const sql = 'SELECT data FROM daily_reports' + where +
              ' ORDER BY report_date DESC, created_at DESC';

  const rows = await tryD1All(env, sql, bindings);
  if (rows !== undefined) {
    return {
      reports: rows.map(rowToRec).filter(Boolean),
      meta: { updated: new Date().toISOString() },
    };
  }

  // KV fallback.
  const list = await loadListFromKV(env);
  let reports = list.reports;
  if (projectId) reports = reports.filter((r) => r.projectId === projectId);
  if (date)      reports = reports.filter((r) => r.date === date);
  return { reports, meta: list.meta };
}

// Count total reports (for the MAX_REPORTS cap on 'create').
export async function countReports(env) {
  const row = await tryD1First(env, 'SELECT COUNT(*) AS n FROM daily_reports', []);
  if (row !== undefined) return (row && Number(row.n)) || 0;

  // KV fallback.
  const list = await loadListFromKV(env);
  return list.reports.length;
}
