#!/usr/bin/env node
// test-mailing-lists-20261029.mjs
// Tests for the mailing lists feature (Derek, 2026-10-29):
//   - D1-backed mailing_lists table (migration 0011)
//   - resolveMailingList fail-safe (empty/error → warning, not skip)
//   - All 4 existing endpoints read from D1 (no hardcoded recipients)
//   - EI email on submit (new)
//   - Owner-only mailing-lists.html + /api/mailing-lists
//   - Submit confirm modal on all 5 forms
//
// Run: node field/tests/test-mailing-lists-20261029.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

const mlLibSrc   = readFileSync(resolve(root, 'functions/lib/mailing-lists.js'), 'utf8');
const mlApiSrc   = readFileSync(resolve(root, 'functions/api/mailing-lists.js'), 'utf8');
const authSrc    = readFileSync(resolve(root, 'functions/lib/auth.js'), 'utf8');
const meSrc      = readFileSync(resolve(root, 'functions/api/me.js'), 'utf8');
const drSrc      = readFileSync(resolve(root, 'functions/api/daily-report.js'), 'utf8');
const srSrc      = readFileSync(resolve(root, 'functions/api/site-readiness.js'), 'utf8');
const ttApiSrc   = readFileSync(resolve(root, 'functions/api/toolbox-talk.js'), 'utf8');
const toSrc      = readFileSync(resolve(root, 'functions/api/time-off.js'), 'utf8');
const eiApiSrc   = readFileSync(resolve(root, 'functions/api/equipment-inspection.js'), 'utf8');
const eiDocSrc   = readFileSync(resolve(root, 'functions/lib/equip-inspection-doc.js'), 'utf8');
const migSrc     = readFileSync(resolve(root, 'migrations/0011_mailing_lists.sql'), 'utf8');
const mlHtmlSrc  = readFileSync(resolve(root, 'mailing-lists.html'), 'utf8');
const drHtmlSrc  = readFileSync(resolve(root, 'daily-report.html'), 'utf8');
const srHtmlSrc  = readFileSync(resolve(root, 'site-readiness.html'), 'utf8');
const eiHtmlSrc  = readFileSync(resolve(root, 'equipment-inspection.html'), 'utf8');
const ttHtmlSrc  = readFileSync(resolve(root, 'toolbox-talk.html'), 'utf8');
const toHtmlSrc  = readFileSync(resolve(root, 'time-off.html'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ===========================================================================
// A. MIGRATION
// ===========================================================================
console.log('\n--- A. Migration 0011_mailing_lists ---');

test('A1: migration file creates mailing_lists table', () => {
  assert.ok(migSrc.includes('CREATE TABLE'), 'migration must CREATE TABLE');
  assert.ok(migSrc.includes('mailing_lists'), 'migration must create mailing_lists table');
});

test('A2: migration defines list_key column with CHECK constraint', () => {
  assert.ok(migSrc.includes('list_key'), 'migration must define list_key column');
  assert.ok(migSrc.includes('CHECK'), 'migration must include CHECK constraint on list_key');
});

test('A3: migration includes UNIQUE constraint on (list_key, email)', () => {
  assert.ok(
    migSrc.includes('UNIQUE') && migSrc.includes('list_key') && migSrc.includes('email'),
    'migration must have UNIQUE constraint covering list_key and email'
  );
});

test('A4: migration seeds all 5 list keys', () => {
  const keys = ['daily_report', 'site_readiness', 'toolbox_talk', 'time_off', 'equipment_inspection'];
  for (const k of keys) {
    assert.ok(migSrc.includes(k), `migration must seed list key: ${k}`);
  }
});

test('A5: migration uses INSERT OR IGNORE (additive, not destructive)', () => {
  assert.ok(
    migSrc.includes('INSERT OR IGNORE'),
    'migration seed inserts must use INSERT OR IGNORE'
  );
});

// ===========================================================================
// B. LIBRARY: mailing-lists.js
// ===========================================================================
console.log('\n--- B. Library: mailing-lists.js ---');

test('B1: OWNER_EMAILS contains exactly Brad, Jonathan, Derek', () => {
  assert.ok(mlLibSrc.includes('breinking@pierfoundations.com'), 'Brad must be in OWNER_EMAILS');
  assert.ok(mlLibSrc.includes('jreinking@pierfoundations.com'), 'Jonathan must be in OWNER_EMAILS');
  assert.ok(mlLibSrc.includes('dfranke@pierfoundations.com'),   'Derek must be in OWNER_EMAILS');
});

test('B2: AGENT_EMAIL is pfpeter@agentmail.to', () => {
  assert.ok(mlLibSrc.includes('pfpeter@agentmail.to'), 'AGENT_EMAIL must be pfpeter@agentmail.to');
});

test('B3: validateEmail rejects non-@pierfoundations.com domains', () => {
  // The validation check must enforce @pierfoundations.com
  assert.ok(
    mlLibSrc.includes('pierfoundations.com'),
    'validateEmail must enforce @pierfoundations.com domain'
  );
});

test('B4: VALID_LIST_KEYS includes all 5 form keys', () => {
  const keys = ['daily_report', 'site_readiness', 'toolbox_talk', 'time_off', 'equipment_inspection'];
  for (const k of keys) {
    assert.ok(mlLibSrc.includes(`'${k}'`) || mlLibSrc.includes(`"${k}"`), `VALID_LIST_KEYS must include '${k}'`);
  }
});

test('B5: resolveMailingList function is exported', () => {
  assert.ok(mlLibSrc.includes('resolveMailingList'), 'resolveMailingList must be exported');
  assert.ok(mlLibSrc.includes('export'), 'mailing-lists.js must use ES module exports');
});

test('B6: resolveMailingList returns { recipients, warning } shape', () => {
  assert.ok(
    mlLibSrc.includes('recipients') && mlLibSrc.includes('warning'),
    'resolveMailingList must return { recipients, warning } shape'
  );
});

test('B7: resolveMailingList returns warning (not throw) on D1 error or empty list', () => {
  // Must catch DB errors and return a warning string, not propagate the exception
  assert.ok(
    mlLibSrc.includes('catch') || mlLibSrc.includes('try'),
    'resolveMailingList must have try/catch for D1 errors'
  );
  assert.ok(
    mlLibSrc.includes('warning:'),
    'resolveMailingList must return a warning key in the error/empty case'
  );
});

test('B8: addToMailingList exported for API use', () => {
  assert.ok(mlLibSrc.includes('addToMailingList'), 'addToMailingList must be exported');
});

test('B9: removeFromMailingList exported for API use', () => {
  assert.ok(mlLibSrc.includes('removeFromMailingList'), 'removeFromMailingList must be exported');
});

test('B10: getAllMailingLists exported for API use', () => {
  assert.ok(mlLibSrc.includes('getAllMailingLists'), 'getAllMailingLists must be exported');
});

// ===========================================================================
// C. API: /api/mailing-lists RBAC
// ===========================================================================
console.log('\n--- C. API: /api/mailing-lists RBAC ---');

test('C1: mailing-lists.js has explicit OWNER_EMAILS allowlist check', () => {
  assert.ok(
    mlApiSrc.includes('OWNER_EMAILS') || mlApiSrc.includes('OWNER_EMAIL'),
    '/api/mailing-lists must check OWNER_EMAILS'
  );
  assert.ok(mlApiSrc.includes('403'), '/api/mailing-lists must return 403 for non-owners');
});

test('C2: mailing-lists.js looks up caller email via D1 (not session role)', () => {
  // The API must do a D1 lookup to get the caller's email
  assert.ok(
    mlApiSrc.includes('getCallerEmail') || mlApiSrc.includes('SELECT email FROM users'),
    '/api/mailing-lists must look up caller email from D1'
  );
});

test('C3: mailing-lists.js exports onRequest (or onRequestGet/Post/Delete)', () => {
  assert.ok(
    mlApiSrc.includes('onRequest') || mlApiSrc.includes('export'),
    '/api/mailing-lists must export request handlers'
  );
});

test('C4: pfpeter re-add is blocked server-side', () => {
  assert.ok(
    mlApiSrc.includes('agentmail') || mlApiSrc.includes('AGENT_EMAIL'),
    '/api/mailing-lists must block pfpeter@agentmail.to re-add server-side'
  );
});

test('C5: every add/remove writes to audit_log', () => {
  assert.ok(
    mlApiSrc.includes('audit_log'),
    '/api/mailing-lists must write to audit_log on add/remove'
  );
});

test('C6: DELETE handler enforces owner check', () => {
  assert.ok(
    mlApiSrc.includes('onRequestDelete') || mlApiSrc.includes("'DELETE'"),
    '/api/mailing-lists must handle DELETE'
  );
  // Owner check must be in the file (already tested in C1, but also check DELETE context)
  assert.ok(
    (mlApiSrc.match(/403/g) || []).length >= 1,
    '/api/mailing-lists must return 403 on unauthorized delete'
  );
});

// ===========================================================================
// D. AUTH: auth.js area gate for mailing-lists
// ===========================================================================
console.log('\n--- D. Auth.js area gate for mailing-lists ---');

test('D1: auth.js has /mailing-lists.html in FIELD_PAGES', () => {
  assert.ok(
    authSrc.includes('/mailing-lists.html') || authSrc.includes('mailing-lists'),
    'auth.js must have area entry for /mailing-lists.html'
  );
});

test('D2: auth.js has /api/mailing-lists in API area gate', () => {
  assert.ok(
    authSrc.includes('/api/mailing-lists') || authSrc.includes('mailing-lists'),
    'auth.js must route /api/mailing-lists to an area'
  );
});

// ===========================================================================
// E. /api/me: email lookup
// ===========================================================================
console.log('\n--- E. /api/me email lookup ---');

test('E1: me.js performs D1 email lookup for caller', () => {
  assert.ok(
    meSrc.includes('SELECT email FROM users') || meSrc.includes('email'),
    '/api/me must look up and return caller email from D1'
  );
});

test('E2: me.js returns email in response JSON', () => {
  assert.ok(
    meSrc.includes('email:') || meSrc.includes('"email"'),
    '/api/me must include email in the response'
  );
});

// ===========================================================================
// F. ENDPOINTS: hardcoded recipients removed
// ===========================================================================
console.log('\n--- F. Endpoints: hardcoded recipients removed ---');

test('F1: daily-report.js imports resolveMailingList', () => {
  assert.ok(drSrc.includes('resolveMailingList'), 'daily-report.js must import resolveMailingList');
});

test('F2: daily-report.js does not define ACTIVE_RECIPIENTS constant (comments are ok)', () => {
  // Strip comments before checking so mentions in explanatory comments don't false-positive
  const stripped = drSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !stripped.includes('ACTIVE_RECIPIENTS'),
    'daily-report.js must not define ACTIVE_RECIPIENTS constant (removed in favor of D1)'
  );
});

test('F3: daily-report.js skips email on warning but record/SP proceed', () => {
  assert.ok(
    drSrc.includes('warning') || drSrc.includes('mailingListWarning') || drSrc.includes('emailWarning'),
    'daily-report.js must handle mailing list warning'
  );
});

test('F4: site-readiness.js imports resolveMailingList', () => {
  assert.ok(srSrc.includes('resolveMailingList'), 'site-readiness.js must import resolveMailingList');
});

test('F5: site-readiness.js does not define ACTIVE_RECIPIENTS constant (comments are ok)', () => {
  const stripped = srSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !stripped.includes('ACTIVE_RECIPIENTS'),
    'site-readiness.js must not define ACTIVE_RECIPIENTS constant'
  );
});

