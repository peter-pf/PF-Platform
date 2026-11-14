// Cloudflare Pages Function — /api/service-log
// Equipment service log for the field portal.
//
// Security:
//  - Standard session gate fires in _middleware.js.
//  - Additional UID-level preview gate fires in _middleware.js via serviceLogAllowed().
//  - This endpoint re-checks the gate directly (belt + suspenders).
//  - Writes are further restricted to serviceLogCanEdit() (SERVICELOG_EDITORS set).
//  - Fail-closed: absent session => 401.  Absent DB => 500.
//
// GET  /api/service-log               — list all entries + vendor name suggestions
// POST /api/service-log               — write (action in JSON body)
//
// POST actions (all require serviceLogCanEdit):
//   add_entry    — { machine, service_date, service_type, [hour_meter, description,
//                    parts_used, vendor, cost, performed_by, next_due_hours,
//                    next_due_date, notes] }
//   edit_entry   — { id, machine, service_date, service_type, [optional fields…] }
//   delete_entry — { id }

import { serviceLogAllowed, serviceLogCanEdit } from '../lib/servicelog-access.js';
import { getEquipInspType, hasServiceIntervals, getMachineTaskData, getMachineBaseline } from '../lib/service-intervals.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Hard caps on free-text to prevent DB abuse.
const CAP = {
  machine:        120,
  service_date:   10,
  service_type:   40,
  description:    500,
  parts_used:     500,
  vendor:         120,
  performed_by:   80,
  next_due_date:  10,
  notes:          500,
};

// Allowed service_interval values (or null for non-scheduled work).
const VALID_INTERVALS = new Set([500, 1000, 2000]);
function cleanInterval(val) {
  if (val === null || val === undefined || val === '' || val === 'none') return null;
  const n = Number(val);
  return VALID_INTERVALS.has(n) ? n : null;
}

function cap(val, field) {
  const s = String(val || '').trim();
  return s.slice(0, CAP[field] || 200);
}

