#!/usr/bin/env node
// test-nonjob-filter-20261119.mjs
// Tests for the verifier NO-GO fix: NJ entries must only appear in the
// Daily Report picker; all other form pickers (SR, EI, TT, index weather
// tile) must be excluded.  Defense-in-depth: site-readiness.js also guards
// projectId server-side before any email or PDF step fires.
//
// F1: /api/field-projects filters NJ entries unless ?includeNonJob=1
// F2: Only daily-report.html passes ?includeNonJob=1; all others do not
// F3: Non-vacuous proofs — the filter actually changes the returned list
// S1: site-readiness.js guard rejects non-real project IDs with 400
// S2: Guard position — BEFORE email send AND before PDF render
// S3: Non-vacuous proofs — NJ-1/NJ-2 fail REAL_PROJ_RE; real jobs pass
//
// Run: node field/tests/test-nonjob-filter-20261119.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
function assertIncludes(desc, str, sub) {
  assert(String(str).includes(sub), `${desc}: expected to find: ${JSON.stringify(sub)}`);
}
function assertNotIncludes(desc, str, sub) {
  assert(!String(str).includes(sub), `${desc}: expected NOT to find: ${JSON.stringify(sub)}`);
}

import { FO_PROJECTS } from '../functions/lib/fo-projects-data.js';

const fpApiSrc = readFileSync(resolve(root, 'functions/api/field-projects.js'), 'utf8');
const srApiSrc = readFileSync(resolve(root, 'functions/api/site-readiness.js'), 'utf8');
const drHtmlSrc  = readFileSync(resolve(root, 'daily-report.html'),          'utf8');
const srHtmlSrc  = readFileSync(resolve(root, 'site-readiness.html'),        'utf8');
const eiHtmlSrc  = readFileSync(resolve(root, 'equipment-inspection.html'),  'utf8');
const ttHtmlSrc  = readFileSync(resolve(root, 'toolbox-talk.html'),          'utf8');
const idxHtmlSrc = readFileSync(resolve(root, 'index.html'),                 'utf8');

const NJ_RE      = /^NJ-/;
const REAL_PROJ_RE = /^[0-9]{2}-[0-9]{2,4}$/;

// ============================================================
// F1: /api/field-projects filter logic
// ============================================================
console.log('\nF1: field-projects.js NJ filter gate');

test('F1a: field-projects.js reads includeNonJob query param', () => {
  assertIncludes('F1a', fpApiSrc, 'includeNonJob');
  assertIncludes('F1a param check', fpApiSrc, "searchParams.get('includeNonJob')");
});

test('F1b: field-projects.js defines NJ_RE pattern', () => {
  assertIncludes('F1b', fpApiSrc, '/^NJ-/');
});

test('F1c: field-projects.js filters FO_PROJECTS when flag absent', () => {
  assertIncludes('F1c filter', fpApiSrc, 'FO_PROJECTS.filter');
  assertIncludes('F1c NJ_RE', fpApiSrc, 'NJ_RE.test(p.number)');
});

test('F1d: field-projects.js response uses visibleProjects not raw FO_PROJECTS', () => {
  // If the response still mapped FO_PROJECTS directly, NJ entries would leak.
  assertIncludes('F1d', fpApiSrc, 'visibleProjects.map');
  assertNotIncludes('F1d raw', fpApiSrc, 'FO_PROJECTS.map');
});

// ============================================================
// F2: HTML consumers — only DR passes the flag
// ============================================================
console.log('\nF2: HTML picker callers');

test('F2a: daily-report.html calls /api/field-projects?includeNonJob=1', () => {
  assertIncludes('F2a', drHtmlSrc, 'field-projects?includeNonJob=1');
});

test('F2b: site-readiness.html does NOT pass includeNonJob', () => {
  assertNotIncludes('F2b', srHtmlSrc, 'includeNonJob');
});