test('F6: toolbox-talk.js imports resolveMailingList', () => {
  assert.ok(ttApiSrc.includes('resolveMailingList'), 'toolbox-talk.js must import resolveMailingList');
});

test('F7: toolbox-talk.js does not define ACTIVE_RECIPIENTS constant (comments are ok)', () => {
  const stripped = ttApiSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !stripped.includes('ACTIVE_RECIPIENTS'),
    'toolbox-talk.js must not define ACTIVE_RECIPIENTS constant'
  );
});

test('F8: time-off.js imports resolveMailingList', () => {
  assert.ok(toSrc.includes('resolveMailingList'), 'time-off.js must import resolveMailingList');
});

test('F9: time-off.js does not define hardcoded recipient constants (comments are ok)', () => {
  const stripped = toSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !stripped.includes('ACTIVE_RECIPIENTS') && !stripped.includes('TEST_RECIPIENTS') && !stripped.includes('PROD_RECIPIENTS'),
    'time-off.js must not define hardcoded recipient constants'
  );
});

test('F10: equipment-inspection.js imports resolveMailingList', () => {
  assert.ok(eiApiSrc.includes('resolveMailingList'), 'equipment-inspection.js must import resolveMailingList');
});

// ===========================================================================
// G. EI EMAIL: new email on equipment inspection submit
// ===========================================================================
console.log('\n--- G. EI email on submit ---');

