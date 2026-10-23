// test-sp-project-folders.mjs
// Tests for the shared SP project-folder resolver and field-projects KV caching.
// Uses mocks — no real Graph or KV calls made.

import assert from 'node:assert/strict';
import { nameMatchesProject, resolveAllProjectFolderNames } from '../functions/lib/sp-project-folders.js';

// ---- nameMatchesProject ---------------------------------------------------
{
  assert.ok(nameMatchesProject('26-012',                         '26-012'), 'exact match');
  assert.ok(nameMatchesProject('26-012 - Warrick Place',         '26-012'), 'space-hyphen match');
  assert.ok(nameMatchesProject('26-012-Variant',                 '26-012'), 'double-hyphen match');
  assert.ok(!nameMatchesProject('26-0120 - Other',               '26-012'), 'longer prefix not matched');
  assert.ok(!nameMatchesProject('26-011',                        '26-012'), 'different number');
  assert.ok(!nameMatchesProject(null,                            '26-012'), 'null name');
  console.log('nameMatchesProject: PASS');
}

// ---- resolveAllProjectFolderNames (mocked Graph) --------------------------

// Build a fake env and token; the function receives (env, token, projectNumbers).
const fakeEnv = { SP_DRIVE_ID: 'fake-drive-id' };
const fakeToken = 'fake-token';

// Mock global fetch for these tests.
let fetchCallCount = 0;
let mockResponses = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  fetchCallCount++;
  if (mockResponses.length === 0) throw new Error('No mock response for ' + url);
  const resp = mockResponses.shift();
  if (resp instanceof Error) throw resp;
  return { ok: resp.ok !== false, status: resp.status || 200, json: async () => resp.body };
};

// ---- L1: cache-miss path — all projects resolved from active listing ------
{
  fetchCallCount = 0;
  // Single active-listing response with two folders.
  mockResponses = [
    { body: { value: [
      { id: 'id-012', name: '26-012 - Warrick Place',    folder: {} },
      { id: 'id-026', name: '25-026 - The Granary - FlCo', folder: {} },
      { id: 'id-001', name: '001 - Completed Projects', folder: {} },
    ] } },
  ];

  const result = await resolveAllProjectFolderNames(fakeEnv, fakeToken, ['26-012', '25-026']);
  assert.equal(result['26-012'], '26-012 - Warrick Place',     'L1: 26-012 resolved to real SP folder name');
  assert.equal(result['25-026'], '25-026 - The Granary - FlCo', 'L1: 25-026 resolved to real SP folder name');
  assert.equal(fetchCallCount, 1, 'L1: exactly ONE Graph call for two active projects');
  console.log('L1 (cache-miss, active listing, 1 call): PASS');
}

// ---- L2: partial miss — one project in completed folder ------------------
{
  fetchCallCount = 0;
  mockResponses = [
    // Active listing: only 26-012 found
    { body: { value: [
      { id: 'id-012', name: '26-012 - Warrick Place', folder: {} },
    ] } },
    // Completed listing: year folders
    { body: { value: [{ id: 'yr-2025', name: '2025', folder: {} }] } },
    // Year 2025 contents: 25-026
    { body: { value: [{ id: 'id-026', name: '25-026 - The Granary - FlCo', folder: {} }] } },
  ];

  const result = await resolveAllProjectFolderNames(fakeEnv, fakeToken, ['26-012', '25-026']);
  assert.equal(result['26-012'], '26-012 - Warrick Place',     'L2: active project resolved');
  assert.equal(result['25-026'], '25-026 - The Granary - FlCo', 'L2: completed project resolved');
  assert.equal(fetchCallCount, 3, 'L2: 3 calls (active + completed root + year)');
  console.log('L2 (partial miss, completed fallback): PASS');
}

// ---- L3: null fallback — project not in SP yet ---------------------------
{
  fetchCallCount = 0;
  mockResponses = [
    // Active listing: no matching folder
    { body: { value: [{ id: 'other', name: '26-999 - Something Else', folder: {} }] } },
    // Completed listing: empty
    { body: { value: [] } },
  ];

  const result = await resolveAllProjectFolderNames(fakeEnv, fakeToken, ['26-012']);
  assert.equal(result['26-012'], null, 'L3: missing project returns null (not a guessed name)');
  console.log('L3 (null fallback for missing project): PASS');
}

// ---- L4: KV cache-hit simulation (field-projects caching logic) ----------
{
  // Simulate the KV read logic: cache hit returns stored value, avoids SP call.
  const NULL_SENTINEL = '__null__';
  const kvStore = { 'spfolder:26-012': '26-012 - Warrick Place', 'spfolder:26-999': NULL_SENTINEL };

  function simKvGet(key) { return kvStore[key] !== undefined ? kvStore[key] : null; }

  function simCacheLookup(numbers) {
    const hits = {}, misses = [];
    for (const num of numbers) {
      const val = simKvGet(`spfolder:${num}`);
      if (val !== null) { hits[num] = val === NULL_SENTINEL ? null : val; }
      else { misses.push(num); }
    }
    return { hits, misses };
  }

  const { hits, misses } = simCacheLookup(['26-012', '26-999', '26-001']);
  assert.equal(hits['26-012'],   '26-012 - Warrick Place', 'L4: cache hit returns real folder name');
  assert.equal(hits['26-999'],   null,                      'L4: null sentinel decoded to null');
  assert.deepEqual(misses,       ['26-001'],                'L4: only uncached number in misses');
  console.log('L4 (KV cache hit simulation): PASS');
}

// ---- L5: client buildUploadPath fallback text ----------------------------
{
  function buildUploadPath(projectNum, spFolder, date, bucket) {
    if (!projectNum || !date) return '';
    var root = (spFolder && spFolder.length)
      ? spFolder
      : 'Project ' + projectNum + ' folder (created on first upload)';
    if (bucket === 'safety_cert') return root + ' / 06 - Safety / ' + date;
    return root + ' / 05 - Field / 02 - Project Photos / ' + date;
  }

  // With real spFolder
  assert.equal(
    buildUploadPath('26-012', '26-012 - Warrick Place', '2026-10-23', 'photos'),
    '26-012 - Warrick Place / 05 - Field / 02 - Project Photos / 2026-10-23',
    'L5: real spFolder shown in path'
  );
  // With null spFolder — safe fallback (never guessed)
  assert.equal(
    buildUploadPath('26-012', null, '2026-10-23', 'photos'),
    'Project 26-012 folder (created on first upload) / 05 - Field / 02 - Project Photos / 2026-10-23',
    'L5: null spFolder uses safe fallback text, not a guessed name'
  );
  // Safety bucket
  assert.equal(
    buildUploadPath('26-012', '26-012 - Warrick Place', '2026-10-23', 'safety_cert'),
    '26-012 - Warrick Place / 06 - Safety / 2026-10-23',
    'L5: safety_cert uses 06 - Safety path'
  );
  console.log('L5 (client fallback text): PASS');
}

// Restore original fetch.
globalThis.fetch = originalFetch;

console.log('\nAll sp-project-folders tests PASSED.');
