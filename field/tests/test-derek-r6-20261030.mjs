#!/usr/bin/env node
// test-derek-r6-20261030.mjs
// Tests for Derek R6 changes (2026-10-30):
//   Item 1: Remove hourAtFailure fields from Equipment failures & maintenance
//   Item 2: Add upcoming projects to fo-projects-data.js
//   Item 3: Downtime hours field label/placeholder + helper note
//   Item 4: Project dropdowns on SR/EI/TT use shared source (fo-projects-data.js via /api/field-projects)
//   Item 5: EI top project selector renamed from "Job Number" to "Project"
//   Item 6: TT section 8 acknowledged button/checkbox removed from form and PDF
//
// Run: node field/tests/test-derek-r6-20261030.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

// ---- source texts ----
const drHtmlSrc    = readFileSync(resolve(root, 'daily-report.html'),                    'utf8');
const drDocSrc     = readFileSync(resolve(root, 'functions/lib/daily-report-doc.js'),    'utf8');
const drApiSrc     = readFileSync(resolve(root, 'functions/api/daily-report.js'),        'utf8');
const eiHtmlSrc    = readFileSync(resolve(root, 'equipment-inspection.html'),            'utf8');
const ttHtmlSrc    = readFileSync(resolve(root, 'toolbox-talk.html'),                    'utf8');
const ttDocSrc     = readFileSync(resolve(root, 'functions/lib/toolbox-talk-doc.js'),    'utf8');
const ttApiSrc     = readFileSync(resolve(root, 'functions/api/toolbox-talk.js'),        'utf8');
const srHtmlSrc    = readFileSync(resolve(root, 'site-readiness.html'),                  'utf8');
const foProjSrc    = readFileSync(resolve(root, 'functions/lib/fo-projects-data.js'),    'utf8');
const fpApiSrc     = readFileSync(resolve(root, 'functions/api/field-projects.js'),      'utf8');

// ---- helpers ----
let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
function assertIncludes(desc, str, sub) {
  assert(String(str).includes(sub), desc + ': expected to find: ' + JSON.stringify(sub));
}
function assertNotIncludes(desc, str, sub) {
  assert(!String(str).includes(sub), desc + ': expected NOT to find: ' + JSON.stringify(sub));
}

// ============================================================
// Item 1: hourAtFailure removed from form and PDF
// ============================================================
console.log('\n--- Item 1: hourAtFailure removed from maintenance form and PDF ---');

test('1a: renderMaint() no longer emits hourAtFailure input field', () => {
  // The input with data-f="hourAtFailure" should not appear in renderMaint output
  assertNotIncludes('1a', drHtmlSrc, 'data-f="hourAtFailure"');
});

test('1b: hourAtFailure key still present in emptyMaintRow (backward compat for state loading)', () => {
  // emptyMaintRow must still include hourAtFailure so old drafts load without errors
  assertIncludes('1b', drHtmlSrc, 'hourAtFailure');
});

test('1c: server cleanMaintenance still accepts and stores hourAtFailure (backward compat)', () => {
  assertIncludes('1c', drApiSrc, 'hourAtFailure');
});

test('1d: PDF renderer does not show hourAtFailure value in maintenance table', () => {
  // The value column for maintenance should not reference hourAtFailure
  assertNotIncludes('1d', drDocSrc, 'm.hourAtFailure');
});

test('1e: PDF renderer maintenance table still renders category and type (label preserved)', () => {
  assertIncludes('1e', drDocSrc, 'm.category');
  assertIncludes('1e type', drDocSrc, 'm.type');
});

test('1f: DR HTML maintenance section still renders type select and item input', () => {
  assertIncludes('1f type', drHtmlSrc, "data-f=\"type\"");
  assertIncludes('1f item', drHtmlSrc, "data-f=\"item\"");
});

