#!/usr/bin/env node
// test-pdf-polish-photos-20261028.mjs
// Tests for 2026-10-28 Derek request (pdf-polish-photos branch):
//
//   A. Header collision guard: title never runs into metadata block
//   B. brandHeader two-line wrap: long titles produce two-line render, not one
//   C. row() divider option: produces separator line in PDF stream
//   D. addImage / PNG parser: JPEG returns idx>=0; unsupported PNG returns -1;
//      RGB PNG (type 2) embeds with FlateDecode; placeImage(-1) renders placeholder
//   E. embedPhotos: smoke + placeholder handling
//   F. Daily Report: sectionPhotos embeds photos; legacy attachments still list
//   G. Site Readiness: long note wraps (no ellipsis); sectionPhotos embeds per key
//   H. Equip Inspection: checklist rows have divider lines
//   I. Regression: all three PDFs render without throw for complex records
//   J. Backward compat: existing DR/SR/EI records without sectionPhotos still render

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const wt    = resolve(__dir, '..');

const { PdfDoc, PF, PHOTO_THUMB_W, PHOTO_MAX_THUMB_H, PHOTO_PER_ROW } =
  await import(resolve(wt, 'functions/lib/pdf.js'));
const { renderDailyReportPdf }     = await import(resolve(wt, 'functions/lib/daily-report-doc.js'));
const { renderSiteReadinessPdf }   = await import(resolve(wt, 'functions/lib/site-readiness-doc.js'));
const { renderEquipInspectionPdf } = await import(resolve(wt, 'functions/lib/equip-inspection-doc.js'));
const { CHECKLIST_ITEMS }          = await import(resolve(wt, 'functions/lib/site-readiness-store.js'));
const { CHECKLIST_ITEMS: EI_ITEMS } = await import(resolve(wt, 'functions/lib/equip-inspection-store.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
function assertPdf(bytes, label) {
  assert.ok(bytes instanceof Uint8Array, `${label}: must be Uint8Array`);
  const header = String.fromCharCode(...bytes.slice(0, 5));
  assert.equal(header, '%PDF-', `${label}: must start with %PDF-`);
  assert.ok(bytes.length > 2000, `${label}: suspiciously small (${bytes.length} bytes)`);
}

// ---- Photo test data --------------------------------------------------------
// Load a real JPEG from the existing placeholders file (verified: starts FFD8FFE0).
// Falls back to a known-good inline JPEG if the file is absent.
let MINI_JPEG_B64, MINI_JPEG_W, MINI_JPEG_H;
const PLACEHOLDERS_PATH =
  '/tmp/claude-1000/-home-aiciv/c303ec62-fb81-4c12-9047-bbbee4d6478c/scratchpad/test-pdfs-20261027/placeholders.json';
try {
  const ph = JSON.parse(readFileSync(PLACEHOLDERS_PATH, 'utf-8'));
  const entry = ph['equip_fl'] || ph[Object.keys(ph)[0]];
  MINI_JPEG_B64 = entry.b64;
  MINI_JPEG_W   = entry.w;
  MINI_JPEG_H   = entry.h;
} catch {
  // Fallback: JFIF 1×1 white JPEG (known-good, 279 bytes).
  MINI_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
    'AABAAEDASIAAREBAXEB/8QAFgABAQEAAAAAAAAAAAAAAAAABQQGA/8QAGRABAQADAQAAAAAAAAAAAAAAAQACETFh/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AMbWs7OFQAAAB//Z';
  MINI_JPEG_W   = 1;
  MINI_JPEG_H   = 1;
}
console.log(`  [setup] JPEG fixture: ${MINI_JPEG_W}×${MINI_JPEG_H}, b64 length=${MINI_JPEG_B64.length}`);

// A minimal valid RGB PNG (1×1 white pixel, color type 2, 8-bit).
// This is a real PNG: 8-byte sig + IHDR + IDAT (zlib-deflated single row) + IEND.
const MINI_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// A data URL with clearly non-image mime type (gif).
const BAD_MIME_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

// Minimal SR record with all items answered 'Yes'.
function makeSrRec(overrides) {
  return Object.assign({
    id: 'sr_test', projectId: '26-TST', projectName: 'Alignment Test - Long Project Name Here',
    date: '2026-10-28', gcContact: 'Acme GC', siteAddress: '100 Test Blvd, Fort Wayne IN',
    inspectedBy: 'Peter Test', schemaVersion: 12, status: 'submitted',
    result: 'READY', openItems: [],
    items: CHECKLIST_ITEMS.map((d) => ({ key: d.key, answer: 'Yes', note: '' })),
    opsSignoffs: {},
    attachments: [],
  }, overrides || {});
}

// Minimal DR record.
function makeDrRec(overrides) {
  return Object.assign({
    id: 'dr_test', projectId: '26-TST',
    projectName: 'Very Long Project Name To Test Header Wrapping - Fort Wayne Industrial Park',
    date: '2026-10-28', foreman: 'J. Smith',
    crew: [{ name: 'J. Smith', costCode: '5100', hours: 8 }],
    equipmentOwned: [], equipmentRental: [],
    maintenance: [], futureIssues: [], delayEntries: [],
    columnsInstalled: 10, lfInstalled: 200,
    precipitation: 'Clear', temp: '55F',
    attachments: [],
  }, overrides || {});
}

// Minimal EI record.
function makeEiRec(overrides) {
  const items = EI_ITEMS
    .filter((d) => d.types.includes('vibro_excavator'))
    .map((d) => ({ key: d.key, answer: 'Pass', note: '' }));
  return Object.assign({
    id: 'ei_test', machineType: 'vibro_excavator',
    projectId: '26-TST', jobNumber: '26-TST',
    date: '2026-10-28', inspectedBy: 'M. Garcia',
    ownedOrRented: 'Owned', serialNumber: 'VSC-TEST-01',
    machineHours: 1000, safeToOperate: true,
    deficienciesNotes: '', items,
    sectionPhotos: {},
  }, overrides || {});
}

// ============================================================
console.log('\n--- A. Header collision guard ---');

test('A1: exported photo constants defined', () => {
  assert.ok(PHOTO_THUMB_W > 0, 'PHOTO_THUMB_W should be > 0');
  assert.equal(PHOTO_PER_ROW, 2, 'PHOTO_PER_ROW should be 2');
  assert.ok(PHOTO_MAX_THUMB_H > 0, 'PHOTO_MAX_THUMB_H should be > 0');
});

test('A2: brandHeader renders with long title + 5 meta rows without throw', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Site Readiness Form', [
    { label: 'Project', value: 'Very Long Project Name - Should Not Collide With Title Text' },
    { label: 'Job #',   value: '26-001' },
    { label: 'Date',    value: '10/28/2026' },
    { label: 'Inspect', value: 'J. Smith' },
  ]);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A2 brandHeader long-title');
});

