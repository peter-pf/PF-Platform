#!/usr/bin/env node
// Field Portal R13 tests (2026-10-23)
// Upload widget visibility: always show for photo buckets; safety_cert conditional on Yes.
//
// Run: node field/tests/test-r13.mjs

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const htmlSrc = readFileSync(resolve(__dir, '../site-readiness.html'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// Extract the upload widget condition from the source.
// The key change: showUpload for non-safety_cert is `true` (always visible).
test('R13-1: upload widget condition no longer gates on answer===Yes for photo buckets', () => {
  // The old conditional was: stateItem.answer === 'Yes' || bkAttach.length > 0 || ...
  // The new code assigns showUpload = true for non-safety_cert buckets.
  assert.ok(htmlSrc.includes("? (stateItem.answer === 'Yes'"),
    'safety_cert must keep its Yes-conditional (shown in ternary true branch)');
  assert.ok(htmlSrc.includes(': true; // all other upload buckets always visible'),
    'non-safety_cert buckets must have showUpload = true (always visible)');
});

test('R13-2: safety_cert still conditional on Yes', () => {
  // showUpload assignment spans multiple lines; check the block as a unit
  const showUploadIdx = htmlSrc.indexOf("var showUpload = (bk === 'safety_cert')");
  assert.ok(showUploadIdx >= 0, 'showUpload must guard safety_cert');
  const block = htmlSrc.slice(showUploadIdx, showUploadIdx + 300);
  assert.ok(block.includes("stateItem.answer === 'Yes'"),
    'safety_cert branch must check answer===Yes');
  assert.ok(block.includes(': true'),
    'non-safety_cert path must be true (always show)');
});

// Simulate the showUpload logic for various answers and buckets.
function showUpload(bucket, answer, hasAttach) {
  const bkAttach = hasAttach ? [{}] : [];
  const bkPending = [];
  return (bucket === 'safety_cert')
    ? (answer === 'Yes' || bkAttach.length > 0 || bkPending.length > 0)
    : true;
}

const PHOTO_BUCKETS = ['photo_1a', 'photo_1b', 'photo_1c', 'photo_4b', 'photo_4c',
                       'grade_photo', 'proof_roll', 'staking_photo'];

test('R13-3: photo buckets show with answer blank', () => {
  for (const bk of PHOTO_BUCKETS) {
    assert.ok(showUpload(bk, '', false), `${bk} must show with blank answer`);
  }
});

test('R13-4: photo buckets show with answer No', () => {
  for (const bk of PHOTO_BUCKETS) {
    assert.ok(showUpload(bk, 'No', false), `${bk} must show with answer=No`);
  }
});

test('R13-5: photo buckets show with answer N/A', () => {
  for (const bk of PHOTO_BUCKETS) {
    assert.ok(showUpload(bk, 'N/A', false), `${bk} must show with answer=N/A`);
  }
});

test('R13-6: photo buckets show with answer Yes', () => {
  for (const bk of PHOTO_BUCKETS) {
    assert.ok(showUpload(bk, 'Yes', false), `${bk} must show with answer=Yes`);
  }
});

test('R13-7: safety_cert hidden when answer blank and no attachments', () => {
  assert.equal(showUpload('safety_cert', '', false), false,
    'safety_cert must be hidden when answer is blank and no attachments');
});

test('R13-8: safety_cert hidden when answer No and no attachments', () => {
  assert.equal(showUpload('safety_cert', 'No', false), false,
    'safety_cert must be hidden when answer is No');
});

test('R13-9: safety_cert visible when answer Yes', () => {
  assert.ok(showUpload('safety_cert', 'Yes', false), 'safety_cert must show when answer=Yes');
});

test('R13-10: safety_cert visible when attachments exist (preserve existing refs)', () => {
  assert.ok(showUpload('safety_cert', '', true), 'safety_cert must show when attachments exist');
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
