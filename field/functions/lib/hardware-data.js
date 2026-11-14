// PRO-DIG MMS3 Hardware Diagrams — parts list data.
//
// Transcribed from the PRO-DIG MMS3 30ft Modular Mast O&M manual.
// Source: /home/aiciv/derek-hardware-page/manual.pdf (Pier Foundations copy).
//
// Each diagram entry:
//   id         string   — matches the hardware-img filename (without .png)
//   label      string   — displayed title
//   type       'mast'|'vibro'
//   pageRef    string   — manual page reference for attribution
//   parts      array    — ordered by item number
//
// Each part entry:
//   item       string   — balloon number as it appears on the drawing
//   desc       string   — description exactly as printed in the parts list
//   partNumber string   — PRO-DIG / ANSI part number
//   qty        string   — quantity per assembly (blank when not listed)
//   size       string   — parsed dimension / thread / length (blank when n/a)
//   grade      string   — material grade (blank when n/a)
//   finish     string   — surface finish / plating (blank when n/a)
//   invId      string|null — id from platform/data/inventory.js, or null
//   hotspot    {x,y}|null  — position on the diagram image (% of image dimensions)
//                            null = item appears only in the parts-list table

// ---- Convenience maps from inventory ----------------------------------------
// 31 PRO-DIG hardware items loaded August 2026 (hw-1 through hw-31).
// Part numbers from inventory.js cross-referenced to drawing balloons below.

