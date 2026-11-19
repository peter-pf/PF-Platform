// Field-safe project list bundled into the Functions at deploy time.
// Source: platform/data/fo-projects-field.js (same data, stripped to {number,name} only).
// ZERO financials, ZERO GC data, ZERO contract values.
//
// Update this file whenever platform/data/fo-projects-field.js changes.
// The build-fo-projects-field.py script should regenerate both files.
//
// Served ONLY by /api/field-projects (authenticated, requireArea field_ops).
// This file lives in functions/lib/ (bundled, NOT served as a static asset).
//
// `address` is used by /api/weather to geocode the job site for the NWS forecast.
// null → the weather tile will show "No site address on file for this job."
// Add/correct addresses here as actual site addresses become known.
//
// spFolder is NOT stored here. It is resolved live from SharePoint by /api/field-projects
// using resolveAllProjectFolderNames() and cached in KV (PF_SCHEDULE) for 6 hours.
//
// Updated 2026-10-30 per Derek: replaced list with the 11 active projects.
// Updated 2026-11-19: added 2 non-job entries (Farm, Shop) per Seth/Brad request.
// Sort order: by project number (natural ascending). NJ-* entries sort after all
//   NN-NNN entries (ASCII 'N' > '2') and appear last in every drop-down.
// Format for all dropdowns: "<number> - <name>" (consistent across DR, SR, EI, TT, weather).
// SP folder names (resolved live from Graph, prefix-matched):
//   25-026 → '25-026 - The Granary - FlCo'
//   26-007 → '26-007 - Madison Lifestyle Garage - Wilhelm'
//   26-014 → '26-014 - TPS Dayton - Brackett'
//   26-019 → '26-019 - Vivera Northbrook - Marion Group'
//   26-020 → '26-020 - Evansville Library - Arc Const'
//   26-023 → '26-023 - Village Premiere - Inherent'
//   26-024 → '26-024 - Leslie County ATC - F&M'
//   26-025 → '26-025 - Prysmian Expansion - Shiel'
//   26-026 → '26-026 - POET N Manchester - POET'
//   26-027 → '26-027 - Westfield Ice Arena - Nicholas'
//   26-028 → '26-028 - The Hangar - Elford'
//   NJ-1 (FARM - Internal Operations) → no SP folder (uploads disabled for NJ entries)
//   NJ-2 (Off Site - No Project)      → no SP folder
// Back-compat: records with project numbers no longer in this list (e.g. 26-022, 25-015,
// 26-001, 26-012) still load correctly. DR and SR inject a synthetic picker entry from
// the stored projectId/projectName. EI and TT restore the search field directly from
// stored state. Past Reports shows the stored projectName unchanged.
//
// NON-JOB ENTRIES (NJ-*):
//   - Number format does not match the NN-NN[N] pattern used for real job numbers.
//   - File uploads (Hand Logs, GUHM Data, Site Photos) require a NN-NN[N] project number
//     both client-side (updateUploadEnabled) and server-side (field-upload.js PROJ_NUM_RE).
//     NJ entries therefore have uploads disabled automatically — there is no SP project folder.
//   - The daily report PDF still generates and emails normally; it goes to the same
//     "Daily Reports Output" SP folder as all other reports (not project-routed).
//   - Weather auto-fill is a no-op (no coords → no_location → client silently skips).
//   - Crew hours, work narrative, delays, safety, and equipment sections work unchanged.

export const FO_PROJECTS = [
  { number: '25-026',  name: 'The Granary',               city_state: 'Noblesville, IN',       address: 'S 8th St & Walnut St, Noblesville, IN 46060' },
  { number: '26-007',  name: 'Madison Lifestyle',    city_state: 'South Bend, IN', address: '416 Dr Martin Luther King Jr Blvd, South Bend, IN 46601' },
  { number: '26-014',  name: 'TPS Dayton',                city_state: 'Dayton, OH',             address: '125 Sears Street, Dayton, OH 45402' },
  { number: '26-019',  name: 'Vivera Northbrook',         city_state: null,                     address: null },
  { number: '26-020',  name: 'EVPL Red Bank Rd Bldg',     city_state: null,                     address: null },
  { number: '26-023',  name: 'Village Premier',           city_state: null,                     address: null },
  { number: '26-024',  name: 'Leslie Co. ATC',            city_state: null,                     address: null },
  { number: '26-025',  name: 'Prysmian Expansion',        city_state: null,                     address: null },
  { number: '26-026',  name: 'POET - N Manchester',       city_state: null,                     address: null },
  { number: '26-027',  name: 'Westfield Ice Arena',       city_state: null,                     address: null },
  { number: '26-028',  name: 'The Hangar',                city_state: null,                     address: null },
  // Non-job entries: crew time logged on internal or off-site non-project work.
  // NJ-* numbers do not match NN-NN[N] format → file uploads disabled (correct).
  // IDs NJ-1/NJ-2 are STABLE — existing saved drafts reference them and must continue to load.
  { number: 'NJ-1',   name: 'FARM - Internal Operations', city_state: null,                     address: null },
  { number: 'NJ-2',   name: 'Off Site - No Project',      city_state: null,                     address: null },
];
