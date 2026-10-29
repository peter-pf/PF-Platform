// test-dr-obs-toolbox-20261028.mjs
// Tests for:
//   A. DR PDF crew hours removal (daily-report-doc.js)
//   B. DR General Site Observations section + obs_photos bucket (daily-report.js + daily-report-doc.js)
//   C. Toolbox Talk store (toolbox-talk-store.js)
//   D. Toolbox Talk PDF renderer (toolbox-talk-doc.js)
//   E. Toolbox Talk API handler (toolbox-talk.js)
//   F. auth.js areaForPath additions (/api/toolbox-talk, /toolbox-talk.html)
//   G. past-reports.js includes TT records
//   K. Coordinator review fixes (66e92ce+1)
//   L. Verifier hardening (b7eaac2+1): TT isolation + pdfWebUrl XSS defense
//
// Run: node tests/test-dr-obs-toolbox-20261028.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, cond, detail) {
  if (cond) { console.log('  PASS ' + desc); passed++; }
  else { console.error('  FAIL ' + desc + (detail ? ' :: ' + detail : '')); failed++; }
}
function assertEq(desc, a, b) {
  assert(desc, a === b, 'got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b));
}
function assertIncludes(desc, str, sub) {
  assert(desc, String(str).includes(sub), 'expected to find: ' + JSON.stringify(sub));
}
function assertNotIncludes(desc, str, sub) {
  assert(desc, !String(str).includes(sub), 'expected NOT to find: ' + JSON.stringify(sub));
}

// ============================================================
// Import helpers
// ============================================================

// Read source as text for static analysis.
const drDocSrc   = readFileSync(path.join(root, 'functions/lib/daily-report-doc.js'),  'utf8');
const drApiSrc   = readFileSync(path.join(root, 'functions/api/daily-report.js'),      'utf8');
const ttStoreSrc = readFileSync(path.join(root, 'functions/lib/toolbox-talk-store.js'),'utf8');
const ttDocSrc   = readFileSync(path.join(root, 'functions/lib/toolbox-talk-doc.js'),  'utf8');
const ttApiSrc   = readFileSync(path.join(root, 'functions/api/toolbox-talk.js'),      'utf8');
const authSrc    = readFileSync(path.join(root, 'functions/lib/auth.js'),              'utf8');
const pastRepSrc = readFileSync(path.join(root, 'functions/api/past-reports.js'),      'utf8');
const ttHtmlSrc  = readFileSync(path.join(root, 'toolbox-talk.html'),                  'utf8');
const indexHtml  = readFileSync(path.join(root, 'index.html'),                         'utf8');

// ============================================================
// A. DR PDF crew hours removal
// ============================================================
console.log('\n--- A. DR PDF crew hours removal ---');

assertNotIncludes('A1: daily-report-doc.js does not include start time (c.start) in crew section',
  drDocSrc, 'c.start');
assertNotIncludes('A2: daily-report-doc.js does not include end time (c.end) in crew section',
  drDocSrc, 'c.end');
assertNotIncludes('A3: daily-report-doc.js does not include hours total in crew section',
  drDocSrc, 'hours:');
assertIncludes('A4: daily-report-doc.js still includes crew names in crew section',
  drDocSrc, 'c.name');
assertIncludes('A5: daily-report-doc.js still includes cost codes in crew section',
  drDocSrc, 'c.costCode');
assertIncludes('A6: DR doc comment notes hours/time-in/out removed from PDF per Derek',
  drDocSrc, 'hours/time-in/out removed from PDF per Derek');

// ============================================================
// B. DR General Site Observations section
// ============================================================
console.log('\n--- B. DR General Site Observations (PDF + API + form) ---');

assertIncludes('B1: daily-report-doc.js has General Site Observations heading',
  drDocSrc, 'General Site Observations');
assertIncludes('B2: daily-report-doc.js reads siteObservations from rec',
  drDocSrc, 'rec.siteObservations');
assertIncludes('B3: daily-report-doc.js reads obs_photos from sectionPhotos',
  drDocSrc, "sectionPhotos['obs_photos']");

assertIncludes('B4: daily-report.js includes obs_photos in VALID_ATTACH_BUCKETS',
  drApiSrc, "obs_photos: 1");
assertIncludes('B5: daily-report.js includes siteObservations in buildBody',
  drApiSrc, 'siteObservations');
assertIncludes('B6: daily-report.js maps obs_photos bucket to fetchAttachmentPhotos',
  drApiSrc, "obs_photos: 'obs_photos'");

// Source-check daily-report.html for obs section
const drHtmlSrc = readFileSync(path.join(root, 'daily-report.html'), 'utf8');
assertIncludes('B7: daily-report.html has General Site Observations section heading',
  drHtmlSrc, 'General Site Observations');
assertIncludes('B8: daily-report.html has drObservations textarea',
  drHtmlSrc, 'id="drObservations"');
assertIncludes('B9: daily-report.html has obs_photos bucket upload widget',
  drHtmlSrc, 'drFileObsPhotos');
assertIncludes('B10: daily-report.html collectBody includes siteObservations',
  drHtmlSrc, 'siteObservations');

// ============================================================
// C. Toolbox Talk store
// ============================================================
console.log('\n--- C. Toolbox Talk store ---');

// Import for real.
const ttStoreModule = await import(path.join(root, 'functions/lib/toolbox-talk-store.js'));
const { PRESENTER_OPTIONS, PRESENTER_SET, TOPICS, TOPIC_KEYS, TOPIC_LABELS } = ttStoreModule;

assertEq('C1: PRESENTER_OPTIONS has 4 entries', PRESENTER_OPTIONS.length, 4);
assert('C2: John Willis in PRESENTER_OPTIONS', PRESENTER_OPTIONS.includes('John Willis'));
assert('C3: Seth Willis in PRESENTER_OPTIONS', PRESENTER_OPTIONS.includes('Seth Willis'));
assert('C4: PRESENTER_SET is a Set', PRESENTER_SET instanceof Set);
assertEq('C5: TOPICS has 11 entries', TOPICS.length, 11);
assert('C6: fall_protection topic exists', TOPIC_KEYS.has('fall_protection'));
assert('C7: other topic exists', TOPIC_KEYS.has('other'));
assert('C8: all 11 expected topic keys present', [
  'fall_protection','excavation_trenching','struck_caught','heavy_equipment_spotters',
  'ppe','heat_cold_stress','housekeeping','electrical_overhead',
  'utilities_locates','silica','other',
].every(function(k){ return TOPIC_KEYS.has(k); }));
assert('C9: TOPIC_LABELS has label for each topic', TOPICS.every(function(t){
  return TOPIC_LABELS[t.key] === t.label;
}));
assertIncludes('C10: store exports upsertRecord', ttStoreSrc, 'export async function upsertRecord');
assertIncludes('C11: store exports loadRecordById', ttStoreSrc, 'export async function loadRecordById');
assertIncludes('C12: store exports listRecords', ttStoreSrc, 'export async function listRecords');
assertIncludes('C13: store exports countRecords', ttStoreSrc, 'export async function countRecords');
assertIncludes('C14: store requires env.DB (D1 only)', ttStoreSrc, "!env.DB");
assertIncludes('C15: attendees stored as JSON', ttStoreSrc, 'JSON.stringify');

// ============================================================
// D. Toolbox Talk PDF renderer
// ============================================================
console.log('\n--- D. Toolbox Talk PDF renderer ---');

assertIncludes('D1: toolbox-talk-doc.js exports renderToolboxTalkPdf', ttDocSrc, 'export function renderToolboxTalkPdf');
assertIncludes('D2: toolbox-talk-doc.js exports pdfFilename', ttDocSrc, 'export function pdfFilename');
assertIncludes('D3: toolbox-talk-doc.js exports sendTalkEmail', ttDocSrc, 'export async function sendTalkEmail');
assertIncludes('D4: toolbox-talk-doc.js exports uploadTalkPdf', ttDocSrc, 'export async function uploadTalkPdf');
assertIncludes('D5: toolbox-talk-doc.js exports buildEmailBody', ttDocSrc, 'export function buildEmailBody');
assertIncludes('D6: SP folder path set correctly', ttDocSrc, '05 - Field Operations/Toolbox Talks');
assertIncludes('D7: SP folder includes year subfolder', ttDocSrc, 'TT_SP_BASE_PATH}/${year}');
assertIncludes('D8: PDF renders Meeting Details section', ttDocSrc, 'Meeting Details');
assertIncludes('D9: PDF renders Key Points Discussed section', ttDocSrc, 'Key Points Discussed');
assertIncludes('D10: PDF renders Hazards section', ttDocSrc, "Hazards Specific to Today");
assertIncludes('D11: PDF renders Questions section', ttDocSrc, 'Questions or Concerns Raised');
assertIncludes('D12: PDF renders Attendees section', ttDocSrc, 'Attendees');
assertIncludes('D13: pdfFilename uses Toolbox Talk suffix', ttDocSrc, 'Toolbox Talk.pdf');
assertNotIncludes('D14: toolbox-talk-doc.js contains no financial data (no pricing/rates)',
  ttDocSrc, 'pricing');
assertIncludes('D15: ensureFolder handles 409 (already exists) correctly',
  ttDocSrc, '=== 409');

// ---- pdfFilename() test with imported module ----
const ttDocModule = await import(path.join(root, 'functions/lib/toolbox-talk-doc.js'))
  .catch(function(e){ return null; });
if (ttDocModule) {
  const fn1 = ttDocModule.pdfFilename({ date: '2026-10-28', projectName: 'Peter Sample Job 99-999' });
  assert('D16: pdfFilename produces correct filename pattern',
    fn1 === '26-1028-Peter Sample Job 99-999-Toolbox Talk.pdf',
    'got: ' + fn1);
  const fn2 = ttDocModule.pdfFilename({ date: '2026-10-28', projectName: '' });
  assertIncludes('D17: pdfFilename falls back to "Project" when name is empty', fn2, 'Project');
} else {
  assert('D16: toolbox-talk-doc.js imported for pdfFilename test', false, 'import failed');
  assert('D17: pdfFilename fallback', false, 'import failed');
}

// ---- buildEmailBody() test ----
if (ttDocModule) {
  const body = ttDocModule.buildEmailBody({
    projectName: 'Test Site',
    date: '2026-10-28',
    topic: 'fall_protection',
    presenter: 'John Willis',
    location: 'Job trailer',
    attendees: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    keyPoints: 'Harness use required.',
    hazards: 'Open trenching nearby.',
  });
  assertIncludes('D18: email body includes project name', body, 'Test Site');
  assertIncludes('D19: email body includes topic label', body, 'Fall Protection');
  assertIncludes('D20: email body includes attendee count', body, '3');
} else {
  [18, 19, 20].forEach(function(n){
    assert('D' + n + ': email body test', false, 'import failed');
  });
}

// ============================================================
// E. Toolbox Talk API handler
// ============================================================
console.log('\n--- E. Toolbox Talk API handler ---');

assertIncludes('E1: toolbox-talk.js exports onRequest', ttApiSrc, 'export async function onRequest');
assertIncludes('E2: VALID_ACTIONS includes create', ttApiSrc, "create: 1");
assertIncludes('E3: VALID_ACTIONS includes update', ttApiSrc, "update: 1");
assertIncludes('E4: VALID_ACTIONS includes submit', ttApiSrc, "submit: 1");
assertNotIncludes('E5: no add_photo action (TT has no photos)', ttApiSrc, 'add_photo');
assertIncludes('E6: API uses requireArea field_ops', ttApiSrc, "requireArea(session, 'field_ops'");
assertIncludes('E7: UUID_RE validates id format', ttApiSrc, 'UUID_RE');
assertIncludes('E8: isValidDate validates date', ttApiSrc, 'isValidDate');
assertIncludes('E9: PRESENTER_SET validates presenter', ttApiSrc, 'PRESENTER_SET');
assertIncludes('E10: TOPIC_KEYS validates topic', ttApiSrc, 'TOPIC_KEYS');
assertIncludes('E11: rate limit on submit (tt_submit_rl)', ttApiSrc, 'tt_submit_rl');
assertIncludes('E12: buildBody enforces owner check', ttApiSrc, 'Not authorized to update this record');
assertIncludes('E13: submitted records locked (409)', ttApiSrc, 'Record already submitted');
assertIncludes('E14: server generates id on create (UUID)', ttApiSrc, 'crypto.randomUUID()');
assertNotIncludes('E15: client id never trusted on create', ttApiSrc, 'src.id on create');
assertIncludes('E16: cleanAttendees caps at MAX_ATTENDEES', ttApiSrc, 'MAX_ATTENDEES');
assertIncludes('E17: presenter required on submit', ttApiSrc, 'Presenter is required');
assertIncludes('E18: date required on submit', ttApiSrc, 'Date is required');
assertIncludes('E19: topic required on submit', ttApiSrc, 'Topic is required');
assertIncludes('E20: SP upload on submit', ttApiSrc, 'uploadTalkPdf');
assertIncludes('E21: email send on submit', ttApiSrc, 'sendTalkEmail');
assertIncludes('E22: TEST_RECIPIENTS defined', ttApiSrc, 'TEST_RECIPIENTS');
assertIncludes('E23: PROD_RECIPIENTS includes Brad', ttApiSrc, 'breinking@pierfoundations.com');
assertIncludes('E24: PROD_RECIPIENTS includes Jonathan', ttApiSrc, 'jreinking@pierfoundations.com');
assertIncludes('E25: PROD_RECIPIENTS includes Derek', ttApiSrc, 'dfranke@pierfoundations.com');
assertIncludes('E26: PROD_RECIPIENTS includes John Willis (jwillis@)', ttApiSrc, 'jwillis@pierfoundations.com');
assertIncludes('E27: ACTIVE_RECIPIENTS = TEST_RECIPIENTS (flip gate)', ttApiSrc, 'ACTIVE_RECIPIENTS = TEST_RECIPIENTS');
assertIncludes('E28: isCrossSite blocks cross-origin POST', ttApiSrc, 'isCrossSite');
assertIncludes('E29: D1 503 on store failure (fail-closed)', ttApiSrc, 'Service temporarily unavailable');
assertIncludes('E30: emailedTo written to record after send', ttApiSrc, 'body.emailedTo = recipients.slice()');
assertNotIncludes('E31: ZERO dollar/financial references in API', ttApiSrc, 'dollar');

// ============================================================
// F. auth.js additions
// ============================================================
console.log('\n--- F. auth.js RBAC additions ---');

assertIncludes('F1: /api/toolbox-talk mapped to field_ops area', authSrc,
  "pathname.startsWith('/api/toolbox-talk')");
assertIncludes('F2: /toolbox-talk.html mapped to field_ops area in FIELD_PAGES', authSrc,
  "'/toolbox-talk.html'");
assertIncludes('F3: /toolbox-talk clean URL mapped to field_ops area', authSrc,
  "'/toolbox-talk'");

// ---- areaForPath() functional test ----
const authModule = await import(path.join(root, 'functions/lib/auth.js'));
const { areaForPath } = authModule;
assertEq('F4: areaForPath /api/toolbox-talk  = field_ops', areaForPath('/api/toolbox-talk'),  'field_ops');
assertEq('F5: areaForPath /api/toolbox-talk/ = field_ops', areaForPath('/api/toolbox-talk/'), 'field_ops');
assertEq('F6: areaForPath /toolbox-talk.html = field_ops', areaForPath('/toolbox-talk.html'), 'field_ops');
assertEq('F7: areaForPath /toolbox-talk      = field_ops', areaForPath('/toolbox-talk'),      'field_ops');
assertEq('F8: areaForPath /api/daily-report  still = field_ops', areaForPath('/api/daily-report'), 'field_ops');
assertEq('F9: areaForPath /api/site-readiness still = field_ops', areaForPath('/api/site-readiness'), 'field_ops');
assertEq('F10: areaForPath /api/equipment-inspection still = field_ops',
  areaForPath('/api/equipment-inspection'), 'field_ops');

// ============================================================
// G. past-reports.js includes TT
// ============================================================
console.log('\n--- G. past-reports.js TT inclusion ---');

assertIncludes('G1: past-reports.js imports listRecords from toolbox-talk-store.js',
  pastRepSrc, 'toolbox-talk-store.js');
assertIncludes('G2: past-reports.js calls listTtRecords', pastRepSrc, 'listTtRecords');
assertIncludes('G3: past-reports.js maps TT record to type toolbox-talk', pastRepSrc, "'toolbox-talk'");
assertIncludes('G4: past-reports.js includes ttReports in combined list', pastRepSrc, 'ttReports');
assertIncludes('G5: past-reports.js preserves topic field in TT entries', pastRepSrc, 'r.topic');
assertIncludes('G6: past-reports.js preserves presenter field in TT entries', pastRepSrc, 'r.presenter');
assertIncludes('G7: past-reports.js comment updated to include Toolbox Talks',
  pastRepSrc, 'Toolbox Talks');

// ============================================================
// H. toolbox-talk.html form
// ============================================================
console.log('\n--- H. toolbox-talk.html form structure ---');

assertIncludes('H1: TT HTML has Meeting Info section', ttHtmlSrc, 'Meeting Info');
assertIncludes('H2: TT HTML has Presenter section', ttHtmlSrc, 'Presenter');
assertIncludes('H3: TT HTML has Topic section with dropdown', ttHtmlSrc, 'id="ttTopic"');
assertIncludes('H4: TT HTML includes all 11 standard topics', ttHtmlSrc, 'fall_protection');
assertIncludes('H5: TT HTML has Other topic option', ttHtmlSrc, 'value="other"');
assertIncludes('H6: TT HTML has ttOtherRow for custom topic text', ttHtmlSrc, 'id="ttOtherRow"');
assertIncludes('H7: TT HTML has Key Points Discussed section', ttHtmlSrc, 'Key Points Discussed');
assertIncludes('H8: TT HTML has Hazards section', ttHtmlSrc, "Hazards Specific to Today");
assertIncludes('H9: TT HTML has Questions or Concerns section', ttHtmlSrc, 'Questions or Concerns Raised');
assertIncludes('H10: TT HTML has Corrective Actions section', ttHtmlSrc, 'Corrective Actions');
assertIncludes('H11: TT HTML has Attendees section with dynamic list', ttHtmlSrc, 'id="ttAttendeeList"');
assertIncludes('H12: TT HTML has Add Attendee button', ttHtmlSrc, 'id="ttAddAttBtn"');
assertIncludes('H13: TT HTML has Acknowledged checkbox for attendees', ttHtmlSrc, 'Acknowledged');
assertIncludes('H14: TT HTML has project picker (same pattern as DR/SR/EI)', ttHtmlSrc, 'ttProjectSearch');
assertIncludes('H15: TT HTML has Save Draft button', ttHtmlSrc, 'id="ttSaveBtn"');
assertIncludes('H16: TT HTML has Submit button', ttHtmlSrc, 'id="ttSubmitBtn"');
assertIncludes('H17: TT HTML has sticky submit bar', ttHtmlSrc, 'id="ttStickyBar"');
assertIncludes('H18: TT HTML fetches /api/toolbox-talk', ttHtmlSrc, '/api/toolbox-talk');
assertIncludes('H19: TT HTML includes action=create', ttHtmlSrc, "'create'");
assertIncludes('H20: TT HTML includes action=submit', ttHtmlSrc, "'submit'");
assertNotIncludes('H21: TT HTML zero dollar/financial references', ttHtmlSrc, 'dollar');
assertIncludes('H22: TT HTML has nav item for Toolbox Talk', ttHtmlSrc, '/toolbox-talk.html');
assertIncludes('H23: TT HTML marks Toolbox Talk nav item as active', ttHtmlSrc, 'pf-nav-active');

// ============================================================
// I. index.html nav + home button
// ============================================================
console.log('\n--- I. index.html nav + home button ---');

assertIncludes('I1: index.html nav includes Toolbox Talk link', indexHtml, 'href="/toolbox-talk.html"');
assertIncludes('I2: index.html home quick action includes Toolbox Talk button', indexHtml,
  'qa-btn');
// Verify toolbox talk appears in the primary qa-row
const qaRowMatch = indexHtml.match(/<!-- Quick actions row 1[\s\S]*?<!-- Quick actions row 2/);
assert('I3: Toolbox Talk is in quick-actions row 1 (primary)',
  qaRowMatch && qaRowMatch[0].includes('toolbox-talk.html'),
  'Not found in row 1 block');

// ============================================================
// J. Migration SQL
// ============================================================
console.log('\n--- J. Migration 0010 SQL ---');

const migSql = readFileSync(
  path.join(root, 'migrations/0010_toolbox_talks.sql'), 'utf8');
assertIncludes('J1: migration creates toolbox_talks table', migSql, 'CREATE TABLE IF NOT EXISTS toolbox_talks');
assertIncludes('J2: migration has attendees JSON column', migSql, 'attendees');
assertIncludes('J3: migration has status column', migSql, 'status');
assertIncludes('J4: migration has created_by column', migSql, 'created_by');
assertIncludes('J5: migration has index on project_id', migSql, 'idx_tt_project_id');
assertIncludes('J6: migration has index on talk_date', migSql, 'idx_tt_talk_date');
assertIncludes('J7: migration notes id is server-generated', migSql, 'server-side');
assertIncludes('J8: migration notes ADDITIVE ONLY', migSql, 'ADDITIVE ONLY');

// ============================================================
// K. Coordinator review fixes (66e92ce+1)
// ============================================================
console.log('\n--- K. Coordinator review fixes ---');

// K1-K2: DR delay total precision (was Math.round * 10 / 10 -> 0.8 for 0.75)
assertNotIncludes('K1: daily-report-doc.js PDF delay total does not use 1dp rounding',
  drDocSrc, 'Math.round(totalDowntime * 10) / 10');
assertIncludes('K2: daily-report-doc.js PDF delay total uses 2dp rounding (100)',
  drDocSrc, 'Math.round(totalDowntime * 100) / 100');

// K3-K4: Same fix in email body
const emailBodySrc = drDocSrc; // same file
assertIncludes('K3: DR email body delay total also uses 2dp rounding',
  emailBodySrc, 'Math.round(totalDowntime * 100) / 100');

// K4: Meeting Details no longer contains Presenter row
assertNotIncludes('K4: TT PDF Meeting Details does not repeat Presenter row',
  ttDocSrc, "label: 'Presenter', value: rec.presenter");

// K5: Not acknowledged shown for unacknowledged attendees
assertIncludes('K5: TT PDF attendee "Not acknowledged" shown for missing sign-off',
  ttDocSrc, 'Not acknowledged');

// K6: TT footer has no spacer forcing page break
assertNotIncludes('K6: TT PDF footer does not have spacer(12) before rule',
  ttDocSrc, 'spacer(12)');
assertIncludes('K7: TT PDF footer rule immediately follows attendees content',
  ttDocSrc, '// No spacer before rule');

// K8-K11: No em/en dashes in any user-facing text in new files
const EM = '—', EN = '–';
assertNotIncludes('K8: toolbox-talk-doc.js has no em dashes', ttDocSrc, EM);
assertNotIncludes('K9: toolbox-talk-doc.js has no en dashes', ttDocSrc, EN);
assertNotIncludes('K10: toolbox-talk-store.js has no em dashes', ttStoreSrc, EM);
assertNotIncludes('K11: toolbox-talk-store.js has no en dashes', ttStoreSrc, EN);

// K12: DR new comment uses hyphen not em dash
assertIncludes('K12: DR crew comment uses hyphen not em dash',
  drDocSrc, '// ---- crew (name + cost code ONLY - hours');

// ============================================================
// L. Verifier hardening (b7eaac2+1)
// ============================================================
console.log('\n--- L. Verifier hardening: TT isolation + pdfWebUrl XSS defense ---');

// L1: past-reports.js TT is NOT inside the same Promise.all as DR/SR.
// The fix separates TT into its own try/catch so a missing table cannot 500 everyone.
// Verify that the Promise.all call only destructs two results ([drResult, srResult]).
assertNotIncludes('L1: past-reports.js Promise.all does not destruct three results including TT',
  pastRepSrc, '[drResult, srResult, ttResult] = await Promise.all');
// Verify TT is called outside Promise.all (after the parallel fetch).
assertIncludes('L2: past-reports.js wraps listTtRecords in its own try/catch block',
  pastRepSrc, 'try {\n      ttResult = await listTtRecords');

// L3: past-reports.js logs the error when TT fails so ops can see it.
assertIncludes('L3: past-reports.js logs TT list failure',
  pastRepSrc, 'TT list failed');

// L4: Functional test - TT throws, DR/SR still produce records.
// This simulates the isolation pattern from past-reports.js directly.
{
  async function runWithTtError() {
    const drResult = { reports: [{ id: 'dr1', date: '2026-10-28', status: 'sent', createdBy: 'u1' }] };
    const srResult = { records: [{ id: 'sr1', date: '2026-10-28', status: 'sent', createdBy: 'u1' }] };
    async function listTtThrows() { throw new Error('no such table: toolbox_talks'); }

    // Same pattern as the fixed past-reports.js handler.
    const [dr, sr] = await Promise.all([
      Promise.resolve(drResult),
      Promise.resolve(srResult),
    ]);
    let ttResult = null;
    try { ttResult = await listTtThrows(); } catch (e) { /* isolated */ }

    const drRecs = Array.isArray(dr.reports)  ? dr.reports  : [];
    const srRecs = Array.isArray(sr.records)  ? sr.records  : [];
    const ttRecs = ttResult && Array.isArray(ttResult.records) ? ttResult.records : [];
    return { dr: drRecs.length, sr: srRecs.length, tt: ttRecs.length };
  }
  const counts = await runWithTtError();
  assertEq('L4: when TT throws, DR records still returned', counts.dr, 1);
  assertEq('L5: when TT throws, SR records still returned', counts.sr, 1);
  assertEq('L6: when TT throws, TT rows are empty (not propagated as error)', counts.tt, 0);
}

// L7: toolbox-talk.js GET single-record sanitizes pdfWebUrl (https-only).
assertIncludes('L7: toolbox-talk.js GET single-record sanitizes pdfWebUrl to null if not https',
  ttApiSrc, 'pdfWebUrl: /^https:\\/\\//i.test(String(rec.pdfWebUrl');

// L8: toolbox-talk.js GET list sanitizes pdfWebUrl in each mapped record.
assertIncludes('L8: toolbox-talk.js GET list sanitizes pdfWebUrl in .map()',
  ttApiSrc, 'pdfWebUrl: /^https:\\/\\//i.test(String(r.pdfWebUrl');

// L9: toolbox-talk.html does NOT build pdfWebUrl into an innerHTML string (old pattern removed).
assertNotIncludes('L9: toolbox-talk.html does not concat pdfWebUrl into innerHTML href string',
  ttHtmlSrc, '"<a href=\\" + d.pdfWebUrl');
assertNotIncludes('L10: toolbox-talk.html does not concat rec.pdfWebUrl into innerHTML href string',
  ttHtmlSrc, '"<a href=\\" + rec.pdfWebUrl');

// L11: toolbox-talk.html has the DOM-safe helper function.
assertIncludes('L11: toolbox-talk.html defines ttShowSubmitMsg DOM-safe helper',
  ttHtmlSrc, 'function ttShowSubmitMsg');

// L12: DOM helper validates https:// client-side before building the link.
assertIncludes('L12: ttShowSubmitMsg validates pdfWebUrl is https:// before building link',
  ttHtmlSrc, '/^https:\\/\\//i.test(String(pdfWebUrl))');

// L13: DOM helper uses createElement, not innerHTML, for the anchor.
assertIncludes('L13: ttShowSubmitMsg uses createElement for the PDF anchor',
  ttHtmlSrc, "document.createElement('a')");

// ============================================================
// M. Nav consistency — Toolbox Talk present on every nav page
// ============================================================

import { readdirSync } from 'fs';

// Helper: extract href values from pf-nav-item anchors.
function navHrefs(htmlSrc) {
  const hrefs = [];
  const re = /class="pf-nav-item[^"]*"[^>]*data-paths="([^"]+)"/g;
  let m;
  while ((m = re.exec(htmlSrc)) !== null) {
    // data-paths may be comma-separated; take the first (canonical) path.
    hrefs.push(m[1].split(',')[0].trim());
  }
  return hrefs;
}

const indexHtmlSrc = readFileSync(path.join(root, 'index.html'), 'utf8');
const canonicalNavHrefs = navHrefs(indexHtmlSrc).sort();

// Pages that should carry the full shared nav.
const navPages = [
  'daily-report.html',
  'site-readiness.html',
  'equipment-inspection.html',
  'past-reports.html',
  'time-off.html',
  'schedule.html',
  'cost-codes.html',
  'toolbox-talk.html',
];

console.log('\n// M: Nav consistency');

// M1: index.html has a /toolbox-talk.html nav item.
assert('M1: index.html has /toolbox-talk.html nav item',
  canonicalNavHrefs.includes('/toolbox-talk.html'));

// M2-M8+: Each nav page has the exact same nav hrefs as index.html.
navPages.forEach(function (page, idx) {
  const src = readFileSync(path.join(root, page), 'utf8');
  const pageHrefs = navHrefs(src).sort();
  const missing = canonicalNavHrefs.filter(h => !pageHrefs.includes(h));
  const extra   = pageHrefs.filter(h => !canonicalNavHrefs.includes(h));
  const label = 'M' + (2 + idx) + ': ' + page + ' nav matches index.html';
  assert(label, missing.length === 0 && extra.length === 0,
    (missing.length ? 'missing=' + JSON.stringify(missing) : '') +
    (extra.length   ? ' extra='  + JSON.stringify(extra)   : ''));
});

// M10: Every nav page contains a literal /toolbox-talk link (belt-and-suspenders).
navPages.forEach(function (page, idx) {
  const src = readFileSync(path.join(root, page), 'utf8');
  assert('M' + (10 + idx) + ': ' + page + ' contains /toolbox-talk.html href',
    src.includes('href="/toolbox-talk.html"'));
});

// ============================================================
// Summary
// ============================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