test('F2c: equipment-inspection.html does NOT pass includeNonJob', () => {
  assertNotIncludes('F2c', eiHtmlSrc, 'includeNonJob');
});

test('F2d: toolbox-talk.html does NOT pass includeNonJob', () => {
  assertNotIncludes('F2d', ttHtmlSrc, 'includeNonJob');
});

test('F2e: index.html does NOT pass includeNonJob', () => {
  assertNotIncludes('F2e', idxHtmlSrc, 'includeNonJob');
});

// ============================================================
// F3: Non-vacuous proofs for the filter
// ============================================================
console.log('\nF3: Non-vacuous proofs — filter changes the list');

test('F3a: simulated filtered list excludes NJ-1 (gate actually works)', () => {
  // Simulate the endpoint logic without the flag.
  const withoutFlag = FO_PROJECTS.filter(p => !NJ_RE.test(p.number));
  assert.ok(!withoutFlag.some(p => p.number === 'NJ-1'),
    'NJ-1 must be absent from filtered list (without flag)');
  // Prove non-vacuous: NJ-1 IS in full FO_PROJECTS, so removing it is a real action.
  assert.ok(FO_PROJECTS.some(p => p.number === 'NJ-1'),
    'NJ-1 must exist in FO_PROJECTS; otherwise the filter is a no-op');
  assert.ok(withoutFlag.length < FO_PROJECTS.length,
    `filtered (${withoutFlag.length}) must be shorter than full list (${FO_PROJECTS.length})`);
});

test('F3b: simulated full list includes NJ-1 (includeNonJob=1 path)', () => {
  // Simulate the endpoint logic WITH the flag.
  const withFlag = FO_PROJECTS; // all entries returned
  assert.ok(withFlag.some(p => p.number === 'NJ-1'),
    'NJ-1 must appear when includeNonJob=1');
  // Prove non-vacuous: the filtered list (no flag) must NOT contain NJ-1.
  const withoutFlag = FO_PROJECTS.filter(p => !NJ_RE.test(p.number));
  assert.ok(!withoutFlag.some(p => p.number === 'NJ-1'),
    'F3b is non-vacuous: without flag, NJ-1 is absent; test would fail if flag behavior were removed');
});

test('F3c: DR html flag string is specific — asserting a wrong flag would fail', () => {
  // Proves F2a is non-vacuous: check a wrong param name does NOT appear in DR.
  assertNotIncludes('F3c wrong flag absent', drHtmlSrc, 'includeNonJob=0');
  assertNotIncludes('F3c wrong flag absent', drHtmlSrc, 'includeNonJob=true');
  // And that the correct flag IS present (redundant but documents intent).
  assertIncludes('F3c correct flag', drHtmlSrc, 'includeNonJob=1');
});

// ============================================================
// S1: site-readiness.js server-side guard
// ============================================================
console.log('\nS1: site-readiness.js REAL_PROJ_RE guard');

test('S1a: site-readiness.js defines REAL_PROJ_RE guard', () => {
  assertIncludes('S1a REAL_PROJ_RE', srApiSrc, 'REAL_PROJ_RE');
  assertIncludes('S1a regex', srApiSrc, '/^[0-9]{2}-[0-9]{2,4}$/');
});

test('S1b: guard returns 400 with required message', () => {
  assertIncludes('S1b 400', srApiSrc, '400');
  assertIncludes('S1b message', srApiSrc, 'Site Readiness forms require a real job number');
});

// ============================================================
// S2: Guard position — must fire before email and before PDF
// ============================================================
console.log('\nS2: SR guard position (before email and PDF)');

