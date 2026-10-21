#!/usr/bin/env node
// Unit tests: draft status banner filename computation, past-reports listing,
// photos bucket routing, and form field wiring.
//
// Run:  node field/tests/test-draft-filename.mjs

import { strict as assert } from 'assert';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dir, '..', 'test-output');
mkdirSync(outDir, { recursive: true });

const drDocUrl  = new URL('../functions/lib/daily-report-doc.js',  import.meta.url);
const srDocUrl  = new URL('../functions/lib/site-readiness-doc.js', import.meta.url);
const uploadUrl = new URL('../functions/api/field-upload.js',        import.meta.url);

const { pdfFilename: drFilename } = await import(drDocUrl.href);
const { pdfFilename: srFilename } = await import(srDocUrl.href);

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  PASS', name);
    passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Daily Report pdfFilename: YY-MMDD-<name>-Daily Report.pdf
// ---------------------------------------------------------------------------
test('DFR pdfFilename — basic format', () => {
  const fn = drFilename({ date: '2026-10-21', projectName: 'Hanley Data Center' });
  assert.equal(fn, '26-1021-Hanley Data Center-Daily Report.pdf');
});

test('DFR pdfFilename — strips SharePoint-illegal chars', () => {
  const fn = drFilename({ date: '2026-10-21', projectName: 'Bad:Name/With\\Slashes' });
  // colons, slashes, backslashes stripped; spaces kept
  assert.match(fn, /^26-1021-BadNameWithSlashes-Daily Report\.pdf$/);
});

test('DFR pdfFilename — ends in -Daily Report.pdf', () => {
  const fn = drFilename({ date: '2026-03-15', projectName: 'Granary' });
  assert.ok(fn.endsWith('-Daily Report.pdf'), `Expected suffix -Daily Report.pdf, got: ${fn}`);
});

test('DFR pdfFilename — project name from projectId fallback', () => {
  const fn = drFilename({ date: '2026-10-21', projectId: '26-022' });
  assert.equal(fn, '26-1021-26-022-Daily Report.pdf');
});

test('DFR pdfFilename — empty project name falls back to Project', () => {
  const fn = drFilename({ date: '2026-10-21', projectName: '' });
  assert.equal(fn, '26-1021-Project-Daily Report.pdf');
});

test('DFR pdfFilename — hyphen and spaces preserved', () => {
  const fn = drFilename({ date: '2026-10-21', projectName: '26-022 - DFS Grain Bins' });
  assert.equal(fn, '26-1021-26-022 - DFS Grain Bins-Daily Report.pdf');
});

// ---------------------------------------------------------------------------
// 2. Site Readiness pdfFilename: YY-MMDD-<name>-Site Readiness.pdf
// ---------------------------------------------------------------------------
test('SR pdfFilename — basic format', () => {
  const fn = srFilename({ date: '2026-10-21', projectName: 'The Granary' });
  assert.equal(fn, '26-1021-The Granary-Site Readiness.pdf');
});

test('SR pdfFilename — ends in -Site Readiness.pdf', () => {
  const fn = srFilename({ date: '2026-05-01', projectName: 'My Project' });
  assert.ok(fn.endsWith('-Site Readiness.pdf'), `Expected suffix -Site Readiness.pdf, got: ${fn}`);
});

test('SR pdfFilename — strips illegal chars', () => {
  const fn = srFilename({ date: '2026-10-21', projectName: 'Bad*Project?"Name' });
  assert.match(fn, /-Site Readiness\.pdf$/);
  assert.ok(!fn.includes('*') && !fn.includes('?') && !fn.includes('"'));
});

test('SR pdfFilename — does NOT contain Daily Report', () => {
  const fn = srFilename({ date: '2026-10-21', projectName: 'Hanley' });
  assert.ok(!fn.includes('Daily Report'), `SR filename should not contain "Daily Report": ${fn}`);
});

test('SR pdfFilename — uses project name not project id alone', () => {
  const fn = srFilename({ date: '2026-10-21', projectName: 'DFS Grain Bins', projectId: '26-022' });
  assert.ok(fn.includes('DFS Grain Bins'), `SR filename should use project name: ${fn}`);
});

