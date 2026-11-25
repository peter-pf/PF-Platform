#!/usr/bin/env node
// test-farm-photo-upload-20261125.mjs
// Tests for FARM / Off Site (NJ-*) photo upload support in the Daily Report.
//
// Derek 11/25: Seth tried to attach a picture on a FARM (NJ-1) daily report.
// Upload was blocked because the upload guard required a real NN-NNN job number.
//
// Root cause:
//   CLIENT  daily-report.html:selectedProjectNumber() — only accepted /^[0-9]{2}-[0-9]{2,4}$/
//           daily-report.html:uploadFiles()           — returned early when !num
//   SERVER  field-upload.js:L376                     — PROJ_NUM_RE rejected 'NJ-1' with 400
//           field-upload.js:L402                     — resolveProjectFolder would fail (no proj folder)
//
// Fix: dual-regex guard (PROJ_NUM_RE OR NJ_NUM_RE) on both client and server.
//   NJ uploads route to: 05 - Field Operations/Internal Operations/Daily Report Photos/<date>/<bucket>/
//   obs_photos bucket also added to server BUCKETS dict (was missing, broke obs upload for all jobs).
//
// Groups:
//   A: NJ_NUM_RE + PROJ_NUM_RE validation parity
//   B: Server BUCKETS dict — obs_photos added, NJ_FOLDER_PATHS defined
//   C: Server validation accepts NJ-1 / NJ-2; rejects unknown NJ-*
//   D: Client selectedProjectNumber() accepts NJ-1 / NJ-2
//   E: Client upload inputs enabled for NJ projects; hint text updated
//   F: Click-test harness — uploadFiles() does NOT short-circuit for NJ-1
//   G: Job project upload path unchanged (regression guard)
//   H: obs_photos bucket routing present for job projects
//
// Run: node field/tests/test-farm-photo-upload-20261125.mjs

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

const uploadSrc  = readFileSync(resolve(root, 'functions/api/field-upload.js'), 'utf8');
const drHtmlSrc  = readFileSync(resolve(root, 'daily-report.html'), 'utf8');
const projectsSrc = readFileSync(resolve(root, 'functions/lib/fo-projects-data.js'), 'utf8');

// ============================================================
// A: NJ_NUM_RE + PROJ_NUM_RE validation parity
// ============================================================
console.log('\nA: NJ_NUM_RE + PROJ_NUM_RE validation parity');

const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;
const NJ_NUM_RE   = /^NJ-[0-9]+$/;

test('A1: NJ-1 does NOT match PROJ_NUM_RE (is a non-job entry, not a real job)', () => {
  assert.ok(!PROJ_NUM_RE.test('NJ-1'), 'NJ-1 should not match PROJ_NUM_RE');
});
test('A2: NJ-2 does NOT match PROJ_NUM_RE', () => {
  assert.ok(!PROJ_NUM_RE.test('NJ-2'), 'NJ-2 should not match PROJ_NUM_RE');
});
test('A3: NJ-1 matches NJ_NUM_RE', () => {
  assert.ok(NJ_NUM_RE.test('NJ-1'), 'NJ-1 should match NJ_NUM_RE');
});
test('A4: NJ-2 matches NJ_NUM_RE', () => {
  assert.ok(NJ_NUM_RE.test('NJ-2'), 'NJ-2 should match NJ_NUM_RE');
});
test('A5: real job number matches PROJ_NUM_RE', () => {
  assert.ok(PROJ_NUM_RE.test('26-027'), '26-027 should match PROJ_NUM_RE');
  assert.ok(PROJ_NUM_RE.test('25-026'), '25-026 should match PROJ_NUM_RE');
});
test('A6: garbage does NOT match either regex', () => {
  assert.ok(!PROJ_NUM_RE.test('garbage') && !NJ_NUM_RE.test('garbage'), 'garbage should fail both');
  assert.ok(!PROJ_NUM_RE.test('') && !NJ_NUM_RE.test(''), 'empty string should fail both');
  assert.ok(!PROJ_NUM_RE.test('NJ-') && !NJ_NUM_RE.test('NJ-'), 'bare NJ- should fail both');
});
test('A7: server field-upload.js defines NJ_NUM_RE', () => {
  assertIncludes('A7', uploadSrc, 'const NJ_NUM_RE');
  assertIncludes('A7 pattern', uploadSrc, '/^NJ-[0-9]+$/');
});
test('A8: server field-upload.js defines NJ_FOLDER_PATHS', () => {
  assertIncludes('A8', uploadSrc, 'const NJ_FOLDER_PATHS');
  assertIncludes('A8 NJ-1', uploadSrc, "'NJ-1'");
  assertIncludes('A8 NJ-2', uploadSrc, "'NJ-2'");
});

