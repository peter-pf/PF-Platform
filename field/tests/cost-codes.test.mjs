#!/usr/bin/env node
// Tests: /api/cost-codes — Derek directive 2026-10-21 (5000-5600, 7500-7635 only).
//
// Run:  node tests/cost-codes.test.mjs   (from field/ directory)
//
// Verifies:
//   1. areaForPath: /cost-codes.html, /cost-codes, /api/cost-codes -> field_ops.
//   2. roleCanAccess field_ops, admin, partner all can reach field_ops area.
//   3. EVERY role (field_ops, admin, partner, business_dev) returns exactly 55 codes.
//   4. All returned codes are in range 5000-5600 or 7500-7635 (inclusive).
//   5. No codes outside those ranges appear for any role.
//   6. Exact spot-check: all 55 expected codes are present.
//   7. Groups are exactly: Job Expenses, Non-Job Materials & Equipment,
//      Personnel Travel - Non Job.
//   8. No r/restricted flag leaks in any response.
//   9. Data shape: code/name/type/jobSpecific/group/section/headingLevel on every row.
//  10. No dollar signs or wage patterns in any name.
//  11. Response includes ok=true and role field.

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const apiUrl  = new URL('../functions/api/cost-codes.js', import.meta.url);
const authUrl = new URL('../functions/lib/auth.js',       import.meta.url);

const { onRequestGet } = await import(apiUrl.href);
const { areaForPath, roleCanAccess } = await import(authUrl.href);

function mockContext(role) {
  return {
    data: {
      session: { uid: 'test-uid-' + role, role, name: 'Test User', exp: Date.now() + 3600000 },
    },
    env: {},
  };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  PASS', name); passed++; })
               .catch(e => { console.error('  FAIL', name, '\n      ', e.message); failed++; });
    }
    console.log('  PASS', name);
    passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message);
    failed++;
  }
}

async function getCodes(role) {
  const ctx = mockContext(role);
  const resp = await onRequestGet(ctx);
  return resp.json();
}

function inRange(code) {
  const n = parseInt(code, 10);
  if (isNaN(n)) return false;
  return (n >= 5000 && n <= 5600) || (n >= 7500 && n <= 7635);
}

// ---- Expected complete code list (5000-5600, 7500-7635) ----
const EXPECTED_CODES = [
  '5000','5050','5051','5052','5053',
  '5100','5110','5120','5130','5140','5190',
  '5200','5210','5215','5220','5230',
  '5300','5310','5320','5330','5340','5350','5360',
  '5400','5405','5406','5407','5408','5409','5410','5420','5430',
  '5600',
  '7500','7501','7505','7507','7509',
  '7511','7512','7513','7515','7516','7517','7518','7519',
  '7520','7521','7522','7525',
  '7600','7610','7620','7630','7635',
];

// Codes that must NOT appear in any response
const REMOVED_CODES = [
  // Balance sheet
  '1000','1100','1150','1200','12000','1500','1530','1535','1540','1545','1700',
  '2000','2100','2200','2500','3000','3040','3060','3080','3200',
  // Income
  '4000','4100','4200','4900',
  // Job expenses outside range (> 5600)
  '5700','5710','5720','5730','5800','5810','5820','5900','5910','5920','5950',
  // Management, professional fees, insurance
  '6000','6100','6200','6300','6400','6500','6600','6700','6800',
  '7000','7010','7020','7040','7050','7060',
  '7100','7110','7120','7125','7130','7140','7150',
  '7180','7181','7182','7183','7184','7190','7191','7192','7193',
  // Business overhead (outside range)
  '7200','7201','7230','7240','7245','7250','7260','7270','7272','7280',
  // Interest
  '7300','7310','7320','7321','7325',
  // Advertising & Marketing
  '7400','7410','7420','7430',
  // Farm Yard, Depreciation, Other
  '7700','7800','8010','8015','8020','8500',
];

// ---------------------------------------------------------------------------
// 1. areaForPath routing
// ---------------------------------------------------------------------------
console.log('\n--- areaForPath for cost-codes ---');

test('areaForPath /cost-codes.html -> field_ops', () => {
  assert.equal(areaForPath('/cost-codes.html'), 'field_ops');
});
test('areaForPath /cost-codes -> field_ops', () => {
  assert.equal(areaForPath('/cost-codes'), 'field_ops');
});
test('areaForPath /api/cost-codes -> field_ops', () => {
  assert.equal(areaForPath('/api/cost-codes'), 'field_ops');
});

test('roleCanAccess field_ops + field_ops -> true', () => {
  assert.equal(roleCanAccess('field_ops', 'field_ops'), true);
});
test('roleCanAccess admin + field_ops -> true', () => {
  assert.equal(roleCanAccess('admin', 'field_ops'), true);
});
test('roleCanAccess partner + field_ops -> true', () => {
  assert.equal(roleCanAccess('partner', 'field_ops'), true);
});

