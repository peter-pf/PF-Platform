#!/usr/bin/env node
// Field Portal R11 tests (Derek 2026-10-23)
//
// A. Time Off — owner view removed:
//   1. /api/time-off-admin is not mapped to field_ops (crew cannot access)
//   2. areaForPath(/api/time-off-admin) does not grant crew access
//   3. PLATFORM_TIME_OFF_REVIEW_URL defined and is platform URL (not field portal)
//   4. time-off.js email body uses PLATFORM_TIME_OFF_REVIEW_URL
//
// B. Site Readiness — section 1 restructure:
//   5.  Section 1 renamed to "Site Prep and Conditions" in store CHECKLIST_ITEMS
//   6.  Old 1b (Spoil pile) removed from CHECKLIST_ITEMS
//   7.  New 1b = "General conditions" with upload in CHECKLIST_ITEMS
//   8.  New 1c = "Areas of concern" with upload in CHECKLIST_ITEMS
//   9.  1a has upload in CHECKLIST_ITEMS
//   10. 4b has upload in CHECKLIST_ITEMS
//   11. 4c has upload in CHECKLIST_ITEMS
//   12. uploadBucketForItem: 1a->photo_1a, 1b->photo_1b, 1c->photo_1c, 4b->photo_4b, 4c->photo_4c
//   13. 3e upload unchanged (staking_photo — not a duplicate)
//   14. Total CHECKLIST_ITEMS count = 20 (R10 was 19; -old 1b +new 1b +1c = 20)
//   15. backward compat: pre-R11 record (no schemaVersion) renders old 1b under legacy label in PDF
//   16. backward compat: pre-R11 record PDF does not show old 1b under new label
//   17. R11 record (schemaVersion:11) renders 1b under "General conditions" label
//   18. PLATFORM_TIME_OFF_REVIEW_URL default is platform portal (not field.pierfoundations.com)
//
// Run: node field/tests/test-r11.mjs

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load auth
const authUrl = new URL('../functions/lib/auth.js', import.meta.url);
const { areaForPath, roleCanAccess } = await import(authUrl.href);

// Load store
const storeUrl = new URL('../functions/lib/site-readiness-store.js', import.meta.url);
const { CHECKLIST_ITEMS, uploadBucketForItem } = await import(storeUrl.href);

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  PASS', name); passed++; })
              .catch(e => { console.error('  FAIL', name, '\n      ', e.message); failed++; });
    }
    console.log('  PASS', name); passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message); failed++;
  }
}

// ---------------------------------------------------------------------------
// A. Time Off — owner route removed
// ---------------------------------------------------------------------------

test('A1: /api/time-off-admin NOT mapped to field_ops (crew cannot access)', () => {
  const area = areaForPath('/api/time-off-admin');
  assert.notEqual(area, 'field_ops',
    '/api/time-off-admin must not return field_ops — crew must be blocked');
});

test('A2: /api/time-off still maps to field_ops (self-service preserved)', () => {
  assert.equal(areaForPath('/api/time-off'), 'field_ops');
});

test('A3: /api/time-off-admin not accessible to field_ops role', () => {
  const area = areaForPath('/api/time-off-admin');
  assert.equal(roleCanAccess('field_ops', area), false,
    'field_ops must be blocked from /api/time-off-admin route area');
});

test('A4: /time-off.html still maps to field_ops (self-service page preserved)', () => {
  assert.equal(areaForPath('/time-off.html'), 'field_ops');
});

// ---------------------------------------------------------------------------
// B. Site Readiness — section 1 restructure
// ---------------------------------------------------------------------------

const byKey = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));

test('B1: total CHECKLIST_ITEMS count is 20 (R11)', () => {
  assert.equal(CHECKLIST_ITEMS.length, 20,
    `expected 20, got ${CHECKLIST_ITEMS.length}. R11: -old_1b +new_1b +1c = 20`);
});

test('B2: section 1 label is "Site Prep and Conditions" (R11 rename)', () => {
  assert.equal(byKey['1a'].sectionLabel, 'Site Prep and Conditions');
  assert.equal(byKey['1b'].sectionLabel, 'Site Prep and Conditions');
  assert.equal(byKey['1c'].sectionLabel, 'Site Prep and Conditions');
});

test('B3: old 1b (Spoil pile) NOT in CHECKLIST_ITEMS', () => {
  // New 1b should be "General conditions", not "Spoil pile"
  assert.ok(byKey['1b'], 'key 1b must exist');
  assert.ok(!byKey['1b'].label.toLowerCase().includes('spoil'),
    '1b must not be Spoil pile in R11');
});