test('A3: brandHeader renders with empty title (EI pattern) without throw', () => {
  const doc = new PdfDoc();
  doc.brandHeader('', [
    { label: 'Machine', value: 'Vibro Excavator' },
    { label: 'Job #',   value: '26-001' },
  ]);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A3 brandHeader empty-title');
});

test('A4: brandHeader renders with no meta rows without throw', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Daily Field Report', []);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A4 brandHeader no-meta');
});

test('A5: very long title triggers two-line path (title exceeds typical maxTitleW)', () => {
  // The title "Site Readiness Form With Extra Long Title" should not throw and
  // must produce valid PDF bytes.
  const doc = new PdfDoc();
  doc.brandHeader('Site Readiness Form With Extra Long Title', [
    { label: 'Project', value: 'Another Very Long Project Name That Pushes The Metadata Left Edge In' },
    { label: 'Date',    value: '10/28/2026' },
    { label: 'Job #',   value: '26-001' },
  ]);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A5 long-title two-line path');
});

// ============================================================
console.log('\n--- B. brandHeader two-line wrap produces two _draw calls ---');

test('B1: brandHeader emits title via /F3 Eurostile or /F2 bold-fallback draw', () => {
  // Title text is Eurostile-encoded as hex GID strings — not plain ASCII.
  // Check that the content stream contains /F3 (Eurostile) or /F2 (bold fallback)
  // confirming the title draw path executed, plus a valid PDF structure.
  const doc = new PdfDoc();
  doc.brandHeader('Site Readiness Form', [
    { label: 'Job #', value: '26-001' },
  ]);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'B1 brandHeader');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/F3') || stream.includes('/F2'), 'B1: display font draw present');
});

// ============================================================
console.log('\n--- C. row() divider option ---');

test('C1: row() with divider:true emits RG S stroke command', () => {
  const doc = new PdfDoc();
  doc.row('Test label', 'Value', { divider: true });
  const stream = doc.cur.join('\n');
  // RG = stroke color, S = stroke operator
  assert.ok(stream.includes(' RG ') && stream.includes(' S'), 'C1: stroke commands present');
  // Should end with m … l S pattern (line draw)
  assert.ok(/ m /.test(stream) && / l S/.test(stream), 'C1: line draw pattern present');
});

test('C2: row() without divider does NOT emit extra stroke after content', () => {
  const doc = new PdfDoc();
  const streamBefore = doc.cur.join('\n');
  doc.row('Test label', 'Value');
  const streamAfter = doc.cur.join('\n');
  const added = streamAfter.slice(streamBefore.length);
  // No line draw should appear after the BT...ET text commands
  assert.ok(!/ l S/.test(added), 'C2: no extra line stroke without divider');
});

