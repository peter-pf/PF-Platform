// Feasibility scorer for BD Opportunities — TRANSPARENT, rule-based v1.
//
// ONE editable place for the rules. Output: { recommendation, reasons[], rule }
//   recommendation: 'Prelim' | 'Pass' | 'Review'
//   reasons:        human-readable bullets (the BASIS is always shown)
//   rule:           the id of the first rule that fired
//
// Every threshold below is a "v1 default — confirm with Jonathan". Edit the
// CONFIG table here and re-run; the /api/opportunity recompute imports score()
// as an ES module, and the browser UI loads this same file via <script> and
// reads the window.PFFeasibility global (set at the bottom). ONE source of
// truth, two consumers.
//
// PF scope: commercial BUILDINGS + data centers (NOT DOT / highway / heavy
// civil). Core region: IN, OH, MI, IL, WI.

'use strict';

// ---- v1 CONFIG (all "v1 default — confirm with Jonathan") ------------------
export const CONFIG = {
  coreStates: ['IN', 'OH', 'MI', 'IL', 'WI'],     // v1 default — confirm with Jonathan
  tightLeadDays: 14,                              // v1 default — Garbin prelim needs ~2+ weeks
  // sector text that means "out of PF scope" (DOT / highway / heavy civil):
  outOfScopeSectors: [
    'dot', 'highway', 'heavy civil', 'heavy-civil', 'road', 'roadway',
    'bridge', 'interstate', 'indot', 'odot', 'transportation',
  ],
  // sector text that is a positive buildings/data-center fit:
  inScopeSectors: [
    'data center', 'datacenter', 'warehouse', 'industrial', 'commercial',
    'building', 'distribution', 'manufacturing', 'logistics', 'office',
    'retail', 'multifamily', 'multi-family', 'apartment', 'mixed use',
    'mixed-use', 'school', 'hospital', 'healthcare',
  ],
};

export const VERSION = 'v1';

function low(v) { return String(v == null ? '' : v).toLowerCase(); }

const STATE_NAMES = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
  MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
  OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI',
  WYOMING: 'WY',
};

function stateCode(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;            // bare 2-letter code
  if (STATE_NAMES[s]) return STATE_NAMES[s];     // full state name
  const m = s.match(/\b([A-Z]{2})\b\s*$/);        // trailing ", XX"
  return m ? m[1] : '';
}

function daysUntil(dateStr, now) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 40));
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - (now || Date.now());
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Pull the values the rules read; tolerant of UI-form keys vs ingested headers.
function read(opp) {
  const f = (opp && opp.fields) || opp || {};
  function pick(keys) {
    for (const k of keys) {
      if (f[k] != null && String(f[k]).trim() !== '') return f[k];
    }
    return '';
  }
  return {
    name: pick(['Project Name', 'projectName', 'name']),
    sector: pick(['Sector', 'Type', 'sector', 'type', 'projectType']),
    state: pick(['State', 'state']),
    city: pick(['City', 'city']),
    dueDate: pick(['Bid Due Date', 'bidDueDate', 'Due Date', 'dueDate', 'Exp. Close', 'expClose']),
    size: pick(['Estimated Size', 'estimatedSize', 'size', 'Value', 'value']),
    notes: pick(['Soil/Geotech Notes', 'geotechNotes', 'Notes', 'notes']),
  };
}

// ---- the scorer: first matching rule wins, but ALL reasons are surfaced -----
export function score(opp, now) {
  const v = read(opp);
  const reasons = [];
  const sector = low(v.sector);
  const st = stateCode(v.state);
  const lead = daysUntil(v.dueDate, now);

  // RULE 0: too little to judge -> REVIEW (do not read as a green light).
  // If Sector, State, and Bid Due Date are all blank there is nothing to score.
  if (!sector && !st && lead == null) {
    reasons.push('Insufficient data to recommend. Add Sector, State, and Bid Due Date.');
    return { recommendation: 'Review', reasons, rule: 'insufficient-data' };
  }

  // RULE 1: out of scope (DOT / highway / heavy civil) -> PASS
  const oos = CONFIG.outOfScopeSectors.filter((w) => sector.indexOf(w) >= 0);
  if (oos.length) {
    reasons.push('Outside PF scope (buildings/data centers, not DOT). Matched: ' + oos.join(', ') + '.');
    return { recommendation: 'Pass', reasons, rule: 'out-of-scope-sector' };
  }

  // RULE 2: out of core region -> REVIEW (confirm travel)
  if (!st) {
    reasons.push('Insufficient data: State. Cannot confirm region.');
  } else if (CONFIG.coreStates.indexOf(st) < 0) {
    reasons.push('Out of core region (' + st + '), confirm travel. Core: ' + CONFIG.coreStates.join('/') + '.');
    if (lead != null && lead < CONFIG.tightLeadDays) {
      reasons.push('Tight for a Garbin prelim (needs ~' + CONFIG.tightLeadDays + '+ days; ' + lead + ' left).');
    }
    return { recommendation: 'Review', reasons, rule: 'out-of-region' };
  }

  // RULE 3: tight lead time -> REVIEW
  if (lead == null) {
    reasons.push('Insufficient data: Bid Due Date. Cannot check prelim lead time.');
  } else if (lead < CONFIG.tightLeadDays) {
    reasons.push('Tight for a Garbin prelim (needs ~' + CONFIG.tightLeadDays + '+ days; ' + lead + ' left).');
    return { recommendation: 'Review', reasons, rule: 'tight-lead-time' };
  }

  // RULE 4: in-region buildings/data-center fit -> PRELIM
  const fit = CONFIG.inScopeSectors.filter((w) => sector.indexOf(w) >= 0);
  if (fit.length) reasons.push('Sector fit: ' + fit.join(', ') + '.');
  else if (!sector) reasons.push('Insufficient data: Sector/Type (assuming building work).');
  else reasons.push('Sector "' + v.sector + '" not flagged out of scope.');
  if (st) reasons.push('In core region (' + st + ').');
  if (lead != null) reasons.push('Adequate lead time (' + lead + ' days to bid).');
  if (v.size) reasons.push('Size noted: ' + v.size + '.');
  return { recommendation: 'Prelim', reasons, rule: 'in-region-building-fit' };
}

// Browser global for the UI (loaded via <script>, not import). Harmless in the
// Workers runtime (globalThis exists there too; the Function uses the ES import).
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.PFFeasibility = { score, CONFIG, VERSION };
  }
} catch (e) { /* no-op */ }