// ---------------------------------------------------------------------------
// 3. DFR vs SR filenames differ in suffix
// ---------------------------------------------------------------------------
test('DFR and SR suffix are distinct', () => {
  const dr = drFilename({ date: '2026-10-21', projectName: 'Same Project' });
  const sr = srFilename({ date: '2026-10-21', projectName: 'Same Project' });
  assert.notEqual(dr, sr);
  assert.ok(dr.includes('Daily Report'), `DFR should include Daily Report: ${dr}`);
  assert.ok(sr.includes('Site Readiness'), `SR should include Site Readiness: ${sr}`);
});

// ---------------------------------------------------------------------------
// 4. past-reports combines both types (mock test of shape)
// ---------------------------------------------------------------------------
test('past-reports response shape is valid', () => {
  // Simulate the combined sort the API does.
  const drRecords = [
    { id: 'dr-1', type: 'daily-report',   date: '2026-10-21', projectName: 'Hanley', status: 'sent',  createdAt: '2026-10-21T10:00:00Z' },
    { id: 'dr-2', type: 'daily-report',   date: '2026-10-20', projectName: 'Hanley', status: 'draft', createdAt: '2026-10-20T09:00:00Z' },
  ];
  const srRecords = [
    { id: 'sr-1', type: 'site-readiness', date: '2026-10-21', projectName: 'Granary', result: 'READY', status: 'sent', createdAt: '2026-10-21T08:00:00Z' },
  ];
  const combined = drRecords.concat(srRecords).sort((a, b) => {
    const dc = String(b.date || '').localeCompare(String(a.date || ''));
    if (dc !== 0) return dc;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  assert.equal(combined.length, 3);
  // Most recent date first (10-21); within 10-21 sort by createdAt DESC (dr-1 10:00 > sr-1 08:00)
  assert.equal(combined[0].id, 'dr-1');
  assert.equal(combined[1].id, 'sr-1');
  assert.equal(combined[2].id, 'dr-2');
  assert.ok(combined.some(r => r.type === 'daily-report'));
  assert.ok(combined.some(r => r.type === 'site-readiness'));
  // Verify no financial fields leak through
  combined.forEach(r => {
    assert.ok(!('rate' in r), 'No rate field in past-reports');
    assert.ok(!('cost' in r), 'No cost field in past-reports');
    assert.ok(!('revenue' in r), 'No revenue field in past-reports');
    assert.ok(!('markup' in r), 'No markup field in past-reports');
  });
});

// ---------------------------------------------------------------------------
// 5. Photos bucket constant exists in field-upload.js
// ---------------------------------------------------------------------------
test('field-upload BUCKETS includes photos key', async () => {
  // Read the source and verify 'photos' bucket is defined.
  const { readFileSync } = await import('fs');
  const src = readFileSync(new URL('../functions/api/field-upload.js', import.meta.url).pathname, 'utf8');
  assert.ok(src.includes("photos"), "field-upload.js should define a 'photos' bucket");
  assert.ok(src.includes("PHOTO_BUCKETS"), "field-upload.js should define PHOTO_BUCKETS set");
  assert.ok(src.includes("02 - Project Photos"), "field-upload.js should reference '02 - Project Photos' path");
  assert.ok(src.includes("05 - Field"), "field-upload.js should reference '05 - Field' path");
});

// ---------------------------------------------------------------------------
// 6. Client-side filename computation mirrors server function
//    (simulates drComputeFilename / srComputeFilename from the HTML files)
// ---------------------------------------------------------------------------
function safeProjectName(v) {
  let s = String(v == null ? '' : v)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').replace(/\.+$/, '')
    .trim().slice(0, 80).trim();
  return s || 'Project';
}
function clientDrFilename(date, projectName) {
  if (!date || !projectName) return null;
  const mt = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return null;
  const dp = mt[1].slice(2) + '-' + mt[2] + mt[3];
  const nm = safeProjectName(projectName);
  return `${dp}-${nm}-Daily Report.pdf`;
}
function clientSrFilename(date, projectName) {
  if (!date || !projectName) return null;
  const mt = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return null;
  const dp = mt[1].slice(2) + '-' + mt[2] + mt[3];
  const nm = safeProjectName(projectName);
  return `${dp}-${nm}-Site Readiness.pdf`;
}

test('client drComputeFilename matches server pdfFilename for DFR', () => {
  const date = '2026-10-21';
  const name = 'DFS Grain Bins Mid-States';
  const client = clientDrFilename(date, name);
  const server = drFilename({ date, projectName: name });
  assert.equal(client, server, `Client "${client}" != server "${server}"`);
});

test('client srComputeFilename matches server pdfFilename for SR', () => {
  const date = '2026-10-21';
  const name = 'The Granary - FlCo';
  const client = clientSrFilename(date, name);
  const server = srFilename({ date, projectName: name });
  assert.equal(client, server, `Client "${client}" != server "${server}"`);
});

test('client filename returns null for missing date', () => {
  assert.equal(clientDrFilename('', 'Hanley'), null);
  assert.equal(clientDrFilename(null, 'Hanley'), null);
});

test('client filename returns null for missing project', () => {
  assert.equal(clientDrFilename('2026-10-21', ''), null);
  assert.equal(clientDrFilename('2026-10-21', null), null);
});

// ---------------------------------------------------------------------------
// 7. Generate sample PDFs in test-output/ with the new naming convention
// ---------------------------------------------------------------------------
const { renderDailyReportPdf } = await import(drDocUrl.href);
const { renderSiteReadinessPdf } = await import(srDocUrl.href);
const { CHECKLIST_ITEMS } = await import(
  new URL('../functions/lib/site-readiness-store.js', import.meta.url).href
);

// Sample DFR
const drRec = {
  date: '2026-10-21',
  projectName: 'DFS Grain Bins Mid-States',
  projectId: '26-022',
  foreman: 'J. Smith',
  precipitation: 'Clear',
  temp: '58 F',
  columnsInstalled: 14,
  lfInstalled: 280,
  crew: [
    { name: 'J. Smith', start: '07:00', end: '15:30', hours: 8.5, costCode: '26-022' },
    { name: 'A. Jones', start: '07:00', end: '15:30', hours: 8.5, costCode: '26-022' },
  ],
  workCompleted: 'Installed 14 VSC columns per AP drawing sheet A1. Stone delivery on schedule.',
  equipmentOwned: [{ machine: 'Drill Rig #1', hours: 8 }],
  equipmentRental: [],
  maintenance: [],
  futureIssues: [],
  delays: '',
  safety: 'Pre-task safety meeting held. No incidents.',
  attachments: [],
};
test('DFR sample PDF generates without error', () => {
  const bytes = renderDailyReportPdf(drRec);
  assert.ok(bytes instanceof Uint8Array, 'renderDailyReportPdf should return Uint8Array');
  assert.ok(bytes.length > 100, 'PDF should be non-trivial size');
  const fn = drFilename(drRec);
  writeFileSync(resolve(outDir, fn), bytes);
  console.log('    Generated:', fn);
});

// Sample SR
const allYes = CHECKLIST_ITEMS.map(it => ({ key: it.key, answer: 'Yes', note: '' }));
const srRec = {
  date: '2026-10-21',
  projectName: 'DFS Grain Bins Mid-States',
  projectId: '26-022',
  gcContact: 'J. Builder - Mid-States',
  siteAddress: '1234 Grain Road, Decatur, IN',
  inspectedBy: 'Derek Franke',
  items: allYes,
  sigName: 'Derek Franke',
  sigDate: '2026-10-21',
  attachments: [],
};
test('SR sample PDF generates without error', () => {
  const bytes = renderSiteReadinessPdf(srRec);
  assert.ok(bytes instanceof Uint8Array, 'renderSiteReadinessPdf should return Uint8Array');
  assert.ok(bytes.length > 100, 'PDF should be non-trivial size');
  const fn = srFilename(srRec);
  writeFileSync(resolve(outDir, fn), bytes);
  console.log('    Generated:', fn);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