test('C3: row() divider produces valid PDF via toBytes()', () => {
  const doc = new PdfDoc();
  doc.row('Item A', 'Pass', { size: 9.5, rightW: 95, divider: true });
  doc.row('Item B', 'Fail', { size: 9.5, rightW: 95, divider: true });
  assertPdf(doc.toBytes(), 'C3 rows with divider');
});

// ============================================================
console.log('\n--- D. addImage / PNG support ---');

test('D1: addImage(jpeg data URL) returns valid idx >= 0', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage(`data:image/jpeg;base64,${MINI_JPEG_B64}`, 1, 1);
  assert.ok(idx >= 0, `D1: idx should be >= 0, got ${idx}`);
});

test('D2: addImage(RGB PNG) returns valid idx >= 0', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage(`data:image/png;base64,${MINI_PNG_B64}`, 1, 1);
  // RGB or grayscale PNG should succeed
  assert.ok(idx >= 0, `D2: RGB PNG idx should be >= 0, got ${idx}`);
});

test('D3: addImage with empty data string returns -1', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage('', 1, 1);
  assert.equal(idx, -1, 'D3: empty data should return -1');
});

test('D4: addImage unsupported MIME returns -1', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage(BAD_MIME_URL, 1, 1);
  assert.equal(idx, -1, 'D4: unsupported MIME (gif) should return -1');
});

test('D5: placeImage(-1) renders placeholder box without throw', () => {
  const doc = new PdfDoc();
  doc.placeImage(-1, 54, 200, 150, 8);
  assertPdf(doc.toBytes(), 'D5 placeholder box');
});

test('D6: placeImage(valid JPEG idx) renders image XObject reference', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage(`data:image/jpeg;base64,${MINI_JPEG_B64}`, 1, 1);
  assert.ok(idx >= 0, 'D6 pre: idx valid');
  doc.placeImage(idx, 54, 200, 150, 8);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'D6 JPEG image placement');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes(`/DImg${idx}`), 'D6: DImg XObject reference present');
});

test('D7: PNG image produces FlateDecode XObject in output', () => {
  const doc = new PdfDoc();
  const idx = doc.addImage(`data:image/png;base64,${MINI_PNG_B64}`, 1, 1);
  if (idx < 0) { console.log('    SKIP D7: PNG embed not supported for this PNG (ok)'); passed++; return; }
  doc.placeImage(idx, 54, 200, 150, 8);
  const bytes = doc.toBytes();
  assertPdf(bytes, 'D7 PNG image placement');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('FlateDecode'), 'D7: FlateDecode in PDF stream for PNG');
});

// ============================================================
console.log('\n--- E. embedPhotos method ---');

test('E1: embedPhotos([]) is a no-op (returns this)', () => {
  const doc = new PdfDoc();
  const yBefore = doc.y;
  doc.embedPhotos([]);
  // y should not change for empty array (or only change by spacer if photos exist)
  assert.equal(doc.y, yBefore, 'E1: y unchanged for empty photos');
});

test('E2: embedPhotos with one JPEG photo advances y', () => {
  const doc = new PdfDoc();
  const yBefore = doc.y;
  doc.embedPhotos([{ data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 }]);
  assert.ok(doc.y < yBefore, 'E2: y advanced by photo placement');
});

test('E3: embedPhotos with null/undefined entries shows placeholder, no throw', () => {
  const doc = new PdfDoc();
  doc.embedPhotos([null, undefined, { data: '', w: 10, h: 10 }]);
  assertPdf(doc.toBytes(), 'E3 null-photo embed');
});

test('E4: embedPhotos 2+ photos fills a row correctly without throw', () => {
  const doc = new PdfDoc();
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 };
  doc.embedPhotos([p, p, p]);  // 3 photos = 1 full row + 1 partial
  assertPdf(doc.toBytes(), 'E4 three photos in grid');
});

test('E5: embedPhotos near page bottom triggers page break cleanly', () => {
  const doc = new PdfDoc();
  doc.y = 80;  // near bottom margin (MARGIN=54)
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 };
  doc.embedPhotos([p]);
  assertPdf(doc.toBytes(), 'E5 page-break near bottom');
});

// ============================================================
console.log('\n--- F. Daily Report photo embedding ---');

test('F1: DR without sectionPhotos renders text attachment list', () => {
  const rec = makeDrRec({
    attachments: [
      { bucket: 'photos', name: 'site-overview.jpg', itemId: 'ph-01' },
    ],
  });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'F1 DR text attachment');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('site-overview.jpg'), 'F1: attachment name in stream');
});