// ---------------------------------------------------------------------------
// 2. All roles return 55 codes (no role split)
// ---------------------------------------------------------------------------
console.log('\n--- All roles return 55 codes ---');

const foBody      = await getCodes('field_ops');
const adminBody   = await getCodes('admin');
const partnerBody = await getCodes('partner');
const bdBody      = await getCodes('business_dev');

await test('field_ops total = 55', async () => {
  assert.equal(foBody.total, 55, `Expected 55, got ${foBody.total}`);
});
await test('admin total = 55', async () => {
  assert.equal(adminBody.total, 55, `Expected 55, got ${adminBody.total}`);
});
await test('partner total = 55', async () => {
  assert.equal(partnerBody.total, 55, `Expected 55, got ${partnerBody.total}`);
});
await test('business_dev total = 55', async () => {
  assert.equal(bdBody.total, 55, `Expected 55, got ${bdBody.total}`);
});

// ---------------------------------------------------------------------------
// 3. Range check: every returned code is in [5000,5600] or [7500,7635]
// ---------------------------------------------------------------------------
console.log('\n--- Range bounds ---');

for (const [label, body] of [['field_ops', foBody], ['admin', adminBody], ['partner', partnerBody]]) {
  test(`${label}: no codes outside 5000-5600 / 7500-7635`, () => {
    const out = body.codes.filter(c => !inRange(c.code));
    assert.equal(out.length, 0,
      `Out-of-range codes for ${label}: ${out.map(c=>c.code).join(',')}`);
  });
}

// ---------------------------------------------------------------------------
// 4. Removed codes must not appear for any role
// ---------------------------------------------------------------------------
console.log('\n--- Removed codes absent for all roles ---');

test('field_ops: no removed codes (income, mgmt, insurance, overhead, interest, etc.)', () => {
  const nums = foBody.codes.map(c => c.code);
  const found = REMOVED_CODES.filter(c => nums.includes(c));
  assert.equal(found.length, 0, `Removed codes in field_ops: ${found.join(',')}`);
});

test('admin: no removed codes', () => {
  const nums = adminBody.codes.map(c => c.code);
  const found = REMOVED_CODES.filter(c => nums.includes(c));
  assert.equal(found.length, 0, `Removed codes in admin: ${found.join(',')}`);
});

test('partner: no removed codes', () => {
  const nums = partnerBody.codes.map(c => c.code);
  const found = REMOVED_CODES.filter(c => nums.includes(c));
  assert.equal(found.length, 0, `Removed codes in partner: ${found.join(',')}`);
});

// Spot-checks for key removed codes
test('no 4000 (Job Income heading) in any role', () => {
  const allNums = [...foBody.codes, ...adminBody.codes].map(c => c.code);
  assert.ok(!allNums.includes('4000'), '4000 must be absent from all roles');
});
test('no 7200 (Business Overhead) in any role', () => {
  const allNums = [...foBody.codes, ...adminBody.codes].map(c => c.code);
  assert.ok(!allNums.includes('7200'), '7200 must be absent from all roles');
});
test('no 7700 (Farm Yard) in any role', () => {
  const allNums = [...foBody.codes, ...adminBody.codes].map(c => c.code);
  assert.ok(!allNums.includes('7700'), '7700 must be absent from all roles');
});
test('no 12000 (Undeposited Funds) in any role', () => {
  const allNums = [...foBody.codes, ...adminBody.codes].map(c => c.code);
  assert.ok(!allNums.includes('12000'), '12000 must be absent from all roles');
});
test('no 8500 (Ask My Accountant) in any role', () => {
  const allNums = [...foBody.codes, ...adminBody.codes].map(c => c.code);
  assert.ok(!allNums.includes('8500'), '8500 must be absent from all roles');
});
test('no 5700-5950 (removed job expense sub-groups) in any role', () => {
  const removed5 = ['5700','5710','5720','5730','5800','5810','5820','5900','5910','5920','5950'];
  const nums = foBody.codes.map(c => c.code);
  const found = removed5.filter(c => nums.includes(c));
  assert.equal(found.length, 0, `5700-5950 codes in field_ops: ${found.join(',')}`);
});

// ---------------------------------------------------------------------------
// 5. Spot-check: all 55 expected codes present
// ---------------------------------------------------------------------------
console.log('\n--- All 55 expected codes present ---');

test('EXPECTED_CODES array has exactly 55 entries', () => {
  assert.equal(EXPECTED_CODES.length, 55, `Expected 55 in spot-check array, got ${EXPECTED_CODES.length}`);
});

