#!/usr/bin/env node
// test-dr-nonjob-20261119.mjs
// Tests for the 2026-11-19 non-job entries in the Daily Report drop-down.
// Seth/Brad request: add Farm and Shop entries so crew don't have to pick a
// real job when logging time on the farm or in the shop.
//
// N1: NJ-1 / NJ-2 entries are present in FO_PROJECTS with the right names
// N2: NJ number format does NOT match the NN-NN[N] regex used for real jobs
//     (file uploads are disabled client-side and rejected server-side for NJ-*)
// N3: weather-now.js returns no_location for NJ entries (no coords → silent no-op)
// N4: DR PDF filename generates correctly for NJ project entries
// N5: DR submit payload with NJ project passes the projectName requirement check
// N6: NJ entries appear after all real job entries (sorted ascending by number)
// N7: index.html weather tile fall-back does not break if pf-last-job is 'NJ-1'
//
// Run: node field/tests/test-dr-nonjob-20261119.mjs

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

import { FO_PROJECTS } from '../functions/lib/fo-projects-data.js';
import { JOB_COORDS }  from '../functions/lib/job-coords.js';
import { pdfFilename, safeProjectName } from '../functions/lib/daily-report-doc.js';

const drHtmlSrc  = readFileSync(resolve(root, 'daily-report.html'), 'utf8');
const idxHtmlSrc = readFileSync(resolve(root, 'index.html'), 'utf8');
const uploadSrc  = readFileSync(resolve(root, 'functions/api/field-upload.js'), 'utf8');
const wnowSrc    = readFileSync(resolve(root, 'functions/api/weather-now.js'), 'utf8');

// ============================================================
// N1: Entries present and correctly named
// ============================================================
console.log('\nN1: NJ entries present');

const NJ_ENTRIES = FO_PROJECTS.filter(p => p.number.startsWith('NJ-'));

test('N1a: at least 2 non-job entries exist', () => {
  assert.ok(NJ_ENTRIES.length >= 2, `expected >= 2 NJ entries, got ${NJ_ENTRIES.length}`);
});

test('N1b: NJ-1 entry exists with name "Non-Job: Farm"', () => {
  const e = FO_PROJECTS.find(p => p.number === 'NJ-1');
  assert.ok(e, 'NJ-1 entry missing');
  assert.equal(e.name, 'Non-Job: Farm');
});

test('N1c: NJ-2 entry exists with name "Non-Job: Shop"', () => {
  const e = FO_PROJECTS.find(p => p.number === 'NJ-2');
  assert.ok(e, 'NJ-2 entry missing');
  assert.equal(e.name, 'Non-Job: Shop');
});

test('N1d: NJ entries have null address and city_state (no geocode attempt)', () => {
  for (const e of NJ_ENTRIES) {
    assert.equal(e.address,    null, `${e.number}: address should be null`);
    assert.equal(e.city_state, null, `${e.number}: city_state should be null`);
  }
});

// ============================================================
// N2: NJ number format does NOT match NN-NN[N] regex
// ============================================================
console.log('\nN2: Upload gate — NJ numbers do not match PROJ_NUM_RE');

// The regex used by both the client (selectedProjectNumber) and server (field-upload.js).
const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;

test('N2a: NJ-1 does NOT match NN-NN[N] regex (uploads disabled)', () => {
  assert.ok(!PROJ_NUM_RE.test('NJ-1'), 'NJ-1 should not match PROJ_NUM_RE');
});

test('N2b: NJ-2 does NOT match NN-NN[N] regex (uploads disabled)', () => {
  assert.ok(!PROJ_NUM_RE.test('NJ-2'), 'NJ-2 should not match PROJ_NUM_RE');
});

test('N2c: field-upload.js still uses PROJ_NUM_RE to gate uploads', () => {
  assertIncludes('N2c', uploadSrc, 'PROJ_NUM_RE');
  assertIncludes('N2c test', uploadSrc, 'PROJ_NUM_RE.test(projectNumber)');
});

test('N2d: DR client uses selectedProjectNumber() that requires NN-NN[N] format', () => {
  // The DR client's selectedProjectNumber function checks /^[0-9]{2}-[0-9]{2,4}$/
  assertIncludes('N2d', drHtmlSrc, '/^[0-9]{2}-[0-9]{2,4}$/');
  assertIncludes('N2d test', drHtmlSrc, '.test(v)?v:');
});

// ============================================================
// N3: Weather — no_location for NJ entries
// ============================================================
console.log('\nN3: Weather — NJ entries have no coords → no_location');

test('N3a: NJ-1 has no coords in JOB_COORDS', () => {
  assert.ok(JOB_COORDS['NJ-1'] === undefined || JOB_COORDS['NJ-1'] === null,
    `NJ-1 unexpectedly has coords: ${JSON.stringify(JOB_COORDS['NJ-1'])}`);
});

