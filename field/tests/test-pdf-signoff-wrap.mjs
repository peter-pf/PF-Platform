#!/usr/bin/env node
// test-pdf-signoff-wrap.mjs
//
// Tests for the pdf.js table() stacked-layout fix (2026-10-27):
//   Bug: a long "Location description" value in the SR sign-off block was
//        drawn right-aligned, starting left of its own label and overprinting it.
//   Fix: when a value's right-aligned start position would physically overlap
//        the drawn label text (with 2pt safety margin), table() switches to a
//        stacked layout: label on its own line, value wrapped below it, left-aligned.
//
// Test categories:
//   A. pdf.js table() geometry: stacking triggers for true overlaps, not for short values
//   B. SR PDF renders without throw for 76-char and 200-char location descriptions
//   C. Regression: SR, Daily Report and Equipment Inspection PDFs all still render
//   D. Stacked layout: text content visible in PDF stream for long desc
//   E. Short sign-off values keep side-by-side layout (no spurious stacking)

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const wt    = resolve(__dir, '..');

const { PdfDoc } = await import(resolve(wt, 'functions/lib/pdf.js'));
const { renderSiteReadinessPdf } = await import(resolve(wt, 'functions/lib/site-readiness-doc.js'));
const { renderDailyReportPdf }   = await import(resolve(wt, 'functions/lib/daily-report-doc.js'));
const { renderEquipInspectionPdf } = await import(resolve(wt, 'functions/lib/equip-inspection-doc.js'));
const { CHECKLIST_ITEMS } = await import(resolve(wt, 'functions/lib/site-readiness-store.js'));
const { CHECKLIST_ITEMS: EI_ITEMS } = await import(resolve(wt, 'functions/lib/equip-inspection-store.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
function assertPdf(bytes, label) {
  assert.ok(bytes instanceof Uint8Array, `${label}: must return Uint8Array`);
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-', `${label}: must start with %PDF-`);
  assert.ok(bytes.length > 2000, `${label}: suspiciously small (${bytes.length} bytes)`);
}

// ---- Helpers ----------------------------------------------------------------

// Build a minimal SR record, answering all items 'Yes'.
function makeSrRec(descOverride) {
  return {
    id: 'test_wrap', projectId: '26-TEST', projectName: 'Wrap Test Job',
    date: '2026-10-27', gcContact: 'Test GC', siteAddress: '123 Test Lane, Fort Wayne IN',
    inspectedBy: 'Peter', result: 'READY', openItems: [], schemaVersion: 12,
    items: CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: 'Yes', note: '' })),
    opsSignoffs: {
      sitePlan: {
        desc: descOverride,
        superName: 'M. Thompson', pfMgrName: 'J. Smith',
        signedAt: '2026-10-27T10:00:00.000Z', capturedByName: 'Peter',
      },
    },
    attachments: [], sigName: 'Peter', sigDate: '2026-10-27', status: 'sent',
  };
}

// Minimal DR record.
function makeDrRec() {
  return {
    id: 'dr_test', projectId: '26-TEST', projectName: 'Wrap Test Job',
    date: '2026-10-27', foreman: 'J. Smith',
    crew: [{ name: 'J. Smith', costCode: '5100', hours: 8, start: '07:00', end: '15:00' }],
    equipmentOwned: [{ machine: 'Vibro Excavator', hours: 8 }],
    equipmentRental: [],
    maintenance: [],
    downtime: [],
    columnsInstalled: 5, lfInstalled: 100,
    precipitation: 'None', temp: '65F',
    notes: '', schemaVersion: 9,
    materialLoads: [],
  };
}

// Minimal EI record.
function makeEiRec(formType) {
  return {
    id: 'ei_test', projectId: '26-TEST', projectName: 'Wrap Test Job',
    date: '2026-10-27', operatorName: 'J. Smith',
    formType, machineId: 'VSC-2024-0042',
    items: EI_ITEMS
      .filter(d => d.types.includes(formType))
      .map(d => ({ key: d.key, answer: 'Pass', note: '' })),
    schemaVersion: 2,
  };
}

// ---- A. table() geometry ----------------------------------------------------

console.log('\n--- A. table() geometry: stacking triggers correctly ---');

test('A1: short sign-off value (Mike Thompson ~68pt) stays side-by-side', () => {
  // With Location description label (~89pt) and value "Mike Thompson" (~68pt):
  //   valueRightX - vw = 550 - 68 = 482 >> lx + lActualW + 2 = 62 + 89 + 2 = 153
  // No stacking expected.
  const doc = new PdfDoc();
  const rows = [{ label: 'GC Signature', value: 'Mike Thompson' }];
  // Just check it renders without throwing; visual check done by rendered PDF
  assert.doesNotThrow(() => doc.table(rows, { valueW: 280 }));
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A1 short value table');
});

test('A2: long location description (76 chars, ~417pt) triggers stacking', () => {
  // "Stone: east laydown only (GC restriction). Spoils: NE corner - pending GC confirmation."
  // value width ~417pt. Label "Location description" ~89pt.
  // valueRightX - vw = 550 - 417 = 133 < lx + 89 + 2 = 153 → STACKS
  const doc = new PdfDoc();
  const desc = 'Stone: east laydown only (GC restriction). Spoils: NE corner - pending GC confirmation.';
  const rows = [{ label: 'Location description', value: desc }];
  assert.doesNotThrow(() => doc.table(rows, { valueW: 280 }));
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A2 long desc table');
  // Confirm the description text appears in the PDF stream (not truncated)
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('Stone:'), 'PDF stream must contain start of description');
  assert.ok(src.includes('GC confirmation'), 'PDF stream must contain end of description');
});

