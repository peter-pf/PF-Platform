#!/usr/bin/env node
// Unit test: site-readiness-store.js + computeResult logic.
//
// Tests:
//   1. upsertRecord creates a new record (D1 path)
//   2. upsertRecord updates an existing record (KV fallback path)
//   3. loadRecordById returns the stored record
//   4. listRecords filters by projectId
//   5. countRecords returns the correct count
//   6. computeResult: all Yes/N/A -> READY
//   7. computeResult: one No -> NOT READY with openItems
//   8. computeResult: blank answer counts as open
//   9. Concurrent upsert of two distinct records doesn't lose either
//
// Uses a pure-JS mock D1 that matches the Workers D1 API surface.
// No native deps required.

import { strict as assert } from 'assert';

// ---- Mock D1 ---------------------------------------------------------------
function makeMockD1() {
  const rows = new Map();

  function execute(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^INSERT OR REPLACE INTO site_readiness/i.test(s)) {
      const [id, project_number, inspection_date, result, status, data, created_at, updated_at, updated_by] = params;
      rows.set(id, { id, project_number, inspection_date, result, status, data, created_at, updated_at, updated_by });
      return { results: [] };
    }
    if (/^INSERT OR IGNORE INTO site_readiness/i.test(s)) {
      const [id, project_number, inspection_date, result, status, data, created_at, updated_at, updated_by] = params;
      if (!rows.has(id)) {
        rows.set(id, { id, project_number, inspection_date, result, status, data, created_at, updated_at, updated_by });
      }
      return { results: [] };
    }
    if (/^SELECT data FROM site_readiness WHERE id = \?/i.test(s)) {
      const r = rows.get(params[0]);
      return { results: r ? [r] : [] };
    }
    if (/^SELECT data FROM site_readiness/i.test(s)) {
      // Minimal filter: project_number equality if present in SQL.
      let vals = Array.from(rows.values());
      if (/project_number = \?/i.test(s) && params[0]) {
        vals = vals.filter(r => r.project_number === params[0]);
      }
      return { results: vals };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM site_readiness/i.test(s)) {
      return { results: [{ n: rows.size }] };
    }
    throw new Error('Mock D1: unhandled SQL: ' + s);
  }

  const db = {
    _rows: rows,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run()   { return execute(sql, params); },
            async first() { const r = execute(sql, params); return r.results[0] || null; },
            async all()   { return execute(sql, params); },
          };
        },
      };
    },
  };
  return db;
}

// ---- Mock KV ---------------------------------------------------------------
function makeMockKV() {
  const store = new Map();
  return {
    async get(key, opts) {
      const v = store.get(key);
      if (v == null) return null;
      return (opts === 'json' || (opts && opts.type === 'json')) ? JSON.parse(v) : v;
    },
    async put(key, val) { store.set(key, typeof val === 'string' ? val : JSON.stringify(val)); },
  };
}

// ---- Dynamic import of store -----------------------------------------------
const storeUrl = new URL('../functions/lib/site-readiness-store.js', import.meta.url);
const {
  upsertRecord, loadRecordById, listRecords, countRecords, computeResult, CHECKLIST_ITEMS,
  uploadBucketForItem
} = await import(storeUrl.href);

// ---- Helpers ---------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch(e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
async function testAsync(name, fn) {
  try { await fn(); console.log('  PASS', name); passed++; }
  catch(e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

function makeRecord(overrides = {}) {
  const now = new Date().toISOString();
  const items = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'Yes', note: '' }));
  return Object.assign({
    id:            'sr_test_' + Math.random().toString(36).slice(2),
    projectId:     '26-001',
    projectName:   'Test Project',
    date:          '2026-10-20',
    gcContact:     'Acme GC',
    siteAddress:   '123 Test St',
    inspectedBy:   'Peter',
    status:        'draft',
    result:        'READY',
    openItems:     [],
    items,
    attachments:   [],
    sigName:       '',
    sigDate:       '',
    createdAt:     now,
    updatedAt:     now,
    updatedBy:     'peter',
  }, overrides);
}

// ============================================================
console.log('\n--- computeResult ---');

test('all Yes -> READY', () => {
  const items = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'Yes', note: '' }));
  const r = computeResult(items);
  assert.equal(r.result, 'READY');
  assert.equal(r.openItems.length, 0);
});

