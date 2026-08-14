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
// the SPEC's multi-trailer extensibility requirement). v1 ships Farm + Crew 1 Trailer.
//
// SHARED-FARM / PER-TRAILER MODEL (Derek 2026-08-12, confirmed):
//   "The trailers will share the same Farm inventory but be individually stocked.
//    They will have the same qty requirements."
//   HOW THIS IS MODELED (no per-trailer required-qty duplication):
//     - REQUIRED quantities live on the ITEM, not the location: `reqTrailer` is the
//       ONE shared trailer requirement used by EVERY trailer location; `reqHome` is
//       the Farm requirement. See reqFor(loc,item) in index.html (mod-inventory):
//       trailers read item.reqTrailer, the farm reads item.reqHome.
//     - ACTUAL stock is per-(location,item): stored in the /api/inventory KV `qty`
//       map keyed `<locationId>::<itemId>`, so each trailer is INDIVIDUALLY stocked.
//   THEREFORE adding an Nth trailer = ONE new entry in `locations` below (id +
//   label). It automatically inherits every item's shared `reqTrailer` requirement
//   and gets its own per-trailer Actual-Qty column. The required-qty list is NEVER
//   redefined per trailer. Right now there is exactly ONE trailer (Crew 1 Trailer);
//   the structure scales to N without touching the item requirements.
//   (Proven by the harness in this branch: a synthetic 2nd trailer reuses reqTrailer
//   for every item and carries its own actuals.)
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
    { id: 'trailer-1', label: 'Crew 1 Trailer', type: 'trailer', order: 1 }
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
    { id: 'test-4', category: 'Testing Equipment', description: 'Privilege Bundle', manufacturer: 'TBD', mfrPart: '', reqTrailer: 2, reqHome: 2, altSources: '', actualOnHand: null, notes: '' },

    // ---- Hardware ----
    // Loaded 2026-08-14 from Derek Franke's "Mast & Vibro hardware list" email
    // (2026-08-12 19:55Z). SOURCE: PRO-DIG "MMS3 - 30FT STROKE" mast manual, the
    // fasteners Derek highlighted GREEN on manual pages 24, 28, 33 & 34 ("hardware
    // needed if we break a bolt or need something"). Each row = one green-highlighted
    // Parts-List line: PRO-DIG part number (mfrPart) + the manual's description.
    //
    // FIELD MEANING FOR HARDWARE ROWS (deliberate, honest):
    //   - manufacturer = 'PRO-DIG' (the MMS3 mast/vibro OEM; these are PRO-DIG part #s).
    //   - mfrPart      = the PRO-DIG Parts-List part number.
    //   - reqTrailer / reqHome = null (TBD). These are STOCK-SPARES targets Derek
    //     sets; they are NOT the per-machine installed count. The manual's installed
    //     count per machine is recorded in `notes` ("machine uses N") for reference so
    //     it never masquerades as a required-stock target. Derek fills the real spare
    //     targets in the Edit-rows mode when he decides how many to stock.
    //   - altSources = FLAG: Fastenal/McMaster cross-reference part numbers + links
    //     Derek requested are NOT yet verified, so they are intentionally left as a
    //     "pending" flag rather than guessed. (See branch report: ambiguity flagged.)
    // Where the same PRO-DIG part is used in more than one assembly/page, `notes`
    // shows the machine total across all pages and lists the pages.
    { id: 'hw-1',  category: 'Hardware', description: 'SHCS, 3/8IN-16 X 2-3/4IN, GR8, BO',        manufacturer: 'PRO-DIG', mfrPart: '4-100-100', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 16.' },
    { id: 'hw-2',  category: 'Hardware', description: 'SHCS, 3/4IN-10 X 3-1/4IN, GR8, YZ',        manufacturer: 'PRO-DIG', mfrPart: '4-100-153', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 18.' },
    { id: 'hw-3',  category: 'Hardware', description: 'HHCS, 1IN-8 X 5IN, GR8, YZ',               manufacturer: 'PRO-DIG', mfrPart: '4-100-169', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 1.' },
    { id: 'hw-4',  category: 'Hardware', description: 'HHCS, 1IN-8 X 3-1/2IN, GR8, YZ',           manufacturer: 'PRO-DIG', mfrPart: '4-100-170', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 1.' },
    { id: 'hw-5',  category: 'Hardware', description: 'SHCS, M8-1.25 X 25MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '5-100-021', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 9.' },
    { id: 'hw-6',  category: 'Hardware', description: 'SHCS, M8-1.25 X 30MM, 12.9, ZINC',         manufacturer: 'PRO-DIG', mfrPart: '5-100-073', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 12.' },
    { id: 'hw-7',  category: 'Hardware', description: 'SHCS, M12-1.75 X 40MM, 12.9',             manufacturer: 'PRO-DIG', mfrPart: '5-100-075', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 8.' },
    { id: 'hw-8',  category: 'Hardware', description: 'SHCS, M20-2.5 X 60MM, 12.9, ZINC',         manufacturer: 'PRO-DIG', mfrPart: '5-100-051', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 12.' },
    { id: 'hw-9',  category: 'Hardware', description: 'SHCS, M20-2.5 X 65MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '5-100-080', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 10.' },
    { id: 'hw-10', category: 'Hardware', description: 'SHCS, M20-2.5 X 80MM, 12.9, ZINC',         manufacturer: 'PRO-DIG', mfrPart: '5-100-076', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 2.' },
    { id: 'hw-11', category: 'Hardware', description: 'LW, M12, HI-COLLAR, PLAIN, DIN 7980',      manufacturer: 'PRO-DIG', mfrPart: '5-200-005', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 8.' },
    { id: 'hw-12', category: 'Hardware', description: 'LW, 3/4IN, SPLIT LOCK WASHER',            manufacturer: 'PRO-DIG', mfrPart: '4-200-052', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 18.' },
    { id: 'hw-13', category: 'Hardware', description: 'LN, M20-2.5, NYLOCK, CLASS 10, ZINC',      manufacturer: 'PRO-DIG', mfrPart: '4-300-060', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 20.' },
    { id: 'hw-14', category: 'Hardware', description: 'NYLOC, 1-8 UNC, GR-8, YZ',                manufacturer: 'PRO-DIG', mfrPart: '4-300-009', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p24; machine uses 2.' },
    { id: 'hw-15', category: 'Hardware', description: 'SHCS, M16-2.0 X 50MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '5-100-070', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 18.' },
    { id: 'hw-16', category: 'Hardware', description: 'SHCS, M16 X 2 X 65MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '4-100-092', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 36 (2 assemblies).' },
    { id: 'hw-17', category: 'Hardware', description: 'LW, HI-COLLAR, M16, B.O.',                 manufacturer: 'PRO-DIG', mfrPart: '4-200-062', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28 & p33; machine uses 68 total.' },
    { id: 'hw-18', category: 'Hardware', description: 'LW, HI-COLLAR, M14, B.O.',                 manufacturer: 'PRO-DIG', mfrPart: '4-200-065', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28 & p33; machine uses 6 total.' },
    { id: 'hw-19', category: 'Hardware', description: 'SHCS, M14-2.0 X 40MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '5-100-124', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 4.' },
    { id: 'hw-20', category: 'Hardware', description: 'LW, M20, HIGH COLLAR, ZINC',              manufacturer: 'PRO-DIG', mfrPart: '5-200-080', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 4.' },
    { id: 'hw-21', category: 'Hardware', description: 'SHCS, M20 X 2.5 X 55MM, GR-12.9, B.O.',    manufacturer: 'PRO-DIG', mfrPart: '5-100-054', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 4.' },
    { id: 'hw-22', category: 'Hardware', description: 'SHCS, M12 X 1.75 X 80MM, GR-12.9, B.O.',   manufacturer: 'PRO-DIG', mfrPart: '4-100-174', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 16.' },
    { id: 'hw-23', category: 'Hardware', description: 'LN, M12 X 1.75, CLASS 10, ZINC-PLATED',    manufacturer: 'PRO-DIG', mfrPart: '5-300-002', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 16.' },
    { id: 'hw-24', category: 'Hardware', description: 'SHCS, M10-1.5 X 25MM, 12.9, BO',           manufacturer: 'PRO-DIG', mfrPart: '5-100-003', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p28; machine uses 4.' },
    { id: 'hw-25', category: 'Hardware', description: 'SHCS, M16 X 2 X 40MM',                     manufacturer: 'PRO-DIG', mfrPart: '5-100-048', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p33; machine uses 32.' },
    { id: 'hw-26', category: 'Hardware', description: 'M30 HIGH COLLAR LW',                       manufacturer: 'PRO-DIG', mfrPart: '4-200-053', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p33; machine uses 16.' },
    { id: 'hw-27', category: 'Hardware', description: 'SHCS, M30 X 3.5 X 90MM',                   manufacturer: 'PRO-DIG', mfrPart: '5-100-043', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p33; machine uses 16.' },
    { id: 'hw-28', category: 'Hardware', description: 'SHCS, M14 X 2 X 60MM, GR-12.9, B.O.',      manufacturer: 'PRO-DIG', mfrPart: '5-100-084', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p33; machine uses 2.' },
    { id: 'hw-29', category: 'Hardware', description: 'DIN 128 - A18 (CURVED SPRING LOCK WASHER)', manufacturer: 'PRO-DIG', mfrPart: '4-200-068', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p34; machine uses 24.' },
    { id: 'hw-30', category: 'Hardware', description: 'SHCS, M18 X 2.5 X 50MM, SOCKET HEAD CAP',  manufacturer: 'PRO-DIG', mfrPart: '5-100-077', reqTrailer: null, reqHome: null, altSources: 'McMaster 91290A036 (per manual note); Fastenal cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p34; machine uses 18. Manual lists McMaster 91290A036.' },
    { id: 'hw-31', category: 'Hardware', description: 'DIN 7984 - M18 X 100 (LOW-HEAD SHCS)',      manufacturer: 'PRO-DIG', mfrPart: '5-100-083', reqTrailer: null, reqHome: null, altSources: 'Fastenal/McMaster cross-ref pending', actualOnHand: null, notes: 'MMS3 mast p34; machine uses 6.' }
  ]
};