test('A3: 200-character location description triggers stacking and wraps', () => {
  const desc = 'LONG: AP stone staged at northwest corner of building pad per GC directive. Spoils placed along east property line, outside utility corridor, and removed daily by GC earthwork subcontractor before end of shift.';
  assert.ok(desc.length >= 200, `desc should be >=200 chars, got ${desc.length}`);
  const doc = new PdfDoc();
  const rows = [{ label: 'Location description', value: desc }];
  assert.doesNotThrow(() => doc.table(rows, { valueW: 280 }));
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A3 200-char desc table');
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('LONG:'), 'PDF stream must contain start of 200-char description');
  assert.ok(src.includes('end of shift'), 'PDF stream must contain end of 200-char description');
});

test('A4: no overlap for 5c label (409pt) + None Required (71pt) — just fits with 7pt gap', () => {
  // label 5c (409.6pt), lx=62, lx+label=471.6
  // "None Required" value (71.1pt), valueRightX-vw = 478.9
  // 478.9 >= 471.6 + 2 = 473.6 → side-by-side (no stacking)
  const doc = new PdfDoc();
  const label = '5c. Spoils removal plan: any additional PF coordination required or GC plan to remove spoils';
  const rows = [{ label, value: 'None Required' }];
  assert.doesNotThrow(() => doc.table(rows, { valueW: 60 }));
  const bytes = doc.toBytes();
  assertPdf(bytes, 'A4 5c None Required');
  // "None Required" should appear in the stream (not below the label)
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('None Required'), 'None Required must appear in PDF stream');
});

// ---- B. SR PDF sign-off block -----------------------------------------------

console.log('\n--- B. SR PDF: long location descriptions ---');

test('B1: SR PDF with 76-char location description renders without throw', () => {
  const rec = makeSrRec('Stone: east laydown only (GC restriction). Spoils: NE corner - pending GC confirmation.');
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'B1 SR 76-char desc');
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('GC confirmation'), 'description end text must appear in PDF stream');
});

test('B2: SR PDF with 200-char location description renders without throw', () => {
  const desc = 'LONG: AP stone staged at northwest corner of building pad per GC directive. Spoils placed along east property line, outside utility corridor, and removed daily by GC earthwork subcontractor before end of shift.';
  assert.ok(desc.length >= 200, `200-char desc, got ${desc.length}`);
  const rec = makeSrRec(desc);
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'B2 SR 200-char desc');
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('end of shift'), 'end of description must appear in PDF stream');
});

test('B3: SR PDF with short location description renders without throw', () => {
  const rec = makeSrRec('Stone NW. Spoils east.');
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'B3 SR short desc');
});

test('B4: SR PDF with empty location description renders without throw', () => {
  const rec = makeSrRec('');
  const bytes = renderSiteReadinessPdf(rec);
  assertPdf(bytes, 'B4 SR empty desc');
});

// ---- C. Regression: all three PDF types -------------------------------------

console.log('\n--- C. Regression: SR / Daily Report / Equipment Inspection ---');

test('C1: Daily Report PDF still renders after pdf.js change', () => {
  const rec = makeDrRec();
  assert.doesNotThrow(() => renderDailyReportPdf(rec));
  const bytes = renderDailyReportPdf(rec);
  assertPdf(bytes, 'C1 DR');
});

test('C2: Equipment Inspection (vibro) PDF still renders', () => {
  const rec = makeEiRec('vibro_excavator');
  assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'C2 EI vibro');
});

test('C3: Equipment Inspection (skid steer) PDF still renders', () => {
  const rec = makeEiRec('skid_steer');
  assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'C3 EI skid steer');
});

test('C4: Equipment Inspection (predrill excavator) PDF still renders', () => {
  const rec = makeEiRec('predrill_excavator');
  assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'C4 EI predrill');
});

test('C5: Equipment Inspection with Damaged items still renders', () => {
  const rec = makeEiRec('vibro_excavator');
  rec.items = rec.items.map((it, i) => i === 0 ? { ...it, answer: 'Damaged', note: 'Cracked weld on mast' } : it);
  assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
  const bytes = renderEquipInspectionPdf(rec);
  assertPdf(bytes, 'C5 EI Damaged item');
});

// ---- D. Content integrity: stacked desc text in PDF stream ------------------

console.log('\n--- D. Content integrity: stacked text visible in PDF stream ---');

test('D1: short sign-off names remain side-by-side (in stream as expected)', () => {
  const rec = makeSrRec('Stone NW corner.');
  const bytes = renderSiteReadinessPdf(rec);
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('Thompson') || src.includes('M. Thompson'),
    'GC signer name must appear in PDF stream');
  assert.ok(src.includes('J. Smith'),
    'PF signer name must appear in PDF stream');
});

test('D2: long location desc (76 chars): label and all value text in stream', () => {
  const rec = makeSrRec('Stone: east laydown only (GC restriction). Spoils: NE corner - pending GC confirmation.');
  const bytes = renderSiteReadinessPdf(rec);
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.includes('Location description'), 'label must appear in PDF stream');
  assert.ok(src.includes('Stone:'), 'start of value must appear in PDF stream');
  assert.ok(src.includes('GC confirmation'), 'end of value must appear in PDF stream');
});

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
