// equip-inspection-store.js -- persistence layer for Daily Equipment Inspection records.
//
// STORAGE: D1 ONLY. No KV fallback. If env.DB is absent or the D1 query fails,
// the function throws so the calling endpoint can return 503. Fail-closed is the
// correct posture for a form that writes to SharePoint on submit.
//
// D1 table schema (migration 0009_equip_inspections.sql):
//   id              TEXT PRIMARY KEY  -- server-generated crypto.randomUUID(), NEVER from client
//   machine_type    TEXT   -- 'skid_steer' | 'predrill_excavator' | 'vibro_excavator'
//   serial_number   TEXT
//   inspection_date TEXT   -- YYYY-MM-DD
//   status          TEXT   -- 'draft' | 'submitted'
//   data            TEXT   -- full JSON blob
//   created_by      TEXT   -- session uid (server-set on create)
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
  { key: 'lk_engine',      section: 'Leaks', label: 'Engine area -- oil, coolant, fuel leaks', types: ALL_TYPES },
  { key: 'lk_hydraulic',   section: 'Leaks', label: 'Hydraulic system leaks (hoses, fittings, cylinders)', types: ALL_TYPES },
  { key: 'lk_final_drive', section: 'Leaks', label: 'Final drive / axle leaks', types: ALL_TYPES },

  // ---- Belts, Hoses & Air --------------------------------------------------
  { key: 'bh_belts',       section: 'Belts, Hoses & Air Filter', label: 'Drive belts -- condition, tension, fraying', types: ALL_TYPES },
  { key: 'bh_hoses',       section: 'Belts, Hoses & Air Filter', label: 'Hoses -- condition, chafing, kinks, clamps', types: ALL_TYPES },
  { key: 'bh_air_filter',  section: 'Belts, Hoses & Air Filter', label: 'Air filter service indicator (restriction indicator)', types: ALL_TYPES },

  // ---- Tires / Tracks & Undercarriage (Skid Steer) -------------------------
  { key: 'tr_tires',       section: 'Tires', label: 'Tire condition and pressure (all 4)', types: ['skid_steer'] },

  // ---- Tracks & Undercarriage (Excavators) ---------------------------------
  { key: 'uc_tracks',      section: 'Tracks & Undercarriage', label: 'Track tension and condition (shoes, links, pins)', types: EXCAVATOR_TYPES },
  { key: 'uc_rollers',     section: 'Tracks & Undercarriage', label: 'Track rollers and carrier rollers', types: EXCAVATOR_TYPES },
  { key: 'uc_sprockets',   section: 'Tracks & Undercarriage', label: 'Sprockets -- wear, cracks, missing teeth', types: EXCAVATOR_TYPES },
  { key: 'uc_idlers',      section: 'Tracks & Undercarriage', label: 'Front idlers -- condition, leaks', types: EXCAVATOR_TYPES },

  // ---- Bucket / Attachment -------------------------------------------------
  { key: 'bk_teeth',        section: 'Bucket / Attachment', label: 'Bucket teeth / cutting edge -- wear, cracks, secure', types: ALL_TYPES },
  { key: 'bk_pins',         section: 'Bucket / Attachment', label: 'Bucket pins and bushings', types: ALL_TYPES },
  { key: 'bk_quick_attach', section: 'Bucket / Attachment', label: 'Quick-attach / coupler -- pins locked, indicator engaged', types: ALL_TYPES },

  // ---- Grease Points -------------------------------------------------------
  { key: 'gr_daily',       section: 'Lubrication', label: 'Daily grease points lubricated per schedule', types: ALL_TYPES },

  // ---- Safety & Cab --------------------------------------------------------
  { key: 'sf_seat_belt',   section: 'Safety & Cab', label: 'Seat belt -- condition, latches properly', types: ALL_TYPES },
  { key: 'sf_rops',        section: 'Safety & Cab', label: 'ROPS / FOPS structure -- no visible damage or cracks', types: ALL_TYPES },
  { key: 'sf_extinguisher',section: 'Safety & Cab', label: 'Fire extinguisher -- present, charged, accessible', types: ALL_TYPES },
  { key: 'sf_horn',        section: 'Safety & Cab', label: 'Horn functional', types: ALL_TYPES },
  { key: 'sf_backup_alarm',section: 'Safety & Cab', label: 'Backup alarm functional', types: ALL_TYPES },
  { key: 'sf_lights',      section: 'Safety & Cab', label: 'Work lights and travel lights operational', types: ALL_TYPES },
  { key: 'sf_mirrors_cam', section: 'Safety & Cab', label: 'Mirrors / cameras -- clean, properly adjusted', types: ALL_TYPES },
  { key: 'sf_glass',       section: 'Safety & Cab', label: 'Cab glass -- no cracks, clean, wipers functional', types: ALL_TYPES },
  { key: 'sf_gauges',      section: 'Safety & Cab', label: 'Gauges and instrument cluster -- no active warning lights', types: ALL_TYPES },

  // ---- Predrill Excavator: Auger Attachment --------------------------------
  { key: 'pd_auger_head',  section: 'Auger Drive Head', label: 'Auger drive head -- oil level, leaks, hose connections', types: ['predrill_excavator'] },
  { key: 'pd_flighting',   section: 'Auger Drive Head', label: 'Auger flighting -- condition, wear, straightness', types: ['predrill_excavator'] },
  { key: 'pd_teeth',       section: 'Auger Drive Head', label: 'Auger teeth / bits -- wear, cracks, secure', types: ['predrill_excavator'] },
  { key: 'pd_kelly',       section: 'Auger Drive Head', label: 'Kelly bar / attachment connection -- pins locked, condition', types: ['predrill_excavator'] },
  { key: 'pd_hyd_lines',   section: 'Auger Drive Head', label: 'Hydraulic hoses to auger drive -- condition, leaks, couplings', types: ['predrill_excavator'] },

  // ---- Vibro Excavator: Vibro Probe Attachment -----------------------------
  { key: 'vb_probe',       section: 'Vibrator / Probe', label: 'Vibrator / probe body -- condition, tip/fin wear', types: ['vibro_excavator'] },
  { key: 'vb_follower',    section: 'Vibrator / Probe', label: 'Follower tubes -- condition, connections, alignment', types: ['vibro_excavator'] },
  { key: 'vb_hopper',      section: 'Vibrator / Probe', label: 'Stone hopper / feed door -- operation, wear, seals', types: ['vibro_excavator'] },
  { key: 'vb_air_water',   section: 'Vibrator / Probe', label: 'Compressed air or water flush lines -- connections, leaks', types: ['vibro_excavator'] },
  { key: 'vb_hyd_hoses',   section: 'Vibrator / Probe', label: 'Hydraulic hoses to vibrator -- condition, quick-disconnects', types: ['vibro_excavator'] },
  { key: 'vb_power_pack',  section: 'Vibrator / Probe', label: 'Power pack / generator (if applicable) -- oil, fuel, start check', types: ['vibro_excavator'] },
];