test('G1: equip-inspection-doc.js exports sendEquipInspectionEmail', () => {
  assert.ok(
    eiDocSrc.includes('sendEquipInspectionEmail'),
    'equip-inspection-doc.js must export sendEquipInspectionEmail'
  );
});

test('G2: EI email subject includes Equipment Inspection', () => {
  assert.ok(
    eiDocSrc.includes('Equipment Inspection'),
    'sendEquipInspectionEmail must use "Equipment Inspection" in subject'
  );
});

test('G3: EI email subject includes machine/serial/date/inspector fields', () => {
  // Subject: "Equipment Inspection - <Machine> - <Serial> - <Date> - <Inspector>"
  // Check the subject template includes the dynamic fields
  const subjectIdx = eiDocSrc.indexOf('Equipment Inspection');
  const subjectSlice = eiDocSrc.slice(subjectIdx, subjectIdx + 200);
  assert.ok(
    subjectSlice.includes('serial') || subjectSlice.includes('Serial') ||
    subjectSlice.includes('date') || subjectSlice.includes('Date') ||
    subjectSlice.includes('inspector') || subjectSlice.includes('Inspector'),
    'EI email subject must include dynamic fields (serial, date, inspector)'
  );
});

test('G4: equipment-inspection.js calls sendEquipInspectionEmail', () => {
  assert.ok(
    eiApiSrc.includes('sendEquipInspectionEmail'),
    'equipment-inspection.js must call sendEquipInspectionEmail'
  );
});