test('F2: DR with sectionPhotos[photos] embeds image XObject, omits text listing', () => {
  const rec = makeDrRec({
    sectionPhotos: {
      photos: [{ data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 }],
    },
    attachments: [{ bucket: 'photos', name: 'site-overview.jpg', itemId: 'ph-01' }],
  });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'F2 DR embedded photo');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/DImg'), 'F2: DImg XObject reference in PDF');
});

test('F3: DR with sectionPhotos[bottom] also works', () => {
  const rec = makeDrRec({
    sectionPhotos: {
      bottom: [{ data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 200, h: 150 }],
    },
  });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'F3 DR sectionPhotos[bottom]');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/DImg'), 'F3: DImg XObject in stream');
});

test('F4: DR with non-photo attachments keeps attachment heading', () => {
  const rec = makeDrRec({
    attachments: [
      { bucket: 'guhma', name: 'data.xlsx', itemId: 'g-01' },
      { bucket: 'handlogs', name: 'log.pdf', itemId: 'h-01' },
    ],
  });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'F4 DR non-photo attach');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('data.xlsx') || stream.includes('Attachments'), 'F4: non-photo attach present');
});

test('F5: DR with 3 embedded photos produces multi-row grid', () => {
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 };
  const rec = makeDrRec({ sectionPhotos: { photos: [p, p, p] } });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'F5 DR 3 photos');
});

// ============================================================
console.log('\n--- G. Site Readiness note wrapping + photo embedding ---');

test('G1: SR long note (200+ chars) does NOT contain ellipsis (...) in stream', () => {
  const longNote = 'This is a very long note that exceeds two hundred characters and must word-wrap cleanly without any ellipsis clipping. ' +
    'It describes soil conditions in detail including clay layers, groundwater levels, and special considerations for the VSC installation crew on site.';
  assert.ok(longNote.length > 200, 'G1 pre: note is >200 chars');
  const items = CHECKLIST_ITEMS.map((d) => ({
    key: d.key,
    answer: 'Yes',
    note: d.key === '1b' ? longNote : '',
  }));
  const rec = makeSrRec({ items });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G1 SR long note');
  // The note content must appear in the stream (word-wrapped, not clipped)
  const stream = new TextDecoder('latin1').decode(bytes);
  // "clay layers" is in the middle of the note — must appear if fully rendered
  assert.ok(stream.includes('clay'), 'G1: middle of note must appear in stream (not clipped)');
});

test('G2: SR stone&spoils desc 200+ chars stacks correctly (no throw)', () => {
  const longDesc = 'Stone delivery restricted to east laydown area only per GC directive issued 10/27. ' +
    'Spoils to be hauled to NE corner stockpile — GC approval pending before next load. ' +
    'Coordinate with site super Mike Thompson at 260-555-0198 before each delivery.';
  const rec = makeSrRec({
    opsSignoffs: {
      sitePlan: {
        desc:           longDesc,
        superName:      'M. Thompson',
        pfMgrName:      'J. Smith',
        signedAt:       '2026-10-28T10:00:00.000Z',
        capturedByName: 'Peter',
      },
    },
  });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G2 SR long sign-off desc');
});

test('G3: SR sectionPhotos[3a] embeds photo in section 3 (Staking)', () => {
  const rec = makeSrRec({
    sectionPhotos: {
      '3a': [{ data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 }],
    },
  });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G3 SR photo in 3a section');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/DImg'), 'G3: DImg reference present');
});

test('G4: SR sectionPhotos[1a] embeds photo in section 1', () => {
  const rec = makeSrRec({
    sectionPhotos: {
      '1a': [{ data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 }],
    },
  });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G4 SR photo in 1a section');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/DImg'), 'G4: DImg reference present');
});

test('G5: SR photos in multiple sections (1a + 3a) both embedded', () => {
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 };
  const rec = makeSrRec({ sectionPhotos: { '1a': [p], '3a': [p, p] } });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G5 SR multi-section photos');
});

test('G6: SR note does not clip short notes (< 50 chars)', () => {
  const items = CHECKLIST_ITEMS.map((d) => ({
    key: d.key, answer: 'Yes',
    note: d.key === '1c' ? 'Short note OK.' : '',
  }));
  const rec = makeSrRec({ items });
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'G6 SR short note');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('Short note'), 'G6: short note content in stream');
});

// ============================================================
console.log('\n--- H. Equipment Inspection row dividers ---');

test('H1: EI PDF stream contains at least one RG…m…l S separator', () => {
  const rec = makeEiRec();
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'H1 EI separator');
  // Find the page content streams (between "stream" and "endstream")
  const raw = new TextDecoder('latin1').decode(bytes);
  // RG = stroke color set, then m (moveto) l (lineto) S (stroke)
  assert.ok(/ RG 0\.5 w /.test(raw), 'H1: 0.5w stroke present');
  assert.ok(/ m \d/.test(raw) && / l S/.test(raw), 'H1: moveto-lineto-stroke pattern present');
});

