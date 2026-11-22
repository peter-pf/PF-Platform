#!/usr/bin/env node
// test-sp-fo-projects-20261122.mjs
// Tests for the live SP-driven project list feature (Derek 11/22/2026).
//
// G1: Pure helpers — extractProjectNumber, extractProjectName, folderToProject
// G2: PROJECT_FOLDER_RE — real project folders in, non-project folders out
// G3: fetchLiveSpFoProjects — Graph mock, all 12 current SP folders returned
// G4: getSpFoProjects — KV cache hit (no Graph call)
// G5: getSpFoProjects — cache miss → live Graph → writes both KV keys
// G6: getSpFoProjects — Graph fails → last-good KV fallback
// G7: getSpFoProjects — Graph + last-good both absent → static FO_PROJECTS fallback
// G8: NJ entries never in getSpFoProjects return value
// G9: PROJ_NUM_RE compatibility — all SP-derived numbers pass server-side regex
// G10: Consumer integration — field-projects.js imports getSpFoProjects, NJ_RE gate
// G11: KV cache TTLs — live=900s, last-good=2592000s
// G12: spFolder = exact SP folder name (not extracted name)
//
// Run: node field/tests/test-sp-fo-projects-20261122.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
async function testAsync(name, fn) {
  try   { await fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

import {
  PROJECT_FOLDER_RE,
  KV_KEY_LIVE,
  KV_KEY_LAST_GOOD,
  KV_TTL_LIVE,
  KV_TTL_LAST_GOOD,
  FO_PROJECTS_SP_PATH,
  extractProjectNumber,
  extractProjectName,
  folderToProject,
  fetchLiveSpFoProjects,
  getSpFoProjects,
} from '../functions/lib/sp-fo-projects.js';

import { FO_PROJECTS } from '../functions/lib/fo-projects-data.js';

// The 12 live SP folders from "05 - Field Operations/01 - Projects" as of 2026-11-22.
// (Provided by Derek in the feature request.)
const LIVE_SP_FOLDERS = [
  '25-026 - The Granary - Noblesville, IN - FL & Co',
  '26-007 - Madison Parking Garage - Wilhelm',
  '26-020 - Vanderburgh Library - ARC - Evansville, IN',
  '26-024 - Leslie County ATC - F&M - Hyden, KY',
  '26-025 - Prysmian Expansion - Shiel Sexton - Indy',
  '26-026 - POET - North Manchester, IN',
  '26-027 - Westfield Ice Arena - Westfield, IN',
  '26-028 - The Hangar - Elford - Columbus, OH',
  '26-029 - Anderson Twnship PW Facility - Cincy',
  '26-030 - Hotel AVEC - Traverse City, MI',
  '26-031 - Int. School of Indiana Ph2 - Gilliatte - Indy',
  '26-099 - Equinix AT06 - Atlanta, GA',
];

// The three non-project entries that must be excluded.
const NON_PROJECT_ENTRIES = [
  '001 - Completed Jobs',
  '26-XXX - Project Name - Location Template',
  'John Receipts - Non Job Related',
];

// Server-side project-number regex (from field-upload.js, site-readiness.js).
const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;

// ============================================================
// G1: Pure helpers
// ============================================================
console.log('\nG1: extractProjectNumber / extractProjectName / folderToProject');

test('G1a: extractProjectNumber — standard dd-ddd format', () => {
  assert.equal(extractProjectNumber('26-028 - The Hangar - Elford - Columbus, OH'), '26-028');
  assert.equal(extractProjectNumber('25-026 - The Granary - Noblesville, IN - FL & Co'), '25-026');
  assert.equal(extractProjectNumber('26-099 - Equinix AT06 - Atlanta, GA'), '26-099');
});

test('G1b: extractProjectNumber — returns null for non-project folders', () => {
  assert.equal(extractProjectNumber('001 - Completed Jobs'), null);
  assert.equal(extractProjectNumber('26-XXX - Project Name - Location Template'), null);
  assert.equal(extractProjectNumber('John Receipts - Non Job Related'), null);
  assert.equal(extractProjectNumber(null), null);
  assert.equal(extractProjectNumber(''), null);
});

test('G1c: extractProjectName — first segment after number prefix', () => {
  assert.equal(extractProjectName('26-028 - The Hangar - Elford - Columbus, OH'),     'The Hangar');
  assert.equal(extractProjectName('26-026 - POET - North Manchester, IN'),              'POET');
  assert.equal(extractProjectName('26-029 - Anderson Twnship PW Facility - Cincy'),   'Anderson Twnship PW Facility');
  assert.equal(extractProjectName('26-030 - Hotel AVEC - Traverse City, MI'),          'Hotel AVEC');
  assert.equal(extractProjectName('26-031 - Int. School of Indiana Ph2 - Gilliatte - Indy'), 'Int. School of Indiana Ph2');
  assert.equal(extractProjectName('25-026 - The Granary - Noblesville, IN - FL & Co'), 'The Granary');
});

test('G1d: extractProjectName — returns null for non-project folders', () => {
  assert.equal(extractProjectName('001 - Completed Jobs'), null);
  assert.equal(extractProjectName('26-XXX - Project Name'), null);
});

test('G1e: folderToProject — produces {number, name, spFolder}', () => {
  const p = folderToProject('26-028 - The Hangar - Elford - Columbus, OH');
  assert.ok(p, 'folderToProject must not return null for a real folder');
  assert.equal(p.number,   '26-028');
  assert.equal(p.name,     'The Hangar');
  assert.equal(p.spFolder, '26-028 - The Hangar - Elford - Columbus, OH');
});

test('G1f: folderToProject — spFolder equals the EXACT original folder name', () => {
  const name = '25-026 - The Granary - Noblesville, IN - FL & Co';
  const p = folderToProject(name);
  // spFolder must be the exact folder name — that is what the client uses for the
  // upload path display and what field-upload.js matches with nameMatchesProject().
  assert.equal(p.spFolder, name, 'spFolder must equal the exact SP folder name, not the short name');
  assert.notEqual(p.spFolder, p.name, 'spFolder and name are different values');
});

test('G1g: folderToProject — returns null for non-project folders', () => {
  assert.equal(folderToProject('001 - Completed Jobs'), null);
  assert.equal(folderToProject('26-XXX - Project Name - Location Template'), null);
  assert.equal(folderToProject('John Receipts - Non Job Related'), null);
});

// ============================================================
// G2: PROJECT_FOLDER_RE filter
// ============================================================
console.log('\nG2: PROJECT_FOLDER_RE — real project folders in, non-project folders out');

test('G2a: PROJECT_FOLDER_RE matches all 12 live SP project folders', () => {
  for (const name of LIVE_SP_FOLDERS) {
    assert.ok(PROJECT_FOLDER_RE.test(name),
      `Expected PROJECT_FOLDER_RE to match: "${name}"`);
  }
});

test('G2b: PROJECT_FOLDER_RE excludes the 3 non-project entries', () => {
  for (const name of NON_PROJECT_ENTRIES) {
    assert.ok(!PROJECT_FOLDER_RE.test(name),
      `Expected PROJECT_FOLDER_RE NOT to match: "${name}"`);
  }
});

test('G2c: PROJECT_FOLDER_RE is non-vacuous — it actually rejects the 3 non-project entries', () => {
  // Prove: at least 1 non-project entry exists AND it fails the regex.
  assert.ok(NON_PROJECT_ENTRIES.length >= 3, 'Must have at least 3 non-project entries to exclude');
  const excluded = NON_PROJECT_ENTRIES.filter(n => !PROJECT_FOLDER_RE.test(n));
  assert.equal(excluded.length, 3, `All 3 non-project entries must be excluded, got: ${excluded.length}`);
});

test('G2d: FO_PROJECTS_SP_PATH is "05 - Field Operations/01 - Projects"', () => {
  assert.equal(FO_PROJECTS_SP_PATH, '05 - Field Operations/01 - Projects');
});

// ============================================================
// G3: fetchLiveSpFoProjects — Graph mock
// ============================================================
console.log('\nG3: fetchLiveSpFoProjects — Graph mock (12 live folders + 3 non-project entries)');

// Save original fetch; we will restore it after I/O tests.
const _origFetch = globalThis.fetch;
let _mockResponses = [];

function pushMock(resp) { _mockResponses.push(resp); }

globalThis.fetch = async (url) => {
  if (_mockResponses.length === 0) throw new Error('No mock response queued for: ' + url);
  const r = _mockResponses.shift();
  if (r instanceof Error) throw r;
  return { ok: r.ok !== false, status: r.status || 200, json: async () => r.body };
};

{
  // Build the mock listing: 12 real folders + 3 non-project entries + 1 loose file (no folder facet).
  const mockFolders = [
    ...LIVE_SP_FOLDERS.map(name => ({ id: 'id-' + name.slice(0, 6), name, folder: {} })),
    ...NON_PROJECT_ENTRIES.map(name => ({ id: 'id-np-' + name.slice(0, 4), name, folder: {} })),
    // Loose file (no folder facet) — must be excluded.
    { id: 'file-1', name: '2026 Field Operations Summary.xlsx' },
  ];
  pushMock({ body: { value: mockFolders } });

  const fakeEnv   = { SP_DRIVE_ID: 'fake-drive-id' };
  const fakeToken = 'fake-token';

  await testAsync('G3a: returns exactly 12 real project entries', async () => {
    const projects = await fetchLiveSpFoProjects(fakeEnv, fakeToken);
    assert.equal(projects.length, 12,
      `Expected 12 projects, got ${projects.length}: ${projects.map(p => p.number).join(', ')}`);
  });
}

{
  pushMock({ body: { value: LIVE_SP_FOLDERS.map(name => ({ id: 'id-' + name.slice(0, 6), name, folder: {} })) } });
  const fakeEnv   = { SP_DRIVE_ID: 'fake-drive-id' };
  const fakeToken = 'fake-token';

  await testAsync('G3b: results sorted by project number ascending', async () => {
    const projects = await fetchLiveSpFoProjects(fakeEnv, fakeToken);
    const numbers = projects.map(p => p.number);
    assert.deepEqual(numbers, [...numbers].sort(), `projects not sorted: ${numbers}`);
    assert.equal(numbers[0], '25-026', 'first project should be 25-026');
    assert.equal(numbers[numbers.length - 1], '26-099', 'last project should be 26-099');
  });
}

{
  pushMock({ body: { value: LIVE_SP_FOLDERS.map(name => ({ id: 'id-' + name.slice(0, 6), name, folder: {} })) } });
  const fakeEnv   = { SP_DRIVE_ID: 'fake-drive-id' };
  const fakeToken = 'fake-token';

  await testAsync('G3c: each result has number, name, spFolder (exact folder name)', async () => {
    const projects = await fetchLiveSpFoProjects(fakeEnv, fakeToken);
    for (const p of projects) {
      assert.ok(p.number && typeof p.number === 'string', `missing number on ${JSON.stringify(p)}`);
      assert.ok(p.name   && typeof p.name   === 'string', `missing name on ${p.number}`);
      assert.ok(p.spFolder && typeof p.spFolder === 'string', `missing spFolder on ${p.number}`);
      // spFolder must be the full folder name, not just the short name.
      assert.ok(p.spFolder.startsWith(p.number), `spFolder "${p.spFolder}" must start with number "${p.number}"`);
      assert.ok(p.spFolder.length > p.name.length + p.number.length,
        `spFolder "${p.spFolder}" should be longer than name + number (should include location/GC)`);
    }
  });
}

{
  // Empty folder listing (edge case — Graph returns no folders).
  pushMock({ body: { value: [] } });
  const fakeEnv   = { SP_DRIVE_ID: 'fake-drive-id' };
  const fakeToken = 'fake-token';

  await testAsync('G3d: returns empty array when SP folder has no matching children', async () => {
    const projects = await fetchLiveSpFoProjects(fakeEnv, fakeToken);
    assert.deepEqual(projects, []);
  });
}

// ============================================================
// G4: getSpFoProjects — KV cache hit (no Graph call)
// ============================================================
console.log('\nG4: getSpFoProjects — KV cache hit');

{
  const cachedProjects = [{ number: '26-028', name: 'The Hangar', spFolder: '26-028 - The Hangar - Elford - Columbus, OH' }];
  let fetchCallCount = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCallCount++; throw new Error('fetch must not be called on cache hit'); };

  const fakeKv = {
    gets: [],
    async get(key, opts) {
      this.gets.push(key);
      if (key === KV_KEY_LIVE) return cachedProjects;
      return null;
    },
    puts: [],
    async put(key, val) { this.puts.push(key); },
  };
  const fakeEnv = { PF_SCHEDULE: fakeKv, AZURE_CLIENT_ID: 'cid', AZURE_CLIENT_SECRET: 'cs', AZURE_TENANT_ID: 'tid', SP_DRIVE_ID: 'drv' };

  await testAsync('G4a: returns cached list immediately on KV hit, makes no Graph call', async () => {
    const result = await getSpFoProjects(fakeEnv);
    assert.deepEqual(result, cachedProjects, 'should return the cached list');
    assert.equal(fetchCallCount, 0, 'fetch must not be called when KV cache hits');
    assert.ok(fakeKv.gets.includes(KV_KEY_LIVE), 'must have checked KV_KEY_LIVE');
  });

  globalThis.fetch = origFetch;
}

// ============================================================
// G5: getSpFoProjects — cache miss → live Graph → writes both KV keys
// ============================================================
console.log('\nG5: getSpFoProjects — live fetch on cache miss, writes both KV keys');

{
  const liveProjects = LIVE_SP_FOLDERS.map(name => {
    const number = name.match(/^(\d{2}-\d{3,4}) - /)[1];
    const rest   = name.slice(number.length + 3);
    return { number, name: rest.split(' - ')[0].trim(), spFolder: name };
  });

  const kvStore = new Map();
  const fakeKv = {
    async get(key, opts) { return kvStore.has(key) ? kvStore.get(key) : null; },
    async put(key, val, opts) { kvStore.set(key, JSON.parse(val)); },
    _store: kvStore,
    _ttls: {},
    async putWithTtl(key, val, opts) {
      this._ttls[key] = opts && opts.expirationTtl;
      kvStore.set(key, JSON.parse(val));
    },
  };
  // Override put to capture TTL.
  fakeKv.put = async function(key, val, opts) {
    this._ttls[key] = opts && opts.expirationTtl;
    kvStore.set(key, JSON.parse(val));
  };

  // Queue: token response, then folder listing response.
  _mockResponses = [
    { body: { access_token: 'live-token', expires_in: 3600 } },
    { body: { value: LIVE_SP_FOLDERS.map(n => ({ id: 'id-' + n.slice(0,6), name: n, folder: {} })) } },
  ];

  const fakeEnv = {
    PF_SCHEDULE: fakeKv,
    AZURE_CLIENT_ID: 'cid',
    AZURE_CLIENT_SECRET: 'cs',
    AZURE_TENANT_ID: 'tid',
    SP_DRIVE_ID: 'drv',
  };

  await testAsync('G5a: returns live SP projects on cache miss', async () => {
    const result = await getSpFoProjects(fakeEnv);
    assert.equal(result.length, 12, `expected 12, got ${result.length}`);
    assert.equal(result[0].number, '25-026', 'first should be 25-026 (sorted)');
  });

  await testAsync('G5b: writes KV_KEY_LIVE with TTL 900s on live fetch', async () => {
    assert.ok(kvStore.has(KV_KEY_LIVE), 'KV_KEY_LIVE must be written after live fetch');
    assert.equal(fakeKv._ttls[KV_KEY_LIVE], KV_TTL_LIVE,
      `KV_KEY_LIVE TTL must be ${KV_TTL_LIVE}s (15 min), got ${fakeKv._ttls[KV_KEY_LIVE]}`);
  });

  await testAsync('G5c: writes KV_KEY_LAST_GOOD with TTL 2592000s on live fetch', async () => {
    assert.ok(kvStore.has(KV_KEY_LAST_GOOD), 'KV_KEY_LAST_GOOD must be written after live fetch');
    assert.equal(fakeKv._ttls[KV_KEY_LAST_GOOD], KV_TTL_LAST_GOOD,
      `KV_KEY_LAST_GOOD TTL must be ${KV_TTL_LAST_GOOD}s (30 days), got ${fakeKv._ttls[KV_KEY_LAST_GOOD]}`);
  });
}

// ============================================================
// G6: getSpFoProjects — Graph fails → last-good KV fallback
// ============================================================
console.log('\nG6: getSpFoProjects — Graph fails, last-good KV fallback');

{
  const lastGoodProjects = [
    { number: '26-028', name: 'The Hangar', spFolder: '26-028 - The Hangar - Elford - Columbus, OH' },
    { number: '26-029', name: 'Anderson Twnship PW Facility', spFolder: '26-029 - Anderson Twnship PW Facility - Cincy' },
  ];

  const kvStore = new Map();
  kvStore.set(KV_KEY_LAST_GOOD, lastGoodProjects);
  const fakeKv = {
    async get(key) { return kvStore.has(key) ? kvStore.get(key) : null; },
    async put(key, val) { kvStore.set(key, JSON.parse(val)); },
  };

  // Token request fails.
  _mockResponses = [new Error('token endpoint unreachable')];

  const fakeEnv = {
    PF_SCHEDULE: fakeKv,
    AZURE_CLIENT_ID: 'cid',
    AZURE_CLIENT_SECRET: 'cs',
    AZURE_TENANT_ID: 'tid',
    SP_DRIVE_ID: 'drv',
  };

  await testAsync('G6a: returns last-good list when Graph token fails', async () => {
    const result = await getSpFoProjects(fakeEnv);
    assert.deepEqual(result, lastGoodProjects,
      'must serve last-good list on Graph failure, not empty array');
  });
}

// ============================================================
// G7: getSpFoProjects — Graph + last-good both absent → static FO_PROJECTS
// ============================================================
console.log('\nG7: getSpFoProjects — static FO_PROJECTS fallback (no KV, no Graph)');

{
  const NJ_RE = /^NJ-/;

  // No Graph creds → graphConfigured returns false → skips to KV last_good → absent → static.
  const fakeEnv = {
    PF_SCHEDULE: null, // no KV
    // No Graph creds: graphConfigured() returns false
  };

  await testAsync('G7a: returns static FO_PROJECTS (real jobs only) when no KV and no Graph', async () => {
    const result = await getSpFoProjects(fakeEnv);
    assert.ok(result.length > 0, 'must not return empty list as fallback');
    // NJ entries must NOT be in the fallback list.
    assert.ok(!result.some(p => NJ_RE.test(p.number)),
      'NJ entries must not appear in getSpFoProjects fallback');
    // All real jobs from FO_PROJECTS should be present.
    const realFoProjects = FO_PROJECTS.filter(p => !NJ_RE.test(p.number));
    assert.equal(result.length, realFoProjects.length,
      `fallback length should equal real FO_PROJECTS length (${realFoProjects.length})`);
  });

  await testAsync('G7b: static fallback entries have spFolder: null', async () => {
    const result = await getSpFoProjects(fakeEnv);
    for (const p of result) {
      assert.equal(p.spFolder, null, `${p.number}: static fallback must have spFolder:null`);
    }
  });
}

// ============================================================
// G8: NJ entries never appear in getSpFoProjects
// ============================================================
console.log('\nG8: NJ entries not in getSpFoProjects (added separately by field-projects.js)');

{
  const NJ_RE = /^NJ-/;

  // Test with static fallback path (simplest — no mocking needed).
  await testAsync('G8a: static fallback contains no NJ entries', async () => {
    const result = await getSpFoProjects({ PF_SCHEDULE: null });
    assert.ok(!result.some(p => NJ_RE.test(p.number)),
      'NJ-* entries must never appear in getSpFoProjects output');
    // Non-vacuous: NJ-1 and NJ-2 DO exist in FO_PROJECTS.
    assert.ok(FO_PROJECTS.some(p => p.number === 'NJ-1'), 'NJ-1 must exist in FO_PROJECTS (proves G8a is non-vacuous)');
  });
}

// ============================================================
// G9: PROJ_NUM_RE compatibility — all SP-derived numbers pass server-side regex
// ============================================================
console.log('\nG9: PROJ_NUM_RE — all 12 SP-derived project numbers pass server-side regex');

test('G9a: all 12 current SP project folders produce numbers passing PROJ_NUM_RE', () => {
  for (const folderName of LIVE_SP_FOLDERS) {
    const p = folderToProject(folderName);
    assert.ok(p, `folderToProject returned null for: "${folderName}"`);
    assert.ok(PROJ_NUM_RE.test(p.number),
      `Project number "${p.number}" from "${folderName}" must pass PROJ_NUM_RE (/^[0-9]{2}-[0-9]{2,4}$/)`);
  }
});

test('G9b: non-project entries produce null from folderToProject (never reach server regex)', () => {
  for (const name of NON_PROJECT_ENTRIES) {
    assert.equal(folderToProject(name), null,
      `Non-project entry "${name}" must return null from folderToProject`);
  }
});

// ============================================================
// G10: Consumer integration — field-projects.js imports and wiring
// ============================================================
console.log('\nG10: Consumer integration — field-projects.js source checks');

{
  const fpSrc = readFileSync(resolve(root, 'functions/api/field-projects.js'), 'utf8');

  test('G10a: field-projects.js imports getSpFoProjects from sp-fo-projects.js', () => {
    assert.ok(fpSrc.includes("from '../lib/sp-fo-projects.js'"),
      'field-projects.js must import from sp-fo-projects.js');
    assert.ok(fpSrc.includes('getSpFoProjects'),
      'field-projects.js must import and call getSpFoProjects');
  });

  test('G10b: field-projects.js still imports FO_PROJECTS for NJ entries', () => {
    assert.ok(fpSrc.includes("from '../lib/fo-projects-data.js'"),
      'FO_PROJECTS import must remain for NJ entries');
    assert.ok(fpSrc.includes('NJ_RE'),
      'NJ_RE pattern must be present for filtering');
  });

  test('G10c: field-projects.js reads includeNonJob query param', () => {
    assert.ok(fpSrc.includes('includeNonJob'), 'includeNonJob param check must exist');
    assert.ok(fpSrc.includes("searchParams.get('includeNonJob')"),
      'must use searchParams.get()');
  });

  test('G10d: field-projects.js does not use FO_PROJECTS.map (NJ entries not leaked)', () => {
    assert.ok(!fpSrc.includes('FO_PROJECTS.map'),
      'FO_PROJECTS.map must not appear — that would include NJ-* in every response');
  });
}

// ============================================================
// G11: KV TTL constants
// ============================================================
console.log('\nG11: KV TTL constants');

test('G11a: KV_TTL_LIVE is 900 seconds (15 minutes)', () => {
  assert.equal(KV_TTL_LIVE, 900,
    `KV_TTL_LIVE should be 900 (15 min), got ${KV_TTL_LIVE}`);
});

test('G11b: KV_TTL_LAST_GOOD is 2592000 seconds (30 days)', () => {
  assert.equal(KV_TTL_LAST_GOOD, 2592000,
    `KV_TTL_LAST_GOOD should be 2592000 (30 days), got ${KV_TTL_LAST_GOOD}`);
});

test('G11c: KV_KEY_LIVE and KV_KEY_LAST_GOOD are distinct strings', () => {
  assert.notEqual(KV_KEY_LIVE, KV_KEY_LAST_GOOD,
    'Live and last-good cache keys must be different');
  assert.equal(KV_KEY_LIVE, 'sp_fo_projects');
  assert.equal(KV_KEY_LAST_GOOD, 'sp_fo_projects_last_good');
});

// ============================================================
// G12: spFolder = exact SP folder name (not extracted short name)
// ============================================================
console.log('\nG12: spFolder equals the exact SP folder name');

test('G12a: spFolder for all 12 live folders equals the exact original folder name', () => {
  for (const folderName of LIVE_SP_FOLDERS) {
    const p = folderToProject(folderName);
    assert.equal(p.spFolder, folderName,
      `spFolder must equal exact folder name for "${folderName}"`);
  }
});

test('G12b: spFolder is longer than the short project name (includes location/GC info)', () => {
  // The existing code used sp-project-folders.js to look up folder names from
  // 04 - Project Management/02 - Projects.  The new code uses the folder name
  // from 05 - Field Operations/01 - Projects directly as spFolder.
  for (const folderName of LIVE_SP_FOLDERS) {
    const p = folderToProject(folderName);
    // The full folder name contains more info than just the short name.
    // "26-028 - The Hangar - Elford - Columbus, OH" vs name "The Hangar"
    if (p.spFolder.includes(' - ', p.number.length + 3)) {
      // Has at least one more " - " segment after the name → spFolder is longer
      assert.ok(p.spFolder.length > p.number.length + 3 + p.name.length,
        `spFolder "${p.spFolder}" should be longer than "<number> - <name>"`);
    }
  }
});

// ============================================================
// Restore fetch
// ============================================================
globalThis.fetch = _origFetch;

// ============================================================
// Summary
// ============================================================
const total = passed + failed;
console.log(`\n  ${total} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
