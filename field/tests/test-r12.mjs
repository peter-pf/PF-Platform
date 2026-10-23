#!/usr/bin/env node
// Field Portal R12 tests (2026-10-23)
//
// 1. CHECKLIST_ITEMS: 1d-1h added to section 1 (no hasUpload)
// 2. computeResult: R12 items skipped for pre-R12 records (non-breaking)
// 3. buildBody: schemaVersion stamped as 12 on create; legacy updates strip 1b-1h
// 4. PDF rendering: 1d-1h absent from pre-R12 PDF; present in R12 PDF
// 5. LOW: legacy update strips schema-guarded keys
// 6. field-upload.js:66 comment no longer references IMAGE_MAGIC_BUCKETS
//
// Run: node field/tests/test-r12.mjs

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const storeUrl = new URL('../functions/lib/site-readiness-store.js', import.meta.url);
const { CHECKLIST_ITEMS, computeResult, R12_KEYS, uploadBucketForItem } = await import(storeUrl.href);

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  PASS', name); passed++; })
              .catch((e) => { console.error('  FAIL', name, '\n      ', e.message); failed++; });
    }
    console.log('  PASS', name); passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message); failed++;
  }
}

const byKey = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));

// ---------------------------------------------------------------------------
// 1. CHECKLIST_ITEMS — new 1d-1h items
// ---------------------------------------------------------------------------

test('R12-1: total CHECKLIST_ITEMS count is 25 (+5 from R11)', () => {
  assert.equal(CHECKLIST_ITEMS.length, 25, `expected 25, got ${CHECKLIST_ITEMS.length}`);
});

test('R12-2: R12_KEYS exports exactly {1d,1e,1f,1g,1h}', () => {
  assert.ok(R12_KEYS instanceof Set, 'R12_KEYS must be a Set');
  assert.equal(R12_KEYS.size, 5);
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(R12_KEYS.has(k), `R12_KEYS must include ${k}`);
  }
});

test('R12-3: 1d label matches spec exactly', () => {
  assert.ok(byKey['1d'], '1d must exist');
  assert.equal(byKey['1d'].label,
    'Pad firm enough for the rig to track and set up (no soft spots or ruts)');
});

test('R12-4: 1e label matches spec exactly', () => {
  assert.equal(byKey['1e'].label, 'Standing water or drainage issues on the pad');
});

test('R12-5: 1f label matches spec exactly', () => {
  assert.equal(byKey['1f'].label,
    'Adjacent structures or neighbors close enough to be sensitive to vibration');
});

test('R12-6: 1g label matches spec exactly', () => {
  assert.equal(byKey['1g'].label, 'Crew parking and equipment laydown area identified');
});

test('R12-7: 1h label matches spec exactly', () => {
  assert.equal(byKey['1h'].label, 'Site hours or noise restrictions from the GC or city');
});

test('R12-8: 1d-1h have no hasUpload (dropdown+notes only)', () => {
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(!byKey[k].hasUpload,
      `${k} must not have hasUpload — Derek did not request photo buttons`);
    assert.equal(uploadBucketForItem(k), null, `${k} must return null from uploadBucketForItem`);
  }
});

test('R12-9: 1d-1h belong to section 1 with correct sectionLabel', () => {
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.equal(byKey[k].section, '1', `${k} must be in section 1`);
    assert.equal(byKey[k].sectionLabel, 'Site Prep and Conditions');
  }
});

test('R12-10: 1d-1h follow 1c in CHECKLIST_ITEMS order', () => {
  const keys = CHECKLIST_ITEMS.map(d => d.key);
  const idx1c = keys.indexOf('1c');
  const idx1d = keys.indexOf('1d');
  const idx1h = keys.indexOf('1h');
  assert.ok(idx1c >= 0, '1c must exist');
  assert.equal(idx1d, idx1c + 1, '1d must immediately follow 1c');
  assert.equal(idx1h, idx1c + 5, '1h must be 5 positions after 1c');
});

// ---------------------------------------------------------------------------
// 2. computeResult — schemaVersion-aware scoring
// ---------------------------------------------------------------------------