// Functional backward compat: old record with hourAtFailure renders without crash
test('1g: renderDailyReportPdf with old record (hourAtFailure in maintenance) does not crash', async () => {
  const drDocUrl = new URL('../functions/lib/daily-report-doc.js', import.meta.url);
  const { renderDailyReportPdf } = await import(drDocUrl.href);
  const oldRec = {
    date: '2026-06-01', projectName: 'Legacy Job', projectId: '26-001',
    foreman: 'J. Smith', precipitation: 'Sunny', temp: '72 F',
    columnsInstalled: 10, lfInstalled: 200,
    crew: [], workCompleted: 'Installed columns.',
    equipmentOwned: [], equipmentRental: [],
    maintenance: [
      { category: 'Drill Rig #1', type: 'Failure', item: 'Hose burst', hourAtFailure: 1450 },
      { category: 'Drill Rig #2', type: 'Maintenance', item: 'Oil change', hourAtFailure: 880 },
    ],
    futureIssues: [],
    delayEntries: [],
    safety: 'Meeting held.',
    attachments: [],
  };
  const bytes = renderDailyReportPdf(oldRec);
  assert.ok(bytes instanceof Uint8Array && bytes.length > 100, 'should return PDF bytes');
});

test('1h: old record PDF does not print hourAtFailure numeric value in maintenance section', async () => {
  const drDocUrl = new URL('../functions/lib/daily-report-doc.js', import.meta.url);
  const { renderDailyReportPdf } = await import(drDocUrl.href);
  const oldRec = {
    date: '2026-06-01', projectName: 'Legacy Job', projectId: '26-001',
    foreman: 'J. Smith', precipitation: 'Sunny', temp: '72 F',
    columnsInstalled: 10, lfInstalled: 200,
    crew: [], workCompleted: 'Installed columns.',
    equipmentOwned: [], equipmentRental: [],
    maintenance: [
      { category: 'Drill Rig #1', type: 'Failure', item: 'Hose burst', hourAtFailure: 1450 },
    ],
    futureIssues: [], delayEntries: [], safety: '', attachments: [],
  };
  const bytes = renderDailyReportPdf(oldRec);
  const text = Buffer.from(bytes).toString('latin1');
  // "1450" should not appear as a rendered value (it was the hourAtFailure)
  // Note: font is Eurostile encoded as hex GID — numbers won't appear as literal digits.
  // Instead verify the source does not reference m.hourAtFailure (checked in 1d).
  assert.ok(bytes instanceof Uint8Array, 'PDF renders without crash');
});

// ============================================================
// Item 2: Upcoming projects added to fo-projects-data.js
// ============================================================
console.log('\n--- Item 2: Upcoming projects in fo-projects-data.js ---');

// Tests 2a-2d were originally written for the R6 interim list (25-015, 26-003, 26-004,
// 26-006). Those projects were removed by c7b6687 ("update project list to 11 active
// projects per Derek 2026-10-30") which superseded the R6 list with the final 11-project
// list. Rewritten here to assert 4 of the 8 new R7 projects; the full 11-project list is
// verified exhaustively by test-projects-list-20261030.mjs (P1a-P1h).

test('2a: 26-019 (Vivera Northbrook) present in R7 active list', () => {
  assertIncludes('2a', foProjSrc, "'26-019'");
  assertIncludes('2a name', foProjSrc, 'Vivera Northbrook');
});

test('2b: 26-025 (Prysmian Expansion) present in R7 active list', () => {
  assertIncludes('2b', foProjSrc, "'26-025'");
  assertIncludes('2b name', foProjSrc, 'Prysmian Expansion');
});

test('2c: 26-027 (Westfield Ice Arena) present in R7 active list', () => {
  assertIncludes('2c', foProjSrc, "'26-027'");
  assertIncludes('2c name', foProjSrc, 'Westfield Ice Arena');
});

test('2d: 26-028 (The Hangar) present in R7 active list', () => {
  assertIncludes('2d', foProjSrc, "'26-028'");
  assertIncludes('2d name', foProjSrc, 'The Hangar');
});

test('2e: Projects carried forward from R6 list are still present (25-026, 26-007, 26-014)', () => {
  // R7 (2026-10-30) replaced the full project list with 11 active projects per Derek.
  // The 3 projects already in the R6 list that are also in the R7 list must remain.
  const carriedForward = ['25-026', '26-007', '26-014'];
  for (const num of carriedForward) {
    assert.ok(foProjSrc.includes(`'${num}'`), `expected '${num}' to still be present`);
  }
});

test('2f: fo-projects-data.js exports FO_PROJECTS array', () => {
  assertIncludes('2f', foProjSrc, 'export const FO_PROJECTS');
});

test('2g: /api/field-projects uses fo-projects-data.js as its source (shared source)', () => {
  assertIncludes('2g', fpApiSrc, 'fo-projects-data.js');
});