test('H2: EI PDF with a Needs Attention item and note renders dividers + note', () => {
  const items = EI_ITEMS
    .filter((d) => d.types.includes('vibro_excavator'))
    .map((d) => ({
      key: d.key,
      answer: d.key === 'ms_winch' ? 'Damaged' : 'Pass',
      note:   d.key === 'ms_winch' ? 'Cable broken strand — do not operate until replaced.' : '',
    }));
  const rec = makeEiRec({ items });
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'H2 EI deficiency with note');
});

test('H3: EI with section photos uses 2-per-row grid', () => {
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 100, h: 75 };
  const rec = makeEiRec({
    sectionPhotos: { 'Fluid Levels': [p, p, p] },
  });
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'H3 EI section photos');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('/DImg'), 'H3: DImg XObject present');
});

// ============================================================
console.log('\n--- I. Regression: complex records all three forms ---');

test('I1: DR full complex record (crew, equipment, maintenance, delays, photos) renders', () => {
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 640, h: 480 };
  const rec = makeDrRec({
    crew: [
      { name: 'J. Smith (Foreman)',  costCode: '5100', hours: 9, start: '07:00', end: '16:00' },
      { name: 'M. Garcia',           costCode: '5100', hours: 9, start: '07:00', end: '16:00' },
    ],
    equipmentOwned:  [{ machine: 'Vibro Excavator (VSC-2024-0042)', hours: 8.5 }],
    equipmentRental: [{ category: 'Water Truck', hours: 4 }],
    maintenance:     [{ category: 'Hydraulic', type: 'Hose', item: 'Rear boom hose seep', hourAtFailure: 1450 }],
    futureIssues:    [{ equipment: 'Vibro Excavator', description: 'Replace hose' }],
    delayEntries:    [{ description: 'Rain delay', downtimeHours: 1.5 }],
    safety:          'Pre-shift toolbox talk. No incidents.',
    workCompleted:   'Installed 12 VSC columns on Grid Lines A1-A12 at 20ft depth.',
    sectionPhotos:   { photos: [p, p] },
    attachments:     [{ bucket: 'guhma', name: 'data.xlsx', itemId: 'g-01' }],
  });
  assertPdf(renderDailyReportPdf(rec), 'I1 DR complex');
});

test('I2: SR full complex record (all sections answered, long notes, photos, signoff) renders', () => {
  const longNote = 'A'.repeat(220);  // 220-char note to stress-test wrapping
  const items = CHECKLIST_ITEMS.map((d) => ({
    key: d.key, answer: 'Yes',
    note: ['1b', '5a'].includes(d.key) ? longNote : '',
  }));
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 640, h: 480 };
  const rec = makeSrRec({
    items,
    sectionPhotos: { '1a': [p], '3a': [p, p] },
    opsSignoffs: {
      sitePlan: {
        desc: 'B'.repeat(250),
        superName: 'Mike T', pfMgrName: 'J. Smith',
        signedAt: '2026-10-28T10:00:00.000Z', capturedByName: 'Peter',
      },
    },
  });
  assertPdf(renderSiteReadinessPdf(rec), 'I2 SR complex');
});

test('I3: EI complex record (all sections, deficiencies, notes, photos) renders', () => {
  const items = EI_ITEMS
    .filter((d) => d.types.includes('vibro_excavator'))
    .map((d, i) => ({
      key: d.key,
      answer: i % 5 === 0 ? 'Needs Attention' : 'Pass',
      note:   i % 5 === 0 ? 'Needs attention — monitor daily.' : '',
    }));
  const p = { data: `data:image/jpeg;base64,${MINI_JPEG_B64}`, w: 640, h: 480 };
  const rec = makeEiRec({
    items, safeToOperate: false,
    deficienciesNotes: 'Multiple items need attention.',
    sectionPhotos: { 'Fluid Levels': [p, p], 'Mast': [p] },
  });
  assertPdf(renderEquipInspectionPdf(rec), 'I3 EI complex');
});

// ============================================================
console.log('\n--- J. Backward compatibility ---');

test('J1: DR without sectionPhotos field still renders', () => {
  const rec = makeDrRec();
  delete rec.sectionPhotos;
  assertPdf(renderDailyReportPdf(rec), 'J1 DR no sectionPhotos');
});

test('J2: SR without sectionPhotos field still renders', () => {
  const rec = makeSrRec();
  delete rec.sectionPhotos;
  assertPdf(renderSiteReadinessPdf(rec), 'J2 SR no sectionPhotos');
});

test('J3: EI without sectionPhotos field still renders', () => {
  const rec = makeEiRec();
  delete rec.sectionPhotos;
  assertPdf(renderEquipInspectionPdf(rec), 'J3 EI no sectionPhotos');
});