// ============================================================
// B: Server BUCKETS dict — obs_photos added, NJ_FOLDER_PATHS complete
// ============================================================
console.log('\nB: Server BUCKETS dict and NJ_FOLDER_PATHS');

test('B1: obs_photos is in server BUCKETS dict', () => {
  assertIncludes('B1', uploadSrc, "obs_photos:");
  assertIncludes('B1 value', uploadSrc, "'Observation Photos'");
});
test('B2: obs_photos image-only ext in BUCKET_EXT map', () => {
  assertIncludes('B2', uploadSrc, "['obs_photos',    IMAGE_ONLY_EXT]");
});
test('B3: NJ-1 maps to Internal Operations folder path', () => {
  assertIncludes('B3', uploadSrc, '05 - Field Operations/Internal Operations/Daily Report Photos');
});
test('B4: NJ-2 maps to Off Site folder path', () => {
  assertIncludes('B4', uploadSrc, '05 - Field Operations/Off Site/Daily Report Photos');
});
test('B5: NJ_FOLDER_PATHS explicitly keys NJ-1 and NJ-2 (guards against arbitrary NJ-*)', () => {
  // Both keys must be present in the constant definition
  const nj1Idx = uploadSrc.indexOf("'NJ-1':");
  const nj2Idx = uploadSrc.indexOf("'NJ-2':");
  assert.ok(nj1Idx >= 0, "NJ-1 key missing from NJ_FOLDER_PATHS");
  assert.ok(nj2Idx >= 0, "NJ-2 key missing from NJ_FOLDER_PATHS");
});

// ============================================================
// C: Server validation accepts NJ-1 / NJ-2; rejects unknown NJ-*
// ============================================================
console.log('\nC: Server validation logic');

test('C1: server uses NJ_NUM_RE test for non-job entries', () => {
  assertIncludes('C1', uploadSrc, 'NJ_NUM_RE.test(projectNumber)');
});
test('C2: server accepts upload when NJ_NUM_RE matches AND NJ_FOLDER_PATHS has the key', () => {
  // The guard: if (!PROJ_NUM_RE.test(projectNumber) && !isNjProject) → reject
  // So NJ-1 (matches NJ_NUM_RE → isNjProject=true) passes the first check.
  // Then: if (isNjProject && !NJ_FOLDER_PATHS has key) → reject
  // NJ-1 IS in NJ_FOLDER_PATHS → passes second check too.
  assertIncludes('C2 isNjProject', uploadSrc, 'const isNjProject = NJ_NUM_RE.test(projectNumber)');
  assertIncludes('C2 unknown NJ guard', uploadSrc, "Unknown non-job entry");
});
test('C3: server rejects project numbers that fail BOTH PROJ_NUM_RE AND NJ_NUM_RE', () => {
  assertIncludes('C3', uploadSrc, '!PROJ_NUM_RE.test(projectNumber) && !isNjProject');
});
test('C4: server PROJ_NUM_RE validation is still present (job projects unchanged)', () => {
  assertIncludes('C4', uploadSrc, 'PROJ_NUM_RE.test(projectNumber)');
});
test('C5: NJ branch calls ensureNjDestination instead of resolveProjectFolder', () => {
  assertIncludes('C5 nj branch', uploadSrc, 'isNjProject');
  assertIncludes('C5 nj dest', uploadSrc, 'ensureNjDestination');
});
test('C6: job branch still calls resolveProjectFolder', () => {
  assertIncludes('C6', uploadSrc, 'resolveProjectFolder(env, token, projectNumber)');
});

// ============================================================
// D: Client selectedProjectNumber() accepts NJ-1 / NJ-2
// ============================================================
console.log('\nD: Client selectedProjectNumber()');

test('D1: client selectedProjectNumber() contains NJ-* regex', () => {
  assertIncludes('D1', drHtmlSrc, '/^NJ-[0-9]+$/.test(v)');
});
test('D2: client still contains the real-job PROJ_NUM_RE pattern', () => {
  assertIncludes('D2', drHtmlSrc, '/^[0-9]{2}-[0-9]{2,4}$/');
});
test('D3: client has isNonJobProject() helper', () => {
  assertIncludes('D3', drHtmlSrc, 'function isNonJobProject(num)');
  assertIncludes('D3 pattern', drHtmlSrc, '/^NJ-[0-9]+$/.test(String(num');
});

