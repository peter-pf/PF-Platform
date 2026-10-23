#!/usr/bin/env node
// R9 Daily Report tests:
//   1. renderDailyReportPdf: 5-crew record generates PDF without error
//   2. renderDailyReportPdf: 5-crew PDF includes all crew names
//   3. renderDailyReportPdf: 1-crew record (legacy min after pad change)
//   4. renderDailyReportPdf: 0-crew record safe (no crew section crash)
//   5. predrill bucket accepted by server cleanAttachments (VALID_ATTACH_BUCKETS)
//   6. predrill attachment appears in PDF listing with "Predrill Markup" label
//   7. predrill bucket yields blank label if unknown bucket supplied
//   8. handlogs/guhma/photos buckets still accepted (no regression)
//   9. dynamic crew round-trip: 5 names survive clean -> render
//  10. old 3-crew legacy record still loads correctly (backward compat)
//
// Run:  node field/tests/test-dr-r9.mjs

import { strict as assert } from 'assert';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dir, '..', 'test-output');
mkdirSync(outDir, { recursive: true });

const drDocUrl = new URL('../functions/lib/daily-report-doc.js', import.meta.url);
const { renderDailyReportPdf, pdfFilename } = await import(drDocUrl.href);

// ---------------------------------------------------------------------------
// Inline server-side helpers under test (no CF runtime deps)
// ---------------------------------------------------------------------------

const MAX_CREW        = 60;
const MAX_SHORT       = 300;
const MAX_STR         = 4000;
const MAX_ATTACH_ROWS = 50;

function s(v, cap = MAX_SHORT) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function hoursVal(v) {
  if (v == null || String(v).trim() === '') return null;
  let n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  if (n > 24) n = 24;
  return Math.round(n * 100) / 100;
}

function cleanCrew(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const m of input.slice(0, MAX_CREW)) {
    if (!m || typeof m !== 'object') continue;
    const name = s(m.name, MAX_SHORT);
    if (!name) continue;
    out.push({ name, start: s(m.start, MAX_SHORT), end: s(m.end, MAX_SHORT),
               hours: hoursVal(m.hours), costCode: s(m.costCode, MAX_SHORT) });
  }
  return out;
}

// VALID_ATTACH_BUCKETS mirror (R9 adds predrill)
const VALID_ATTACH_BUCKETS = { handlogs: 1, guhma: 1, photos: 1, predrill: 1 };

function cleanAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input.slice(0, MAX_ATTACH_ROWS)) {
    if (!a || typeof a !== 'object') continue;
    const name   = s(a.name,   MAX_SHORT);
    const itemId = s(a.itemId, MAX_SHORT);
    if (!name && !itemId) continue;
    const bucketRaw = s(a.bucket, MAX_SHORT);
    const bucket = VALID_ATTACH_BUCKETS[bucketRaw] ? bucketRaw : '';
    const wu = s(a.webUrl, MAX_STR);
    const webUrl = (wu && wu.startsWith('https://')) ? wu : '';
    out.push({ name, itemId, webUrl, bucket });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Base record for tests (minimal valid structure)
// ---------------------------------------------------------------------------
const baseRec = {
  date: '2026-10-23',
  projectName: 'R9 Test Project',
  projectId: '26-100',
  foreman: 'T. Jones',
  precipitation: 'Clear',
  temp: '65 F',
  columnsInstalled: 8,
  lfInstalled: 160,
  equipmentOwned: [{ machine: 'Drill Rig #1', hours: 8 }],
  equipmentRental: [],
  maintenance: [],
  futureIssues: [],
  delayEntries: [],
  delays: '',
  safety: 'Pre-task meeting held.',
  workCompleted: 'Production complete.',
  attachments: [],
};

// Five-crew record (R9: dynamic crew list, no longer fixed at 3)
const fiveCrewRec = {
  ...baseRec,
  crew: [
    { name: 'Alice Smith',  start: '07:00', end: '15:00', hours: 8,   costCode: '26-100' },
    { name: 'Bob Jones',    start: '07:00', end: '15:00', hours: 8,   costCode: '26-100' },
    { name: 'Carol Davis',  start: '07:00', end: '15:00', hours: 8,   costCode: '26-100' },
    { name: 'Dan Wilson',   start: '07:00', end: '15:30', hours: 8.5, costCode: '26-100' },
    { name: 'Eve Martinez', start: '07:00', end: '16:00', hours: 9,   costCode: '26-100' },
  ],
};

// One-crew record (minimum after R9 pad change from <3 to <1)
const oneCrewRec = { ...baseRec, crew: [{ name: 'Solo Worker', start: '07:00', end: '15:00', hours: 8, costCode: '26-100' }] };

// Zero-crew record (edge case — safe)
const zeroCrewRec = { ...baseRec, crew: [] };

// Legacy 3-crew record (exactly 3 — must still work after pad change)
const threeCrewRec = {
  ...baseRec,
  crew: [
    { name: 'Alpha',  start: '07:00', end: '15:00', hours: 8, costCode: '26-001' },
    { name: 'Bravo',  start: '07:00', end: '15:00', hours: 8, costCode: '26-001' },
    { name: 'Charlie',start: '07:00', end: '15:00', hours: 8, costCode: '26-001' },
  ],
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  PASS', name); passed++; })
              .catch(e => { console.error('  FAIL', name, '\n      ', e.message); failed++; });
    }
    console.log('  PASS', name); passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message); failed++;
  }
}

// ---------------------------------------------------------------------------
// 1-4: Dynamic crew rendering
// ---------------------------------------------------------------------------
console.log('\n--- R9: Dynamic crew ---');

test('5-crew record: PDF generates without error', () => {
  const bytes = renderDailyReportPdf(fiveCrewRec);
  assert.ok(bytes instanceof Uint8Array, 'should return Uint8Array');
  assert.ok(bytes.length > 100, 'PDF should be non-trivial size');
});

test('5-crew record: all crew names appear in PDF', () => {
  const bytes = renderDailyReportPdf(fiveCrewRec);
  const text = Buffer.from(bytes).toString('latin1');
  for (const m of fiveCrewRec.crew) {
    const firstName = m.name.split(' ')[0];
    assert.ok(text.includes(firstName), `PDF should include crew name fragment "${firstName}"`);
  }
});

test('1-crew record: PDF generates without error', () => {
  const bytes = renderDailyReportPdf(oneCrewRec);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 100);
});

test('0-crew record: PDF generates without error (no-crew fallback)', () => {
  const bytes = renderDailyReportPdf(zeroCrewRec);
  assert.ok(bytes instanceof Uint8Array);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('No crew recorded'), 'Should show fallback text when crew empty');
});

// ---------------------------------------------------------------------------
// 5-8: VALID_ATTACH_BUCKETS — predrill and existing buckets
// ---------------------------------------------------------------------------
console.log('\n--- R9: Predrill bucket ---');

test('predrill bucket accepted by cleanAttachments', () => {
  const cleaned = cleanAttachments([
    { name: 'predrill-markup.pdf', itemId: 'item-001', webUrl: 'https://sharepoint.example.com/predrill.pdf', bucket: 'predrill' },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].bucket, 'predrill');
});

test('predrill attachment appears in PDF with "Predrill Markup" label', () => {
  const rec = {
    ...baseRec,
    crew: oneCrewRec.crew,
    attachments: [
      { name: 'predrill-markup.pdf', itemId: 'item-001', webUrl: 'https://sharepoint.example.com/predrill.pdf', bucket: 'predrill' },
    ],
  };
  const bytes = renderDailyReportPdf(rec);
  const text  = Buffer.from(bytes).toString('latin1');
  // The doc renders: "- predrill-markup.pdf  [Predrill Markup]"
  assert.ok(text.includes('Predrill Markup'), 'PDF should include "Predrill Markup" label');
  assert.ok(text.includes('predrill-markup'), 'PDF should include the file name');
});

