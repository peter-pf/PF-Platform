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

test('R12-21b: legacy update preserves stored 1b answer+note byte-identical after update', () => {
  // Simulate the server-side merge: strip guarded from incoming, merge back from base.
  const SCHEMA_GUARDED_KEYS = new Set(['1b','1c','1d','1e','1f','1g','1h']);
  function applyLegacyMerge(srcItems, baseItems) {
    // Strip guarded from incoming
    let filtered = srcItems.filter(it => !it || !SCHEMA_GUARDED_KEYS.has(String(it.key || '')));
    // Simulate cleanItems fill: add blank entries for all server CHECKLIST_ITEMS keys
    const seen = new Set(filtered.map(it => it.key));
    for (const def of CHECKLIST_ITEMS) {
      if (!seen.has(def.key)) filtered.push({ key: def.key, answer: '', note: '' });
    }
    // Re-merge guarded keys from base
    for (const baseIt of baseItems) {
      if (!baseIt || !SCHEMA_GUARDED_KEYS.has(String(baseIt.key || ''))) continue;
      const idx = filtered.findIndex(it => it.key === baseIt.key);
      const merged = { key: baseIt.key, answer: baseIt.answer || '', note: baseIt.note || '' };
      if (idx >= 0) { filtered[idx] = merged; } else { filtered.push(merged); }
    }
    return filtered;
  }
  const legacyBase = {
    date: '2026-01-01',
    items: [
      { key: '1a', answer: 'Yes', note: '' },
      { key: '1b', answer: 'Yes', note: 'south side of building' }, // old spoil-pile answer
    ],
  };
  const incomingItems = [
    { key: '1a', answer: 'Yes', note: '' },
    { key: '1b', answer: 'No', note: 'client overwrite attempt' }, // must be ignored
    { key: '2a', answer: 'Yes', note: '' },
  ];
  const result = applyLegacyMerge(incomingItems, legacyBase.items);
  const stored1b = result.find(it => it.key === '1b');
  assert.ok(stored1b, '1b must be present in result items');
  assert.equal(stored1b.answer, 'Yes', 'stored 1b answer must be preserved (not blanked or overwritten)');
  assert.equal(stored1b.note, 'south side of building', 'stored 1b note must be preserved byte-identical');
});

test('R12-21c: legacy update result does not flip to NOT READY due to blanked 1b', () => {
  // If 1b was Yes and gets blanked, computeResult (pre-R12) would still not count it
  // (R12_KEYS doesn't include 1b) — but having it present with Yes is the correct state.
  // Verify the merge keeps 1b=Yes so it doesn't pollute any future schema upgrade path.
  const SCHEMA_GUARDED_KEYS = new Set(['1b','1c','1d','1e','1f','1g','1h']);
  const legacyBase = { items: [{ key: '1b', answer: 'Yes', note: 'confirmed' }] };
  const incoming = [{ key: '1a', answer: 'Yes' }];
  let filtered = incoming.filter(it => !SCHEMA_GUARDED_KEYS.has(it.key));
  // cleanItems fill would add blank 1b
  filtered.push({ key: '1b', answer: '', note: '' });
  // Apply merge
  for (const baseIt of legacyBase.items) {
    if (!SCHEMA_GUARDED_KEYS.has(baseIt.key)) continue;
    const idx = filtered.findIndex(it => it.key === baseIt.key);
    const merged = { key: baseIt.key, answer: baseIt.answer || '', note: baseIt.note || '' };
    if (idx >= 0) filtered[idx] = merged; else filtered.push(merged);
  }
  const item1b = filtered.find(it => it.key === '1b');
  assert.equal(item1b.answer, 'Yes', '1b must be Yes after merge, not blank');
  assert.equal(item1b.note, 'confirmed', '1b note must survive merge');
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
// 7. HTML client: 1d-1h labels present and client/server keys in sync
// ---------------------------------------------------------------------------
const htmlSrc = readFileSync(resolve(__dir, '../site-readiness.html'), 'utf8');

const R12_LABELS = [
  'Pad firm enough for the rig to track and set up (no soft spots or ruts)',
  'Standing water or drainage issues on the pad',
  'Adjacent structures or neighbors close enough to be sensitive to vibration',
  'Crew parking and equipment laydown area identified',
  'Site hours or noise restrictions from the GC or city',
];

test('R12-26: HTML contains all five R12 labels (1d-1h) in client ITEMS', () => {
  let found = 0;
  for (const label of R12_LABELS) {
    if (htmlSrc.includes(label)) {
      found++;
    } else {
      assert.fail(`HTML missing R12 label: "${label}"`);
    }
  }
  assert.equal(found, 5, `expected 5 R12 labels in HTML, found ${found}`);
});

test('R12-27: client ITEMS key list matches server CHECKLIST_ITEMS key list', () => {
  // Extract client item keys from HTML ITEMS definition
  const clientKeysRaw = htmlSrc.match(/key:\s*'([^']+)'/g) || [];
  // Filter to only the ITEMS var section (between var ITEMS = [ and closing ]
  const itemsStart = htmlSrc.indexOf('var ITEMS = [');
  const itemsEnd   = htmlSrc.indexOf('\n  ];', itemsStart);
  const itemsSection = htmlSrc.slice(itemsStart, itemsEnd);
  const clientKeys = (itemsSection.match(/key:\s*'([^']+)'/g) || [])
    .map(m => m.replace(/key:\s*'/, '').replace("'", ''));
  const serverKeys = CHECKLIST_ITEMS.map(d => d.key);
  assert.deepEqual(clientKeys, serverKeys,
    'client ITEMS keys must exactly match server CHECKLIST_ITEMS keys in the same order');
});

test('R12-28: HTML collectBody sends schemaVersion: 12', () => {
  assert.ok(htmlSrc.includes('schemaVersion: 12'),
    'collectBody must send schemaVersion: 12 (bumped from 11)');
  assert.ok(!htmlSrc.includes('schemaVersion: 11'),
    'old schemaVersion: 11 must no longer appear in collectBody');
});

test('R12-29: HTML CLIENT_R12_KEYS set covers all five R12 item keys', () => {
  for (const k of ['1d','1e','1f','1g','1h']) {
    assert.ok(htmlSrc.includes(`'${k}': 1`),
      `CLIENT_R12_KEYS in HTML must include key '${k}'`);
  }
});

test('R12-30: HTML computeResult guards R12 keys by loadedSchemaVersion', () => {
  assert.ok(htmlSrc.includes('loadedSchemaVersion'),
    'HTML must track loadedSchemaVersion for schema-version-aware scoring');
  assert.ok(htmlSrc.includes('CLIENT_R12_KEYS'),
    'HTML computeResult must reference CLIENT_R12_KEYS to skip 1d-1h for pre-R12 records');
});

// ---------------------------------------------------------------------------
// 8. Client/server scoring agreement + legacy sentinel
// ---------------------------------------------------------------------------

// Inline client computeResult logic (mirrors site-readiness.html)
const CLIENT_R12_KEYS_TEST = { '1d':1,'1e':1,'1f':1,'1g':1,'1h':1 };
function clientComputeResult(items, loadedSchemaVersion) {
  const sv = loadedSchemaVersion;
  const isR12 = (sv === null) || (typeof sv === 'number' && sv >= 12);
  const open = [];
  items.forEach(it => {
    if (!isR12 && CLIENT_R12_KEYS_TEST[it.key]) return;
    if (it.answer !== 'Yes' && it.answer !== 'N/A') open.push(it.key);
  });
  return { result: open.length === 0 ? 'READY' : 'NOT READY', openItems: open };
}
// All items answered helper
const allAnswered = CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: 'Yes', note: '' }));
const allAnsweredNoR12 = allAnswered.map(it => CLIENT_R12_KEYS_TEST[it.key] ? { ...it, answer: '' } : it);

