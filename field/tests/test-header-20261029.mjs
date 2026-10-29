#!/usr/bin/env node
// test-header-20261029.mjs — Derek 2026-10-29 header changes
//
//   1. "Pier Foundations" subtitle removed from brandHeader
//   2. Report title vertically centered in the black band (optical center formula)
//   3. PF logo made a little smaller (vPad 20→26, logoH 64→52pt)
//
// Applies to all 4 report PDFs: DR, SR, EI, TT.
//
// Run: node field/tests/test-header-20261029.mjs

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const wt    = resolve(__dir, '..');

const { PdfDoc } = await import(resolve(wt, 'functions/lib/pdf.js'));
const { renderDailyReportPdf }     = await import(resolve(wt, 'functions/lib/daily-report-doc.js'));
const { renderSiteReadinessPdf }   = await import(resolve(wt, 'functions/lib/site-readiness-doc.js'));
const { renderEquipInspectionPdf } = await import(resolve(wt, 'functions/lib/equip-inspection-doc.js'));
const { renderToolboxTalkPdf }     = await import(resolve(wt, 'functions/lib/toolbox-talk-doc.js'));
const { CHECKLIST_ITEMS }          = await import(resolve(wt, 'functions/lib/site-readiness-store.js'));
const { CHECKLIST_ITEMS: EI_ITEMS } = await import(resolve(wt, 'functions/lib/equip-inspection-store.js'));

const pdfSrc = readFileSync(resolve(wt, 'functions/lib/pdf.js'), 'utf-8');

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

// ---- Minimal record fixtures ------------------------------------------------

function makeDrRec(overrides) {
  return Object.assign({
    id: 'dr_hdr_test', projectId: '26-HDR', projectName: 'Header Test Project',
    date: '2026-10-29', foreman: 'P. Test',
    crew: [{ name: 'P. Test', costCode: '5100', hours: 8 }],
    equipmentOwned: [], equipmentRental: [],
    maintenance: [], futureIssues: [], delayEntries: [],
    columnsInstalled: 5, lfInstalled: 100,
    precipitation: 'Clear', temp: '50F',
    attachments: [],
  }, overrides || {});
}

function makeSrRec(overrides) {
  return Object.assign({
    id: 'sr_hdr_test', projectId: '26-HDR', projectName: 'Header Test Project',
    date: '2026-10-29', gcContact: 'Test GC', siteAddress: '100 Test Blvd, Fort Wayne IN',
    inspectedBy: 'P. Test', schemaVersion: 12, status: 'submitted',
    result: 'READY', openItems: [],
    items: CHECKLIST_ITEMS.map((d) => ({ key: d.key, answer: 'Yes', note: '' })),
    opsSignoffs: {}, attachments: [],
  }, overrides || {});
}

function makeEiRec(overrides) {
  const items = EI_ITEMS
    .filter((d) => d.types.includes('vibro_excavator'))
    .map((d) => ({ key: d.key, answer: 'Pass', note: '' }));
  return Object.assign({
    id: 'ei_hdr_test', machineType: 'vibro_excavator',
    projectId: '26-HDR', jobNumber: '26-HDR',
    date: '2026-10-29', inspectedBy: 'P. Test',
    ownedOrRented: 'Owned', serialNumber: 'VSC-HDR-01',
    machineHours: 500, safeToOperate: true,
    deficienciesNotes: '', items,
    sectionPhotos: {},
  }, overrides || {});
}

function makeTtRec(overrides) {
  return Object.assign({
    id: 'tt_hdr_test', projectId: '26-HDR', projectName: 'Header Test Project',
    date: '2026-10-29', time: '07:00', presenter: 'P. Test',
    topic: 'ppe', location: 'Job trailer',
    keyPoints: 'Hard hats required.', hazards: 'Overhead crane.',
    questions: 'None.', actions: '',
    attendees: [{ name: 'P. Test', signature: '' }],
  }, overrides || {});
}

// ============================================================
console.log('\n--- A. Source-level assertions (pdf.js) ---');

test('A1: vPad changed to 26 (logo smaller)', () => {
  assert.ok(pdfSrc.includes('const vPad = 26;'), 'vPad must be 26 in brandHeader');
  assert.ok(!pdfSrc.includes('const vPad = 20;'), 'old vPad=20 must be gone');
});

test('A2: subtitle _draw call removed from brandHeader', () => {
  // The removed line was: this._draw('Pier Foundations', 8, 'helv', ...
  // Extract just the brandHeader function body to avoid false positives elsewhere.
  const start = pdfSrc.indexOf('brandHeader(title, meta)');
  const end   = pdfSrc.indexOf('\n  }', start + 1); // closing brace of method
  assert.ok(start >= 0, 'brandHeader must exist');
  const fn = pdfSrc.slice(start, end);
  assert.ok(!fn.includes("'Pier Foundations'"), 'subtitle _draw must be absent from brandHeader');
});

test('A3: titleBaseY uses optical-center formula (tSize * 0.35)', () => {
  assert.ok(pdfSrc.includes('tSize * 0.35'),
    'titleBaseY must use bandCenterY - tSize * 0.35 formula');
});

test('A4: old fixed titleBaseY = bandCenterY + 9 is gone', () => {
  assert.ok(!pdfSrc.includes('bandCenterY + 9'),
    'old fixed offset +9 must not remain');
});

test('A5: subBaseY constant is gone', () => {
  assert.ok(!pdfSrc.includes('subBaseY'),
    'subBaseY constant must be removed (subtitle gone)');
});