// Build a set of valid item keys for fast lookup.
export const VALID_ITEM_KEYS = new Set(CHECKLIST_ITEMS.map((d) => d.key));

// Valid answers for checklist items.
export const VALID_ANSWERS = { 'Pass': 1, 'Needs Attention': 1, 'N/A': 1, '': 1 };

// ---- D1 helpers (fail-closed: throw on any failure) -----------------------

function rowToRec(row) {
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// Throw with a tagged message so the API can distinguish D1 errors from logic errors.
function d1Error(op, cause) {
  const msg = `[equip-inspection-store] D1 ${op} failed: ${cause && cause.message || cause}`;
  console.error(msg);
  const err = new Error(msg);
  err.isD1Error = true;
  return err;
}

// ---- Public API -------------------------------------------------------------

// Upsert a single equipment inspection record.
// Throws a tagged error (err.isD1Error = true) on D1 failure.
export async function upsertRecord(env, rec) {
  if (!env || !env.DB) throw d1Error('upsert', 'DB binding unavailable');
  const nowIso = new Date().toISOString();
  const updatedBy = rec.updatedBy || rec.createdBy || '';
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO equip_inspections
         (id, machine_type, serial_number, inspection_date, status, data,
          created_by, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      rec.id,
      rec.machineType || '',
      rec.serialNumber || '',
      rec.date || '',
      rec.status || 'draft',
      JSON.stringify(rec),
      rec.createdBy || '',
      rec.createdAt || nowIso,
      nowIso,
      updatedBy,
    ).run();
  } catch (e) {
    throw d1Error('upsert', e);
  }
  return nowIso;
}

// Load a single record by id.
// Returns null if not found. Throws on D1 failure.
export async function loadRecordById(env, id) {
  if (!env || !env.DB) throw d1Error('loadById', 'DB binding unavailable');
  let row;
  try {
    row = await env.DB.prepare('SELECT data FROM equip_inspections WHERE id = ?')
      .bind(id).first();
  } catch (e) {
    throw d1Error('loadById', e);
  }
  return row ? rowToRec(row) : null;
}

// List all records optionally filtered; uid-scopes drafts to the requesting user.
// Throws on D1 failure.
export async function listRecords(env, { machineType, status, uid } = {}) {
  if (!env || !env.DB) throw d1Error('list', 'DB binding unavailable');
  let result;
  try {
    result = await env.DB.prepare(
      'SELECT data FROM equip_inspections ORDER BY inspection_date DESC, created_at DESC LIMIT 500'
    ).bind().all();
  } catch (e) {
    throw d1Error('list', e);
  }
  let recs = (result.results || []).map(rowToRec).filter(Boolean);
  if (machineType) recs = recs.filter((r) => r.machineType === machineType);
  if (status)      recs = recs.filter((r) => r.status === status);
  if (uid) {
    recs = recs.filter((r) => r.status !== 'draft' || r.createdBy === uid);
  }
  return recs;
}

// Count all records. Throws on D1 failure.
export async function countRecords(env) {
  if (!env || !env.DB) throw d1Error('count', 'DB binding unavailable');
  let row;
  try {
    row = await env.DB.prepare('SELECT COUNT(*) AS n FROM equip_inspections').bind().first();
  } catch (e) {
    throw d1Error('count', e);
  }
  return (row && Number(row.n)) || 0;
}
