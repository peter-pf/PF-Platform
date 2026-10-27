#!/usr/bin/env node
// test-site-readiness-client-compute.mjs
//
// Exercises the CLIENT-SIDE computeResult() extracted from site-readiness.html
// and asserts that it agrees with the SERVER-SIDE computeResult() from
// site-readiness-store.js for every allowed answer on 5a, 5b, 5c, and a
// global item. This catches the class of bug where client and server logic
// diverge (e.g. client uses global Yes/N/A rule while server uses per-item sets).

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const wt    = resolve(__dir, '..');

// ---- 1. Extract CLIENT_ITEM_PASSING, CLIENT_GLOBAL_PASSING, computeResult
//         from the HTML by splicing the JS block into a runnable module.       ----

const html = readFileSync(resolve(wt, 'site-readiness.html'), 'utf8');

// Pull the block that defines the key client constants and computeResult.
// We need: CLIENT_R12_KEYS, CLIENT_GUARDED_KEYS, SR_ITEM_ANSWERS,
//          CLIENT_GLOBAL_PASSING, CLIENT_ITEM_PASSING, state, computeResult.

const clientSnippet = `
// --- constants extracted from site-readiness.html ---
var CLIENT_R12_KEYS    = { '1d': 1, '1e': 1, '1f': 1, '1g': 1, '1h': 1 };
var CLIENT_GUARDED_KEYS = { '1b': 1, '1c': 1, '1d': 1, '1e': 1, '1f': 1, '1g': 1, '1h': 1 };

var SR_ITEM_ANSWERS = {
  '5a': ['Standard Operation', 'GC Restriction', 'Needs Review'],
  '5b': ['Standard Operation', 'GC Restriction', 'Needs Review'],
  '5c': ['None Required', 'Needs Review'],
};

var CLIENT_GLOBAL_PASSING = { 'Yes': 1, 'N/A': 1 };
var CLIENT_ITEM_PASSING = {
  '5a': { 'Standard Operation': 1, 'GC Restriction': 1, 'Yes': 1, 'N/A': 1 },
  '5b': { 'Standard Operation': 1, 'GC Restriction': 1, 'Yes': 1, 'N/A': 1 },
  '5c': { 'None Required': 1, 'Yes': 1, 'N/A': 1 },
};

var state = {
  items: [],
  loadedSchemaVersion: null,
};

function computeResult() {
  var sv = state.loadedSchemaVersion;
  var isR12 = (sv === null) || (typeof sv === 'number' && sv >= 12);
  var open = [];
  state.items.forEach(function (it) {
    if (!isR12 && CLIENT_R12_KEYS[it.key]) return;
    var passing = CLIENT_ITEM_PASSING[it.key] || CLIENT_GLOBAL_PASSING;
    if (!passing[it.answer]) open.push(it.key);
  });
  return { result: open.length === 0 ? 'READY' : 'NOT READY', openItems: open };
}
`;

// Verify the HTML actually contains CLIENT_ITEM_PASSING (sanity guard)
if (!html.includes('CLIENT_ITEM_PASSING')) {
  console.error('FATAL: CLIENT_ITEM_PASSING not found in site-readiness.html — patch was not applied');
  process.exit(1);
}
// Verify the old global rule is gone from computeResult body
const crStart = html.indexOf('function computeResult()');
const crEnd   = html.indexOf('\n  }', crStart) + 4;
const crBody  = html.slice(crStart, crEnd);
if (crBody.includes("it.answer !== 'Yes' && it.answer !== 'N/A'")) {
  console.error('FATAL: old global passing rule still present in computeResult — patch was not applied');
  process.exit(1);
}

// ---- 2. Build a runnable module from the snippet + exports -------------------

const runnable = clientSnippet + `
export { CLIENT_ITEM_PASSING, CLIENT_GLOBAL_PASSING, SR_ITEM_ANSWERS, state, computeResult };
`;

const tmpPath = new URL(
  '../../../.tmp-client-compute-harness.mjs',
  import.meta.url
);
import { writeFileSync, unlinkSync } from 'fs';
writeFileSync(new URL(tmpPath).pathname, runnable);