test('unknown bucket is blanked (not persisted as unknown value)', () => {
  const cleaned = cleanAttachments([
    { name: 'mystery.pdf', itemId: 'item-002', webUrl: 'https://sharepoint.example.com/x.pdf', bucket: 'private-stuff' },
  ]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].bucket, '', 'Unknown bucket should be blanked, not rejected');
});

test('legacy buckets (handlogs/guhma/photos) still accepted (no regression)', () => {
  const cleaned = cleanAttachments([
    { name: 'log.pdf',   itemId: 'i1', webUrl: 'https://x.sharepoint.com/log.pdf',  bucket: 'handlogs' },
    { name: 'data.xlsx', itemId: 'i2', webUrl: 'https://x.sharepoint.com/data.xlsx', bucket: 'guhma'    },
    { name: 'site.jpg',  itemId: 'i3', webUrl: 'https://x.sharepoint.com/site.jpg',  bucket: 'photos'   },
  ]);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[0].bucket, 'handlogs');
  assert.equal(cleaned[1].bucket, 'guhma');
  assert.equal(cleaned[2].bucket, 'photos');
});

// ---------------------------------------------------------------------------
// 9-10: Crew round-trip and legacy backward compat
// ---------------------------------------------------------------------------
console.log('\n--- R9: Crew round-trip and backward compat ---');

test('5-crew round-trip: cleanCrew -> 5 rows preserved', () => {
  const cleaned = cleanCrew(fiveCrewRec.crew);
  assert.equal(cleaned.length, 5);
  assert.equal(cleaned[0].name, 'Alice Smith');
  assert.equal(cleaned[4].name, 'Eve Martinez');
  // OT check: 9h crew member hours capped at 24 but not 8
  assert.equal(cleaned[4].hours, 9, 'OT hours (9h) should be preserved, not capped at 8');
});

test('legacy 3-crew record loads correctly (backward compat after pad change)', () => {
  // Before R9: form padded to 3 minimum. After R9: pad to 1 minimum.
  // A saved record with exactly 3 crew must still render all 3.
  const cleaned = cleanCrew(threeCrewRec.crew);
  assert.equal(cleaned.length, 3, 'Legacy 3-crew record should load all 3 crew members');
  const bytes = renderDailyReportPdf(threeCrewRec);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('Alpha'),   'Alpha crew member should be in PDF');
  assert.ok(text.includes('Bravo'),   'Bravo crew member should be in PDF');
  assert.ok(text.includes('Charlie'), 'Charlie crew member should be in PDF');
});

// ---------------------------------------------------------------------------
// 11. Sample PDF for manual inspection
// ---------------------------------------------------------------------------
console.log('\n--- R9: Sample PDF generation ---');

test('R9 sample PDF (5-crew + predrill) writes to test-output/', () => {
  const rec = {
    ...fiveCrewRec,
    projectName: 'R9 Test - 5 Crew Predrill',
    attachments: [
      { name: 'predrill-markup.pdf', itemId: 'dritem-001',
        webUrl: 'https://pierfoundations.sharepoint.com/sites/PFPlatform/Shared%20Documents/predrill.pdf',
        bucket: 'predrill' },
      { name: 'site-photo.jpg', itemId: 'dritem-002',
        webUrl: 'https://pierfoundations.sharepoint.com/sites/PFPlatform/Shared%20Documents/photo.jpg',
        bucket: 'photos' },
    ],
  };
  const bytes = renderDailyReportPdf(rec);
  assert.ok(bytes instanceof Uint8Array, 'should return Uint8Array');
  const fn = pdfFilename(rec);
  const outPath = resolve(outDir, fn);
  writeFileSync(outPath, bytes);
  console.log('    Generated:', outPath);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 0));
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
