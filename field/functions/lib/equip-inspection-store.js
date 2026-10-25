// equip-inspection-store.js -- persistence layer for Daily Equipment Inspection records.
//
// Mirrors site-readiness-store.js exactly:
//   PRIMARY storage:  D1 (env.DB, table equip_inspections) -- one row per record.
//   FALLBACK storage: KV (env.PF_SCHEDULE, key equip_inspections_v1) -- full-list JSON.
//
// D1 table schema (migration 0009_equip_inspections.sql — separate deliverable):
//   id              TEXT PRIMARY KEY
//   machine_type    TEXT   -- 'skid_steer' | 'predrill_excavator' | 'vibro_excavator'
//   serial_number   TEXT
//   inspection_date TEXT   -- YYYY-MM-DD
//   status          TEXT   -- 'draft' | 'submitted'
//   data            TEXT   -- full JSON blob
//   created_at      TEXT
//   updated_at      TEXT
//   updated_by      TEXT   -- uid
//
// CHECKLIST ITEMS
// ---------------------------------------------------------------------------
// Source basis (see equip-inspection.html comment block for full URLs):
//   Skid Steer / Loader items based on:
//     Cat Operation and Maintenance Manual "SEBU9258" (262D3/272D3 series)
//     https://www.cat.com/en_US/support/operations/service-manuals.html
//   Excavator items (Predrill + Vibro base) based on:
//     Cat Operation and Maintenance Manual "UENR7706" (320/323 series)
//     Cat Operation and Maintenance Manual "UENR8027" (336 series)
//     https://www.cat.com/en_US/support/operations/service-manuals.html
//   Generic daily walk-around inspection checklists also referenced at:
//     https://www.cat.com/en_US/support/maintenance.html
//   NOTE: these are starting-point items; Derek will confirm and refine.

export const KV_KEY = 'equip_inspections_v1';

// Machine type keys (canonical)
export const MACHINE_TYPES = ['skid_steer', 'predrill_excavator', 'vibro_excavator'];

export const MACHINE_LABELS = {
  skid_steer:          'Skid Steer / Loader',
  predrill_excavator:  'Predrill Excavator',
  vibro_excavator:     'Vibro Excavator',
};

// ---- Checklist definitions -------------------------------------------------
// key: unique string, no spaces
// label: display label
// section: section heading
// types: array of machine types this item applies to
// hasNote: always true (every item has a freetext note field)
// answers: 'pass_fail_na' = Pass/OK | Needs Attention | N/A (default for all)

const ALL_TYPES = MACHINE_TYPES;
const EXCAVATOR_TYPES = ['predrill_excavator', 'vibro_excavator'];