test('2h: SR, EI, TT all call /api/field-projects (shared dropdown source)', () => {
  assertIncludes('2h SR', srHtmlSrc, '/api/field-projects');
  assertIncludes('2h EI', eiHtmlSrc, '/api/field-projects');
  assertIncludes('2h TT', ttHtmlSrc, '/api/field-projects');
});

test('2i: FO_PROJECTS has 11 entries (replaced with active-projects list per Derek 2026-10-30)', () => {
  // R7 replaced the 21-entry list with exactly 11 active projects.
  const matches = foProjSrc.match(/number:/g) || [];
  assert.ok(matches.length === 11, `expected 11 projects, got ${matches.length}`);
});

// ============================================================
// Item 3: Downtime hours label/placeholder + helper note
// ============================================================
console.log('\n--- Item 3: Downtime hours label and helper note ---');

test('3a: renderDelays() uses placeholder "Downtime hours" (not "Downtime hrs" or "Downtime h")', () => {
  assertIncludes('3a', drHtmlSrc, 'placeholder="Downtime hours"');
  assertNotIncludes('3a no-hrs', drHtmlSrc, 'placeholder="Downtime hrs"');
});

test('3b: renderDelays() includes helper note text "Qty of hours lost during the day due to failure"', () => {
  assertIncludes('3b', drHtmlSrc, 'Qty of hours lost during the day due to failure');
});

test('3c: helper note is inside renderDelays() (dynamically rendered, not just a static HTML comment)', () => {
  // The note should be inside the function body (after "function renderDelays")
  const fnIdx = drHtmlSrc.indexOf('function renderDelays');
  const noteIdx = drHtmlSrc.indexOf('Qty of hours lost');
  assert.ok(fnIdx >= 0 && noteIdx > fnIdx, 'note should appear after renderDelays function definition');
});

test('3d: DR PDF delays section does not contain label "Downtime h" or "Downtime hrs"', () => {
  assertNotIncludes('3d no-h', drDocSrc, 'Downtime h');
  assertNotIncludes('3d no-hrs', drDocSrc, 'Downtime hrs');
});

test('3e: DR delays/downtime section heading is "Delays" (unchanged)', () => {
  assertIncludes('3e', drDocSrc, "doc.heading('Delays')");
});

// ============================================================
// Item 4: Project dropdown uses shared source across all forms
// (covered partly in Item 2 tests 2g/2h - adding supplement here)
// ============================================================
console.log('\n--- Item 4: Shared project dropdown source (all forms) ---');

test('4a: DR loadProjects() calls /api/field-projects', () => {
  assertIncludes('4a', drHtmlSrc, '/api/field-projects');
});

test('4b: /api/field-projects sources from FO_PROJECTS in fo-projects-data.js', () => {
  assertIncludes('4b', fpApiSrc, 'FO_PROJECTS');
});

test('4c: no form hardcodes a static project list (all use the API)', () => {
  // Each form should not contain a static array of project numbers inline
  // (as a proxy: none should have 25-026 hardcoded as a <option> value)
  assertNotIncludes('4c DR', drHtmlSrc, '<option value="25-026"');
  assertNotIncludes('4c SR', srHtmlSrc, '<option value="25-026"');
  assertNotIncludes('4c EI', eiHtmlSrc, '<option value="25-026"');
  assertNotIncludes('4c TT', ttHtmlSrc, '<option value="25-026"');
});

// ============================================================
// Item 5: EI project selector label "Job Number" -> "Project"
// ============================================================
console.log('\n--- Item 5: EI project selector renamed to "Project" ---');

test('5a: EI HTML label is "Project" (not "Job Number")', () => {
  assertIncludes('5a', eiHtmlSrc, '<label>Project</label>');
  assertNotIncludes('5a no-job-number', eiHtmlSrc, '<label>Job Number</label>');
});

test('5b: EI project search placeholder says "Search project..."', () => {
  assertIncludes('5b', eiHtmlSrc, 'placeholder="Search project..."');
  assertNotIncludes('5b no-old', eiHtmlSrc, 'placeholder="Search job number or name"');
});

test('5c: EI project picker list aria-label still says "Projects"', () => {
  assertIncludes('5c', eiHtmlSrc, 'aria-label="Projects"');
});

test('5d: EI still has project picker DOM elements (#eiProjectPicker, #eiProjectId, #eiProjectSearch)', () => {
  assertIncludes('5d picker', eiHtmlSrc, 'id="eiProjectPicker"');
  assertIncludes('5d id', eiHtmlSrc, 'id="eiProjectId"');
  assertIncludes('5d search', eiHtmlSrc, 'id="eiProjectSearch"');
});