test('N3b: NJ-2 has no coords in JOB_COORDS', () => {
  assert.ok(JOB_COORDS['NJ-2'] === undefined || JOB_COORDS['NJ-2'] === null,
    `NJ-2 unexpectedly has coords: ${JSON.stringify(JOB_COORDS['NJ-2'])}`);
});

test('N3c: weather-now.js returns no_location for missing coords', () => {
  assertIncludes('N3c', wnowSrc, "status: 'no_location'");
});

test('N3d: DR auto-fill only proceeds when status === ok (NJ → silent no-op)', () => {
  // The client checks: if (!data || data.status !== 'ok') return;
  assertIncludes('N3d', drHtmlSrc, "data.status !== 'ok'");
});

// ============================================================
// N4: PDF filename generates correctly for NJ entries
// ============================================================
console.log('\nN4: PDF filename with NJ project');

test('N4a: pdfFilename for NJ-1 Farm entry generates a valid filename', () => {
  const rec = { date: '2026-11-19', projectId: 'NJ-1', projectName: 'Non-Job: Farm' };
  const name = pdfFilename(rec);
  // Expected: 26-1119-Non-Job Farm-Daily Report.pdf (colon stripped by safeProjectName)
  assert.ok(name.startsWith('26-1119-'), `filename should start with date part: ${name}`);
  assert.ok(name.includes('Non-Job'), `filename should contain "Non-Job": ${name}`);
  assert.ok(name.includes('Farm'),    `filename should contain "Farm": ${name}`);
  assert.ok(name.endsWith('-Daily Report.pdf'), `filename should end with -Daily Report.pdf: ${name}`);
  assert.ok(!name.includes(':'), `colon should be stripped from filename: ${name}`);
});

test('N4b: pdfFilename for NJ-2 Shop entry generates a valid filename', () => {
  const rec = { date: '2026-11-19', projectId: 'NJ-2', projectName: 'Non-Job: Shop' };
  const name = pdfFilename(rec);
  assert.ok(name.startsWith('26-1119-'), `filename should start with date part: ${name}`);
  assert.ok(name.includes('Shop'), `filename should contain "Shop": ${name}`);
  assert.ok(!name.includes(':'), `colon should be stripped: ${name}`);
});

test('N4c: safeProjectName strips colon from "Non-Job: Farm"', () => {
  const safe = safeProjectName('Non-Job: Farm');
  assert.ok(!safe.includes(':'), `colon not stripped: ${safe}`);
  assert.ok(safe.includes('Non-Job'), `Non-Job not present: ${safe}`);
});

// ============================================================
// N5: Submit payload validation — NJ project passes projectName check
// ============================================================
console.log('\nN5: Submit validation for NJ project');

test('N5a: DR client checks projectName (not just projectId) so NJ entries pass', () => {
  // The save() function: if(!body.projectName||!body.projectName.trim()){...return;}
  assertIncludes('N5a', drHtmlSrc, "!body.projectName||!body.projectName.trim()");
});

test('N5b: DR API accepts projectName alone (NJ entries always have a name)', () => {
  // The API: if (!body.projectId && !body.projectName) → 400
  // NJ entries have projectId='NJ-1' AND projectName='Non-Job: Farm' → both present
  // This test just confirms the API code path exists
  const apiSrc = readFileSync(resolve(root, 'functions/api/daily-report.js'), 'utf8');
  assertIncludes('N5b', apiSrc, "!body.projectId && !body.projectName");
});

// ============================================================
// N6: Sort order — NJ entries appear after all real job entries
// ============================================================
console.log('\nN6: Sort order');

test('N6a: NJ entries appear at the end of FO_PROJECTS (sorted after all NN-NN entries)', () => {
  const numbers = FO_PROJECTS.map(p => p.number);
  const lastRealIdx = numbers.map((n, i) => ({ n, i })).filter(x => /^\d/.test(x.n)).slice(-1)[0]?.i ?? -1;
  const firstNjIdx  = numbers.findIndex(n => n.startsWith('NJ-'));
  assert.ok(firstNjIdx > lastRealIdx,
    `NJ entries (first at index ${firstNjIdx}) should be after all real entries (last at ${lastRealIdx})`);
});

test('N6b: array is still sorted ascending (NJ-1 before NJ-2)', () => {
  const numbers = FO_PROJECTS.map(p => p.number);
  const sorted  = [...numbers].sort();
  assert.deepEqual(numbers, sorted, 'FO_PROJECTS not sorted ascending');
});

// ============================================================
// N7: index.html weather tile fall-back when last-job is NJ-1
// ============================================================
console.log('\nN7: Weather tile fall-back for NJ last-job');

test('N7a: index.html falls back to first project if stored job not in current list', () => {
  // This guards against NJ-1 being in localStorage but not in future project lists.
  assertIncludes('N7a', idxHtmlSrc, "projects.find(function(p){return p.number===defaultJob;})");
});

test('N7b: weather tile handles no_location gracefully (NJ-1 has no coords)', () => {
  assertIncludes('N7b', idxHtmlSrc, "data.status === 'no_location'");
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
