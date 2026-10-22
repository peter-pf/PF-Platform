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

export const FO_PROJECTS = [
  { number: '25-026',  name: 'The Granary (Garbin)', address: null },
  { number: '26-001',  name: 'WPAFB Housing Project (Garbin)', address: '2000 Allbrook Drive, Wright-Patterson AFB, OH 45433' },
  { number: '26-002',  name: 'POET Bioprocessing - Shelbyville (Garbin)', address: null },
  { number: '26-007',  name: 'Madison Lifestyle District Parking Garage (Garbin)', address: null },
  { number: '26-008',  name: 'INAW Terre Haute WTF GAC Addition (Garbin)', address: null },
  { number: '26-009',  name: 'International School of IN - New International Plaza', address: null },
  { number: '26-010',  name: 'Founders Park Ph II (Garbin)', address: null },
  { number: '26-011',  name: 'Indianapolis Housing Hub (Garbin)', address: null },
  { number: '26-012',  name: 'Warrick Place', address: null },
  { number: '26-013',  name: 'Park & Poplar (Garbin)', address: null },
  { number: '26-014',  name: 'TPS Dayton (Garbin)', address: null },
  { number: '26-015',  name: 'Schaaf CPA HQ Building (Garbin)', address: null },
  { number: '26-016',  name: 'Filager Campus Improvement Phase II (Garbin)', address: null },
  { number: '26-017',  name: 'Molto Canal Pointe (Garbin)', address: null },
  { number: '25-2001', name: 'Greenways Trail ITP Extension', address: null },
  { number: '25-2002', name: 'Herrick Village', address: null },
];