export const CHECKLIST_ITEMS = [
  // ---- Fluid Levels --------------------------------------------------------
  { key: 'fl_engine_oil',  section: 'Fluid Levels', label: 'Engine oil level (dipstick / sight glass)', types: ALL_TYPES },
  { key: 'fl_hydraulic',   section: 'Fluid Levels', label: 'Hydraulic oil level', types: ALL_TYPES },
  { key: 'fl_coolant',     section: 'Fluid Levels', label: 'Coolant level (overflow reservoir)', types: ALL_TYPES },
  { key: 'fl_def',         section: 'Fluid Levels', label: 'DEF (Diesel Exhaust Fluid) level', types: ALL_TYPES },
  { key: 'fl_fuel',        section: 'Fluid Levels', label: 'Fuel level', types: ALL_TYPES },

  // ---- Leaks ---------------------------------------------------------------
  { key: 'lk_engine',      section: 'Leaks', label: 'Engine area — oil, coolant, fuel leaks', types: ALL_TYPES },
  { key: 'lk_hydraulic',   section: 'Leaks', label: 'Hydraulic system leaks (hoses, fittings, cylinders)', types: ALL_TYPES },
  { key: 'lk_final_drive', section: 'Leaks', label: 'Final drive / axle leaks', types: ALL_TYPES },

  // ---- Belts, Hoses & Air --------------------------------------------------
  { key: 'bh_belts',       section: 'Belts, Hoses & Air Filter', label: 'Drive belts — condition, tension, fraying', types: ALL_TYPES },
  { key: 'bh_hoses',       section: 'Belts, Hoses & Air Filter', label: 'Hoses — condition, chafing, kinks, clamps', types: ALL_TYPES },
  { key: 'bh_air_filter',  section: 'Belts, Hoses & Air Filter', label: 'Air filter service indicator (restriction indicator)', types: ALL_TYPES },

  // ---- Tires / Tracks & Undercarriage (Skid Steer) -------------------------
  { key: 'tr_tires',       section: 'Tires', label: 'Tire condition and pressure (all 4)', types: ['skid_steer'] },

  // ---- Tracks & Undercarriage (Excavators) ---------------------------------
  { key: 'uc_tracks',      section: 'Tracks & Undercarriage', label: 'Track tension and condition (shoes, links, pins)', types: EXCAVATOR_TYPES },
  { key: 'uc_rollers',     section: 'Tracks & Undercarriage', label: 'Track rollers and carrier rollers', types: EXCAVATOR_TYPES },
  { key: 'uc_sprockets',   section: 'Tracks & Undercarriage', label: 'Sprockets — wear, cracks, missing teeth', types: EXCAVATOR_TYPES },
  { key: 'uc_idlers',      section: 'Tracks & Undercarriage', label: 'Front idlers — condition, leaks', types: EXCAVATOR_TYPES },

  // ---- Bucket / Attachment -------------------------------------------------
  { key: 'bk_teeth',       section: 'Bucket / Attachment', label: 'Bucket teeth / cutting edge — wear, cracks, secure', types: ALL_TYPES },
  { key: 'bk_pins',        section: 'Bucket / Attachment', label: 'Bucket pins and bushings', types: ALL_TYPES },
  { key: 'bk_quick_attach',section: 'Bucket / Attachment', label: 'Quick-attach / coupler — pins locked, indicator engaged', types: ALL_TYPES },

  // ---- Grease Points -------------------------------------------------------
  { key: 'gr_daily',       section: 'Lubrication', label: 'Daily grease points lubricated per schedule', types: ALL_TYPES },

  // ---- Safety & Cab --------------------------------------------------------
  { key: 'sf_seat_belt',   section: 'Safety & Cab', label: 'Seat belt — condition, latches properly', types: ALL_TYPES },
  { key: 'sf_rops',        section: 'Safety & Cab', label: 'ROPS / FOPS structure — no visible damage or cracks', types: ALL_TYPES },
  { key: 'sf_extinguisher',section: 'Safety & Cab', label: 'Fire extinguisher — present, charged, accessible', types: ALL_TYPES },
  { key: 'sf_horn',        section: 'Safety & Cab', label: 'Horn functional', types: ALL_TYPES },
  { key: 'sf_backup_alarm',section: 'Safety & Cab', label: 'Backup alarm functional', types: ALL_TYPES },
  { key: 'sf_lights',      section: 'Safety & Cab', label: 'Work lights and travel lights operational', types: ALL_TYPES },
  { key: 'sf_mirrors_cam', section: 'Safety & Cab', label: 'Mirrors / cameras — clean, properly adjusted', types: ALL_TYPES },
  { key: 'sf_glass',       section: 'Safety & Cab', label: 'Cab glass — no cracks, clean, wipers functional', types: ALL_TYPES },
  { key: 'sf_gauges',      section: 'Safety & Cab', label: 'Gauges and instrument cluster — no active warning lights', types: ALL_TYPES },

  // ---- Predrill Excavator: Auger Attachment --------------------------------
  { key: 'pd_auger_head',  section: 'Auger Drive Head', label: 'Auger drive head — oil level, leaks, hose connections', types: ['predrill_excavator'] },
  { key: 'pd_flighting',   section: 'Auger Drive Head', label: 'Auger flighting — condition, wear, straightness', types: ['predrill_excavator'] },
  { key: 'pd_teeth',       section: 'Auger Drive Head', label: 'Auger teeth / bits — wear, cracks, secure', types: ['predrill_excavator'] },
  { key: 'pd_kelly',       section: 'Auger Drive Head', label: 'Kelly bar / attachment connection — pins locked, condition', types: ['predrill_excavator'] },
  { key: 'pd_hyd_lines',   section: 'Auger Drive Head', label: 'Hydraulic hoses to auger drive — condition, leaks, couplings', types: ['predrill_excavator'] },

  // ---- Vibro Excavator: Vibro Probe Attachment -----------------------------
  { key: 'vb_probe',       section: 'Vibrator / Probe', label: 'Vibrator / probe body — condition, tip/fin wear', types: ['vibro_excavator'] },
  { key: 'vb_follower',    section: 'Vibrator / Probe', label: 'Follower tubes — condition, connections, alignment', types: ['vibro_excavator'] },
  { key: 'vb_hopper',      section: 'Vibrator / Probe', label: 'Stone hopper / feed door — operation, wear, seals', types: ['vibro_excavator'] },
  { key: 'vb_air_water',   section: 'Vibrator / Probe', label: 'Compressed air or water flush lines — connections, leaks', types: ['vibro_excavator'] },
  { key: 'vb_hyd_hoses',   section: 'Vibrator / Probe', label: 'Hydraulic hoses to vibrator — condition, quick-disconnects', types: ['vibro_excavator'] },
  { key: 'vb_power_pack',  section: 'Vibrator / Probe', label: 'Power pack / generator (if applicable) — oil, fuel, start check', types: ['vibro_excavator'] },
];