// Simulate selectedProjectNumber() logic (without a real DOM):
function simSelectedProjectNumber(v) {
  v = String(v || '').trim();
  return (/^[0-9]{2}-[0-9]{2,4}$/.test(v) || /^NJ-[0-9]+$/.test(v)) ? v : '';
}

test('D4: selectedProjectNumber() returns NJ-1 for NJ-1 input', () => {
  assert.equal(simSelectedProjectNumber('NJ-1'), 'NJ-1');
});
test('D5: selectedProjectNumber() returns NJ-2 for NJ-2 input', () => {
  assert.equal(simSelectedProjectNumber('NJ-2'), 'NJ-2');
});
test('D6: selectedProjectNumber() returns job number for real job', () => {
  assert.equal(simSelectedProjectNumber('26-027'), '26-027');
  assert.equal(simSelectedProjectNumber('25-026'), '25-026');
});
test('D7: selectedProjectNumber() returns empty for no-match inputs', () => {
  assert.equal(simSelectedProjectNumber(''), '');
  assert.equal(simSelectedProjectNumber('garbage'), '');
  assert.equal(simSelectedProjectNumber('NJ-'), '');
});

// ============================================================
// E: Client upload inputs enabled for NJ projects; hint text updated
// ============================================================
console.log('\nE: Client upload enabled + hint text for NJ');

test('E1: updateUploadEnabled() uses isNonJobProject() check', () => {
  assertIncludes('E1', drHtmlSrc, 'var isNJ=isNonJobProject(num)');
});
test('E2: updateUploadEnabled() shows NJ-specific hint when isNJ', () => {
  assertIncludes('E2', drHtmlSrc, 'if(num&&isNJ)');
  assertIncludes('E2 hint', drHtmlSrc, '05 - Field Operations / Daily Report Photos');
});
test('E3: job hints still present for non-NJ projects', () => {
  assertIncludes('E3 photos hint', drHtmlSrc, "else if(num)");
  assertIncludes('E3 photos text', drHtmlSrc, "02 Project Photos folder");
});
test('E4: upload disabled when no project selected', () => {
  assertIncludes('E4', drHtmlSrc, "hint.textContent='Select a project first to enable uploads.'");
});

// ============================================================
// F: Click-test harness — uploadFiles() does NOT short-circuit for NJ-1
// ============================================================
console.log('\nF: Click-test harness — uploadFiles() fires for NJ-1 (FARM)');

// The key behavior: uploadFiles() calls selectedProjectNumber() → gets 'NJ-1'
// (truthy) → passes the !num guard → proceeds to XHR to /api/field-upload.
// We test the click handler is wired and the guard is correct by inspecting source.

test('F1: uploadFiles() checks !num early guard (in-flight guard intact)', () => {
  // The guard: if(!num){upMsg(bk,'Select a project first.',false);return;}
  assertIncludes('F1', drHtmlSrc, "if(!num){upMsg(bk,'Select a project first.',false);return;}");
});
test('F2: uploadFiles() calls selectedProjectNumber() (not a hardcoded real-job check)', () => {
  // If NJ-1 is now returned by selectedProjectNumber(), num='NJ-1' is truthy →
  // the guard passes → XHR fires. This confirms the click handler WILL fire.
  assertIncludes('F2', drHtmlSrc, 'var num=selectedProjectNumber();');
  // Confirm the guard is `!num` (not a regex check inside uploadFiles itself):
  const uploadFilesStart = drHtmlSrc.indexOf('function uploadFiles(bk,files){');
  const uploadFilesEnd   = drHtmlSrc.indexOf('function extOk(', uploadFilesStart);
  const fnBody = drHtmlSrc.slice(uploadFilesStart, uploadFilesEnd);
  assertIncludes('F2 no-proj guard', fnBody, "if(!num){upMsg(bk,'Select a project first.',false);return;}");
  assertNotIncludes('F2 no inline PROJ_NUM_RE in uploadFiles', fnBody, 'PROJ_NUM_RE');
});
test('F3: uploadFiles() appends projectNumber to FormData (NJ-1 sent to server)', () => {
  assertIncludes('F3', drHtmlSrc, "fd.append('projectNumber',num)");
});
test('F4: file input change handler calls uploadFiles() (click/change wires through)', () => {
  // The change listener that fires uploadFiles when files are selected
  assertIncludes('F4', drHtmlSrc, 'if(files.length){uploadFiles(bk,files);}');
});