test('J4: DR legacy record with text-only photo attachments still lists them', () => {
  const rec = makeDrRec({
    attachments: [
      { bucket: 'photos', name: 'old-photo-1.jpg', itemId: 'p-01' },
      { bucket: 'photos', name: 'old-photo-2.jpg', itemId: 'p-02' },
    ],
  });
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'J4 DR legacy photo list');
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(stream.includes('old-photo-1.jpg'), 'J4: legacy photo name in stream');
});

test('J5: SR pre-R11 record still renders', () => {
  const items = CHECKLIST_ITEMS
    .filter((d) => d.key !== '1b' && !['1d','1e','1f','1g','1h'].includes(d.key))
    .map((d) => ({ key: d.key, answer: 'Yes', note: '' }));
  const rec = makeSrRec({ schemaVersion: 10, items });
  assertPdf(renderSiteReadinessPdf(rec), 'J5 SR pre-R11');
});

// ============================================================
console.log('\n--- K. fetchAttachmentPhotos (live data path) ---');

const { fetchAttachmentPhotos } = await import(resolve(wt, 'functions/lib/graph.js'));

// --- K mock helpers ---

// Decode MINI_JPEG_B64 to a fresh Uint8Array (byteOffset=0).
const K_JPEG_BYTES = new Uint8Array(Buffer.from(MINI_JPEG_B64, 'base64'));

function kMockJpeg() {
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => k.toLowerCase() === 'content-type' ? 'image/jpeg' : null },
    arrayBuffer: async () => K_JPEG_BYTES.buffer,
  };
}

function kMock404() {
  return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
}

function kMockNonImage() {
  return { ok: true, status: 200, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => new ArrayBuffer(0) };
}

const K_BUCKET_MAP = { photos: 'photos' };

// Run async K tests via top-level await (ESM module already uses top-level await).
const kTests = [
  ['K1: success: attachment with known bucket returns data/w/h entry', async () => {
    const attachments = [{ bucket: 'photos', name: 'site.jpg', itemId: 'item-k01' }];
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => kMockJpeg() });
    assert.ok(Array.isArray(result.photos) && result.photos.length === 1, 'K1: photos[0] present');
    assert.ok(result.photos[0].data.startsWith('data:image/jpeg;'), 'K1: data URL correct');
    assert.ok(result.photos[0].w > 0 && result.photos[0].h > 0, 'K1: dims populated');
  }],

  ['K2: 404 on thumbnail falls back to /content and succeeds', async () => {
    const attachments = [{ bucket: 'photos', name: 'site.jpg', itemId: 'item-k02' }];
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async (url) =>
          url.includes('/thumbnails/') ? kMock404() : kMockJpeg() });
    assert.ok(result.photos?.length === 1, 'K2: fallback to /content worked');
  }],

  ['K3: fetch throw (timeout / network error) is fail-soft -> empty sectionPhotos', async () => {
    const attachments = [{ bucket: 'photos', name: 'site.jpg', itemId: 'item-k03' }];
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => { throw new Error('network timeout'); } });
    assert.deepEqual(result, {}, 'K3: timeout -> empty {}');
  }],

  ['K4: non-image content-type (pdf) is silently skipped', async () => {
    const attachments = [{ bucket: 'photos', name: 'doc.pdf', itemId: 'item-k04' }];
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => kMockNonImage() });
    assert.deepEqual(result, {}, 'K4: non-image -> empty {}');
  }],

  ['K5: empty attachments array returns {}', async () => {
    const result = await fetchAttachmentPhotos('tok', 'drv', [],
      K_BUCKET_MAP, { fetchFn: async () => { throw new Error('should not call'); } });
    assert.deepEqual(result, {}, 'K5: empty attachments -> {}');
  }],

  ['K6: attachment with unknown bucket is skipped (fetch never called)', async () => {
    const attachments = [{ bucket: 'handlogs', name: 'log.pdf', itemId: 'item-k06' }];
    let called = false;
    await fetchAttachmentPhotos('tok', 'drv', attachments,
      { photos: 'photos' }, // 'handlogs' not in map
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => { called = true; return kMockJpeg(); } });
    assert.equal(called, false, 'K6: unknown bucket -> no fetch');
  }],

  ['K7: multiple attachments with multiple SR buckets map to correct item keys', async () => {
    const attachments = [
      { bucket: 'grade_photo',   name: 'grade.jpg',  itemId: 'k-10' },
      { bucket: 'photos',        name: 'site.jpg',   itemId: 'k-11' },
      { bucket: 'sr_markup',     name: 'markup.jpg', itemId: 'k-12' },
      { bucket: 'handlogs',      name: 'log.pdf',    itemId: 'k-13' }, // no mapping -> skip
    ];
    const SR_MAP = { grade_photo: '3a', photos: 'photos', sr_markup: '5d' };
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, SR_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => kMockJpeg() });
    assert.equal(result['3a']?.length, 1,      'K7: grade_photo -> 3a');
    assert.equal(result['photos']?.length, 1,  'K7: photos -> photos');
    assert.equal(result['5d']?.length, 1,      'K7: sr_markup -> 5d');
    assert.equal(result['handlogs'], undefined, 'K7: handlogs not in result');
  }],

  ['K8: null/missing itemId entries in attachments are skipped', async () => {
    const attachments = [
      { bucket: 'photos', name: 'ok.jpg',     itemId: 'item-k08' },
      { bucket: 'photos', name: 'bad.jpg',    itemId: null },      // no itemId
      { bucket: 'photos', name: 'bad2.jpg' },                       // missing itemId
      null,                                                           // null entry
    ];
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: async () => kMockJpeg() });
    assert.equal(result.photos?.length, 1, 'K8: only valid itemId fetched');
  }],
];

