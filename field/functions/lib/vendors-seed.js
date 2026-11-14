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
// Primary will populate the Fort Wayne vendor list here when ready.
// Until then the array is empty and the page starts with one blank section.

export const VENDORS_SEED = [
  // Example entry shape (not inserted, just for reference):
  // {
  //   section_name: 'Local (Fort Wayne)',  // creates section if new
  //   company:     'Example Supply Co.',
  //   category:    'Aggregate',
  //   contact:     'Jane Smith',
  //   phone:       '260-555-0100',
  //   address:     '1234 Industrial Blvd, Fort Wayne, IN 46803',
  //   website:     'https://examplesupply.com',
  //   account_num: 'PF-001',
  //   notes:       '',
  // },
];