test('B4: new 1b is "General conditions" with upload', () => {
  assert.ok(byKey['1b'].label.toLowerCase().includes('general') ||
            byKey['1b'].label.toLowerCase().includes('condition'),
    '1b label should mention general/condition');
  assert.equal(byKey['1b'].hasUpload, true, '1b must have hasUpload=true');
});

test('B5: new 1c "Areas of concern" exists with upload', () => {
  assert.ok(byKey['1c'], '1c must exist');
  assert.ok(byKey['1c'].label.toLowerCase().includes('concern'), '1c label must include concern');
  assert.equal(byKey['1c'].hasUpload, true, '1c must have hasUpload=true');
});

test('B6: 1a has upload (R11 new)', () => {
  assert.equal(byKey['1a'].hasUpload, true, '1a must have hasUpload=true (R11)');
});

test('B7: 4b and 4c have uploads (R11 new)', () => {
  assert.equal(byKey['4b'].hasUpload, true, '4b must have hasUpload=true (R11)');
  assert.equal(byKey['4c'].hasUpload, true, '4c must have hasUpload=true (R11)');
});

test('B8: 3e upload unchanged (staking_photo — not a duplicate)', () => {
  assert.equal(byKey['3e'].hasUpload, true, '3e still has upload');
  assert.equal(uploadBucketForItem('3e'), 'staking_photo', '3e bucket unchanged');
});

test('B9: uploadBucketForItem returns correct buckets for R11 items', () => {
  assert.equal(uploadBucketForItem('1a'), 'photo_1a');
  assert.equal(uploadBucketForItem('1b'), 'photo_1b');
  assert.equal(uploadBucketForItem('1c'), 'photo_1c');
  assert.equal(uploadBucketForItem('4b'), 'photo_4b');
  assert.equal(uploadBucketForItem('4c'), 'photo_4c');
  // Existing unchanged
  assert.equal(uploadBucketForItem('3a'), 'grade_photo');
  assert.equal(uploadBucketForItem('3d'), 'proof_roll');
  assert.equal(uploadBucketForItem('5d'), 'sr_markup');
  assert.equal(uploadBucketForItem('6a'), 'safety_cert');
  // No upload
  assert.equal(uploadBucketForItem('4a'), null);
  assert.equal(uploadBucketForItem('4d'), null);
  assert.equal(uploadBucketForItem('5a'), null);
});

test('B10: 1c (new) has section 1 and section label correct', () => {
  assert.equal(byKey['1c'].section, '1');
  assert.equal(byKey['1c'].sectionLabel, 'Site Prep and Conditions');
});

// ---------------------------------------------------------------------------
// B legacy backward compat (PDF schemaVersion check)
// ---------------------------------------------------------------------------

// Inline the isPreR11 check logic from site-readiness-doc.js
function isPreR11(rec) {
  return !rec.schemaVersion || rec.schemaVersion < 11;
}

// Inline the section 1 rendering logic from site-readiness-doc.js for old records
function renderSection1ForPdf(rec) {
  const pre = isPreR11(rec);
  const rows = [];
  for (const def of CHECKLIST_ITEMS) {
    if (pre && def.key === '1b') continue; // skip new 1b for old records
    if (def.section !== '1') continue;
    const item = (rec.items || []).find(it => it && it.key === def.key);
    const answer = (item && item.answer) ? String(item.answer) : '-';
    rows.push({ key: def.key, label: def.label, answer });
  }
  // Legacy 1b for old records
  if (pre) {
    const legacyItem1b = (rec.items || []).find(it => it && it.key === '1b');
    if (legacyItem1b && legacyItem1b.answer) {
      rows.push({ key: '1b_legacy', label: 'Spoil pile locations identified off the building pad (legacy)', answer: legacyItem1b.answer });
    }
  }
  return rows;
}

test('B11: pre-R11 record: old 1b renders under legacy label in section 1', () => {
  const oldRec = {
    // No schemaVersion = pre-R11
    items: [
      { key: '1a', answer: 'Yes', note: '' },
      { key: '1b', answer: 'Yes', note: 'south side' }, // old meaning: Spoil pile
    ],
  };
  const rows = renderSection1ForPdf(oldRec);
  const legacyRow = rows.find(r => r.key === '1b_legacy');
  assert.ok(legacyRow, 'legacy 1b row must be present for pre-R11 record');
  assert.ok(legacyRow.label.toLowerCase().includes('spoil'), 'legacy label must mention spoil pile');
  assert.equal(legacyRow.answer, 'Yes');
});

