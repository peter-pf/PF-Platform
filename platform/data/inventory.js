// PF Inventory — seed feed (MVP v1, read-only base data).
// Built from Derek Franke's "Inventory Tracking Module and Initial Inventory List"
// email (2026-08-12) + the 2026-08-13 refinements. See derek-inventory-module/SPEC.md.
//
// EVERYONE-VIEWABLE: this file is classified 'general' in functions/lib/auth.js
// (DATA_FILE_AREAS) so ALL roles — including field_ops — can READ it. It carries
// ZERO dollars / pricing / financial data (part numbers + quantities + supplier
// NAMES only), so it is safe for the whole company to view.
//
// SCHEMA (per SPEC — 9 fields per item):
//   category, description, manufacturer, mfrPart, reqTrailer, reqHome,
//   altSources, actualOnHand, notes
// "actualOnHand" here is the BASELINE seed value. The LIVE value shown in the
// portal is this baseline MERGED with the per-item KV override written through
// /api/inventory (the only editable field in v1). See index.html mod-inventory.
//
// LOCATIONS (per SPEC): "Farm" (= Home / main stockyard, Derek renamed Home->Farm)
// plus field equipment trailers. Locations are DATA-DRIVEN below so adding a
// trailer = adding an entry to PF_INVENTORY.locations (a "section per trailer" per
// the SPEC's multi-trailer extensibility requirement). v1 ships Farm + Trailer 1.
//
// v2 SEAMS (NOT built in v1 — documented for the next build):
//   - Per-item, per-location actualOnHand becomes a COMPUTED value driven by a
//     per-trailer consumption ledger (daily-report "used qty" auto-deducts) and a
//     farm->trailer transfer ledger. v1 stores a single editable actualOnHand per
//     item as a flat KV override; v2 replaces the flat override with a ledger.
//   - Metadata-sheet unification: this seed becomes rows in the flat metadata DB.
//
// GOTCHA: this file assigns window.PF_INVENTORY exactly like every other
// /data/*.js feed (e.g. window.PF_PRODUCTION). It is injected via document.write
// in index.html's feed loader and must run BEFORE the mod-inventory module script.

