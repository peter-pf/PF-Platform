// Field-safe project list bundled into the Functions at deploy time.
// Source: platform/data/fo-projects-field.js (same data, stripped to {number,name} only).
// ZERO financials, ZERO GC data, ZERO contract values.
//
// Update this file whenever platform/data/fo-projects-field.js changes.
// The build-fo-projects-field.py script should regenerate both files.
//
// Served ONLY by /api/field-projects (authenticated, requireArea field_ops).
// This file lives in functions/lib/ (bundled, NOT served as a static asset).

export const FO_PROJECTS = [
  { number: '25-026',  name: 'The Granary (Garbin)' },
  { number: '26-001',  name: 'WPAFB Housing Project (Garbin)' },
  { number: '26-002',  name: 'POET Bioprocessing - Shelbyville (Garbin)' },
  { number: '26-007',  name: 'Madison Lifestyle District Parking Garage (Garbin)' },
  { number: '26-008',  name: 'INAW Terre Haute WTF GAC Addition (Garbin)' },
  { number: '26-009',  name: 'International School of IN - New International Plaza' },
  { number: '26-010',  name: 'Founders Park Ph II (Garbin)' },
  { number: '26-011',  name: 'Indianapolis Housing Hub (Garbin)' },
  { number: '26-012',  name: 'Warrick Place' },
  { number: '26-013',  name: 'Park & Poplar (Garbin)' },
  { number: '26-014',  name: 'TPS Dayton (Garbin)' },
  { number: '26-015',  name: 'Schaaf CPA HQ Building (Garbin)' },
  { number: '26-016',  name: 'Filager Campus Improvement Phase II (Garbin)' },
  { number: '26-017',  name: 'Molto Canal Pointe (Garbin)' },
  { number: '25-2001', name: 'Greenways Trail ITP Extension' },
  { number: '25-2002', name: 'Herrick Village' },
];