test('all N/A -> READY', () => {
  const items = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'N/A', note: '' }));
  const r = computeResult(items);
  assert.equal(r.result, 'READY');
  assert.equal(r.openItems.length, 0);
});

test('one No -> NOT READY, appears in openItems', () => {
  const items = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'Yes', note: '' }));
  items[0].answer = 'No';
  const r = computeResult(items);
  assert.equal(r.result, 'NOT READY');
  assert.equal(r.openItems[0], items[0].key);
});

test('blank answer -> NOT READY', () => {
  const items = (CHECKLIST_ITEMS || []).map(d => ({ key: d.key, answer: 'Yes', note: '' }));
  items[2].answer = '';
  const r = computeResult(items);
  assert.equal(r.result, 'NOT READY');
  assert(r.openItems.includes(items[2].key));
});

test('mixed Yes/N/A -> READY', () => {
  const items = (CHECKLIST_ITEMS || []).map((d, i) => ({ key: d.key, answer: i % 2 === 0 ? 'Yes' : 'N/A', note: '' }));
  const r = computeResult(items);
  assert.equal(r.result, 'READY');
  assert.equal(r.openItems.length, 0);
});

// ============================================================
console.log('\n--- store (D1 path) ---');

await testAsync('upsertRecord creates record in D1', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  const rec = makeRecord();
  const stamp = await upsertRecord(env, rec);
  // upsertRecord returns a timestamp string (ISO) on success.
  assert(typeof stamp === 'string', 'expected timestamp string, got: ' + typeof stamp);
  assert(db._rows.has(rec.id), 'row not in D1');
  // Verify round-trip.
  const loaded = await loadRecordById(env, rec.id);
  assert.equal(loaded.id, rec.id);
  assert.equal(loaded.projectId, '26-001');
});

await testAsync('upsertRecord updates existing record', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  const rec = makeRecord({ gcContact: 'First GC' });
  await upsertRecord(env, rec);
  const updated = Object.assign({}, rec, { gcContact: 'Updated GC', updatedAt: new Date().toISOString() });
  await upsertRecord(env, updated);
  assert.equal(db._rows.size, 1, 'should still be 1 row');
  const loaded = await loadRecordById(env, rec.id);
  assert.equal(loaded.gcContact, 'Updated GC');
});

await testAsync('loadRecordById returns stored record', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  const rec = makeRecord({ projectName: 'Bridge Project' });
  await upsertRecord(env, rec);
  const loaded = await loadRecordById(env, rec.id);
  assert(loaded, 'no record returned');
  assert.equal(loaded.projectName, 'Bridge Project');
});

await testAsync('listRecords filters by projectId', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  await upsertRecord(env, makeRecord({ id: 'sr_a', projectId: '26-001' }));
  await upsertRecord(env, makeRecord({ id: 'sr_b', projectId: '26-002' }));
  const res = await listRecords(env, { projectId: '26-001' });
  const list = res.records || res;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'sr_a');
});

await testAsync('countRecords returns correct count', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  assert.equal(await countRecords(env), 0);
  await upsertRecord(env, makeRecord({ id: 'sr_x1' }));
  await upsertRecord(env, makeRecord({ id: 'sr_x2' }));
  assert.equal(await countRecords(env), 2);
});

// ============================================================
console.log('\n--- concurrent upsert (two distinct IDs) ---');

await testAsync('concurrent upsert of two records loses neither', async () => {
  const db = makeMockD1();
  const kv = makeMockKV();
  const env = { DB: db, PF_SCHEDULE: kv };
  const r1 = makeRecord({ id: 'sr_c1', projectId: '26-001' });
  const r2 = makeRecord({ id: 'sr_c2', projectId: '26-002' });
  await Promise.all([upsertRecord(env, r1), upsertRecord(env, r2)]);
  assert(db._rows.has('sr_c1'), 'sr_c1 lost');
  assert(db._rows.has('sr_c2'), 'sr_c2 lost');
});

// ============================================================
console.log('\n--- KV fallback ---');