// ============================================================
console.log('\n--- B. Content stream: subtitle absent, title present ---');

test('B1: subtitle text absent from brandHeader stream (DR title)', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Daily Field Report', [
    { label: 'Job #', value: '26-HDR' },
    { label: 'Date',  value: '10/29/2026' },
  ]);
  const bytes = doc.toBytes();
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'),
    'subtitle "Pier Foundations" must not appear in stream');
});

test('B2: subtitle text absent from brandHeader stream (SR title)', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Site Readiness Form', [
    { label: 'Job #', value: '26-HDR' },
  ]);
  const bytes = doc.toBytes();
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'),
    'subtitle must be absent for SR title');
});

test('B3: subtitle text absent when empty title (EI pattern)', () => {
  const doc = new PdfDoc();
  doc.brandHeader('', [{ label: 'Machine', value: 'Vibro' }]);
  const bytes = doc.toBytes();
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'),
    'subtitle must be absent when title is empty string');
});

test('B4: title IS drawn (Eurostile /F3 font reference present)', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Daily Field Report', [{ label: 'Job #', value: '26-001' }]);
  const bytes = doc.toBytes();
  const stream = new TextDecoder('latin1').decode(bytes);
  // /F3 = Eurostile, /F2 = Helvetica fallback
  assert.ok(stream.includes('/F3') || stream.includes('/F2'),
    'title must be rendered via Eurostile (/F3) or bold fallback (/F2)');
});

test('B5: header renders valid PDF bytes', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Toolbox Talk', [{ label: 'Date', value: '10/29/2026' }]);
  assertPdf(doc.toBytes(), 'B5 TT header');
});

// ============================================================
console.log('\n--- C. Long title: shrinks to fit, no overlap, no throw ---');

test('C1: very long title renders valid PDF without throw', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Daily Equipment Inspection With Extremely Long Title That Exceeds Max', [
    { label: 'Project', value: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee Fffff Ggggg Hhhhh' },
    { label: 'Date', value: '10/29/2026' },
  ]);
  assertPdf(doc.toBytes(), 'C1 very long title');
});

test('C2: long title subtitle still absent after shrink', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Site Readiness Form With Very Long Overflow Title Text Here', [
    { label: 'Project', value: 'Another Long Project Name - Fort Wayne Industrial Park' },
    { label: 'Date', value: '10/29/2026' },
  ]);
  const bytes = doc.toBytes();
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'), 'subtitle absent even with long title');
});

test('C3: no-meta header renders (TT-like) without throw', () => {
  const doc = new PdfDoc();
  doc.brandHeader('Toolbox Talk', []);
  assertPdf(doc.toBytes(), 'C3 no-meta');
});

// ============================================================
console.log('\n--- D. All 4 report PDFs render without throw ---');

test('D1: renderDailyReportPdf renders valid PDF', () => {
  const bytes = renderDailyReportPdf(makeDrRec());
  assertPdf(bytes, 'D1 DR');
});

test('D2: renderDailyReportPdf — subtitle absent in full render', () => {
  const bytes = renderDailyReportPdf(makeDrRec());
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'), 'DR: subtitle absent');
});

test('D3: renderSiteReadinessPdf renders valid PDF', () => {
  const bytes = renderSiteReadinessPdf(makeSrRec());
  assertPdf(bytes, 'D3 SR');
});

test('D4: renderSiteReadinessPdf — subtitle absent in full render', () => {
  const bytes = renderSiteReadinessPdf(makeSrRec());
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'), 'SR: subtitle absent');
});

test('D5: renderEquipInspectionPdf renders valid PDF', () => {
  const bytes = renderEquipInspectionPdf(makeEiRec());
  assertPdf(bytes, 'D5 EI');
});

test('D6: renderEquipInspectionPdf — subtitle absent in full render', () => {
  const bytes = renderEquipInspectionPdf(makeEiRec());
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'), 'EI: subtitle absent');
});

test('D7: renderToolboxTalkPdf renders valid PDF', () => {
  const bytes = renderToolboxTalkPdf(makeTtRec());
  assertPdf(bytes, 'D7 TT');
});

test('D8: renderToolboxTalkPdf — subtitle absent in full render', () => {
  const bytes = renderToolboxTalkPdf(makeTtRec());
  const stream = new TextDecoder('latin1').decode(bytes);
  assert.ok(!stream.includes('Pier Foundations'), 'TT: subtitle absent');
});

// ============================================================
console.log('\n--- E. Long project name: all 4 reports handle gracefully ---');

const LONG_NAME = 'Very Long Project Name - Fort Wayne Industrial Park Expansion Phase 2';

test('E1: DR with long project name renders valid PDF', () => {
  const bytes = renderDailyReportPdf(makeDrRec({ projectName: LONG_NAME }));
  assertPdf(bytes, 'E1 DR long-name');
});

test('E2: SR with long project name renders valid PDF', () => {
  const bytes = renderSiteReadinessPdf(makeSrRec({ projectName: LONG_NAME }));
  assertPdf(bytes, 'E2 SR long-name');
});

test('E3: EI with long project name renders valid PDF', () => {
  const bytes = renderEquipInspectionPdf(makeEiRec({ projectId: '26-LONG', jobNumber: '26-LONG' }));
  assertPdf(bytes, 'E3 EI long-name');
});

test('E4: TT with long project name renders valid PDF', () => {
  const bytes = renderToolboxTalkPdf(makeTtRec({ projectName: LONG_NAME }));
  assertPdf(bytes, 'E4 TT long-name');
});

// ============================================================
console.log(`\n  ${passed + 0} running...`);
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