window.PF_INVENTORY = {
  generated: '2026-08-13',
  version: 1,
  // Location registry. type 'farm' = Home/stockyard (Derek's "Farm Inventory");
  // type 'trailer' = a field equipment trailer. Add trailers here (id must be
  // stable + unique; it keys the per-location required/actual quantities).
  locations: [
    { id: 'farm',      label: 'Farm Inventory', type: 'farm',    order: 0 },
    { id: 'trailer-1', label: 'Trailer 1',      type: 'trailer', order: 1 }
  ],
  // Ordered category list (controls grouping + display order). "Hardware" is a
  // PLACEHOLDER stub per SPEC — Derek sends the detailed fastener list separately.
  categories: [
    'Drilling',
    'Mast Components',
    'Vibroflot Parts',
    'Side Dump Bucket',
    'Testing Equipment',
    'Hardware'
  ],
  // Items. reqTrailer / reqHome = required STOCK quantities (SPEC fields 5 & 6).
  // actualOnHand = SPEC field 8 (the only editable field in v1); the value here is
  // the baseline seed, overridden live via /api/inventory. Where the email gave
  // "TBD" we carry null (renders as "TBD"); numeric where the email gave a number.
  // Each item has a stable `id` (category-slug + index) that keys the KV override.
  items: [
    // ---- Drilling ----
    { id: 'drill-1', category: 'Drilling', description: 'Drive Head Adapter Plate', manufacturer: 'Custom Fabrication', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: 'Local Machine Shop', actualOnHand: null, notes: '' },
    { id: 'drill-2', category: 'Drilling', description: '18" Auger', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: 'Jeffrey Machine', actualOnHand: null, notes: '' },
    { id: 'drill-3', category: 'Drilling', description: '24" Auger', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: 'Jeffrey Machine', actualOnHand: null, notes: '' },
    { id: 'drill-4', category: 'Drilling', description: 'Auger Teeth (Box of 25)', manufacturer: 'ProDig / Jeffrey Machine', mfrPart: '', reqTrailer: 8, reqHome: 10, altSources: 'TBD', actualOnHand: null, notes: 'Quantities are in BOXES (25/box).' },
    { id: 'drill-5', category: 'Drilling', description: 'Pilot Bit', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 2, reqHome: 3, altSources: 'Jeffrey Machine', actualOnHand: null, notes: '' },

    // ---- Mast Components ----
    { id: 'mast-1', category: 'Mast Components', description: 'Sheave', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: '', actualOnHand: null, notes: '' },
    { id: 'mast-2', category: 'Mast Components', description: 'Tilt Cylinder', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: '', actualOnHand: null, notes: '' },
    { id: 'mast-3', category: 'Mast Components', description: 'Sheave Tensioner Cylinder', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: '', actualOnHand: null, notes: '' },
    { id: 'mast-4', category: 'Mast Components', description: 'Double-Row Steel Cylindrical Bearing (Sheave Bearing)', manufacturer: 'SKF', mfrPart: 'NNF 5014 ADB-2LSV', reqTrailer: null, reqHome: null, altSources: 'Applied.com (Applied Industrial Technologies) stock# 100743300 — https://www.applied.com/c-brands/c-skf-corp/c-skf/nnf-5014-adb-2lsv/Double-Row-Steel-Cylindrical-Bearing/p/100743300', actualOnHand: null, notes: 'Required stock TBD. Applied Industrial Technologies stock# 100743300.' },
    { id: 'mast-5', category: 'Mast Components', description: 'Mast Cable 89 ft', manufacturer: 'TBD', mfrPart: '', reqTrailer: 2, reqHome: 4, altSources: '', actualOnHand: null, notes: '' },

    // ---- Vibroflot Parts ----
    { id: 'vibro-1', category: 'Vibroflot Parts', description: 'Isolators', manufacturer: 'Alforady', mfrPart: '', reqTrailer: 0, reqHome: 4, altSources: '', actualOnHand: null, notes: '' },
    { id: 'vibro-2', category: 'Vibroflot Parts', description: 'Isometric Bushing', manufacturer: 'ProDig', mfrPart: '', reqTrailer: 1, reqHome: 2, altSources: 'None Known', actualOnHand: null, notes: '' },

    // ---- Side Dump Bucket ----
    { id: 'sidedump-1', category: 'Side Dump Bucket', description: 'Side Dump Bucket', manufacturer: 'Max Attachments', mfrPart: '', reqTrailer: 1, reqHome: 1, altSources: 'Malecio Attachments', actualOnHand: null, notes: '' },

    // ---- Testing Equipment ----
    { id: 'test-1', category: 'Testing Equipment', description: 'Drive Head', manufacturer: 'ProDig (model X12K)', mfrPart: 'X12K', reqTrailer: 1, reqHome: 0, altSources: '', actualOnHand: null, notes: '' },
    { id: 'test-2', category: 'Testing Equipment', description: 'Helical Coils', manufacturer: 'TBD', mfrPart: '', reqTrailer: null, reqHome: null, altSources: '', actualOnHand: null, notes: 'Maintain Trailer Stock.' },
    { id: 'test-3', category: 'Testing Equipment', description: 'Concrete Puck', manufacturer: 'Custom Fabrication', mfrPart: '', reqTrailer: 0, reqHome: 1, altSources: '', actualOnHand: null, notes: 'N/A for trailer; keep 1 at Farm.' },
    { id: 'test-4', category: 'Testing Equipment', description: 'Privilege Bundle', manufacturer: 'TBD', mfrPart: '', reqTrailer: 2, reqHome: 2, altSources: '', actualOnHand: null, notes: '' }

    // ---- Hardware ----
    // PLACEHOLDER category (SPEC): Derek sends the detailed bolts/nuts/washers/pins
    // consumables list separately (the Mast & Vibro fastener list -> Fastenal /
    // McMaster). The category is declared above so the tab renders an empty
    // "Hardware" group ready to receive those rows. No seed items yet.
  ]
};