await testAsync('store writes to KV when D1 missing', async () => {
  const kv = makeMockKV();
  const env = { PF_SCHEDULE: kv }; // no DB
  const rec = makeRecord({ id: 'sr_kv1', projectId: '26-010' });
  const stamp = await upsertRecord(env, rec);
  // KV path returns a timestamp string (ISO from saveListToKV).
  assert(typeof stamp === 'string', 'expected timestamp string');
  const raw = await kv.get('site_readiness_v1');
  const parsed = JSON.parse(raw);
  assert(Array.isArray(parsed.records), 'KV value.records should be array');
  assert(parsed.records.some(r => r.id === 'sr_kv1'), 'sr_kv1 not in KV');
});

await testAsync('loadRecordById falls back to KV', async () => {
  const kv = makeMockKV();
  const env = { PF_SCHEDULE: kv };
  const rec = makeRecord({ id: 'sr_kv2', siteAddress: 'KV Fallback Rd' });
  await upsertRecord(env, rec);
  const loaded = await loadRecordById(env, 'sr_kv2');
  assert(loaded, 'no record from KV fallback');
  assert.equal(loaded.siteAddress, 'KV Fallback Rd');
});

// ============================================================
console.log('\n--- CHECKLIST_ITEMS ---');

// R10: updated expectations for 19-item structure.
test('CHECKLIST_ITEMS has exactly 19 items (R10: sections 1-6)', () => {
  assert.equal((CHECKLIST_ITEMS || []).length, 19,
    `expected 19, got ${(CHECKLIST_ITEMS || []).length}`);
});

test('R10: items with hasUpload=true are 3a, 3d, 3e, 5d, 6a', () => {
  const by = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));
  assert.equal(by['3a'] && by['3a'].hasUpload, true, '3a missing hasUpload');
  assert.equal(by['3d'] && by['3d'].hasUpload, true, '3d missing hasUpload');
  assert.equal(by['3e'] && by['3e'].hasUpload, true, '3e missing hasUpload');
  assert.equal(by['5d'] && by['5d'].hasUpload, true, '5d missing hasUpload (R10)');
  assert.equal(by['6a'] && by['6a'].hasUpload, true, '6a missing hasUpload (R10)');
  assert(!by['4d'].hasUpload, '4d should NOT have hasUpload in R10');
});

test('items without upload do not have hasUpload', () => {
  const withoutUp = ['1a', '1b', '2a', '2b', '2c', '3b', '3c', '4a', '4b', '4c', '4d', '5a', '5b', '5c'];
  const by = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));
  withoutUp.forEach(k => {
    assert(!by[k].hasUpload, k + ' should not have hasUpload');
  });
});

test('2c label is the R9 updated description', () => {
  const by = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));
  assert(by['2c'].label.includes('underground utilities'), '2c label should include "underground utilities"');
  assert(by['2c'].label.includes('building pad'), '2c label should include "building pad"');
});

test('R10: uploadBucketForItem maps 5d->sr_markup and 6a->safety_cert (4d->null)', () => {
  assert.equal(uploadBucketForItem('3a'), 'grade_photo',   '3a->grade_photo');
  assert.equal(uploadBucketForItem('3d'), 'proof_roll',    '3d->proof_roll');
  assert.equal(uploadBucketForItem('3e'), 'staking_photo', '3e->staking_photo');
  assert.equal(uploadBucketForItem('5d'), 'sr_markup',     '5d->sr_markup (R10)');
  assert.equal(uploadBucketForItem('6a'), 'safety_cert',   '6a->safety_cert (R10)');
  assert.equal(uploadBucketForItem('4d'), null,            '4d->null (R10: no upload on 4d)');
  assert.equal(uploadBucketForItem('1a'), null,            '1a->null');
});

test('R10: new items in correct sections', () => {
  const by = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));
  assert.equal(by['3e'].section, '3', '3e should be in section 3');
  assert.equal(by['4a'].sectionLabel, 'Trucking Plan', '4a section is Trucking Plan');
  assert.equal(by['5d'].section, '5', '5d should be in section 5');
  assert.equal(by['6a'].section, '6', '6a should be in section 6');
});

test('R10: 4b label is Trucking Plan item', () => {
  const by = Object.fromEntries((CHECKLIST_ITEMS || []).map(d => [d.key, d]));
  assert(by['4b'].label.toLowerCase().includes('unload') || by['4b'].label.toLowerCase().includes('street'),
    '4b label should reference unload/street (R10 trucking item)');
});

// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