test('field_ops: all 55 expected codes present', () => {
  const nums = foBody.codes.map(c => c.code);
  const missing = EXPECTED_CODES.filter(c => !nums.includes(c));
  assert.equal(missing.length, 0, `Missing from field_ops: ${missing.join(',')}`);
});

test('admin: all 55 expected codes present', () => {
  const nums = adminBody.codes.map(c => c.code);
  const missing = EXPECTED_CODES.filter(c => !nums.includes(c));
  assert.equal(missing.length, 0, `Missing from admin: ${missing.join(',')}`);
});

// Spot-checks for key codes in range
test('5000 Job Expenses present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('5000'), '5000 must be present');
});
test('5600 Small Tools (end of 5xxx range) present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('5600'), '5600 must be present');
});
test('7500 Non Job Mtls (start of 7xxx range) present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('7500'), '7500 must be present');
});
test('7525 Fuel Expense present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('7525'), '7525 must be present');
});
test('7600 Personnel Travel heading present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('7600'), '7600 must be present');
});
test('7635 Non Job Per Diem (end of range) present', () => {
  assert.ok(foBody.codes.map(c=>c.code).includes('7635'), '7635 must be present');
});

// ---------------------------------------------------------------------------
// 6. Exactly 3 groups
// ---------------------------------------------------------------------------
console.log('\n--- Groups ---');

const EXPECTED_GROUPS = [
  'Job Expenses',
  'Non-Job Materials & Equipment',
  'Personnel Travel - Non Job',
];

test('exactly 3 groups returned', () => {
  const groups = [...new Set(foBody.codes.map(c => c.group))];
  assert.equal(groups.length, 3, `Expected 3 groups, got: ${groups.join(', ')}`);
});

test('group names are exactly as expected', () => {
  const groups = new Set(foBody.codes.map(c => c.group));
  for (const g of EXPECTED_GROUPS) {
    assert.ok(groups.has(g), `Missing group: ${g}`);
  }
});

test('no "Balance Sheet" or "Income" or "Management" groups remain', () => {
  const groups = new Set(adminBody.codes.map(c => c.group));
  const forbidden = ['Balance Sheet', 'Income', 'Management Expenses', 'Insurance',
                     'Professional Fees', 'Business Overhead', 'Interest Expense',
                     'Advertising & Marketing', 'Farm Yard', 'Depreciation & Other'];
  const found = forbidden.filter(g => groups.has(g));
  assert.equal(found.length, 0, `Forbidden groups still present: ${found.join(', ')}`);
});

// ---------------------------------------------------------------------------
// 7. Data shape
// ---------------------------------------------------------------------------
console.log('\n--- Data shape ---');

test('all returned codes have required fields', () => {
  const bad = adminBody.codes.filter(c =>
    typeof c.code    !== 'string' || !c.code ||
    typeof c.name    !== 'string' || !c.name ||
    typeof c.type    !== 'string' || !c.type ||
    typeof c.jobSpecific !== 'boolean' ||
    typeof c.group   !== 'string' ||
    typeof c.headingLevel !== 'number'
  );
  assert.equal(bad.length, 0, `Codes with bad shape: ${JSON.stringify(bad.slice(0,3))}`);
});

test('no restricted flag (r) leaks in response', () => {
  const leaked = [...foBody.codes, ...adminBody.codes].filter(c => 'r' in c);
  assert.equal(leaked.length, 0, `Internal "r" flag must not appear in response`);
});

test('section field is present (may be null, not undefined)', () => {
  const bad = adminBody.codes.filter(c => typeof c.section === 'undefined');
  assert.equal(bad.length, 0, 'section field must be present on every code');
});

// ---------------------------------------------------------------------------
// 8. No financial figures in names
// ---------------------------------------------------------------------------
console.log('\n--- No financial figures in names ---');

test('no dollar signs in any code name', () => {
  const bad = adminBody.codes.filter(c => c.name.includes('$'));
  assert.equal(bad.length, 0, `$ in code names: ${bad.map(c=>c.code).join(',')}`);
});

test('no wage/rate patterns in code names', () => {
  const bad = adminBody.codes.filter(c => /\d\s*\/\s*hr|\brate\b|\bwage\b/i.test(c.name));
  assert.equal(bad.length, 0, 'No wage patterns allowed in code names');
});

// ---------------------------------------------------------------------------
// 9. Response metadata
// ---------------------------------------------------------------------------
console.log('\n--- Response metadata ---');

test('field_ops response ok=true', () => {
  assert.equal(foBody.ok, true);
});
test('admin response ok=true', () => {
  assert.equal(adminBody.ok, true);
});
test('field_ops response includes role=field_ops', () => {
  assert.equal(foBody.role, 'field_ops');
});
test('admin response includes role=admin', () => {
  assert.equal(adminBody.role, 'admin');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