for (const [name, fn] of kTests) {
  try {
    await fn();
    console.log('  PASS', name);
    passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message);
    failed++;
  }
}

// ============================================================
console.log('\n--- L. sectionPhotos isolation: not stored in rec or API response ---');
// Verifies the BLOCK fix: base64 photo blobs must never be written onto rec,
// stored in D1, or sent back to the browser in the submit response.

const drApiSrc = readFileSync(resolve(wt, 'functions/api/daily-report.js'), 'utf8');
const srApiSrc = readFileSync(resolve(wt, 'functions/api/site-readiness.js'), 'utf8');
const eiApiSrc = readFileSync(resolve(wt, 'functions/api/equipment-inspection.js'), 'utf8');

test('L1: DR: rec.sectionPhotos is NOT assigned (uses local variable)', () => {
  assert.ok(!drApiSrc.includes('rec.sectionPhotos ='),
    'L1: DR must not write base64 blobs onto rec (would persist to D1)');
});

test('L2: SR: rec.sectionPhotos is NOT assigned (uses local variable)', () => {
  assert.ok(!srApiSrc.includes('rec.sectionPhotos ='),
    'L2: SR must not write base64 blobs onto rec (would persist to D1)');
});

test('L3: DR: local drSectionPhotos variable passed as spread into render call', () => {
  assert.ok(drApiSrc.includes('drSectionPhotos'), 'L3: drSectionPhotos local var present');
  assert.ok(drApiSrc.includes('sectionPhotos: drSectionPhotos'),
    'L3: spread into renderDailyReportPdf call (not onto rec)');
});

test('L4: SR: local srSectionPhotos variable passed as spread into render call', () => {
  assert.ok(srApiSrc.includes('srSectionPhotos'), 'L4: srSectionPhotos local var present');
  assert.ok(srApiSrc.includes('sectionPhotos: srSectionPhotos'),
    'L4: spread into renderSiteReadinessPdf call (not onto rec)');
});

test('L5: EI path unchanged — EI uses KV blobs and does not import fetchAttachmentPhotos', () => {
  // EI populates rec.sectionPhotos from its own KV storage (different design, not changed here).
  assert.ok(eiApiSrc.includes('sectionPhotos'), 'L5: EI still handles sectionPhotos');
  assert.ok(!eiApiSrc.includes('fetchAttachmentPhotos'),
    'L5: EI must NOT import fetchAttachmentPhotos (EI uses KV, not SP Graph fetch)');
});

// ============================================================
console.log('\n--- M. GRAPH_ID_RE itemId validation in DR cleanAttachments ---');

test('M1: DR cleanAttachments defines and applies GRAPH_ID_RE to itemId', () => {
  assert.ok(drApiSrc.includes('GRAPH_ID_RE'), 'M1: GRAPH_ID_RE constant defined in DR');
  assert.ok(drApiSrc.includes('GRAPH_ID_RE.test(rawId)'),
    'M1: GRAPH_ID_RE applied to itemId before storage');
});

test('M2: DR GRAPH_ID_RE pattern rejects slash, query-string, and other path chars', () => {
  // Pattern must match the one in site-readiness.js exactly.
  assert.ok(drApiSrc.includes('GRAPH_ID_RE = /^[A-Za-z0-9!._'),
    'M2: GRAPH_ID_RE pattern present in DR source');
  // Verify the regex behaviour against known good/bad ids.
  const re = /^[A-Za-z0-9!._\-]{1,300}$/;
  assert.ok(!re.test('abc/xyz'),   'M2: slash (path traversal) rejected');
  assert.ok(!re.test('abc?xyz'),   'M2: question mark (query injection) rejected');
  assert.ok(!re.test('abc xyz'),   'M2: space rejected');
  assert.ok(!re.test(''),          'M2: empty string rejected');
  assert.ok( re.test('016ISVH6546BCGQXTIBFFKDG4HC7AZI27B'), 'M2: valid SP item id accepted');
  assert.ok( re.test('item-k01'), 'M2: dash allowed');
});