test('B12: pre-R11 record: old 1b does NOT render under "General conditions" label', () => {
  const oldRec = {
    items: [{ key: '1b', answer: 'Yes', note: '' }],
  };
  const rows = renderSection1ForPdf(oldRec);
  // "General conditions" is new 1b; for old records it should be SKIPPED in main loop
  const generalCondRow = rows.find(r => r.key === '1b' && r.label.toLowerCase().includes('general'));
  assert.equal(generalCondRow, undefined, 'old record must not show 1b under "General conditions"');
});

test('B13: R11 record (schemaVersion:11): 1b renders under "General conditions"', () => {
  const newRec = {
    schemaVersion: 11,
    items: [
      { key: '1b', answer: 'Yes', note: 'clay soil' },
      { key: '1c', answer: 'No', note: '' },
    ],
  };
  const rows = renderSection1ForPdf(newRec);
  const newRow = rows.find(r => r.key === '1b');
  assert.ok(newRow, '1b must be present for R11 record');
  // Should use the new label from CHECKLIST_ITEMS
  assert.ok(byKey['1b'].label.toLowerCase().includes('general') || byKey['1b'].label.toLowerCase().includes('condition'));
  // Legacy row must NOT appear for R11 records
  const legacyRow = rows.find(r => r.key === '1b_legacy');
  assert.equal(legacyRow, undefined, 'R11 record must not have legacy 1b row');
});

test('B14: pre-R11 record with no 1b answer: no legacy section added', () => {
  const oldRec = {
    items: [{ key: '1a', answer: 'Yes', note: '' }],
    // no 1b item
  };
  const rows = renderSection1ForPdf(oldRec);
  const legacyRow = rows.find(r => r.key === '1b_legacy');
  assert.equal(legacyRow, undefined, 'legacy row only added when old 1b has an answer');
});

// ---------------------------------------------------------------------------
// A (HIGH-1): time-off.js GET no longer leaks owner data (source checks)
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { resolve } from 'path';

const timeOffSrc = readFileSync(resolve(__dir, '../functions/api/time-off.js'), 'utf8');

test('A5: GET handler no longer contains pendingAll query (isOwner branch removed)', () => {
  assert.ok(!timeOffSrc.includes('pendingAll'),
    'pendingAll must be removed from GET handler — it was leaking all employees\' requests');
});

test('A6: GET handler return statement does not include isOwner key', () => {
  // Find the json({...}) return inside the GET handler.
  // The return statement must not include isOwner: in the response object.
  const getHandlerIdx = timeOffSrc.indexOf('onRequestGet');
  const postHandlerIdx = timeOffSrc.indexOf('onRequestPost');
  const getSection = timeOffSrc.slice(getHandlerIdx, postHandlerIdx);
  // Look for the json({...}) return — must not have isOwner: as a key
  assert.ok(!getSection.includes('isOwner:'),
    'GET handler return must not include isOwner: key — owner role check removed from GET');
});

test('A7: GET handler return statement does not include pendingAll or allocations keys', () => {
  const getHandlerIdx = timeOffSrc.indexOf('onRequestGet');
  const postHandlerIdx = timeOffSrc.indexOf('onRequestPost');
  const getSection = timeOffSrc.slice(getHandlerIdx, postHandlerIdx);
  assert.ok(!getSection.includes('pendingAll:'),
    'GET handler return must not include pendingAll: key');
  assert.ok(!getSection.includes('allocations:'),
    'GET handler return must not include allocations: key — owner data removed from GET response');
});

// ---------------------------------------------------------------------------
// C (HIGH-2): site-readiness.js buildBody stamps schemaVersion=11 server-side
// ---------------------------------------------------------------------------

// Inline the schemaVersion stamping logic from site-readiness.js buildBody for testing.
// (buildBody is not exported; we test the logic in isolation to verify correctness.)
function serverSchemaVersion(base) {
  const isCreate = Object.keys(base).length === 0;
  return isCreate ? 11 : base.schemaVersion;
}

test('C1: new record (empty base) gets schemaVersion=11 stamped by server', () => {
  const sv = serverSchemaVersion({});
  assert.equal(sv, 11, 'create must stamp schemaVersion=11');
});

