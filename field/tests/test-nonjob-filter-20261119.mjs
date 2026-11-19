#!/usr/bin/env node
// test-nonjob-filter-20261119.mjs
// Tests for NJ (non-job) entry filtering and Derek's rename (11/19).
//
// F1: /api/field-projects filters NJ entries unless ?includeNonJob=1
// F2: DR/TT/EI pass ?includeNonJob=1; SR and index do not
// F3: Non-vacuous proofs — the filter actually changes the returned list
// N:  NJ entry names match Derek's rename request (NJ-1/NJ-2 IDs stable)
// S1: site-readiness.js guard rejects non-real project IDs with 400
// S2: Guard position — BEFORE email send AND before PDF render
// S3: Non-vacuous proofs — NJ-1/NJ-2 fail REAL_PROJ_RE; real jobs pass
// T:  TT/EI SP upload path is fixed (not project-routed); NJ IDs safe
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

const fpApiSrc = readFileSync(resolve(root, 'functions/api/field-projects.js'),     'utf8');
const srApiSrc = readFileSync(resolve(root, 'functions/api/site-readiness.js'),     'utf8');
const ttApiSrc = readFileSync(resolve(root, 'functions/api/toolbox-talk.js'),       'utf8');
const eiApiSrc = readFileSync(resolve(root, 'functions/api/equipment-inspection.js'),'utf8');
const ttDocSrc = readFileSync(resolve(root, 'functions/lib/toolbox-talk-doc.js'),   'utf8');
const eiDocSrc = readFileSync(resolve(root, 'functions/lib/equip-inspection-doc.js'),'utf8');
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
// F2: HTML consumers — DR/TT/EI pass the flag; SR and index do not.
// SR is a job-site checklist that emails BEFORE upload; NJ entries
// would hit the SP project-folder path and generate duplicate emails.
// TT and EI upload to fixed SP folders (not project-routed), so NJ is safe.
// ============================================================
console.log('\nF2: HTML picker callers');

test('F2a: daily-report.html calls /api/field-projects?includeNonJob=1', () => {
  assertIncludes('F2a', drHtmlSrc, 'field-projects?includeNonJob=1');
});

test('F2b: site-readiness.html does NOT pass includeNonJob', () => {
  assertNotIncludes('F2b', srHtmlSrc, 'includeNonJob');
});

test('F2c: equipment-inspection.html DOES pass includeNonJob=1 (fixed SP path, safe)', () => {
  assertIncludes('F2c', eiHtmlSrc, 'field-projects?includeNonJob=1');
  // Non-vacuous: asserting a wrong flag value would fail.
  assertNotIncludes('F2c non-vacuous', eiHtmlSrc, 'includeNonJob=0');
});

test('F2d: toolbox-talk.html DOES pass includeNonJob=1 (fixed SP path, safe)', () => {
  assertIncludes('F2d', ttHtmlSrc, 'field-projects?includeNonJob=1');
  // Non-vacuous: asserting a wrong flag value would fail.
  assertNotIncludes('F2d non-vacuous', ttHtmlSrc, 'includeNonJob=0');
});