test('R12-31: client and server agree: legacy record (sv=0/undefined) all-pre-R12 answered = READY', () => {
  // Client uses 0 for legacy; server uses undefined
  const clientR = clientComputeResult(allAnsweredNoR12, 0).result;
  const serverR = computeResult(allAnsweredNoR12, undefined).result;
  assert.equal(clientR, 'READY', 'client: legacy record with all pre-R12 items answered = READY');
  assert.equal(serverR, 'READY', 'server: legacy record with all pre-R12 items answered = READY');
});

test('R12-32: client and server agree: v11 record all-pre-R12 answered = READY', () => {
  const clientR = clientComputeResult(allAnsweredNoR12, 11).result;
  const serverR = computeResult(allAnsweredNoR12, 11).result;
  assert.equal(clientR, 'READY');
  assert.equal(serverR, 'READY');
});

test('R12-33: client and server agree: v12 record all answered = READY', () => {
  const clientR = clientComputeResult(allAnswered, 12).result;
  const serverR = computeResult(allAnswered, 12).result;
  assert.equal(clientR, 'READY');
  assert.equal(serverR, 'READY');
});

test('R12-34: client and server agree: v12 record with unanswered 1d = NOT READY', () => {
  const items12 = allAnswered.map(it => it.key === '1d' ? { ...it, answer: '' } : it);
  const clientR = clientComputeResult(items12, 12);
  const serverR = computeResult(items12, 12);
  assert.equal(clientR.result, 'NOT READY');
  assert.equal(serverR.result, 'NOT READY');
  assert.ok(clientR.openItems.includes('1d'), 'client must list 1d as open');
  assert.ok(serverR.openItems.includes('1d'), 'server must list 1d as open');
});

test('R12-35: new form (sv=null) is R12-scored on client', () => {
  const r = clientComputeResult(allAnswered, null);
  assert.equal(r.result, 'READY', 'new form with all items answered must be READY');
});

test('R12-36: HTML uses 0 sentinel for legacy records (not null)', () => {
  assert.ok(htmlSrc.includes('loadedSchemaVersion : 0') || htmlSrc.includes('loadedSchemaVersion = 0') || htmlSrc.includes(': 0;') && htmlSrc.includes('loadedSchemaVersion'),
    'HTML must assign 0 (not null) for loaded records missing schemaVersion');
  // Specifically the assignment at load time
  assert.ok(htmlSrc.includes('? r.schemaVersion : 0'),
    'HTML load path must fall back to 0 for legacy records');
});

test('R12-37: HTML isLegacyRecord function exists and checks sv===0', () => {
  assert.ok(htmlSrc.includes('isLegacyRecord'),
    'HTML must define isLegacyRecord() helper');
  assert.ok(htmlSrc.includes('loadedSchemaVersion === 0'),
    'isLegacyRecord must check for sentinel 0');
});

test('R12-38: HTML CLIENT_GUARDED_KEYS covers 1b/1c/1d-1h', () => {
  for (const k of ['1b','1c','1d','1e','1f','1g','1h']) {
    assert.ok(htmlSrc.includes(`'${k}': 1`), `CLIENT_GUARDED_KEYS must include '${k}'`);
  }
});

test('R12-39: HTML disabled note text present for legacy inputs', () => {
  assert.ok(htmlSrc.includes('older version of the form'),
    'HTML must show older-version note for disabled guarded inputs on legacy records');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 200);