// Simulate the uploadFiles guard logic with NJ-1:
function simUploadFilesGuard(projectNum) {
  // selectedProjectNumber() now returns NJ-1 (truthy) for NJ projects.
  // Guard: if(!num) return early.
  const num = simSelectedProjectNumber(projectNum);
  if (!num) return 'BLOCKED: Select a project first.';
  return 'PROCEEDS: num=' + num;
}

test('F5: upload guard for NJ-1 (FARM) returns truthy num, does not block', () => {
  const result = simUploadFilesGuard('NJ-1');
  assert.ok(result.startsWith('PROCEEDS'), `NJ-1 should proceed, got: ${result}`);
  assert.ok(result.includes('NJ-1'), `result should contain NJ-1: ${result}`);
});
test('F6: upload guard for NJ-2 (Off Site) returns truthy num, does not block', () => {
  const result = simUploadFilesGuard('NJ-2');
  assert.ok(result.startsWith('PROCEEDS'), `NJ-2 should proceed, got: ${result}`);
});
test('F7: upload guard for empty selection still blocks', () => {
  const result = simUploadFilesGuard('');
  assert.ok(result.startsWith('BLOCKED'), `empty should be blocked, got: ${result}`);
});
test('F8: upload guard for real job proceeds as before', () => {
  const result = simUploadFilesGuard('26-027');
  assert.ok(result.startsWith('PROCEEDS'), `26-027 should proceed, got: ${result}`);
  assert.ok(result.includes('26-027'), `result should contain job number: ${result}`);
});

// ============================================================
// G: Job project upload path unchanged (regression guard)
// ============================================================
console.log('\nG: Job project upload path unchanged');

test('G1: PROJ_NUM_RE still used to identify real job projects', () => {
  assertIncludes('G1', uploadSrc, 'const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/');
});
test('G2: resolveProjectFolder still called for real job projects', () => {
  // Ensure the job branch still uses resolveProjectFolder
  assertIncludes('G2', uploadSrc, 'const proj = await resolveProjectFolder(env, token, projectNumber)');
});
test('G3: ensureDestination still called for real job projects', () => {
  assertIncludes('G3', uploadSrc, 'destFolderId = await ensureDestination(env, token, proj.id, reportDate, bucketKey, bucketFolderName)');
});
test('G4: QAQC path still exists for handlogs/guhma (job default branch)', () => {
  assertIncludes('G4', uploadSrc, "'03 - Engineering & Design'");
  assertIncludes('G4 qaqc', uploadSrc, "'QAQC'");
});
test('G5: PHOTO_BUCKETS path still exists for site photos on jobs', () => {
  assertIncludes('G5', uploadSrc, "PHOTO_BUCKETS.has(bucketKey)");
  assertIncludes('G5 path', uploadSrc, "'02 - Project Photos'");
});
test('G6: PREDRILL_BUCKETS path still exists for predrill on jobs', () => {
  assertIncludes('G6', uploadSrc, "PREDRILL_BUCKETS.has(bucketKey)");
  assertIncludes('G6 path', uploadSrc, "'Predrill Markup'");
});

// ============================================================
// H: obs_photos bucket routing added for job projects
// ============================================================
console.log('\nH: obs_photos bucket routing for job projects');

test('H1: OBS_PHOTO_BUCKETS defined in server', () => {
  assertIncludes('H1', uploadSrc, "const OBS_PHOTO_BUCKETS = new Set(['obs_photos'])");
});
test('H2: obs_photos routes to 05 - Field/Observations path in job projects', () => {
  assertIncludes('H2 check', uploadSrc, 'OBS_PHOTO_BUCKETS.has(bucketKey)');
  assertIncludes('H2 path', uploadSrc, "'Observations'");
});
test('H3: obs_photos in BUCKETS with label "Observation Photos"', () => {
  assertIncludes('H3', uploadSrc, "obs_photos:    'Observation Photos'");
});
test('H4: fo-projects-data.js comment reflects NJ uploads ARE now supported', () => {
  assertIncludes('H4', projectsSrc, 'File uploads (photos, obs_photos, handlogs, guhma, predrill) ARE supported');
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