export const DIAGRAMS = [

  // ===== MAST DIAGRAMS ========================================================

  {
    id: 'mast-complete',
    label: 'Mast — Complete Assembly',
    type: 'mast',
    pageRef: 'p.24',
    parts: [
      // Items with inventory cross-references and hotspot positions extracted
      // from the PDF text layer (balloon circle centres) and cross-checked
      // against hi_p24.png highlighted overlays.
      //
      // COORDINATE NOTES:
      //  Image crop: left 50% of the portrait page (792/1584 pts wide).
      //  x/y are percent of the CROPPED image dimensions.
      //  Items 84 and 87 positions estimated from hi_p24.png overlay.
      { item: '15', desc: 'HHCS, 1-1/4N-7 X 2-3/4IN, GR5, PL',   partNumber: '4-100-100', qty: '8',  size: '1-1/4N-7 × 2-3/4in', grade: 'GR5', finish: 'PL',       invId: 'hw-1',  hotspot: { x: 62.6, y: 94.5 } },
      { item: '17', desc: 'MMS3-30FT-2018-DRIVE-TUBE',              partNumber: '5-200-005', qty: '1',  size: '',                   grade: '',    finish: '',            invId: 'hw-11', hotspot: { x: 36.6, y:  6.7 } },
      { item: '18', desc: 'MMS3-30FT-2018-DRIVE-TUBE-CAP',          partNumber: '5-100-075', qty: '1',  size: '',                   grade: '',    finish: '',            invId: 'hw-7',  hotspot: { x: 22.0, y:  3.2 } },
      { item: '22', desc: 'SHCS, M20-2.5 X 80MM, GR12.9, BLK',     partNumber: '5-100-076', qty: '4',  size: 'M20-2.5 × 80mm',    grade: 'GR12.9', finish: 'BLK',    invId: 'hw-10', hotspot: { x: 35.4, y:  2.9 } },
      { item: '23', desc: 'SHCS, M20-2.5 X 65MM, GR12.9, BLK',     partNumber: '5-100-080', qty: '4',  size: 'M20-2.5 × 65mm',    grade: 'GR12.9', finish: 'BLK',    invId: 'hw-9',  hotspot: { x: 64.4, y:  3.1 } },
      { item: '24', desc: 'LN, M20-2.5, GR10.9, BLK',               partNumber: '4-300-060', qty: '8',  size: 'M20-2.5',           grade: 'GR10.9', finish: 'BLK',    invId: 'hw-13', hotspot: { x: 70.8, y:  3.0 } },
      { item: '29', desc: 'MMS3-30FT-2018-LOWER-FRAME-WELD',        partNumber: '5-100-051', qty: '1',  size: '',                   grade: '',    finish: '',            invId: 'hw-8',  hotspot: { x: 62.2, y: 96.4 } },
      { item: '31', desc: 'MMS3-30FT-2018-TUBE-SIDE-PIVOT',         partNumber: '5-100-021', qty: '2',  size: '',                   grade: '',    finish: '',            invId: 'hw-5',  hotspot: { x: 81.1, y:  5.1 } },
      { item: '32', desc: 'MMS3-30FT-2018-TUBE-SIDE-WELD-ON-PIVOT', partNumber: '5-100-073', qty: '2',  size: '',                   grade: '',    finish: '',            invId: 'hw-6',  hotspot: { x: 32.8, y: 18.5 } },
      { item: '39', desc: 'FW, 3/4IN, SAE GR-F,YZ',                 partNumber: '4-200-052', qty: '8',  size: '3/4in',             grade: 'SAE GR-F', finish: 'YZ',   invId: 'hw-12', hotspot: { x: 79.8, y: 16.5 } },
      { item: '40', desc: 'HHCS, 3/4N-10 X 2-1/2IN, GR8, YZ',      partNumber: '4-100-153', qty: '8',  size: '3/4N-10 × 2-1/2in', grade: 'GR8', finish: 'YZ',       invId: 'hw-2',  hotspot: { x: 82.6, y: 17.7 } },
      { item: '61', desc: 'NYLOCK, 3/4N-10, GR-C, YZ',              partNumber: '4-300-009', qty: '8',  size: '3/4N-10',           grade: 'GR-C', finish: 'YZ',       invId: 'hw-14', hotspot: { x: 22.6, y: 53.5 } },
      { item: '63', desc: 'FW, 1IN, SAE GR-F, YZ',                  partNumber: '4-200-027', qty: '',   size: '1in',               grade: 'SAE GR-F', finish: 'YZ',   invId: null,    hotspot: { x: 27.6, y: 40.3 } },
      { item: '64', desc: 'HHCS, 1N-8 X 5IN, GR8, YZ',             partNumber: '4-100-169', qty: '',   size: '1N-8 × 5in',        grade: 'GR8', finish: 'YZ',       invId: 'hw-3',  hotspot: { x: 22.3, y: 44.5 } },
      { item: '84', desc: 'HHCS, 1N-8 X 5IN, GR8, YZ',             partNumber: '4-100-169', qty: '1',  size: '1N-8 × 5in',        grade: 'GR8', finish: 'YZ',       invId: 'hw-3',  hotspot: { x: 27.1, y: 42.2 } },
      { item: '87', desc: 'HHCS, 1N-8 X 3-1/2IN, GR8, YZ',         partNumber: '4-100-170', qty: '1',  size: '1N-8 × 3-1/2in',   grade: 'GR8', finish: 'YZ',       invId: 'hw-4',  hotspot: { x: 25.3, y: 43.0 } },
    ],
  },

  {
    id: 'mast-fairlead',
    label: 'Mast — Fairlead Assembly',
    type: 'mast',
    pageRef: 'p.25',
    parts: [
      // No hardware-highlighted items on this page (mast fairlead sheave assembly).
      // Parts transcribed from p.25 parts list for completeness.
      { item: '1',  desc: 'VM978-30200 FAIRLEAD ASSEMBLY',              partNumber: 'VM978-30200', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '2',  desc: 'VM978-41718 FAIRLEAD FRAME WELDMENT',        partNumber: 'VM978-41718', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '3',  desc: 'VM978-41720 FAIRLEAD ROLLER',                partNumber: 'VM978-41720', qty: '4', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '4',  desc: 'VM978-41727 FAIRLEAD ROLLER SHAFT',          partNumber: 'VM978-41727', qty: '4', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '5',  desc: 'VM978-41728 FAIRLEAD ROLLER BEARING',        partNumber: 'VM978-41728', qty: '8', size: '', grade: '', finish: '', invId: null, hotspot: null },
    ],
  },

  {
    id: 'mast-foot',
    label: 'Mast — Foot Assembly',
    type: 'mast',
    pageRef: 'p.30',
    parts: [
      { item: '1', desc: 'BREAK AWAY LOWER FOOT ASSEMBLY',              partNumber: 'VM978-20339', qty: '1', size: '', grade: '',      finish: '',   invId: null, hotspot: { x: 12.0, y: 60.0 } },
      { item: '2', desc: 'MMS3 BREAK AWAY FOOT, UPPER LEG',             partNumber: 'VM978-20363', qty: '1', size: '', grade: '',      finish: '',   invId: null, hotspot: { x:  8.0, y: 25.0 } },
      { item: '3', desc: 'ANSI/ASME B18.2.1 3/8-16 UNC',               partNumber: '4-100-156',   qty: '4', size: '3/8-16 UNC', grade: '', finish: '', invId: null, hotspot: { x: 18.0, y: 38.0 } },
      { item: '4', desc: 'NYLOCK 3/8-16 UNC GR-8 YZ',                  partNumber: '4-300-030',   qty: '4', size: '3/8-16 UNC', grade: 'GR-8', finish: 'YZ', invId: null, hotspot: { x: 16.0, y: 36.0 } },
      { item: '5', desc: 'MMS3-2019 FOOT MOUNT BRACKET',                partNumber: 'VM978-41682', qty: '1', size: '', grade: '',      finish: '',   invId: null, hotspot: { x: 18.0, y: 12.0 } },
      { item: '6', desc: 'MMS3-30FT-2018-FOOT TUBE GUSSETS',            partNumber: 'VM978-41506', qty: '1', size: '', grade: '',      finish: '',   invId: null, hotspot: { x: 16.0, y: 18.0 } },
    ],
  },

  {
    id: 'mast-pivot',
    label: 'Mast — Tube Side Pivot Mount',
    type: 'mast',
    pageRef: 'p.31',
    parts: [
      // Item 9 is a hardware item present in inventory (hw-26 through hw-28 range).
      // Other items are structural / fabricated components.
      { item: '1',  desc: 'MMS3-30FT-2018-TUBE-SIDE-PIVOT-MOUNT-ASSY', partNumber: 'VM978-20352', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: { x: 25.0, y: 50.0 } },
      { item: '2',  desc: 'MMS3-30FT-2018-TUBE-SIDE-OUTER-TUBE',       partNumber: 'VM978-41684', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '3',  desc: 'MMS3-30FT-2018-TUBE-SIDE-BEARING-HOUSING',  partNumber: 'VM978-41685', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '4',  desc: 'MMS3-30FT-2018-TUBE-SIDE-BEARING-CAP',      partNumber: 'VM978-41686', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '5',  desc: 'MMS3-30FT-2018-TUBE-SIDE-INNER-SLEEVE',     partNumber: 'VM978-41687', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '6',  desc: 'MMS3-30FT-2018-TUBE-SIDE-BEARING',          partNumber: 'VM978-41688', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '7',  desc: 'MMS3-30FT-2018-TUBE-SIDE-SEAL',             partNumber: 'VM978-41689', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '8',  desc: 'GREASE ZERK, 1/4-28 NF, 90-DEG',           partNumber: 'VM978-41691', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '9',  desc: 'SHCS ANSI B18.3.1M M36X4X100, GR12.9',     partNumber: 'VM978-41692', qty: '1', size: 'M36×4×100mm', grade: 'GR12.9', finish: '', invId: 'hw-26', hotspot: { x: 18.3, y: 3.8 } },
    ],
  },

  {
    id: 'mast-sled',
    label: 'Mast — Sled Assembly',
    type: 'mast',
    pageRef: 'p.34',
    parts: [
      { item: '1', desc: 'VM978-20357 MMS3-30FT SLED ASSEMBLY',       partNumber: 'VM978-20357', qty: '1', size: '', grade: '',    finish: '',   invId: null, hotspot: null },
      { item: '2', desc: 'VM978-41706 MMS3-30FT SLED FRAME',           partNumber: 'VM978-41706', qty: '1', size: '', grade: '',    finish: '',   invId: null, hotspot: null },
      { item: '3', desc: 'HHCS 1N-8 X 3IN GR8 YZ',                    partNumber: '4-100-157',   qty: '8', size: '1N-8 × 3in',  grade: 'GR8', finish: 'YZ', invId: 'hw-29', hotspot: { x: 32.9, y:  9.7 } },
      { item: '4', desc: 'NYLOCK 1N-8 GR-C YZ',                        partNumber: '4-300-039',   qty: '8', size: '1N-8',        grade: 'GR-C', finish: 'YZ', invId: 'hw-30', hotspot: { x: 31.8, y:  9.7 } },
      { item: '5', desc: 'FW 1IN SAE GR-F YZ',                         partNumber: '4-200-027',   qty: '16', size: '1in',        grade: 'SAE GR-F', finish: 'YZ', invId: 'hw-31', hotspot: { x: 42.0, y: 70.2 } },
    ],
  },

  // ===== VIBRO DIAGRAMS =======================================================

  {
    id: 'vibro-coupling',
    label: 'Vibro — 18-Hole Coupling Assembly',
    type: 'vibro',
    pageRef: 'p.27–28',
    parts: [
      // Main assembly items (p.27 drawing, p.28 parts list).
      // Items 1-1 through 1-17 are sub-items of the coupling.
      // Items with hotspot positions are from the main drawing left side;
      // items 1-xx are from the right-side sub-assembly detail callout.
      { item: '1',    desc: 'VM978-10164 18-HOLE COUPLING ASSEMBLY',      partNumber: 'VM978-10164', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: { x: 45.0, y: 50.0 } },
      { item: '1-1',  desc: 'VM978-41573 COUPLING FRAME',                  partNumber: 'VM978-41573', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-2',  desc: 'VM978-41574 COUPLING HUB, MALE',              partNumber: 'VM978-41574', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-3',  desc: 'VM978-41575 COUPLING HUB, FEMALE',            partNumber: 'VM978-41575', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-4',  desc: 'VM978-41576 COUPLING DISC',                   partNumber: 'VM978-41576', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-5',  desc: 'VM978-41577 DISC RETAINER',                   partNumber: 'VM978-41577', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-6',  desc: 'VM978-41578 COUPLING DISC BACKUP',            partNumber: 'VM978-41578', qty: '2', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-7',  desc: 'VM978-41579 HUB RETAINER RING',               partNumber: 'VM978-41579', qty: '2', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-8',  desc: 'VM978-41580 COUPLING RETAINER RING',          partNumber: 'VM978-41580', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-9',  desc: 'VM978-41581 HUB SEAL',                        partNumber: 'VM978-41581', qty: '2', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-10', desc: 'SHCS M16-2.0 X 55MM GR12.9 BLK',             partNumber: '5-100-057',   qty: '8', size: 'M16-2.0 × 55mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-15', hotspot: { x: 89.4, y: 87.0 } },
      { item: '1-11', desc: 'SHCS M16-2.0 X 40MM GR12.9 BLK',             partNumber: '5-100-034',   qty: '8', size: 'M16-2.0 × 40mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-16', hotspot: { x: 89.4, y: 25.6 } },
      { item: '1-12', desc: 'SHCS M16-2.0 X 50MM GR12.9 BLK',             partNumber: '5-100-033',   qty: '8', size: 'M16-2.0 × 50mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-17', hotspot: { x: 89.4, y: 29.6 } },
      { item: '1-13', desc: 'LN M16-2.0 GR10.9 BLK',                       partNumber: '4-300-055',   qty: '16', size: 'M16-2.0',      grade: 'GR10.9', finish: 'BLK', invId: 'hw-18', hotspot: { x: 89.4, y:  9.8 } },
      { item: '1-14', desc: 'FW M16 GR12.9 BLK',                           partNumber: '4-200-054',   qty: '16', size: 'M16',           grade: 'GR12.9', finish: 'BLK', invId: 'hw-19', hotspot: { x: 89.4, y:  7.3 } },
      { item: '1-15', desc: 'VM978-41582 RUBBER ISOLATOR',                  partNumber: 'VM978-41582', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-16', desc: 'VM978-41583 RETAINER PLATE',                   partNumber: 'VM978-41583', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '1-17', desc: 'VM978-41584 ISOLATOR RETAINER BOLT',           partNumber: 'VM978-41584', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      // Main assembly additional items
      { item: '9',  desc: 'SHCS M20-2.5 X 70MM GR12.9 BLK',              partNumber: '5-100-040',   qty: '', size: 'M20-2.5 × 70mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-20', hotspot: { x: 43.8, y: 85.8 } },
      { item: '10', desc: 'LN M20-2.5 GR10.9 BLK',                        partNumber: '4-300-060',   qty: '', size: 'M20-2.5',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-24', hotspot: { x: 43.8, y: 88.8 } },
      { item: '11', desc: 'SHCS M24-3.0 X 90MM GR12.9 BLK',              partNumber: '5-100-021',   qty: '', size: 'M24-3.0 × 90mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-22', hotspot: { x: 56.9, y: 40.1 } },
      { item: '12', desc: 'LN M24-3.0 GR10.9 BLK',                        partNumber: '4-300-064',   qty: '', size: 'M24-3.0',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-23', hotspot: { x: 48.3, y: 38.0 } },
      { item: '17', desc: 'SHCS M16-2.0 X 40MM GR12.9 BLK',              partNumber: '5-100-034',   qty: '', size: 'M16-2.0 × 40mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-16', hotspot: { x: 89.1, y: 20.5 } },
      { item: '18', desc: 'SHCS M16-2.0 X 50MM GR12.9 BLK',              partNumber: '5-100-033',   qty: '', size: 'M16-2.0 × 50mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-17', hotspot: { x: 86.9, y: 96.1 } },
      { item: '20', desc: 'LN M20-2.5 GR10.9 BLK',                        partNumber: '4-300-060',   qty: '', size: 'M20-2.5',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-24', hotspot: { x: 42.4, y: 10.6 } },
      { item: '21-1', desc: 'VM978-41553 SEAL',                            partNumber: 'VM978-41553', qty: '1', size: '', grade: '', finish: '', invId: 'hw-21', hotspot: { x: 61.4, y: 45.2 } },
    ],
  },

  {
    id: 'vibro-boom',
    label: 'Vibro — Boom Extension Assembly',
    type: 'vibro',
    pageRef: 'p.33',
    parts: [
      // Image crop: left 50% of portrait page.
      // Coordinates scaled: x_cropped = x_full * 2.0
      { item: '1',  desc: 'VM978-20367 BOOM EXTENSION ASSEMBLY',          partNumber: 'VM978-20367', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: { x: 25.0, y: 50.0 } },
      { item: '2',  desc: 'VM978-41734 BOOM TUBE WELDMENT',               partNumber: 'VM978-41734', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '3',  desc: 'VM978-41735 BOOM END CAP',                     partNumber: 'VM978-41735', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '4',  desc: 'VM978-41736 BOOM PIVOT PIN',                   partNumber: 'VM978-41736', qty: '1', size: '', grade: '', finish: '', invId: null,    hotspot: null },
      { item: '7',  desc: 'SHCS M24-3.0 X 90MM GR12.9 BLK',              partNumber: '5-100-021',   qty: '8', size: 'M24-3.0 × 90mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-22', hotspot: { x: 29.2, y: 21.2 } },
      { item: '8',  desc: 'LN M24-3.0 GR10.9 BLK',                        partNumber: '4-300-064',   qty: '8', size: 'M24-3.0',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-23', hotspot: { x: 22.4, y: 21.2 } },
      { item: '9',  desc: 'SHCS M20-2.5 X 70MM GR12.9 BLK',              partNumber: '5-100-040',   qty: '4', size: 'M20-2.5 × 70mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-20', hotspot: { x: 30.6, y: 64.6 } },
      { item: '10', desc: 'LN M20-2.5 GR10.9 BLK',                        partNumber: '4-300-060',   qty: '4', size: 'M20-2.5',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-24', hotspot: { x: 34.2, y: 64.6 } },
      { item: '11', desc: 'SHCS M20-2.5 X 70MM GR12.9 BLK',              partNumber: '5-100-040',   qty: '4', size: 'M20-2.5 × 70mm', grade: 'GR12.9', finish: 'BLK', invId: 'hw-20', hotspot: { x: 27.0, y: 59.9 } },
      { item: '12', desc: 'LN M20-2.5 GR10.9 BLK',                        partNumber: '4-300-060',   qty: '4', size: 'M20-2.5',       grade: 'GR10.9', finish: 'BLK', invId: 'hw-24', hotspot: { x: 30.4, y: 59.9 } },
      { item: '14', desc: 'FW M24 GR12.9 BLK',                             partNumber: '4-200-059',   qty: '8', size: 'M24',          grade: 'GR12.9', finish: 'BLK', invId: 'hw-25', hotspot: { x: 21.2, y: 15.7 } },
      { item: '15', desc: 'FW M24 GR12.9 BLK',                             partNumber: '4-200-059',   qty: '4', size: 'M24',          grade: 'GR12.9', finish: 'BLK', invId: 'hw-25', hotspot: { x: 28.4, y: 15.9 } },
      { item: '16', desc: 'FW M24 GR12.9 BLK',                             partNumber: '4-200-059',   qty: '4', size: 'M24',          grade: 'GR12.9', finish: 'BLK', invId: 'hw-25', hotspot: { x: 25.0, y: 15.9 } },
    ],
  },

  {
    id: 'vibro-nose',
    label: 'Vibro — Nose Strut Assembly',
    type: 'vibro',
    pageRef: 'p.35',
    parts: [
      // No hardware-highlighted items; structural weldments only.
      { item: '1', desc: 'VM978-20368 NOSE STRUT ASSEMBLY',              partNumber: 'VM978-20368', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: { x: 20.0, y: 50.0 } },
      { item: '2', desc: 'VM978-41737 NOSE STRUT WELDMENT',              partNumber: 'VM978-41737', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: { x: 61.1, y: 40.8 } },
      { item: '3', desc: 'VM978-41738 STRUT PIVOT PLATE',                partNumber: 'VM978-41738', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '4', desc: 'VM978-41739 STRUT PIVOT PIN',                  partNumber: 'VM978-41739', qty: '1', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '5', desc: 'VM978-41740 PIVOT RETAINER',                   partNumber: 'VM978-41740', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
      { item: '6', desc: 'VM978-41741 STRUT BRACE TUBE',                 partNumber: 'VM978-41741', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: { x: 66.6, y: 40.9 } },
      { item: '7', desc: 'VM978-41742 BRACE TUBE END CAP',               partNumber: 'VM978-41742', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: { x: 66.0, y: 26.1 } },
      { item: '8', desc: 'VM978-41743 BRACE TUBE CONNECTOR',             partNumber: 'VM978-41743', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: { x: 65.7, y: 32.5 } },
      { item: '9', desc: 'VM978-41744 CONNECTOR PIN',                    partNumber: 'VM978-41744', qty: '2', size: '', grade: '', finish: '', invId: null, hotspot: null },
    ],
  },

];

// Build a quick lookup by diagram id
export const DIAGRAM_BY_ID = Object.fromEntries(DIAGRAMS.map(d => [d.id, d]));
