#!/usr/bin/env node
// Smoke test: site-readiness-doc.js PDF generation.
//
// Generates a sample Site Readiness PDF (READY + NOT READY variants) and
// writes them to field/test-output/.
// Also exercises pdfFilename() and buildEmailBody().
//
// Run:  node field/tests/test-site-readiness-smoke.mjs
// Output: field/test-output/smoke-site-readiness-READY.pdf
//         field/test-output/smoke-site-readiness-NOT-READY.pdf

import { strict as assert } from 'assert';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dir, '..', 'test-output');
mkdirSync(outDir, { recursive: true });

const docUrl = new URL('../functions/lib/site-readiness-doc.js', import.meta.url);
const { renderSiteReadinessPdf, pdfFilename, buildEmailBody } = await import(docUrl.href);

const { CHECKLIST_ITEMS, computeResult } = await import(
  new URL('../functions/lib/site-readiness-store.js', import.meta.url).href
);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch(e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ---- Build two sample records ----------------------------------------------
const allYes = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'Yes', note: '' }));
const someNo = (CHECKLIST_ITEMS || []).map((d, i) => ({
  key: d.key, answer: i < 2 ? 'No' : 'Yes', note: i < 2 ? 'Not done yet' : ''
}));

const baseRec = {
  id:            'sr_smoke_001',
  projectId:     '26-001',
  projectName:   'Hanley Data Center',
  date:          '2026-10-20',
  gcContact:     'Sunbelt Construction - Mike Thompson',
  siteAddress:   '4800 Industrial Park Dr, Fort Wayne IN 46805',
  inspectedBy:   'Peter (COO)',
  status:        'draft',
  attachments:   [],
  sigName:       'Peter COO',
  sigDate:       '2026-10-20',
  createdAt:     '2026-10-20T17:00:00.000Z',
  updatedAt:     '2026-10-20T17:33:00.000Z',
  updatedBy:     'peter@pierfoundations.com',
};

const readyRes = computeResult(allYes);
const notReadyRes = computeResult(someNo);

const readyRec = Object.assign({}, baseRec, {
  items:     allYes,
  result:    readyRes.result,
  openItems: readyRes.openItems,
});

const notReadyRec = Object.assign({}, baseRec, {
  id:        'sr_smoke_002',
  items:     someNo,
  result:    notReadyRes.result,
  openItems: notReadyRes.openItems,
});

// ---- Tests -----------------------------------------------------------------
console.log('\n--- pdfFilename ---');

test('READY filename uses job# and READY', () => {
  const fn = pdfFilename(readyRec);
  // New format: YY-MMDD-<projectName>-Site Readiness.pdf (per Derek round 2 spec)
  assert.match(fn, /26-1020/, 'date part YY-MMDD missing');
  assert.match(fn, /Hanley Data Center/, 'project name missing');
  assert.match(fn, /Site Readiness/, 'Site Readiness suffix missing');
  console.log('    filename:', fn);
});

test('NOT READY filename uses Site Readiness suffix', () => {
  const fn = pdfFilename(notReadyRec);
  // New format: YY-MMDD-<projectName>-Site Readiness.pdf (result not in filename)
  assert.match(fn, /Site Readiness/, 'Site Readiness suffix missing');
  assert.match(fn, /26-1020/, 'date part missing');
  console.log('    filename:', fn);
});

// ---- Email body ------------------------------------------------------------
console.log('\n--- buildEmailBody ---');

test('email body includes project name', () => {
  const body = buildEmailBody(readyRec);
  assert(body.includes('Hanley Data Center'), 'project name missing from email body');
  assert(body.includes('READY'), 'result missing from email body');
});

test('NOT READY email body lists open items', () => {
  const body = buildEmailBody(notReadyRec);
  assert(body.includes('NOT READY'), 'NOT READY missing from email body');
  assert(body.includes('1a') || body.includes('Open Items'), 'open items not listed');
});

// ---- PDF generation --------------------------------------------------------
console.log('\n--- PDF generation ---');

test('renderSiteReadinessPdf (READY) returns non-empty Uint8Array', () => {
  const bytes = renderSiteReadinessPdf(readyRec);
  assert(bytes instanceof Uint8Array, 'expected Uint8Array');
  assert(bytes.length > 1000, 'PDF suspiciously small: ' + bytes.length + ' bytes');
  // Check PDF header
  const hdr = String.fromCharCode(...bytes.slice(0, 5));
  assert.equal(hdr, '%PDF-', 'does not start with %PDF-');
  console.log('    READY PDF size:', bytes.length, 'bytes');

  const path = resolve(outDir, 'smoke-site-readiness-READY.pdf');
  writeFileSync(path, bytes);
  console.log('    Written:', path);
});

test('renderSiteReadinessPdf (NOT READY) returns non-empty Uint8Array', () => {
  const bytes = renderSiteReadinessPdf(notReadyRec);
  assert(bytes instanceof Uint8Array, 'expected Uint8Array');
  assert(bytes.length > 1000, 'PDF suspiciously small: ' + bytes.length + ' bytes');
  const hdr = String.fromCharCode(...bytes.slice(0, 5));
  assert.equal(hdr, '%PDF-', 'does not start with %PDF-');
  console.log('    NOT READY PDF size:', bytes.length, 'bytes');

  const path = resolve(outDir, 'smoke-site-readiness-NOT-READY.pdf');
  writeFileSync(path, bytes);
  console.log('    Written:', path);
});

// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