// Parse a nullable REAL field from the request body.
// Returns the number, or null if absent/non-finite.
function realOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// Ensure the service_log_entries table and indexes exist (idempotent DDL).
// Also tries to ADD service_interval column to existing tables (new in 11/14 spec).
async function ensureTable(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS service_log_entries (
      id               TEXT    PRIMARY KEY,
      machine          TEXT    NOT NULL,
      service_date     TEXT    NOT NULL,
      hour_meter       REAL,
      service_type     TEXT    NOT NULL,
      service_interval INTEGER,
      description      TEXT,
      parts_used       TEXT,
      vendor           TEXT,
      cost             REAL,
      performed_by     TEXT,
      next_due_hours   REAL,
      next_due_date    TEXT,
      notes            TEXT,
      created_by       TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_by       TEXT,
      updated_at       TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sl_machine ON service_log_entries (machine)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sl_date    ON service_log_entries (service_date DESC)`),
  ]);
  // ALTER TABLE guard: adds service_interval to tables created before this column existed.
  // SQLite does not support IF NOT EXISTS on ADD COLUMN; we catch and ignore the dup-column error.
  try {
    await db.prepare('ALTER TABLE service_log_entries ADD COLUMN service_interval INTEGER').run();
  } catch (_) {
    // Column already exists — expected on second+ deploy.
  }
}

// Fetch vendor company names from vendors_items as suggestions.
// Best-effort: returns empty array if the vendors table doesn't exist yet.
async function fetchVendorNames(db) {
  try {
    const rows = await db
      .prepare('SELECT DISTINCT company FROM vendors_items ORDER BY company')
      .all();
    return (rows.results || []).map(r => r.company || '').filter(Boolean);
  } catch {
    return [];
  }
}

// Build a machineHoursData map: { [machineName]: { hours, source, date } }
// Combines the latest service_log_entries.hour_meter reading with the latest
// equip_inspections.machineHours reading (from the JSON blob via json_extract).
// Best-effort: errors in the equip_inspections query are non-fatal.
async function buildMachineHoursData(db, entries) {
  // 1. Latest hour_meter per machine from service log entries.
  //    entries is already ordered service_date DESC, so first per machine wins.
  const slByMachine = {};
  for (const e of entries) {
    if (!e.machine) continue;
    if (e.hour_meter == null) continue;
    if (!slByMachine[e.machine]) {
      slByMachine[e.machine] = {
        hours:  e.hour_meter,
        source: 'service log',
        date:   e.service_date || '',
      };
    }
  }

  // 2. Latest machineHours per equip_inspection machine_type.
  //    We query once per unique equipType needed by the machines that appear in entries.
  const equipTypeCache = {}; // equipType → { hours, date }
  const machineNames = [...new Set(entries.map(e => e.machine).filter(Boolean))];

  const typesToQuery = new Set();
  for (const name of machineNames) {
    const et = getEquipInspType(name);
    if (et) typesToQuery.add(et);
  }

  for (const equipType of typesToQuery) {
    try {
      const row = await db.prepare(
        `SELECT inspection_date,
                json_extract(data, '$.machineHours') AS machine_hours
         FROM equip_inspections
         WHERE status = 'submitted'
           AND machine_type = ?
           AND json_extract(data, '$.machineHours') IS NOT NULL
         ORDER BY inspection_date DESC
         LIMIT 1`
      ).bind(equipType).first();
      if (row && row.machine_hours != null) {
        equipTypeCache[equipType] = {
          hours: Number(row.machine_hours),
          date:  row.inspection_date || '',
        };
      }
    } catch {
      // equip_inspections table may not exist in this DB yet — non-fatal.
    }
  }

  // 3. Merge: for each machine that has service intervals, pick the LATER reading.
  const result = {};
  for (const name of machineNames) {
    if (!hasServiceIntervals(name)) continue; // skip augers / tooling

    const slEntry  = slByMachine[name];
    const equipType = getEquipInspType(name);
    const eiEntry  = equipType ? equipTypeCache[equipType] : null;

    // Pick whichever source has a more recent date (or either if only one present).
    let chosen = null;
    if (slEntry && eiEntry) {
      chosen = eiEntry.date > slEntry.date
        ? { hours: eiEntry.hours, source: 'equip inspection', date: eiEntry.date }
        : { hours: slEntry.hours, source: slEntry.source, date: slEntry.date };
    } else if (slEntry) {
      chosen = slEntry;
    } else if (eiEntry) {
      chosen = { hours: eiEntry.hours, source: 'equip inspection', date: eiEntry.date };
    }

    result[name] = chosen || null;
  }

  return result;
}

// ---- GET ----------------------------------------------------------------
export async function onRequestGet(context) {
  const session = context.data?.session;
  if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
  if (!serviceLogAllowed(session)) return json({ ok: false, error: 'Access not enabled for your account.' }, 403);

  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 500);

  try {
    await ensureTable(db);

    const [entryRows, vendorNames] = await Promise.all([
      db.prepare(
        `SELECT id, machine, service_date, hour_meter, service_type, service_interval,
                description, parts_used, vendor, cost, performed_by,
                next_due_hours, next_due_date, notes,
                created_by, created_at, updated_by, updated_at
         FROM service_log_entries
         ORDER BY service_date DESC, created_at DESC`
      ).all(),
      fetchVendorNames(db),
    ]);

    const entries = entryRows.results || [];
    const machineHoursData = await buildMachineHoursData(db, entries);

    // Build machineTaskData and machineBaselines for all machines that appear in entries.
    const machineNames = [...new Set(entries.map(e => e.machine).filter(Boolean))];
    const machineTaskData  = {};
    const machineBaselines = {};
    for (const name of machineNames) {
      const td = getMachineTaskData(name);
      if (td) machineTaskData[name] = td;
      const bl = getMachineBaseline(name);
      if (bl) machineBaselines[name] = bl;
    }

    return json({ ok: true, entries, vendorNames, machineHoursData, machineTaskData, machineBaselines });
  } catch (e) {
    console.error('[service-log] GET error:', e && e.message);
    return json({ ok: false, error: 'Failed to load service log.' }, 500);
  }
}

// ---- POST ---------------------------------------------------------------
export async function onRequestPost(context) {
  const session = context.data?.session;
  if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
  if (!serviceLogAllowed(session)) return json({ ok: false, error: 'Access not enabled for your account.' }, 403);
  if (!serviceLogCanEdit(session)) return json({ ok: false, error: 'Write access not enabled for your account.' }, 403);

  const db = context.env?.DB;
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const { action } = body || {};
  const actor = session.name || session.uid || 'unknown';
  const now   = new Date().toISOString();

  try {
    await ensureTable(db);

    // ----------------------------------------------------------------
    if (action === 'add_entry') {
      const machine          = cap(body.machine, 'machine');
      const service_date     = cap(body.service_date, 'service_date');
      const service_type     = cap(body.service_type, 'service_type');
      const service_interval = cleanInterval(body.service_interval);

      if (!machine)       return json({ ok: false, error: 'Machine is required.' }, 400);
      if (!service_date)  return json({ ok: false, error: 'Service date is required.' }, 400);
      if (!service_type)  return json({ ok: false, error: 'Service type is required.' }, 400);

      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO service_log_entries
           (id, machine, service_date, hour_meter, service_type, service_interval,
            description, parts_used, vendor, cost, performed_by,
            next_due_hours, next_due_date, notes, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, machine, service_date,
        realOrNull(body.hour_meter),
        service_type,
        service_interval,
        cap(body.description, 'description') || null,
        cap(body.parts_used, 'parts_used')   || null,
        cap(body.vendor, 'vendor')             || null,
        realOrNull(body.cost),
        cap(body.performed_by, 'performed_by') || null,
        realOrNull(body.next_due_hours),
        cap(body.next_due_date, 'next_due_date') || null,
        cap(body.notes, 'notes')               || null,
        actor, now
      ).run();

      return json({ ok: true, id });
    }

    // ----------------------------------------------------------------
    if (action === 'edit_entry') {
      const { id } = body;
      const machine          = cap(body.machine, 'machine');
      const service_date     = cap(body.service_date, 'service_date');
      const service_type     = cap(body.service_type, 'service_type');
      const service_interval = cleanInterval(body.service_interval);

      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      if (!machine)      return json({ ok: false, error: 'Machine is required.' }, 400);
      if (!service_date) return json({ ok: false, error: 'Service date is required.' }, 400);
      if (!service_type) return json({ ok: false, error: 'Service type is required.' }, 400);

      const result = await db.prepare(
        `UPDATE service_log_entries
         SET machine=?, service_date=?, hour_meter=?, service_type=?, service_interval=?,
             description=?, parts_used=?, vendor=?, cost=?,
             performed_by=?, next_due_hours=?, next_due_date=?,
             notes=?, updated_by=?, updated_at=?
         WHERE id=?`
      ).bind(
        machine, service_date,
        realOrNull(body.hour_meter),
        service_type,
        service_interval,
        cap(body.description, 'description') || null,
        cap(body.parts_used, 'parts_used')   || null,
        cap(body.vendor, 'vendor')             || null,
        realOrNull(body.cost),
        cap(body.performed_by, 'performed_by') || null,
        realOrNull(body.next_due_hours),
        cap(body.next_due_date, 'next_due_date') || null,
        cap(body.notes, 'notes')               || null,
        actor, now, id
      ).run();

      if (!result.meta?.changes) return json({ ok: false, error: 'Entry not found.' }, 404);
      return json({ ok: true });
    }

    // ----------------------------------------------------------------
    if (action === 'delete_entry') {
      const { id } = body;
      if (!id || typeof id !== 'string') return json({ ok: false, error: 'id required.' }, 400);
      await db.prepare('DELETE FROM service_log_entries WHERE id=?').bind(id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action.' }, 400);

  } catch (e) {
    console.error('[service-log] POST error:', action, e && e.message);
    return json({ ok: false, error: 'Server error.' }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET')  return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}