// Build a set of valid item keys for fast lookup.
export const VALID_ITEM_KEYS = new Set(CHECKLIST_ITEMS.map((d) => d.key));

// Valid answers for checklist items.
export const VALID_ANSWERS = { 'Pass': 1, 'Needs Attention': 1, 'N/A': 1, '': 1 };

// ---- KV helpers (fallback) -------------------------------------------------

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

// ---- D1 helpers -------------------------------------------------------------

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
    console.warn('[equip-inspection-store] D1 write failed, falling back to KV:', e && e.message);
    return false;
  }
}

async function tryD1First(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const row = await env.DB.prepare(sql).bind(...params).first();
    return row;
  } catch (e) {
    console.warn('[equip-inspection-store] D1 read failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

async function tryD1All(env, sql, params) {
  if (!env || !env.DB) return undefined;
  try {
    const result = await env.DB.prepare(sql).bind(...params).all();
    return result.results || [];
  } catch (e) {
    console.warn('[equip-inspection-store] D1 query failed, falling back to KV:', e && e.message);
    return undefined;
  }
}

// ---- Public API -------------------------------------------------------------

// Upsert a single equipment inspection record. Returns an ISO timestamp string.
export async function upsertRecord(env, rec) {
  const nowIso = new Date().toISOString();
  const updatedBy = rec.updatedBy || rec.createdBy || '';

  const ok = await tryD1Write(
    env,
    `INSERT OR REPLACE INTO equip_inspections
       (id, machine_type, serial_number, inspection_date, status, data, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.machineType || '',
      rec.serialNumber || '',
      rec.date || '',
      rec.status || 'draft',
      JSON.stringify(rec),
      rec.createdAt || nowIso,
      nowIso,
      updatedBy,
    ]
  );

  if (ok) return nowIso;

  // KV fallback
  const { records } = await loadListFromKV(env);
  const idx = records.findIndex((r) => r.id === rec.id);
  const updated = { ...rec, updatedAt: nowIso };
  if (idx >= 0) records[idx] = updated;
  else records.push(updated);
  return saveListToKV(env, records);
}

// Load a single record by id.
export async function loadRecordById(env, id) {
  const row = await tryD1First(env,
    'SELECT data FROM equip_inspections WHERE id = ?', [id]);
  if (row !== undefined) return rowToRec(row);

  const { records } = await loadListFromKV(env);
  return records.find((r) => r.id === id) || null;
}

// List all records (optionally filtered by machine type or status).
export async function listRecords(env, { machineType, status, uid } = {}) {
  const rows = await tryD1All(env,
    'SELECT data FROM equip_inspections ORDER BY inspection_date DESC, created_at DESC LIMIT 500',
    []);
  let recs;
  if (rows !== undefined) {
    recs = rows.map(rowToRec).filter(Boolean);
  } else {
    const { records } = await loadListFromKV(env);
    recs = records;
  }
  if (machineType) recs = recs.filter((r) => r.machineType === machineType);
  if (status) recs = recs.filter((r) => r.status === status);
  // uid filter: drafts are scoped to the requesting user (owner only), submitted = all
  if (uid) {
    recs = recs.filter((r) =>
      r.status !== 'draft' || r.createdBy === uid
    );
  }
  return recs;
}

export async function countRecords(env) {
  const row = await tryD1First(env, 'SELECT COUNT(*) AS n FROM equip_inspections', []);
  if (row !== undefined) return (row && Number(row.n)) || 0;
  const { records } = await loadListFromKV(env);
  return records.length;
}