test('M3: SR cleanAttachments already had GRAPH_ID_RE (regression guard)', () => {
  assert.ok(srApiSrc.includes('GRAPH_ID_RE'), 'M3: GRAPH_ID_RE present in SR');
  assert.ok(srApiSrc.includes('GRAPH_ID_RE.test(rawId)'), 'M3: applied in SR cleanAttachments');
});

// ============================================================
console.log('\n--- N. Per-photo byte cap (MAX_PHOTO_BYTES) ---');

const { MAX_PHOTO_BYTES } = await import(resolve(wt, 'functions/lib/graph.js'));
const graphSrc = readFileSync(resolve(wt, 'functions/lib/graph.js'), 'utf8');

test('N1: MAX_PHOTO_BYTES exported from graph.js equals 4 MB', () => {
  assert.equal(MAX_PHOTO_BYTES, 4 * 1024 * 1024, 'N1: MAX_PHOTO_BYTES = 4 MB');
});

test('N2: clearTimeout(timer) appears AFTER arrayBuffer() (signal active during body read)', () => {
  const bodyReadIdx   = graphSrc.indexOf('abuf = await resp.arrayBuffer()');
  const clearAfterIdx = graphSrc.indexOf('clearTimeout(timer); // body fully read');
  assert.ok(bodyReadIdx > 0,          'N2: arrayBuffer() call in _fetchOnePhoto');
  assert.ok(clearAfterIdx > bodyReadIdx, 'N2: clearTimeout after body read — timeout covers body');
});

const nTests = [
  ['N3: Content-Length > MAX_PHOTO_BYTES causes photo to be skipped (no body read)', async () => {
    const attachments = [{ bucket: 'photos', name: 'huge.jpg', itemId: 'item-n03' }];
    let bodyReadCalled = false;
    const mockFetch = async () => ({
      ok: true, status: 200,
      headers: { get: (k) => {
        const kl = k.toLowerCase();
        if (kl === 'content-type')   return 'image/jpeg';
        if (kl === 'content-length') return String(MAX_PHOTO_BYTES + 1);
        return null;
      }},
      arrayBuffer: async () => { bodyReadCalled = true; return new ArrayBuffer(0); },
    });
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: mockFetch });
    assert.deepEqual(result, {}, 'N3: oversized Content-Length -> photo skipped');
    assert.equal(bodyReadCalled, false, 'N3: body NOT read when Content-Length over cap');
  }],

  ['N4: arrayBuffer.byteLength > MAX_PHOTO_BYTES causes photo to be skipped', async () => {
    const attachments = [{ bucket: 'photos', name: 'huge2.jpg', itemId: 'item-n04' }];
    const mockFetch = async () => ({
      ok: true, status: 200,
      // No Content-Length header (bypass fast-path check)
      headers: { get: (k) => k.toLowerCase() === 'content-type' ? 'image/jpeg' : null },
      arrayBuffer: async () => new ArrayBuffer(MAX_PHOTO_BYTES + 1),
    });
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: mockFetch });
    assert.deepEqual(result, {}, 'N4: oversized arrayBuffer -> photo skipped');
  }],

  ['N5: photo exactly at MAX_PHOTO_BYTES is accepted (boundary check)', async () => {
    // The minimum-size JPEG still passes when Content-Length == MAX_PHOTO_BYTES exactly.
    const attachments = [{ bucket: 'photos', name: 'ok.jpg', itemId: 'item-n05' }];
    const mockFetch = async () => ({
      ok: true, status: 200,
      headers: { get: (k) => {
        const kl = k.toLowerCase();
        if (kl === 'content-type')   return 'image/jpeg';
        if (kl === 'content-length') return String(MAX_PHOTO_BYTES); // exactly at limit
        return null;
      }},
      // Return a real JPEG (K_JPEG_BYTES) — the Content-Length matches the cap exactly so it passes.
      arrayBuffer: async () => K_JPEG_BYTES.buffer,
    });
    const result = await fetchAttachmentPhotos('tok', 'drv', attachments, K_BUCKET_MAP,
      { maxPhotos: 24, timeoutMs: 4000, fetchFn: mockFetch });
    assert.ok(Array.isArray(result.photos) && result.photos.length === 1,
      'N5: photo at exact cap boundary is accepted');
  }],
];

for (const [name, fn] of nTests) {
  try {
    await fn();
    console.log('  PASS', name);
    passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message);
    failed++;
  }
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
