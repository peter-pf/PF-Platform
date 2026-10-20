#!/usr/bin/env node
// Unit test: daily-report-store.js concurrent upsert safety.
//
// Proves that two simultaneous upsertReport calls with different IDs both
// land in the store without either being lost — fixing BLOCK-1.
//
// Uses a pure-JS mock D1 (Map-backed) that matches the Workers D1 API surface
// (prepare().bind().run() / .first() / .all()). No native deps required.

import { strict as assert } from 'assert';

// ---- Mock D1 ---------------------------------------------------------------
// In-memory SQLite substitute. Parses only the SQL patterns used by the store lib.
function makeMockD1() {
  const rows = new Map(); // id -> {id, project_number, report_date, status, data, created_at, updated_at, updated_by}

  function execute(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (/^INSERT OR REPLACE INTO daily_reports/i.test(s)) {
      const [id, project_number, report_date, status, data, created_at, updated_at, updated_by] = params;
      rows.set(id, { id, project_number, report_date, status, data, created_at, updated_at, updated_by });
      return { results: [] };
    }
    if (/^INSERT OR IGNORE INTO daily_reports/i.test(s)) {
      const [id, project_number, report_date, status, data, created_at, updated_at, updated_by] = params;
      if (!rows.has(id)) {
        rows.set(id, { id, project_number, report_date, status, data, created_at, updated_at, updated_by });
      }
      return { results: [] };
    }
    if (/^SELECT 1 FROM daily_reports/i.test(s)) {
      return { results: [{ 1: 1 }] };
    }
    if (/^SELECT data FROM daily_reports WHERE id = \?/i.test(s)) {
      const r = rows.get(params[0]);
      return { results: r ? [r] : [] };
    }
    if (/^SELECT data FROM daily_reports/i.test(s)) {
      // Return all (filter params ignored in mock — not needed for this test).
      return { results: Array.from(rows.values()) };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM daily_reports/i.test(s)) {
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

// ---- Import store lib -------------------------------------------------------
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
// This test lives in platform/migrations/ — store lib is at ../functions/lib/
const REPO = join(__dir, '../..');
const storePath = join(__dir, '../functions/lib/daily-report-store.js');

// Dynamic import (ESM).
const store = await import(storePath);
const { upsertReport, loadReportById, listReports, countReports } = store;

// ---- Test fixtures ----------------------------------------------------------
function makeRec(id, projectId = 'PROJ-1') {
  const now = new Date().toISOString();
  return {
    id, projectId, date: '2026-10-20', status: 'draft',
    projectName: 'Test Project', foreman: 'J. Smith',
    crew: [{ name: 'A. Crew', hours: 8, costCode: '001' }],
    createdBy: 'test', createdAt: now, updatedAt: now,
    submittedBy: null, submittedAt: null,
    editedBy: null, editedAt: null,
    pdfName: null, pdfWebUrl: null, emailedTo: null, sentAt: null,
  };
}

// ---- Tests ------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

console.log('=== daily-report-store unit tests ===\n');

// Test 1: Basic upsert and read-back.
await test('upsert + loadReportById round-trip', async () => {
  const db = makeMockD1();
  const env = { DB: db };
  const rec = makeRec('dr_test1');
  await upsertReport(env, rec);
  const got = await loadReportById(env, 'dr_test1');
  assert(got !== null, 'record should be found after upsert');
  assert.equal(got.id, 'dr_test1');
  assert.equal(got.projectId, 'PROJ-1');
});

// Test 2: Two concurrent upserts with different IDs — NEITHER is lost.
// This is the core fix for BLOCK-1.
await test('concurrent upserts with different IDs — neither is lost', async () => {
  const db = makeMockD1();
  const env = { DB: db };
  const recA = makeRec('dr_concA', 'PROJ-A');
  const recB = makeRec('dr_concB', 'PROJ-B');

  // Fire both upserts simultaneously (Promise.all).
  await Promise.all([upsertReport(env, recA), upsertReport(env, recB)]);

  const gotA = await loadReportById(env, 'dr_concA');
  const gotB = await loadReportById(env, 'dr_concB');

  assert(gotA !== null, 'recA must not be lost after concurrent upsert');
  assert(gotB !== null, 'recB must not be lost after concurrent upsert');
  assert.equal(gotA.projectId, 'PROJ-A', 'recA.projectId correct');
  assert.equal(gotB.projectId, 'PROJ-B', 'recB.projectId correct');
});

// Test 3: Old KV approach — proves the bug (read-modify-write loses a record).
// Simulates two writers racing on the same KV blob.
await test('OLD KV read-modify-write loses a concurrent record (demonstrates the bug being fixed)', async () => {
  // Simulate KV: a shared blob.
  let kvBlob = JSON.stringify({ version: 1, reports: [], meta: { updated: null } });
  const kvGet = async () => kvBlob;
  const kvPut = async (_, val) => { kvBlob = val; }; // last writer wins

  async function kvUpsert(rec) {
    const parsed = JSON.parse(await kvGet());
    const reports = parsed.reports || [];
    const idx = reports.findIndex((r) => r.id === rec.id);
    // --- artificial delay to simulate two workers reading before either writes ---
    await new Promise(r => setTimeout(r, 1));
    if (idx >= 0) reports[idx] = rec; else reports.push(rec);
    await kvPut('key', JSON.stringify({ version: 1, reports, meta: { updated: new Date().toISOString() } }));
  }

  const recA = makeRec('dr_kvA', 'PROJ-A');
  const recB = makeRec('dr_kvB', 'PROJ-B');

  // Race: both read the empty list, both write back only their own record.
  await Promise.all([kvUpsert(recA), kvUpsert(recB)]);

  const final = JSON.parse(kvBlob);
  // In the race, one record is likely dropped (last writer overwrites first).
  // This test PASSES when the old approach drops a record (proves the bug).
  const ids = final.reports.map(r => r.id);
  const dropped = !ids.includes('dr_kvA') || !ids.includes('dr_kvB');
  assert(dropped, 'KV read-modify-write SHOULD drop a record under concurrent write (demonstrates the bug)');
  console.log(`    KV final records: [${ids.join(', ')}] — ${dropped ? 'one dropped (bug confirmed)' : 'none dropped (race did not trigger)'}`);
});

// Test 4: D1 upsert idempotency — re-upserting same id replaces, not duplicates.
await test('upsert idempotency — same id replaces existing record', async () => {
  const db = makeMockD1();
  const env = { DB: db };
  const rec = makeRec('dr_idem');
  await upsertReport(env, rec);

  const updated = { ...rec, status: 'sent', sentAt: new Date().toISOString() };
  await upsertReport(env, updated);

  const { reports } = await listReports(env, {});
  assert.equal(reports.filter(r => r.id === 'dr_idem').length, 1, 'only one record with this id');
  assert.equal(reports.find(r => r.id === 'dr_idem').status, 'sent', 'record updated to sent');
});

// Test 5: countReports.
await test('countReports returns correct count', async () => {
  const db = makeMockD1();
  const env = { DB: db };
  assert.equal(await countReports(env), 0, 'empty store = 0');
  await upsertReport(env, makeRec('dr_c1'));
  await upsertReport(env, makeRec('dr_c2'));
  assert.equal(await countReports(env), 2, 'two records = 2');
});

// Test 6: KV fallback when env.DB is not set.
await test('KV fallback when D1 unavailable', async () => {
  let kvBlob = null;
  const env = {
    // No env.DB — D1 unavailable.
    PF_SCHEDULE: {
      async get() { return kvBlob; },
      async put(_, v) { kvBlob = v; },
    },
  };
  const rec = makeRec('dr_kv1');
  await upsertReport(env, rec);
  const got = await loadReportById(env, 'dr_kv1');
  assert(got !== null, 'KV fallback: record found');
  assert.equal(got.id, 'dr_kv1');
});

// Test 7: field-projects returns no financial keys.
await test('field-projects data contains no financial keys', async () => {
  const { FO_PROJECTS } = await import(
    join(REPO, 'field/functions/lib/fo-projects-data.js')
  );
  const FORBIDDEN = ['gc', 'gcName', 'contract', 'contractValue', 'bid', 'price',
    'revenue', 'margin', 'cost', 'invoice', 'rate', 'dollar', '$'];
  for (const p of FO_PROJECTS) {
    const keys = Object.keys(p);
    for (const k of keys) {
      assert(!FORBIDDEN.some(f => k.toLowerCase().includes(f)),
        `field-projects: key "${k}" looks financial`);
    }
    assert('number' in p, 'has number');
    assert('name' in p, 'has name');
    assert.equal(Object.keys(p).length, 2, 'only number + name keys');
  }
});

// Summary.
console.log('');
console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