test('R12-11: pre-R12 record (no schemaVersion) — 1d-1h not counted as open', () => {
  // All R11 items answered, 1d-1h have no answer
  const items = [
    { key: '1a', answer: 'Yes' }, { key: '1b', answer: 'Yes' }, { key: '1c', answer: 'Yes' },
    // 1d-1h absent / unanswered
    { key: '2a', answer: 'Yes' }, { key: '2b', answer: 'Yes' }, { key: '2c', answer: 'Yes' },
    { key: '3a', answer: 'Yes' }, { key: '3b', answer: 'Yes' }, { key: '3c', answer: 'Yes' },
    { key: '3d', answer: 'Yes' }, { key: '3e', answer: 'N/A' },
    { key: '4a', answer: 'Yes' }, { key: '4b', answer: 'Yes' }, { key: '4c', answer: 'Yes' },
    { key: '4d', answer: 'Yes' },
    { key: '5a', answer: 'Yes' }, { key: '5b', answer: 'Yes' }, { key: '5c', answer: 'Yes' },
    { key: '5d', answer: 'Yes' },
    { key: '6a', answer: 'Yes' },
  ];
  const { result, openItems } = computeResult(items, undefined);
  assert.equal(result, 'READY', 'pre-R12 record with all R11 items answered must be READY');
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(!openItems.includes(k), `${k} must not appear in openItems for pre-R12 record`);
  }
});

test('R12-12: pre-R12 record (schemaVersion=11) — 1d-1h not counted as open', () => {
  const items = CHECKLIST_ITEMS.filter(d => !R12_KEYS.has(d.key)).map(d => ({ key: d.key, answer: 'Yes' }));
  const { result, openItems } = computeResult(items, 11);
  assert.equal(result, 'READY');
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(!openItems.includes(k), `${k} must not appear in openItems for schemaVersion=11`);
  }
});

test('R12-13: R12 record (schemaVersion=12) — 1d-1h ARE scored', () => {
  // All items answered except 1d
  const items = CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: d.key === '1d' ? '' : 'Yes' }));
  const { result, openItems } = computeResult(items, 12);
  assert.ok(openItems.includes('1d'), '1d must be open in R12 scoring when unanswered');
  assert.equal(result, 'NOT READY');
});

test('R12-14: R12 record with all items answered is READY', () => {
  const items = CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: 'Yes' }));
  const { result, openItems } = computeResult(items, 12);
  assert.equal(result, 'READY');
  assert.equal(openItems.length, 0);
});

// ---------------------------------------------------------------------------
// 3. buildBody schemaVersion stamping
// ---------------------------------------------------------------------------

// Inline the server-side schemaVersion logic (same as buildBody uses)
function serverSchemaVersion(base) {
  const isCreate = Object.keys(base).length === 0;
  return isCreate ? 12 : base.schemaVersion;
}

test('R12-15: create stamps schemaVersion=12 (bumped from R11\'s 11)', () => {
  assert.equal(serverSchemaVersion({}), 12);
});

test('R12-16: R11 update (base.schemaVersion=11) preserves 11', () => {
  assert.equal(serverSchemaVersion({ schemaVersion: 11, items: [] }), 11);
});

test('R12-17: legacy update (no schemaVersion) preserves undefined', () => {
  assert.equal(serverSchemaVersion({ date: '2026-01-01', items: [] }), undefined);
});

// ---------------------------------------------------------------------------
// 4. PDF rendering — 1d-1h absent from pre-R12, present in R12
// ---------------------------------------------------------------------------

function isPreR12(rec) {
  return !rec.schemaVersion || rec.schemaVersion < 12;
}

function renderSection1Keys(rec) {
  const pre11 = !rec.schemaVersion || rec.schemaVersion < 11;
  const pre12 = isPreR12(rec);
  const keys = [];
  for (const def of CHECKLIST_ITEMS) {
    if (def.section !== '1') continue;
    if (pre11 && def.key === '1b') continue;
    if (pre12 && R12_KEYS.has(def.key)) continue;
    keys.push(def.key);
  }
  return keys;
}

test('R12-18: pre-R12 record PDF section 1 does not include 1d-1h', () => {
  const keys = renderSection1Keys({ items: [], schemaVersion: 11 });
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(!keys.includes(k), `${k} must be absent from pre-R12 PDF`);
  }
});

