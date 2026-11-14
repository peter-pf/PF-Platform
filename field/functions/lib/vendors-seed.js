// vendors-seed.js — initial data for the Vendors page.
//
// PRIMARY DESIGN: The API inserts VENDORS_SEED only if the vendors_sections
// table is EMPTY (checked before every seed call — idempotent).  It will NOT
// overwrite Derek's edits; once he has added or changed any vendor the seed
// is permanently skipped.
//
// FORMAT: flat array of items; the first unique section_name creates the section.
// Required: company.  All other fields are optional.
//
// Source: PF SharePoint invoices, compiled 2026-11-14 by pf-vendor-agent.
// Citations in /home/aiciv/derek-vendors/SOURCES.md (internal; not on page).
// DO NOT include dollar totals, invoice numbers, SharePoint IDs, or purchase counts.

export const VENDORS_SEED = [
  // ---- Local (Fort Wayne) — sorted by purchase frequency ----

  {
    section_name: 'Local (Fort Wayne)',
    company:     'Geiger Machine',
    category:    'Machine shop / equipment repairs',
    contact:     'Logan',
    phone:       '260-402-2124',
    address:     '8380 N 500 W, Decatur, IN 46733',
    website:     null,
    account_num: null,
    notes:       'Decatur, ~25 mi S. Drive head fab, bucket repair, bearing press. geigermachine@gmail.com',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'H & S Fabrication, LLC',
    category:    'Steel fabrication',
    contact:     null,
    phone:       '260-724-3656',
    address:     '5342 N 400 W, Decatur, IN 46733',
    website:     null,
    account_num: null,
    notes:       'Decatur, ~25 mi S. Structural steel for rigs: plates, beams, shims. Net 30. Alt: 260-223-0640. hsfabrication1@gmail.com',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'Fastenal',
    category:    'Fasteners / hardware',
    contact:     null,
    phone:       '260-434-0643',
    address:     '4105 Engleton Dr, Fort Wayne, IN 46804',
    website:     null,
    account_num: 'INFT21183',
    notes:       'Fort Wayne branch. Fasteners, metric hi-alloy hardware. Net 30.',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'Applied Industrial Technologies',
    category:    'Bearings / power transmission / hydraulic components',
    contact:     'Christopher Rice',
    phone:       '260-471-8461',
    address:     '3210 Congressional Pkwy, Fort Wayne, IN 46808',
    website:     'https://applied.com',
    account_num: 'C2153',
    notes:       'Fort Wayne. Bearings, hydraulic components. COD. crice@applied.com x4004',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'Carter Welding Repair & Supplies Inc',
    category:    'Welding equipment, supplies, and repair',
    contact:     null,
    phone:       '260-704-5810',
    address:     '8360 E 550 N, Churubusco, IN 46723',
    website:     'https://carterwelding.com',
    account_num: null,
    notes:       'Churubusco, ~20 mi NW. Welding equip & repair. sales@carterwelding.com',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'MacAllister Machinery (Fort Wayne Parts)',
    category:    'CAT equipment dealer parts',
    contact:     'Michael D Groves',
    phone:       '260-483-6469',
    address:     '2500 West Coliseum Blvd, Fort Wayne, IN 46808',
    website:     'https://macallister.com',
    account_num: '8324919',
    notes:       'Fort Wayne. CAT equipment parts. nikihamilton@macallister.com (billing)',
  },
  {
    section_name: 'Local (Fort Wayne)',
    company:     'Cummins Sales and Service (Fort Wayne Branch)',
    category:    'Engine parts / service',
    contact:     null,
    phone:       '260-482-3691',
    address:     '3415 Coliseum Blvd West, Fort Wayne, IN 46808',
    website:     'https://cummins.com',
    account_num: '1220326',
    notes:       'Fort Wayne. Cummins engine service for Sany equipment. Came on-site.',
  },
];
