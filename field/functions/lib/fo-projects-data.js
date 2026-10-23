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

export const FO_PROJECTS = [
  { number: '25-026',  name: 'The Granary (Garbin)',                                   city_state: 'Noblesville, IN',           address: 'S 8th St & Walnut St, Noblesville, IN 46060' },
  { number: '26-001',  name: 'WPAFB Housing Project (Garbin)',                          city_state: 'Wright Patterson AFB, OH',  address: 'Talbott Rd and Locust Street, Wright Patterson AFB, OH 45433' },
  { number: '26-002',  name: 'POET Bioprocessing - Shelbyville (Garbin)',               city_state: 'Shelbyville, IN',           address: '2373 W 300 N, Shelbyville, IN 46176' },
  { number: '26-007',  name: 'Madison Lifestyle District Parking Garage (Garbin)',      city_state: 'South Bend, IN',            address: '416 Dr Martin Luther King Jr Blvd, South Bend, IN 46601' },
  { number: '26-008',  name: 'INAW Terre Haute WTF GAC Addition (Garbin)',              city_state: 'Terre Haute, IN',           address: '51 Locust St, Terre Haute, IN 47807' },
  { number: '26-009',  name: 'International School of IN - New International Plaza',    city_state: 'Indianapolis, IN',          address: '4330 N Michigan Rd, Indianapolis, IN 46208' },
  { number: '26-010',  name: 'Founders Park Ph II (Garbin)',                            city_state: 'Columbus, OH',              address: '550 Riverfront Lane, Columbus, OH 43201' },
  { number: '26-011',  name: 'Indianapolis Housing Hub (Garbin)',                       city_state: 'Indianapolis, IN',          address: '1010 E Georgia St, Indianapolis, IN 46202' },
  { number: '26-012',  name: 'Warrick Place',                                           city_state: 'Indianapolis, IN',          address: '3838 E Washington St, Indianapolis, IN 46204' },
  { number: '26-013',  name: 'Park & Poplar (Garbin)',                                  city_state: 'Westfield, IN',             address: 'Westfield Boulevard & Park Street, Westfield, IN 46074' },
  { number: '26-014',  name: 'TPS Dayton (Garbin)',                                     city_state: 'Dayton, OH',                address: '125 Sears Street, Dayton, OH 45402' },
  { number: '26-015',  name: 'Schaaf CPA HQ Building (Garbin)',                         city_state: 'Westfield, IN',             address: '250 North Union Street, Westfield, IN 46074' },
  { number: '26-016',  name: 'Filager Campus Improvement Phase II (Garbin)',             city_state: 'Batavia, OH',               address: '4011 Filager Road, Batavia, OH 45103' },
  { number: '26-017',  name: 'Molto Canal Pointe (Garbin)',                              city_state: 'Canal Winchester, OH',      address: null },
  { number: '26-022',  name: 'DFS Grain Bins',                                           city_state: 'Oskaloosa, IA',             address: '2905 S 33rd St, Oskaloosa, IA 52577' },
  { number: '25-2001', name: 'Greenways Trail ITP Extension',                            city_state: 'Plymouth, IN',              address: null },
  { number: '25-2002', name: 'Herrick Village',                                          city_state: 'Racine, WI',                address: null },
];