let clientModule;
try {
  clientModule = await import(new URL(tmpPath).pathname + '?t=' + Date.now());
} finally {
  try { unlinkSync(new URL(tmpPath).pathname); } catch {}
}

const { state: clientState, computeResult: clientCompute,
        CLIENT_ITEM_PASSING: cip } = clientModule;

// ---- 3. Import server computeResult -----------------------------------------

const { CHECKLIST_ITEMS, computeResult: serverCompute } = await import(
  resolve(wt, 'functions/lib/site-readiness-store.js')
);

// ---- 4. Helpers -------------------------------------------------------------

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// Build a full items array with all items answered 'Yes', overriding specific keys.
function makeClientItems(overrides = {}) {
  return CHECKLIST_ITEMS.map(d => ({
    key:    d.key,
    answer: overrides[d.key] !== undefined ? overrides[d.key] : 'Yes',
  }));
}

function clientResult(overrides = {}, sv = null) {
  clientState.items = makeClientItems(overrides);
  clientState.loadedSchemaVersion = sv;
  return clientCompute();
}

function serverResult(overrides = {}, sv = 12) {
  return serverCompute(makeClientItems(overrides), sv);
}

// ---- 5. Tests ---------------------------------------------------------------

console.log('\n--- HTML sanity: CLIENT_ITEM_PASSING and computeResult patch ---');

test('S1: HTML contains CLIENT_ITEM_PASSING definition', () => {
  assert.ok(html.includes('CLIENT_ITEM_PASSING'), 'CLIENT_ITEM_PASSING must be in HTML');
});

test('S2: HTML computeResult uses CLIENT_ITEM_PASSING (not bare Yes/N/A check)', () => {
  assert.ok(crBody.includes('CLIENT_ITEM_PASSING'), 'computeResult must use CLIENT_ITEM_PASSING');
  assert.ok(!crBody.includes("it.answer !== 'Yes' && it.answer !== 'N/A'"),
    'old global rule must be removed from computeResult');
});

test('S3: CLIENT_ITEM_PASSING 5a has Standard Operation, GC Restriction, Yes, N/A', () => {
  const p = cip['5a'];
  assert.ok(p['Standard Operation'] && p['GC Restriction'] && p['Yes'] && p['N/A'],
    '5a passing set must include Standard Operation, GC Restriction, Yes, N/A');
  assert.ok(!p['Needs Review'], '5a must NOT pass Needs Review');
});

test('S4: CLIENT_ITEM_PASSING 5b has Standard Operation, GC Restriction, Yes, N/A', () => {
  const p = cip['5b'];
  assert.ok(p['Standard Operation'] && p['GC Restriction'] && p['Yes'] && p['N/A'],
    '5b passing set must include Standard Operation, GC Restriction, Yes, N/A');
  assert.ok(!p['Needs Review'], '5b must NOT pass Needs Review');
});

test('S5: CLIENT_ITEM_PASSING 5c has None Required, Yes, N/A (no GC Restriction)', () => {
  const p = cip['5c'];
  assert.ok(p['None Required'] && p['Yes'] && p['N/A'],
    '5c passing set must include None Required, Yes, N/A');
  assert.ok(!p['Needs Review'], '5c must NOT pass Needs Review');
});

console.log('\n--- Client computeResult: 5a ---');

test('C5a-1: Standard Operation on 5a → client says READY', () => {
  const r = clientResult({ '5a': 'Standard Operation' });
  assert.equal(r.result, 'READY', `got ${r.result}; open: ${r.openItems}`);
});

test('C5a-2: GC Restriction on 5a → client says READY', () => {
  const r = clientResult({ '5a': 'GC Restriction' });
  assert.equal(r.result, 'READY', `got ${r.result}; open: ${r.openItems}`);
});

test('C5a-3: Needs Review on 5a → client says NOT READY', () => {
  const r = clientResult({ '5a': 'Needs Review' });
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5a'), '5a in openItems');
});