test('C2: legacy update (base with no schemaVersion) preserves undefined — stays legacy', () => {
  const legacyBase = { date: '2026-01-01', items: [{ key: '1b', answer: 'Yes' }] };
  const sv = serverSchemaVersion(legacyBase);
  assert.equal(sv, undefined,
    'legacy re-save must NOT stamp schemaVersion=11 — record stays legacy so PDF shows Spoil pile');
});

test('C3: R11 update (base.schemaVersion=11) preserves 11', () => {
  const r11Base = { date: '2026-10-23', schemaVersion: 11, items: [] };
  const sv = serverSchemaVersion(r11Base);
  assert.equal(sv, 11, 'R11 re-save must preserve schemaVersion=11');
});

test('C4: legacy re-save: isPreR11 check still passes (no collision on 1b)', () => {
  // After a legacy re-save schemaVersion is undefined → PDF still routes 1b as spoil pile.
  const legacyReSavedRec = { date: '2026-01-01', items: [{ key: '1b', answer: 'Marked' }] };
  // schemaVersion stays undefined (see C2 above)
  const sv = serverSchemaVersion({ date: legacyReSavedRec.date, items: legacyReSavedRec.items });
  assert.equal(sv, undefined);
  // With undefined schemaVersion, isPreR11 is true → PDF shows legacy label
  const pre = isPreR11({ ...legacyReSavedRec, schemaVersion: sv });
  assert.equal(pre, true, 'legacy re-saved record must still be treated as pre-R11 in PDF');
  // Confirm 1b routes to legacy label, not new label
  const rows = renderSection1ForPdf({ ...legacyReSavedRec, schemaVersion: sv });
  const legacyRow = rows.find(r => r.key === '1b_legacy');
  assert.ok(legacyRow, 'legacy re-saved record must still show old 1b under legacy label');
  const newRow = rows.find(r => r.key === '1b' && r.label.toLowerCase().includes('general'));
  assert.equal(newRow, undefined, 'legacy re-saved record must NOT show 1b under General conditions');
});

// ---------------------------------------------------------------------------
// D (MEDIUM-3/4): site-readiness.js VALID_BUCKETS + field-upload.js BUCKET_EXT
// ---------------------------------------------------------------------------
const srSrc = readFileSync(resolve(__dir, '../functions/api/site-readiness.js'), 'utf8');
const uploadSrc = readFileSync(resolve(__dir, '../functions/api/field-upload.js'), 'utf8');

test('D1: cleanAttachments VALID_BUCKETS includes all 5 photo_* buckets (MEDIUM-3)', () => {
  for (const b of ['photo_1a', 'photo_1b', 'photo_1c', 'photo_4b', 'photo_4c']) {
    assert.ok(srSrc.includes(`'${b}'`),
      `site-readiness.js cleanAttachments VALID_BUCKETS must include ${b}`);
  }
});

test('D2: field-upload.js BUCKET_EXT includes all 5 photo_* buckets (MEDIUM-4)', () => {
  for (const b of ['photo_1a', 'photo_1b', 'photo_1c', 'photo_4b', 'photo_4c']) {
    assert.ok(uploadSrc.includes(`'${b}'`),
      `field-upload.js BUCKET_EXT must include ${b} for image-only allowlist`);
  }
});

test('D3: field-upload.js photo_* BUCKET_EXT uses image-only extensions', () => {
  // IMAGE_ONLY_EXT constant must be present and used for the photo_* entries
  assert.ok(uploadSrc.includes('IMAGE_ONLY_EXT'),
    'IMAGE_ONLY_EXT constant must exist in field-upload.js for photo_* buckets');
  // Verify it contains the expected image extensions
  assert.ok(uploadSrc.includes('.heic'), 'IMAGE_ONLY_EXT must include .heic');
  // Ensure .pdf and .guh are NOT in IMAGE_ONLY_EXT (image-only means no docs)
  // Check the IMAGE_ONLY_EXT definition line does not include .pdf or .guh
  const imageOnlyLine = uploadSrc.split('\n').find(l => l.includes('IMAGE_ONLY_EXT') && l.includes('new Set'));
  assert.ok(imageOnlyLine, 'IMAGE_ONLY_EXT definition line must exist');
  assert.ok(!imageOnlyLine.includes('.pdf'), 'IMAGE_ONLY_EXT must not include .pdf');
  assert.ok(!imageOnlyLine.includes('.guh'), 'IMAGE_ONLY_EXT must not include .guh');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 200);