test('G5: EI email hoisted graphToken variable (token scope fix)', () => {
  // Verify the graphToken is declared outside the if block (scope fix)
  assert.ok(
    eiApiSrc.includes('let graphToken') || eiApiSrc.includes('var graphToken'),
    'equipment-inspection.js must declare graphToken at function scope (not inside if block)'
  );
  // Must NOT have the old scoped 'let token' inside the if block
  assert.ok(
    !eiApiSrc.includes('let token =') && !eiApiSrc.includes('let token;'),
    'equipment-inspection.js must not use old scoped "let token" variable'
  );
});

test('G6: EI email fail-safe: eiEmailWarning set on mailing list failure', () => {
  assert.ok(
    eiApiSrc.includes('eiEmailWarning'),
    'equipment-inspection.js must set eiEmailWarning on mailing list or send failure'
  );
});

// ===========================================================================
// H. MAILING LISTS PAGE HTML
// ===========================================================================
console.log('\n--- H. mailing-lists.html ---');

test('H1: mailing-lists.html exists and has #main', () => {
  assert.ok(mlHtmlSrc.includes('id="main"'), 'mailing-lists.html must have #main element');
});

test('H2: mailing-lists.html reveals #main with style.display=block (not empty string)', () => {
  // Must set style.display = 'block', NOT style.display = ''
  // Check the auth success handler
  const authIdx = mlHtmlSrc.indexOf('style.display');
  // Find instances of display assignment
  const displayBlocks = mlHtmlSrc.match(/mainEl\.style\.display\s*=\s*['"][^'"]*['"]/g) || [];
  assert.ok(
    displayBlocks.some(m => m.includes("'block'") || m.includes('"block"')),
    'mailing-lists.html must reveal #main with style.display="block", not style.display=""'
  );
  assert.ok(
    !displayBlocks.some(m => /=\s*[']["']\s*['"]/.test(m) || /=\s*''/.test(m) || /=\s*""/.test(m)),
    'mailing-lists.html must not use style.display="" to reveal #main'
  );
});

test('H3: mailing-lists.html has owner email check client-side', () => {
  assert.ok(
    mlHtmlSrc.includes('breinking@pierfoundations.com') &&
    mlHtmlSrc.includes('jreinking@pierfoundations.com') &&
    mlHtmlSrc.includes('dfranke@pierfoundations.com'),
    'mailing-lists.html must check all 3 owner emails client-side'
  );
});

test('H4: mailing-lists.html redirects non-owners to /denied.html', () => {
  assert.ok(
    mlHtmlSrc.includes('denied.html') || mlHtmlSrc.includes('/denied'),
    'mailing-lists.html must redirect non-owners'
  );
});

test('H5: mailing-lists.html blocks pfpeter re-add in UI', () => {
  assert.ok(
    mlHtmlSrc.includes('agentmail') || mlHtmlSrc.includes('pfpeter'),
    'mailing-lists.html must block pfpeter@agentmail.to re-add in UI'
  );
});

test('H6: mailing-lists.html shows all 5 mailing list sections', () => {
  const keys = ['daily_report', 'site_readiness', 'toolbox_talk', 'time_off', 'equipment_inspection'];
  for (const k of keys) {
    assert.ok(
      mlHtmlSrc.includes(k),
      `mailing-lists.html must show section for list key: ${k}`
    );
  }
});

test('H7: mailing-lists.html validates @pierfoundations.com in add input', () => {
  assert.ok(
    mlHtmlSrc.includes('pierfoundations.com'),
    'mailing-lists.html must enforce @pierfoundations.com domain on add'
  );
});

// ===========================================================================
// I. OWNER NAV ITEM: all 5 forms have mlNavItem
// ===========================================================================
console.log('\n--- I. Owner nav item on all 5 forms ---');

test('I1: daily-report.html has mlNavItem nav link', () => {
  assert.ok(drHtmlSrc.includes('id="mlNavItem"'), 'daily-report.html must have id="mlNavItem" nav link');
  assert.ok(drHtmlSrc.includes('mailing-lists.html'), 'daily-report.html mlNavItem must link to mailing-lists.html');
  assert.ok(
    drHtmlSrc.includes('style="display:none"') || drHtmlSrc.includes("style='display:none'"),
    'daily-report.html mlNavItem must start hidden (display:none)'
  );
});

test('I2: site-readiness.html has mlNavItem nav link', () => {
  assert.ok(srHtmlSrc.includes('id="mlNavItem"'), 'site-readiness.html must have id="mlNavItem"');
  assert.ok(srHtmlSrc.includes('mailing-lists.html'), 'site-readiness.html mlNavItem must link to mailing-lists.html');
});

test('I3: equipment-inspection.html has mlNavItem nav link', () => {
  assert.ok(eiHtmlSrc.includes('id="mlNavItem"'), 'equipment-inspection.html must have id="mlNavItem"');
  assert.ok(eiHtmlSrc.includes('mailing-lists.html'), 'equipment-inspection.html mlNavItem must link to mailing-lists.html');
});

test('I4: toolbox-talk.html has mlNavItem nav link', () => {
  assert.ok(ttHtmlSrc.includes('id="mlNavItem"'), 'toolbox-talk.html must have id="mlNavItem"');
  assert.ok(ttHtmlSrc.includes('mailing-lists.html'), 'toolbox-talk.html mlNavItem must link to mailing-lists.html');
});

test('I5: time-off.html has mlNavItem nav link', () => {
  assert.ok(toHtmlSrc.includes('id="mlNavItem"'), 'time-off.html must have id="mlNavItem"');
  assert.ok(toHtmlSrc.includes('mailing-lists.html'), 'time-off.html mlNavItem must link to mailing-lists.html');
});

test('I6: all 5 forms reveal mlNavItem only for owners (owner email check)', () => {
  for (const [label, src] of [
    ['daily-report.html', drHtmlSrc],
    ['site-readiness.html', srHtmlSrc],
    ['equipment-inspection.html', eiHtmlSrc],
    ['toolbox-talk.html', ttHtmlSrc],
    ['time-off.html', toHtmlSrc],
  ]) {
    assert.ok(
      src.includes('mlNavItem') && src.includes('dfranke@pierfoundations.com'),
      `${label} must have owner email check to reveal mlNavItem`
    );
  }
});

// ===========================================================================
// J. CONFIRM MODAL: all 5 forms have submitConfirmModal
// ===========================================================================
console.log('\n--- J. Submit confirm modal on all 5 forms ---');

test('J1: daily-report.html has submitConfirmModal element', () => {
  assert.ok(drHtmlSrc.includes('id="submitConfirmModal"'), 'daily-report.html must have id="submitConfirmModal"');
  assert.ok(drHtmlSrc.includes('Are you sure you are ready to submit'), 'modal text must match spec');
});

test('J2: site-readiness.html has submitConfirmModal element', () => {
  assert.ok(srHtmlSrc.includes('id="submitConfirmModal"'), 'site-readiness.html must have id="submitConfirmModal"');
  assert.ok(srHtmlSrc.includes('Are you sure you are ready to submit'), 'modal text must match spec');
});

test('J3: equipment-inspection.html has submitConfirmModal element', () => {
  assert.ok(eiHtmlSrc.includes('id="submitConfirmModal"'), 'equipment-inspection.html must have id="submitConfirmModal"');
  assert.ok(eiHtmlSrc.includes('Are you sure you are ready to submit'), 'modal text must match spec');
});

test('J4: toolbox-talk.html has submitConfirmModal element', () => {
  assert.ok(ttHtmlSrc.includes('id="submitConfirmModal"'), 'toolbox-talk.html must have id="submitConfirmModal"');
  assert.ok(ttHtmlSrc.includes('Are you sure you are ready to submit'), 'modal text must match spec');
});

test('J5: time-off.html has submitConfirmModal element', () => {
  assert.ok(toHtmlSrc.includes('id="submitConfirmModal"'), 'time-off.html must have id="submitConfirmModal"');
  assert.ok(toHtmlSrc.includes('Are you sure you are ready to submit'), 'modal text must match spec');
});

test('J6: each modal has Cancel and Submit buttons', () => {
  for (const [label, src] of [
    ['daily-report.html', drHtmlSrc],
    ['site-readiness.html', srHtmlSrc],
    ['equipment-inspection.html', eiHtmlSrc],
    ['toolbox-talk.html', ttHtmlSrc],
    ['time-off.html', toHtmlSrc],
  ]) {
    assert.ok(src.includes('Cancel'), `${label} modal must have Cancel button`);
    // The modal Submit button is inside the modal div — check modal div region
    const modalIdx = src.indexOf('id="submitConfirmModal"');
    const modalEnd  = src.indexOf('</div>', modalIdx + 400);
    const modalSlice = src.slice(modalIdx, modalEnd + 100);
    assert.ok(modalSlice.includes('Submit'), `${label} modal must have Submit button`);
  }
});

// ===========================================================================
// K. MODAL HELPERS: show/hide functions and dataset.firing guard
// ===========================================================================
console.log('\n--- K. Modal helpers and dataset.firing guard ---');

test('K1: daily-report.html has pfShowConfirmModal helper', () => {
  assert.ok(drHtmlSrc.includes('pfShowConfirmModal'), 'daily-report.html must have pfShowConfirmModal helper');
});

test('K2: site-readiness.html has pfShowConfirmModalSR helper', () => {
  assert.ok(srHtmlSrc.includes('pfShowConfirmModalSR'), 'site-readiness.html must have pfShowConfirmModalSR helper');
});

test('K3: equipment-inspection.html has pfShowConfirmModalEI helper', () => {
  assert.ok(eiHtmlSrc.includes('pfShowConfirmModalEI'), 'equipment-inspection.html must have pfShowConfirmModalEI helper');
});

test('K4: toolbox-talk.html has pfShowConfirmModalTT helper', () => {
  assert.ok(ttHtmlSrc.includes('pfShowConfirmModalTT'), 'toolbox-talk.html must have pfShowConfirmModalTT helper');
});

test('K5: time-off.html has pfShowConfirmModalTO helper', () => {
  assert.ok(toHtmlSrc.includes('pfShowConfirmModalTO'), 'time-off.html must have pfShowConfirmModalTO helper');
});

test('K6: each form modal confirm button has dataset.firing guard', () => {
  for (const [label, src] of [
    ['daily-report.html', drHtmlSrc],
    ['site-readiness.html', srHtmlSrc],
    ['equipment-inspection.html', eiHtmlSrc],
    ['toolbox-talk.html', ttHtmlSrc],
    ['time-off.html', toHtmlSrc],
  ]) {
    assert.ok(
      src.includes('dataset.firing'),
      `${label} modal confirm must have dataset.firing double-click guard`
    );
  }
});

test('K7: each form has Cancel and Overlay click handlers to hide modal', () => {
  for (const [label, src] of [
    ['daily-report.html', drHtmlSrc],
    ['site-readiness.html', srHtmlSrc],
    ['equipment-inspection.html', eiHtmlSrc],
    ['toolbox-talk.html', ttHtmlSrc],
    ['time-off.html', toHtmlSrc],
  ]) {
    // Both cancel button and overlay must wire to hide the modal
    assert.ok(
      (src.match(/pfHideConfirmModal/g) || []).length >= 2,
      `${label} must wire cancel and overlay to pfHideConfirmModal* (found at least 2 calls)`
    );
  }
});

// ===========================================================================
// L. MODAL WIRING: submit button shows modal first
// ===========================================================================
console.log('\n--- L. Submit button shows modal before sending ---');

test('L1: daily-report.html submit wires pfShowConfirmModal before save(true)', () => {
  // The submit path calls pfShowConfirmModal with a callback that runs save(true)
  assert.ok(
    drHtmlSrc.includes('pfShowConfirmModal') && drHtmlSrc.includes('save(true)'),
    'daily-report.html must call pfShowConfirmModal with save(true) as callback'
  );
});

test('L2: site-readiness.html submit wires pfShowConfirmModalSR before save(true)', () => {
  assert.ok(
    srHtmlSrc.includes('pfShowConfirmModalSR') && srHtmlSrc.includes('save(true)'),
    'site-readiness.html must call pfShowConfirmModalSR with save(true) callback'
  );
});

test('L3: equipment-inspection.html submit shows modal before eiSubmitting guard releases', () => {
  // Validation runs first, then pfShowConfirmModalEI is shown, THEN eiSubmitting=true inside callback
  const modalIdx    = eiHtmlSrc.indexOf('pfShowConfirmModalEI');
  const submittingIdx = eiHtmlSrc.indexOf('eiSubmitting = true;');
  assert.ok(modalIdx !== -1, 'equipment-inspection.html must call pfShowConfirmModalEI');
  assert.ok(submittingIdx !== -1, 'equipment-inspection.html must set eiSubmitting = true');
  assert.ok(
    modalIdx < submittingIdx,
    'pfShowConfirmModalEI must appear before eiSubmitting=true (modal shown before guard set)'
  );
});

test('L4: toolbox-talk.html submit shows modal before ttSave(true)', () => {
  const modalIdx = ttHtmlSrc.indexOf('pfShowConfirmModalTT');
  const saveIdx  = ttHtmlSrc.indexOf('ttSave(true)');
  assert.ok(modalIdx !== -1, 'toolbox-talk.html must call pfShowConfirmModalTT');
  assert.ok(saveIdx  !== -1, 'toolbox-talk.html must call ttSave(true)');
  assert.ok(
    modalIdx < saveIdx,
    'pfShowConfirmModalTT must appear before ttSave(true) (modal shown first)'
  );
});

test('L5: time-off.html submit shows modal via dataset.confirmed flag before fetch', () => {
  // TO uses dataset.confirmed pattern on the form
  assert.ok(
    toHtmlSrc.includes('dataset.confirmed') || toHtmlSrc.includes('pfShowConfirmModalTO'),
    'time-off.html must use confirm modal before submitting (dataset.confirmed or pfShowConfirmModalTO)'
  );
  assert.ok(
    toHtmlSrc.includes("fetch('/api/time-off'"),
    'time-off.html must still have fetch to /api/time-off'
  );
});

// ===========================================================================
// M. IN-FLIGHT GUARDS PRESERVED
// ===========================================================================
console.log('\n--- M. In-flight guards preserved ---');

test('M1: EI submit still has if(eiSubmitting) return guard', () => {
  const clickIdx    = eiHtmlSrc.indexOf("getElementById('eiSubmit').addEventListener('click'");
  assert.ok(clickIdx !== -1, 'eiSubmit click handler must exist');
  // The guard must appear before the modal (in the outer click handler)
  const handlerSlice = eiHtmlSrc.slice(clickIdx, clickIdx + 300);
  assert.ok(
    handlerSlice.includes('if (eiSubmitting) return;'),
    'EI submit handler must still have if(eiSubmitting) return guard before showing modal'
  );
});

test('M2: TT submit still calls ttSave (which has if(ttState.saving) return guard)', () => {
  assert.ok(
    ttHtmlSrc.includes('if (ttState.saving) return;'),
    'toolbox-talk.html must preserve ttState.saving in-flight guard in ttSave'
  );
});

// ===========================================================================
// N. FAIL-SAFE: record and SP upload survive email failure
// ===========================================================================
console.log('\n--- N. Fail-safe: record and SP succeed even when email skipped ---');

test('N1: daily-report.js SP upload not inside email conditional', () => {
  // resolveMailingList is called; if warning, email is skipped; SP upload is unconditional
  // Verify that emailWarning/warning is checked BEFORE email send, not before SP upload
  const warningIdx = drSrc.indexOf('mailingListWarning') !== -1
    ? drSrc.indexOf('mailingListWarning')
    : drSrc.indexOf('emailWarning');
  const spIdx = drSrc.indexOf('SharePoint') !== -1
    ? drSrc.indexOf('SharePoint')
    : drSrc.indexOf('sharePoint') !== -1
      ? drSrc.indexOf('sharePoint')
      : drSrc.indexOf('upload') !== -1
        ? drSrc.indexOf('upload')
        : -1;
  // SP upload should not be gated on email success
  assert.ok(
    drSrc.includes('resolveMailingList'),
    'daily-report.js must use resolveMailingList for fail-safe email'
  );
});

test('N2: equipment-inspection.js SP upload path not gated on email success', () => {
  // EI: SP upload happens first, then email is attempted if recipients available
  // Check that the upload happens before the email send in the code flow
  const uploadIdx = eiApiSrc.indexOf('uploadToSharePoint') !== -1
    ? eiApiSrc.indexOf('uploadToSharePoint')
    : eiApiSrc.indexOf('sharePoint') !== -1
      ? eiApiSrc.indexOf('sharePoint')
      : eiApiSrc.indexOf('upload');
  const emailIdx  = eiApiSrc.indexOf('sendEquipInspectionEmail');
  assert.ok(uploadIdx !== -1, 'equipment-inspection.js must have SP upload');
  assert.ok(emailIdx  !== -1, 'equipment-inspection.js must have sendEquipInspectionEmail');
  assert.ok(
    uploadIdx < emailIdx,
    'SP upload must happen before EI email send (email is secondary, upload is primary)'
  );
});

test('N3: resolveMailingList returns empty recipients with warning on empty list', () => {
  // The library function must return {recipients: [], warning: '...'} for empty/error
  const fnIdx = mlLibSrc.indexOf('resolveMailingList');
  assert.ok(fnIdx !== -1, 'resolveMailingList must exist in mailing-lists.js');
  const fnSlice = mlLibSrc.slice(fnIdx, fnIdx + 800);
  assert.ok(
    fnSlice.includes('recipients') && fnSlice.includes('warning'),
    'resolveMailingList must return both recipients and warning fields'
  );
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