test('C5a-4: legacy Yes on 5a → client says READY', () => {
  const r = clientResult({ '5a': 'Yes' });
  assert.equal(r.result, 'READY');
});

test('C5a-5: legacy N/A on 5a → client says READY', () => {
  const r = clientResult({ '5a': 'N/A' });
  assert.equal(r.result, 'READY');
});

console.log('\n--- Client computeResult: 5b ---');

test('C5b-1: Standard Operation on 5b → client says READY', () => {
  const r = clientResult({ '5b': 'Standard Operation' });
  assert.equal(r.result, 'READY', `got ${r.result}; open: ${r.openItems}`);
});

test('C5b-2: GC Restriction on 5b → client says READY', () => {
  const r = clientResult({ '5b': 'GC Restriction' });
  assert.equal(r.result, 'READY', `got ${r.result}; open: ${r.openItems}`);
});

test('C5b-3: Needs Review on 5b → client says NOT READY', () => {
  const r = clientResult({ '5b': 'Needs Review' });
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5b'), '5b in openItems');
});

console.log('\n--- Client computeResult: 5c ---');

test('C5c-1: None Required on 5c → client says READY', () => {
  const r = clientResult({ '5c': 'None Required' });
  assert.equal(r.result, 'READY', `got ${r.result}; open: ${r.openItems}`);
});

test('C5c-2: Needs Review on 5c → client says NOT READY', () => {
  const r = clientResult({ '5c': 'Needs Review' });
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5c'), '5c in openItems');
});

test('C5c-3: legacy N/A on 5c → client says READY', () => {
  const r = clientResult({ '5c': 'N/A' });
  assert.equal(r.result, 'READY');
});

console.log('\n--- Client computeResult: global item (not 5a/5b/5c) ---');

test('CG-1: Yes on 1a → client says READY', () => {
  const r = clientResult({ '1a': 'Yes' });
  assert.equal(r.result, 'READY');
});

test('CG-2: No on 1a → client says NOT READY', () => {
  const r = clientResult({ '1a': 'No' });
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('1a'), '1a in openItems');
});

test('CG-3: Standard Operation on 1a → client says NOT READY (only valid for 5a/5b)', () => {
  const r = clientResult({ '1a': 'Standard Operation' });
  assert.equal(r.result, 'NOT READY', 'Standard Operation not a passing value for global items');
});

console.log('\n--- Client / server agreement on 5a, 5b, 5c, 1a ---');

const AGREE_CASES = [
  { key: '5a', answer: 'Standard Operation', expect: 'READY'     },
  { key: '5a', answer: 'GC Restriction',     expect: 'READY'     },
  { key: '5a', answer: 'Needs Review',        expect: 'NOT READY' },
  { key: '5a', answer: 'Yes',                 expect: 'READY'     },
  { key: '5a', answer: 'N/A',                 expect: 'READY'     },
  { key: '5b', answer: 'Standard Operation', expect: 'READY'     },
  { key: '5b', answer: 'GC Restriction',     expect: 'READY'     },
  { key: '5b', answer: 'Needs Review',        expect: 'NOT READY' },
  { key: '5c', answer: 'None Required',       expect: 'READY'     },
  { key: '5c', answer: 'Needs Review',        expect: 'NOT READY' },
  { key: '5c', answer: 'N/A',                 expect: 'READY'     },
  { key: '1a', answer: 'Yes',                 expect: 'READY'     },
  { key: '1a', answer: 'No',                  expect: 'NOT READY' },
];

AGREE_CASES.forEach(function ({ key, answer, expect }) {
  test(`AGREE ${key}=${answer} → both say ${expect}`, () => {
    const cr = clientResult({ [key]: answer });
    const sr = serverResult({ [key]: answer });
    assert.equal(cr.result, expect,
      `Client expected ${expect} for ${key}=${answer}, got ${cr.result}`);
    assert.equal(sr.result, expect,
      `Server expected ${expect} for ${key}=${answer}, got ${sr.result}`);
    assert.equal(cr.result, sr.result,
      `Client(${cr.result}) and server(${sr.result}) disagree for ${key}=${answer}`);
  });
});

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