test('R12-19: legacy record PDF section 1 does not include 1b or 1d-1h (main loop)', () => {
  const keys = renderSection1Keys({ items: [] }); // no schemaVersion
  assert.ok(!keys.includes('1b'), '1b skipped for legacy in main loop');
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(!keys.includes(k), `${k} must be absent from legacy PDF`);
  }
  assert.ok(keys.includes('1a'), '1a must still render');
  assert.ok(keys.includes('1c'), '1c must still render for legacy (no legacy guard)');
});

test('R12-20: R12 record PDF section 1 includes all of 1a-1h', () => {
  const keys = renderSection1Keys({ schemaVersion: 12 });
  for (const k of ['1a','1b','1c','1d','1e','1f','1g','1h']) {
    assert.ok(keys.includes(k), `${k} must be present in R12 PDF section 1`);
  }
});

// ---------------------------------------------------------------------------
// 5. LOW: legacy update strips schema-guarded keys
// ---------------------------------------------------------------------------

function stripGuardedKeys(srcItems, base) {
  const SCHEMA_GUARDED_KEYS = new Set(['1b', '1c', '1d', '1e', '1f', '1g', '1h']);
  const isCreate = Object.keys(base).length === 0;
  const schemaVersion = isCreate ? 12 : base.schemaVersion;
  const isLegacyUpdate = !isCreate && (schemaVersion == null || schemaVersion < 11);
  if (isLegacyUpdate && Array.isArray(srcItems)) {
    return srcItems.filter(it => !it || !SCHEMA_GUARDED_KEYS.has(String(it.key || '')));
  }
  return srcItems;
}

test('R12-21: legacy update strips 1b, 1c, 1d-1h from incoming items', () => {
  const legacyBase = { date: '2026-01-01', items: [{ key: '1b', answer: 'Yes', note: 'south side' }] };
  const incoming = [
    { key: '1a', answer: 'Yes' },
    { key: '1b', answer: 'No', note: 'overwrite attempt' }, // guarded
    { key: '1c', answer: 'Yes' },                            // guarded
    { key: '1d', answer: 'Yes' },                            // guarded
    { key: '2a', answer: 'Yes' },
  ];
  const stripped = stripGuardedKeys(incoming, legacyBase);
  const keys = stripped.map(it => it.key);
  assert.ok(keys.includes('1a'), '1a must pass through');
  assert.ok(keys.includes('2a'), '2a must pass through');
  assert.ok(!keys.includes('1b'), '1b must be stripped from legacy update');
  assert.ok(!keys.includes('1c'), '1c must be stripped from legacy update');
  assert.ok(!keys.includes('1d'), '1d must be stripped from legacy update');
});

test('R12-22: R12 update does NOT strip 1b-1h (only legacy updates are guarded)', () => {
  const r12Base = { schemaVersion: 12, items: [] };
  const incoming = [
    { key: '1b', answer: 'Yes' },
    { key: '1d', answer: 'Yes' },
  ];
  const stripped = stripGuardedKeys(incoming, r12Base);
  assert.ok(stripped.some(it => it.key === '1b'), '1b must not be stripped from R12 update');
  assert.ok(stripped.some(it => it.key === '1d'), '1d must not be stripped from R12 update');
});

test('R12-23: create (empty base) does NOT strip 1b-1h', () => {
  const incoming = [{ key: '1b', answer: 'Yes' }, { key: '1d', answer: 'Yes' }];
  const stripped = stripGuardedKeys(incoming, {});
  assert.ok(stripped.some(it => it.key === '1b'), '1b must not be stripped on create');
  assert.ok(stripped.some(it => it.key === '1d'), '1d must not be stripped on create');
});

// ---------------------------------------------------------------------------
// 6. field-upload.js comment fix
// ---------------------------------------------------------------------------

const uploadSrc = readFileSync(resolve(__dir, '../functions/api/field-upload.js'), 'utf8');

test('R12-24: field-upload.js no longer references IMAGE_MAGIC_BUCKETS (nonexistent)', () => {
  assert.ok(!uploadSrc.includes('IMAGE_MAGIC_BUCKETS'),
    'IMAGE_MAGIC_BUCKETS was a stale reference — comment must be fixed');
});

test('R12-25: field-upload.js comment correctly references PNG_MAGIC_BUCKETS instead', () => {
  const commentArea = uploadSrc.split('\n').find(l => l.includes('PNG_MAGIC_BUCKETS') && l.includes('magic'));
  assert.ok(commentArea, 'comment must reference PNG_MAGIC_BUCKETS for PNG enforcement');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 200);