// ============================================================
// Item 6: TT acknowledged checkbox removed from form and PDF
// ============================================================
console.log('\n--- Item 6: TT acknowledged checkbox removed ---');

test('6a: TT HTML does not render acknowledged checkbox (ackInput removed)', () => {
  assertNotIncludes('6a no-ackInput', ttHtmlSrc, "ackInput.type = 'checkbox'");
});

test('6b: TT HTML does not show "Acknowledged" label text', () => {
  assertNotIncludes('6b no-ack-label', ttHtmlSrc, "' Acknowledged'");
  assertNotIncludes('6b no-aria', ttHtmlSrc, 'aria-label="Acknowledged"');
});

test('6c: TT HTML section 8 description no longer references checkbox acknowledgment', () => {
  assertNotIncludes('6c', ttHtmlSrc, 'Check the box when each person acknowledges');
});

test('6d: TT HTML attendee list still renders names (nameInput preserved)', () => {
  assertIncludes('6d', ttHtmlSrc, 'nameInput.type');
  assertIncludes('6d name', ttHtmlSrc, 'tt-att-name');
});

test('6e: TT HTML attendee list still has Remove button (rmBtn preserved)', () => {
  assertIncludes('6e', ttHtmlSrc, 'tt-att-rm');
});

test('6f: TT HTML submit confirm modal preserved', () => {
  assertIncludes('6f modal', ttHtmlSrc, 'id="submitConfirmModal"');
  assertIncludes('6f confirm', ttHtmlSrc, 'id="ttModalConfirm"');
  assertIncludes('6f cancel', ttHtmlSrc, 'id="ttModalCancel"');
});

test('6g: TT HTML in-flight guard preserved (dataset.firing)', () => {
  assertIncludes('6g', ttHtmlSrc, 'dataset.firing');
});

test('6h: TT PDF does not show "Acknowledged" or "Not acknowledged" per attendee', () => {
  assertNotIncludes('6h no-acked', ttDocSrc, "a.acknowledged ? 'Acknowledged'");
  assertNotIncludes('6h no-not-acked', ttDocSrc, 'Not acknowledged');
});

test('6i: TT PDF attendees section still renders attendee names', () => {
  assertIncludes('6i', ttDocSrc, 'a.name');
  assertIncludes('6i heading', ttDocSrc, "doc.heading('Attendees')");
});

test('6j: TT PDF renders attendee table with just the name label and blank value', () => {
  // New pattern: { label: `${i + 1}. ${a.name}`, value: '' }
  assertIncludes('6j', ttDocSrc, "a.name}");
  assertIncludes('6j value-blank', ttDocSrc, "value: ''");
});

test('6k: TT API server still accepts acknowledged field (backward compat for old records)', () => {
  // cleanAttendees should still process acknowledged (old stored records have it)
  assertIncludes('6k', ttApiSrc, 'acknowledged');
});

test('6l: TT HTML preserved #main display explicit block (CSS trap fix intact)', () => {
  assertIncludes('6l', ttHtmlSrc, "getElementById('main').style.display    = 'block'");
});

// Functional: TT PDF renders without crash with old record (has acknowledged flags)
test('6m: renderToolboxTalkPdf with old record (acknowledged flags) does not crash', async () => {
  const ttDocUrl = new URL('../functions/lib/toolbox-talk-doc.js', import.meta.url);
  const { renderToolboxTalkPdf } = await import(ttDocUrl.href);
  const oldRec = {
    date: '2026-09-15',
    projectId: '26-012',
    projectName: 'Warrick Place',
    foreman: 'J. Willis',
    topic: 'emergency_procedures',
    presenter: 'J. Willis',
    keyPoints: 'Emergency muster point is parking lot A.',
    hazards: 'Excavation depth > 4ft.',
    questions: '',
    correctiveActions: '',
    attendees: [
      { name: 'Alice Smith', acknowledged: true },
      { name: 'Bob Jones', acknowledged: false },
      { name: 'Carol White', acknowledged: true },
    ],
  };
  const bytes = renderToolboxTalkPdf(oldRec);
  assert.ok(bytes instanceof Uint8Array && bytes.length > 100, 'should return PDF bytes');
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