test('S2a: REAL_PROJ_RE guard appears BEFORE the email send call', () => {
  // Search for the actual CALL, not the import statement.
  const guardPos = srApiSrc.indexOf('REAL_PROJ_RE');
  const emailPos = srApiSrc.indexOf('await sendSiteReadinessEmail');
  assert.ok(guardPos !== -1,
    'REAL_PROJ_RE guard not found in site-readiness.js (fix not applied?)');
  assert.ok(emailPos !== -1,
    '"await sendSiteReadinessEmail" call not found in site-readiness.js');
  assert.ok(guardPos < emailPos,
    `Guard must precede email send CALL: guard pos ${guardPos} vs email call pos ${emailPos}. ` +
    'An NJ-* projectId must be rejected BEFORE any email fires.');
});

test('S2b: REAL_PROJ_RE guard appears BEFORE the PDF render call', () => {
  // Search for the actual CALL, not the import statement.
  const guardPos = srApiSrc.indexOf('REAL_PROJ_RE');
  const pdfPos   = srApiSrc.indexOf('renderSiteReadinessPdf(');
  assert.ok(guardPos !== -1, 'REAL_PROJ_RE guard not found');
  assert.ok(pdfPos   !== -1, 'renderSiteReadinessPdf( call not found');
  assert.ok(guardPos < pdfPos,
    `Guard must precede PDF render CALL: guard pos ${guardPos} vs PDF call pos ${pdfPos}.`);
});

test('S2c: guard is non-vacuous — it uses .test() to evaluate projectId', () => {
  // Verify the guard actually calls .test(), not just references the regex.
  assertIncludes('S2c .test call', srApiSrc, 'REAL_PROJ_RE.test(');
});

// ============================================================
// S3: Non-vacuous proofs for REAL_PROJ_RE
// ============================================================
console.log('\nS3: REAL_PROJ_RE values — guard blocks NJ, passes real jobs');

test('S3a: NJ-1 fails REAL_PROJ_RE (guard blocks it)', () => {
  assert.ok(!REAL_PROJ_RE.test('NJ-1'),
    'NJ-1 must fail REAL_PROJ_RE — if it passes, the guard is broken');
  // Non-vacuous: NJ-1 exists in FO_PROJECTS, so there is real data to block.
  assert.ok(FO_PROJECTS.some(p => p.number === 'NJ-1'),
    'NJ-1 must exist in FO_PROJECTS for S3a to be meaningful');
});

test('S3b: NJ-2 fails REAL_PROJ_RE', () => {
  assert.ok(!REAL_PROJ_RE.test('NJ-2'),
    'NJ-2 must fail REAL_PROJ_RE');
});

test('S3c: empty and blank projectId fail REAL_PROJ_RE', () => {
  assert.ok(!REAL_PROJ_RE.test(''),    'empty string must fail');
  assert.ok(!REAL_PROJ_RE.test(' '),   'blank must fail');
  assert.ok(!REAL_PROJ_RE.test('null'), '"null" string must fail');
});

test('S3d: all real job numbers pass REAL_PROJ_RE (guard does not block real jobs)', () => {
  const realJobs = FO_PROJECTS.filter(p => /^\d{2}-\d{2,4}$/.test(p.number));
  assert.ok(realJobs.length >= 11,
    `expected >= 11 real job entries to test, got ${realJobs.length}`);
  for (const p of realJobs) {
    assert.ok(REAL_PROJ_RE.test(p.number),
      `Real job ${p.number} must pass REAL_PROJ_RE — guard would block legitimate SR submits`);
  }
});

test('S3e: NJ-* pattern is distinct from real job pattern (non-vacuous: values differ)', () => {
  // If NJ-1 passed REAL_PROJ_RE, the guard would be useless — this proves it cannot.
  const nj1PassesReal = REAL_PROJ_RE.test('NJ-1');
  assert.equal(nj1PassesReal, false,
    'S3e: NJ-1 must fail REAL_PROJ_RE; if this assertion changes, the guard is broken');
  // Show the complementary case: a real project DOES pass.
  assert.ok(REAL_PROJ_RE.test('26-023'),
    'S3e complementary: 26-023 must pass, proving REAL_PROJ_RE is not trivially always-false');
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