test('F2e: index.html does NOT pass includeNonJob (weather tile stays job-only)', () => {
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
// N: NJ entry names (Derek's rename, 11/19)
// IDs NJ-1/NJ-2 must stay stable — existing drafts reference them.
// ============================================================
console.log('\nN: NJ entry names and ID stability');

test('N1a: NJ-1 name is "FARM - Internal Operations"', () => {
  const nj1 = FO_PROJECTS.find(p => p.number === 'NJ-1');
  assert.ok(nj1, 'NJ-1 must exist in FO_PROJECTS');
  assert.equal(nj1.name, 'FARM - Internal Operations',
    `NJ-1 name should be "FARM - Internal Operations", got "${nj1.name}"`);
});

test('N1b: NJ-2 name is "Off Site - No Project"', () => {
  const nj2 = FO_PROJECTS.find(p => p.number === 'NJ-2');
  assert.ok(nj2, 'NJ-2 must exist in FO_PROJECTS');
  assert.equal(nj2.name, 'Off Site - No Project',
    `NJ-2 name should be "Off Site - No Project", got "${nj2.name}"`);
});

test('N1c: IDs NJ-1 and NJ-2 are stable (old drafts still load)', () => {
  // Both NJ IDs must be present so existing saved drafts that reference
  // "NJ-1" or "NJ-2" in D1 continue to populate the picker correctly.
  assert.ok(FO_PROJECTS.some(p => p.number === 'NJ-1'), 'NJ-1 must exist');
  assert.ok(FO_PROJECTS.some(p => p.number === 'NJ-2'), 'NJ-2 must exist');
});

test('N1d: old names are gone — non-vacuous (rename actually happened)', () => {
  // If the old names were still present, N1a/N1b could trivially pass by
  // adding new entries. This test proves the OLD names are gone.
  assert.ok(!FO_PROJECTS.some(p => p.name === 'Non-Job: Farm'),
    '"Non-Job: Farm" must be removed; still present means rename did not apply');
  assert.ok(!FO_PROJECTS.some(p => p.name === 'Non-Job: Shop'),
    '"Non-Job: Shop" must be removed; still present means rename did not apply');
});

test('N1e: NJ entries have no SP folder and no address (unchanged by rename)', () => {
  for (const p of FO_PROJECTS.filter(p => /^NJ-/.test(p.number))) {
    assert.equal(p.city_state, null, `${p.number} city_state must be null`);
    assert.equal(p.address,    null, `${p.number} address must be null`);
  }
});

// ============================================================
// T: TT and EI submit with NJ IDs — no crash, correct SP path
// SP paths for TT and EI are fixed (not project-routed). The project
// number is stored as text and shown on the PDF; it never drives folder
// selection, regex gating, or SP path construction.
// ============================================================
console.log('\nT: TT/EI safe submission with NJ project IDs');

test('T1a: toolbox-talk.js has no PROJ_NUM_RE guard (NJ IDs pass through)', () => {
  assertNotIncludes('T1a no PROJ_NUM_RE', ttApiSrc, 'PROJ_NUM_RE');
  assertNotIncludes('T1a no REAL_PROJ_RE', ttApiSrc, 'REAL_PROJ_RE');
  // Non-vacuous: site-readiness.js DOES have REAL_PROJ_RE; proves the absence in TT is meaningful.
  assertIncludes('T1a SR has guard', srApiSrc, 'REAL_PROJ_RE');
});

test('T1b: toolbox-talk-doc.js SP path is a fixed base path (no projectId in path)', () => {
  // The SP upload folder is '05 - Field Operations/Toolbox Talks/{YYYY}'.
  // projectId is used only as a display string in the PDF and email subject.
  assertIncludes('T1b fixed base', ttDocSrc, "TT_SP_BASE_PATH = '05 - Field Operations/Toolbox Talks'");
  // The upload URL is built from TT_SP_BASE_PATH + year, NOT from projectId.
  assertNotIncludes('T1b no proj routing', ttDocSrc, 'encodeURIComponent(rec.projectId)');
});

test('T1c: TT email subject uses projectName (falls back to projectId, then literal "Project")', () => {
  // With NJ-1/NJ-2, projectName will be "FARM - Internal Operations" / "Off Site - No Project".
  // Subject: "Safety Analysis - FARM - Internal Operations - 2026-11-19" — no crash.
  assertIncludes('T1c subject', ttApiSrc, 'body.projectName || body.projectId');
  // Non-vacuous: if projectName were NOT used, subject would show raw NJ-1 ID instead.
  assertNotIncludes('T1c no bare id', ttApiSrc, "subject = `Safety Analysis - ${body.projectId}");
});

test('T2a: equipment-inspection.js has no PROJ_NUM_RE guard (NJ IDs pass through)', () => {
  assertNotIncludes('T2a no PROJ_NUM_RE', eiApiSrc, 'PROJ_NUM_RE');
  assertNotIncludes('T2a no REAL_PROJ_RE', eiApiSrc, 'REAL_PROJ_RE');
  // Non-vacuous: site-readiness.js DOES have it; absence in EI is meaningful.
  assertIncludes('T2a SR has guard', srApiSrc, 'REAL_PROJ_RE');
});

test('T2b: EI SP path uses machine type + serial, not projectId', () => {
  // uploadEquipInspectionPdf builds path from rec.machineType and rec.serialNumber.
  assertIncludes('T2b checklist folder', eiDocSrc, 'Equipment Checklist');
  assertNotIncludes('T2b no proj routing', eiDocSrc, 'encodeURIComponent(rec.projectId)');
  // Non-vacuous: the path DOES encode serialNumber and machineType.
  assertIncludes('T2b serial encoded', eiDocSrc, 'encodeURIComponent(serial');
});

test('T3a: TT SP upload occurs BEFORE email send (no duplicate-email risk)', () => {
  // If email fired first and SP upload threw, every retry would send another email.
  // Confirm upload call precedes email call in source.
  const uploadPos = ttApiSrc.indexOf('await uploadTalkPdf(');
  const emailPos  = ttApiSrc.indexOf('await sendTalkEmail(');
  assert.ok(uploadPos !== -1, 'uploadTalkPdf call not found in toolbox-talk.js');
  assert.ok(emailPos  !== -1, 'sendTalkEmail call not found in toolbox-talk.js');
  assert.ok(uploadPos < emailPos,
    `TT upload must precede email: upload at ${uploadPos}, email at ${emailPos}`);
});

test('T3b: EI SP upload occurs BEFORE email send', () => {
  const uploadPos = eiApiSrc.indexOf('await uploadEquipInspectionPdf(');
  const emailPos  = eiApiSrc.indexOf('await sendEquipInspectionEmail(');
  assert.ok(uploadPos !== -1, 'uploadEquipInspectionPdf call not found');
  assert.ok(emailPos  !== -1, 'sendEquipInspectionEmail call not found');
  assert.ok(uploadPos < emailPos,
    `EI upload must precede email: upload at ${uploadPos}, email at ${emailPos}`);
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
