// service-intervals.js
//
// Machine-specific scheduled service intervals and task lists.
//
// Source data: /home/aiciv/derek-service-log/service-intervals-verified.json
// (Primary-curated 2026-11-14; every task item has a cited source).
// RULE: Only items with a cited source are listed. Empty list = not yet sourced.
//       Do NOT fill from general knowledge.
//
// Portal name mapping (from KV ownedEquipment):
//   cat_336            → "Cat 336 Vibro Rig"
//   deere_350g         → "Deere 350G Vibro Rig"
//   sany_365           → "Sany 365 Predrill"
//   sullair_compressor → "Sulair Air Compressor"
//
// "Augers" and similar attach-only tooling have NO engine hour intervals.

// ---------------------------------------------------------------------------
// Machine interval data (from service-intervals-verified.json, 2026-11-14)
// ---------------------------------------------------------------------------
const MACHINES = {
  cat_336: {
    // Pattern: matches "Cat 336", "CAT336", etc. — NOT "CAT 308"
    patterns: [/cat\s*336/i],
    equipType: 'vibro_excavator',
    label:     'Cat 336F L (SN RKB21376)',
    source:    'CAT Product Status Report from the machine ECM, RKB21376, 02/23/2026 (SharePoint 02 - Equipment/CAT Equipment/Excavator Reports.zip, RKB21376_PSRPT_2026-02-23)',
    intervals: {
      500: [
        'Engine oil',
        'Engine oil filter',
        'Secondary fuel filter',
        'Tertiary fuel filter',
        'Fuel/water separator',
        'Attachment hydraulic oil filter',
      ],
      1000: [
        'Hydraulic case drain oil filter',
        'Hydraulic pilot oil filter',
        'Swing drive oil',
        'Fuel tank cap',
      ],
      2000: [
        'Return hydraulic oil filter',
        'Final drive oil',
      ],
    },
    // Baseline from ECM report 02/23/2026 at 799 h:
    //   500/1000 items last done at ~714 h; 2000 h items never done.
    // Used when no service_log entry exists for a given level.
    baseline: {
      date:          '2026-02-23',
      machine_hours: 799,
      note: "ECM 'hours since reset' at 799 h: oil/filters serviced at ~714 h; swing drive/final drive/coolant at 799 h (never reset).",
      last_done_hours: { 500: 714, 1000: 714, 2000: null }, // null → treat as 0
    },
  },

  deere_350g: {
    patterns: [/deere\s*350/i, /john\s*deere\s*350/i],
    equipType: 'vibro_excavator',
    label:     'John Deere 350G LC',
    source:    'John Deere 350G LC/380G LC brochure (SharePoint 02 - Equipment/Excavator Specs/350G-LC-380G-LC.pdf) pp.8, 11, 21',
    intervals: {
      500:  ['Engine oil change', 'Arm and boom joint grease'],
      1000: [],   // not yet sourced
      2000: [],   // not yet sourced
    },
    gaps: 'Full 1000 h and 2000 h task lists need the 350G LC Operator’s Manual service interval chart (not in our SharePoint).',
    baseline: null,
  },

  sany_365: {
    patterns: [/sany\s*365/i],
    equipType: 'predrill_excavator',
    label:     'SANY SY365C (Cummins QSL9)',
    source:    null,
    intervals: { 500: [], 1000: [], 2000: [] },
    gaps: 'Our SharePoint has only the SY365C parts book (no maintenance schedule). Need the SANY operation & maintenance manual or the Cummins QSL9 owner’s manual.',
    baseline: null,
  },

  cat_308: {
    // CAT 308 Drill — predrill excavator; no interval data sourced yet
    patterns: [/cat\s*308/i, /308\s*drill/i],
    equipType: 'predrill_excavator',
    label:     'CAT 308',
    source:    null,
    intervals: { 500: [], 1000: [], 2000: [] },
    gaps: 'Service interval data not yet sourced. Need the CAT 308 Operation & Maintenance Manual.',
    baseline: null,
  },

  sullair_compressor: {
    // "Sulair" in KV (confirmed spelling from portal_names in service-intervals-verified.json)
    patterns: [/sullair/i, /sulair/i, /air\s*comp/i],
    equipType: null,   // not in equip_inspections
    label:     'Sullair portable air compressor (model TBD)',
    source:    null,
    intervals: { 500: [], 1000: [], 2000: [] },
    gaps: 'Model/serial needed; Sullair schedules differ by model (main service is typically 250 h, fluid at 1500 h per the 375/185H manuals).',
    baseline: null,
  },
};

// ---------------------------------------------------------------------------
// Auger / tooling pattern — attach-only tools with no engine hour intervals.
// ---------------------------------------------------------------------------
const AUGER_PATTERN = /\bauger\b|\bbit\b|\bflighting\b|\btrailer\b/i;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function findMachineKey(machineName) {
  if (!machineName || typeof machineName !== 'string') return null;
  if (AUGER_PATTERN.test(machineName)) return null;
  for (const [key, cfg] of Object.entries(MACHINES)) {
    for (const p of cfg.patterns) {
      if (p.test(machineName)) return key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the snake_case key for the given machine name, or null. */
export function getMachineKey(machineName) {
  return findMachineKey(machineName);
}

/** Returns the interval task map {500:[...], 1000:[...], 2000:[...]} or null. */
export function getMachineIntervals(machineName) {
  const key = findMachineKey(machineName);
  if (!key) return null;
  return MACHINES[key].intervals;
}

/** Returns the equip_inspections machine_type for the given machine name, or null. */
export function getEquipInspType(machineName) {
  const key = findMachineKey(machineName);
  if (!key) return null;
  return MACHINES[key].equipType || null;
}

/** Returns true if the machine name tracks hour-based service intervals. */
export function hasServiceIntervals(machineName) {
  return findMachineKey(machineName) !== null;
}

/**
 * Returns task data for the GET response:
 *   { label, source, gaps, 500:{tasks,source,gaps}, 1000:{...}, 2000:{...} }
 * or null if no intervals for this machine.
 */
export function getMachineTaskData(machineName) {
  const key = findMachineKey(machineName);
  if (!key) return null;
  const cfg = MACHINES[key];
  const result = {
    label:  cfg.label,
    source: cfg.source || null,
    gaps:   cfg.gaps   || null,
  };
  for (const level of [500, 1000, 2000]) {
    result[level] = {
      tasks:  cfg.intervals[level] || [],
      source: cfg.source || null,
      gaps:   (cfg.intervals[level] && cfg.intervals[level].length === 0) ? (cfg.gaps || null) : null,
    };
  }
  return result;
}

/**
 * Returns the baseline last_done_hours for a machine, or null.
 * Shape: { 500: number|null, 1000: number|null, 2000: number|null }
 * null hours means the service was never done → treat as 0.
 */
export function getMachineBaseline(machineName) {
  const key = findMachineKey(machineName);
  if (!key || !MACHINES[key].baseline) return null;
  return MACHINES[key].baseline.last_done_hours;
}

/** Returns equip type groups for batch querying (see service-log.js). */
export function getEquipTypeGroups() {
  const groups = {};
  for (const [key, cfg] of Object.entries(MACHINES)) {
    if (!cfg.equipType) continue;
    if (!groups[cfg.equipType]) groups[cfg.equipType] = [];
    groups[cfg.equipType].push(key);
  }
  return groups;
}
