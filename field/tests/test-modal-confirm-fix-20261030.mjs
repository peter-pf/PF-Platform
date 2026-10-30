#!/usr/bin/env node
// Regression tests for 2026-10-30 modal confirm callback bug.
//
// ROOT CAUSE: every pfHideConfirmModal*() function sets
//   window.pfConfirmModalCallback = null
// THEN the confirm click handler checks:
//   window.pfConfirmModalCallback && window.pfConfirmModalCallback()
// which is always null by that point — the submit callback NEVER fires.
//
// Affected: ALL 5 field forms (EI, DR, SR, TT, TO) since commit 4f96f50
// (mailing-lists feature) which introduced the confirm modal on all forms.
//
// Observable symptom: clicking modal "Confirm" closes the modal silently;
// no server request is made; records stay DRAFT forever.
//
// Fix: save the callback reference before calling the hide function:
//   var cb=window.pfConfirmModalCallback; pfHideConfirmModal*(); if(cb)cb();
//
// These tests FAIL before the fix (bad pattern present / good pattern absent)
// and PASS after the fix (bad pattern removed / good pattern present).
//
// Run: node field/tests/test-modal-confirm-fix-20261030.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const eiSrc  = readFileSync(resolve(__dir, '../equipment-inspection.html'), 'utf8');
const drSrc  = readFileSync(resolve(__dir, '../daily-report.html'),         'utf8');
const srSrc  = readFileSync(resolve(__dir, '../site-readiness.html'),       'utf8');
const ttSrc  = readFileSync(resolve(__dir, '../toolbox-talk.html'),         'utf8');
const toSrc  = readFileSync(resolve(__dir, '../time-off.html'),             'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ===========================================================================
// V. EI — modal confirm must save callback before hide
// ===========================================================================

// V1: The buggy pattern (hide-then-call) must be gone after fix.
// Before fix: EI contains pfHideConfirmModalEI() followed immediately by the
// now-null pfConfirmModalCallback check → assertNotIncludes FAILS.
test('V1: EI modal confirm does not null callback before calling it (bug pattern gone)', () => {
  assert.ok(
    !eiSrc.includes('pfHideConfirmModalEI();window.pfConfirmModalCallback&&window.pfConfirmModalCallback();'),
    'EI confirm handler must not call pfHideConfirmModalEI() before the callback check'
  );
});

// V2: The fixed pattern (save-then-hide-then-call) must be present.
// Before fix: this string is absent → assertIncludes FAILS.
test('V2: EI modal confirm saves callback reference before hiding modal', () => {
  assert.ok(
    eiSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalEI();if(cb)cb();'),
    'EI confirm handler must capture cb before pfHideConfirmModalEI(), then call cb()'
  );
});

// ===========================================================================
// W. DR — modal confirm must save callback before hide
// ===========================================================================

// W1: Buggy pattern gone.
test('W1: DR modal confirm does not null callback before calling it (bug pattern gone)', () => {
  assert.ok(
    !drSrc.includes('pfHideConfirmModal();window.pfConfirmModalCallback&&window.pfConfirmModalCallback();'),
    'DR confirm handler must not call pfHideConfirmModal() before the callback check'
  );
});

// W2: Fixed pattern present.
test('W2: DR modal confirm saves callback reference before hiding modal', () => {
  assert.ok(
    drSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModal();if(cb)cb();'),
    'DR confirm handler must capture cb before pfHideConfirmModal(), then call cb()'
  );
});

// ===========================================================================
// X. SR — modal confirm must save callback before hide (uses CallbackSR)
// ===========================================================================

// X1: Buggy pattern gone.
test('X1: SR modal confirm does not null callback before calling it (bug pattern gone)', () => {
  assert.ok(
    !srSrc.includes('pfHideConfirmModalSR(); window.pfConfirmModalCallbackSR && window.pfConfirmModalCallbackSR();'),
    'SR confirm handler must not call pfHideConfirmModalSR() before the CallbackSR check'
  );
});

// X2: Fixed pattern present.
test('X2: SR modal confirm saves callback reference before hiding modal', () => {
  assert.ok(
    srSrc.includes('var cb=window.pfConfirmModalCallbackSR;pfHideConfirmModalSR();if(cb)cb();'),
    'SR confirm handler must capture cb before pfHideConfirmModalSR(), then call cb()'
  );
});

// ===========================================================================
// Y. TT — modal confirm must save callback before hide
// ===========================================================================

// Y1: Buggy pattern gone.
test('Y1: TT modal confirm does not null callback before calling it (bug pattern gone)', () => {
  assert.ok(
    !ttSrc.includes('pfHideConfirmModalTT();window.pfConfirmModalCallback&&window.pfConfirmModalCallback();'),
    'TT confirm handler must not call pfHideConfirmModalTT() before the callback check'
  );
});

// Y2: Fixed pattern present.
test('Y2: TT modal confirm saves callback reference before hiding modal', () => {
  assert.ok(
    ttSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalTT();if(cb)cb();'),
    'TT confirm handler must capture cb before pfHideConfirmModalTT(), then call cb()'
  );
});

// ===========================================================================
// Z. TO — modal confirm must save callback before hide
// ===========================================================================

// Z1: Buggy pattern gone.
test('Z1: TO modal confirm does not null callback before calling it (bug pattern gone)', () => {
  assert.ok(
    !toSrc.includes('pfHideConfirmModalTO();window.pfConfirmModalCallback&&window.pfConfirmModalCallback();'),
    'TO confirm handler must not call pfHideConfirmModalTO() before the callback check'
  );
});

// Z2: Fixed pattern present.
test('Z2: TO modal confirm saves callback reference before hiding modal', () => {
  assert.ok(
    toSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalTO();if(cb)cb();'),
    'TO confirm handler must capture cb before pfHideConfirmModalTO(), then call cb()'
  );
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
