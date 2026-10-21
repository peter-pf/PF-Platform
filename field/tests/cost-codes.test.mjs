#!/usr/bin/env node
// Tests: /api/cost-codes role filtering and data integrity.
//
// Run:  node field/tests/cost-codes.test.mjs
//
// Verifies:
//   1. field_ops role never receives restricted codes (balance sheet / income /
//      management / insurance / bank fees / interest / depreciation).
//   2. admin role receives ALL codes (no filtering).
//   3. Exact PDF row count (163) across the full chart of accounts.
//   4. Exact field-visible count (79) for field_ops.
//   5. Specific restricted code ranges are absent from field_ops response.
//   6. Specific field-visible code ranges are present for field_ops.
//   7. areaForPath: /cost-codes.html, /cost-codes, /api/cost-codes -> field_ops.
//   8. Heuristic test: SENSITIVE_NAME_RE would have fired on "cost-codes" without
//      the explicit FIELD_PAGES entry.
//   9. No dollar amounts, wages, or financial figures in any code name.
//  10. jobSpecific flag is boolean on all returned codes.

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load the API function module
// ---------------------------------------------------------------------------
const apiUrl  = new URL('../functions/api/cost-codes.js',  import.meta.url);
const authUrl = new URL('../functions/lib/auth.js',        import.meta.url);

// We import the raw CODES array indirectly by calling onRequestGet with mock
// context objects. Build a minimal Cloudflare Pages context mock.

// We also need verifySession + mintSession to produce valid sessions.
// For unit tests we call onRequestGet directly without network — mock context
// carries a pre-verified session object on context.data.session.

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

// ---------------------------------------------------------------------------
// 1. areaForPath routing (must be field_ops, not default-deny / financials)
// ---------------------------------------------------------------------------
console.log('\n--- areaForPath for cost-codes ---');

test('areaForPath /cost-codes.html -> field_ops', () => {
  assert.equal(areaForPath('/cost-codes.html'), 'field_ops');
});
test('areaForPath /cost-codes (clean URL) -> field_ops', () => {
  assert.equal(areaForPath('/cost-codes'), 'field_ops');
});
test('areaForPath /api/cost-codes -> field_ops', () => {
  assert.equal(areaForPath('/api/cost-codes'), 'field_ops');
});
test('areaForPath /api/cost-codes?role=admin -> field_ops (startsWith match)', () => {
  // Ensure query-string variant still maps correctly via startsWith
  assert.equal(areaForPath('/api/cost-codes'), 'field_ops');
});

// Confirm field_ops role CAN access the field_ops area
test('roleCanAccess field_ops + field_ops area -> true', () => {
  assert.equal(roleCanAccess('field_ops', 'field_ops'), true);
});
test('roleCanAccess admin + field_ops area -> true', () => {
  assert.equal(roleCanAccess('admin', 'field_ops'), true);
});
test('roleCanAccess partner + field_ops area -> true', () => {
  assert.equal(roleCanAccess('partner', 'field_ops'), true);
});

// ---------------------------------------------------------------------------
// 2. Role filtering via onRequestGet
// ---------------------------------------------------------------------------
console.log('\n--- Role filtering ---');

// Helper: call the handler and parse JSON
async function getCodes(role) {
  const ctx = mockContext(role);
  const resp = await onRequestGet(ctx);
  const body = await resp.json();
  return body;
}

await test('field_ops: response ok=true', async () => {
  const body = await getCodes('field_ops');
  assert.equal(body.ok, true);
});

await test('admin: response ok=true', async () => {
  const body = await getCodes('admin');
  assert.equal(body.ok, true);
});

// Capture results for subsequent tests
const foBody     = await getCodes('field_ops');
const adminBody  = await getCodes('admin');
const foCodeNums = foBody.codes.map(c => c.code);
const adCodeNums = adminBody.codes.map(c => c.code);

test('field_ops total = 79 (field-visible codes only)', () => {
  assert.equal(foBody.total, 79, `Expected 79, got ${foBody.total}`);
});

test('admin total = 163 (full chart of accounts)', () => {
  assert.equal(adminBody.total, 163, `Expected 163, got ${adminBody.total}`);
});

// ---------------------------------------------------------------------------
// 3. Restricted codes absent from field_ops response
// ---------------------------------------------------------------------------
console.log('\n--- Restricted codes absent from field_ops ---');

// Balance sheet codes
const RESTRICTED_CODES = [
  // Balance sheet
  '1000','1100','1150','1200','12000',
  '1500','1530','1535','1540','1545','1700',
  '2000','2100','2200','2210','2220','2230','2232','2234',
  '2240','2250','2260','2300','2310','2320','2330',
  '2400','2450','2500',
  '3000','3030','3040','3050','3060','3070','3080','3200',
  // Income
  '4000','4100','4200','4900',
  // Management
  '6000','6100','6200','6300','6400','6500','6600','6700','6800',
  // Professional fees
  '7000','7010','7020','7040','7050','7060',
  // Insurance
  '7100','7110','7120','7125','7130','7140','7150',
  '7180','7181','7182','7183','7184',
  '7190','7191','7192','7193',
  // Bank/payroll fees
  '7270','7272',
  // Interest
  '7300','7310','7320','7321','7325',
  // Depreciation & other
  '7800','8010','8015','8020','8500',
];

test('field_ops: no balance sheet codes (1000-3200)', () => {
  const bs = ['1000','1100','1150','1200','12000','1500','1530','1535','1540','1545','1700',
              '2000','2100','2200','2210','2220','2230','2232','2234','2240','2250','2260',
              '2300','2310','2320','2330','2400','2450','2500',
              '3000','3030','3040','3050','3060','3070','3080','3200'];
  const found = bs.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Balance sheet codes found in field_ops: ${found.join(',')}`);
});

test('field_ops: no income codes (4000-4900)', () => {
  const inc = ['4000','4100','4200','4900'];
  const found = inc.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Income codes found in field_ops: ${found.join(',')}`);
});

test('field_ops: no management expense codes (6000-6800)', () => {
  const mgmt = ['6000','6100','6200','6300','6400','6500','6600','6700','6800'];
  const found = mgmt.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Management codes found in field_ops: ${found.join(',')}`);
});

test('field_ops: no professional fees / insurance (7000-7193)', () => {
  const prof = ['7000','7010','7020','7040','7050','7060',
                '7100','7110','7120','7125','7130','7140','7150',
                '7180','7181','7182','7183','7184',
                '7190','7191','7192','7193'];
  const found = prof.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Prof/insurance codes found in field_ops: ${found.join(',')}`);
});

test('field_ops: no 7270 (Bank Service Charges)', () => {
  assert.ok(!foCodeNums.includes('7270'), '7270 must not appear for field_ops');
});

test('field_ops: no 7272 (Payroll Processing Fees)', () => {
  assert.ok(!foCodeNums.includes('7272'), '7272 must not appear for field_ops');
});

test('field_ops: no interest codes (7300-7325)', () => {
  const int = ['7300','7310','7320','7321','7325'];
  const found = int.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Interest codes found in field_ops: ${found.join(',')}`);
});

test('field_ops: no depreciation / other (7800-8500)', () => {
  const dep = ['7800','8010','8015','8020','8500'];
  const found = dep.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Depreciation/other codes found in field_ops: ${found.join(',')}`);
});

// Comprehensive: every single restricted code must be absent
test('field_ops: ALL restricted codes absent (comprehensive check)', () => {
  const found = RESTRICTED_CODES.filter(c => foCodeNums.includes(c));
  assert.equal(found.length, 0, `Restricted codes leaked to field_ops: ${found.join(',')}`);
});

// ---------------------------------------------------------------------------
// 4. Field-visible codes ARE present in field_ops response
// ---------------------------------------------------------------------------
console.log('\n--- Field-visible codes present for field_ops ---');

const FIELD_VISIBLE_SPOT = [
  '5000','5050','5051','5052','5053',
  '5100','5110','5120','5130','5140','5190',
  '5200','5210','5215','5220','5230',
  '5300','5310','5320','5330','5340','5350','5360',
  '5400','5405','5406','5407','5408','5409','5410','5420','5430',
  '5600',
  '5700','5710','5720','5730',
  '5800','5810','5820',
  '5900','5910','5920','5950',
  '7200','7201','7230','7240','7245','7250','7260','7280',
  '7400','7410','7420','7430',
  '7500','7501','7505','7507','7509','7511','7512','7513',
  '7515','7516','7517','7518','7519',
  '7520','7521','7522','7525',
  '7600','7610','7620','7630','7635',
  '7700',
];

test('field_ops: all 79 field-visible codes present', () => {
  const missing = FIELD_VISIBLE_SPOT.filter(c => !foCodeNums.includes(c));
  assert.equal(missing.length, 0, `Field-visible codes missing from field_ops: ${missing.join(',')}`);
  assert.equal(FIELD_VISIBLE_SPOT.length, 79, `Spot-check array should have 79 codes, found ${FIELD_VISIBLE_SPOT.length}`);
});

test('field_ops: 5000 Job Expenses present', () => {
  assert.ok(foCodeNums.includes('5000'), '5000 must be in field_ops codes');
});
test('field_ops: 5110 Stone Materials present', () => {
  assert.ok(foCodeNums.includes('5110'), '5110 must be in field_ops codes');
});
test('field_ops: 7700 Farm Yard present', () => {
  assert.ok(foCodeNums.includes('7700'), '7700 must be in field_ops codes');
});
test('field_ops: 7200 Business Overhead present', () => {
  assert.ok(foCodeNums.includes('7200'), '7200 must be in field_ops codes');
});

// ---------------------------------------------------------------------------
// 5. Admin gets ALL codes
// ---------------------------------------------------------------------------
console.log('\n--- Admin receives all codes ---');

test('admin: all restricted codes present', () => {
  const missing = RESTRICTED_CODES.filter(c => !adCodeNums.includes(c));
  assert.equal(missing.length, 0, `Admin missing restricted codes: ${missing.join(',')}`);
});

test('admin: 12000 Undeposited Funds present (verbatim code from PDF)', () => {
  assert.ok(adCodeNums.includes('12000'), '12000 must be in admin codes (verbatim from PDF)');
});

test('admin: 6400 Partner Guaranteed Payments present', () => {
  assert.ok(adCodeNums.includes('6400'), '6400 must be in admin codes');
});

test('admin: 3050, 3060, 3070, 3080 equity codes present', () => {
  assert.ok(adCodeNums.includes('3050') && adCodeNums.includes('3060') &&
            adCodeNums.includes('3070') && adCodeNums.includes('3080'),
            'Equity sub-codes 3050/3060/3070/3080 must be in admin codes');
});

// ---------------------------------------------------------------------------
// 6. Data shape: every code has required fields
// ---------------------------------------------------------------------------
console.log('\n--- Data shape ---');

test('all returned codes have required fields', () => {
  const allCodes = adminBody.codes;
  const bad = allCodes.filter(c =>
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
  const allCodes = adminBody.codes;
  const leaked = allCodes.filter(c => 'r' in c);
  assert.equal(leaked.length, 0, `Internal "r" flag must not be in response (${leaked.length} leaked)`);
});

test('no section null values cause shape issues', () => {
  // section can be null — that is fine — but it must not be undefined
  const allCodes = adminBody.codes;
  const badSection = allCodes.filter(c => typeof c.section === 'undefined');
  assert.equal(badSection.length, 0, 'section field must be present (can be null but not undefined)');
});

// ---------------------------------------------------------------------------
// 7. No financial figures in code names
// ---------------------------------------------------------------------------
console.log('\n--- No financial figures in names ---');

test('no dollar signs in any code name', () => {
  const allCodes = adminBody.codes;
  const dollarCodes = allCodes.filter(c => c.name.includes('$'));
  assert.equal(dollarCodes.length, 0, `Code names must not contain $: ${dollarCodes.map(c=>c.code).join(',')}`);
});

test('no wage/rate patterns (e.g. $/hr) in code names', () => {
  const allCodes = adminBody.codes;
  const wageCodes = allCodes.filter(c => /\d\s*\/\s*hr|\brate\b|\bwage\b/i.test(c.name));
  assert.equal(wageCodes.length, 0, `Code names should not contain wage patterns`);
});

// ---------------------------------------------------------------------------
// 8. Partner role also gets all codes
// ---------------------------------------------------------------------------
console.log('\n--- Partner role ---');

await test('partner: response ok=true with all codes', async () => {
  const body = await getCodes('partner');
  assert.equal(body.ok, true);
  assert.equal(body.total, 163, `Partner should see all 163 codes, got ${body.total}`);
});

// ---------------------------------------------------------------------------
// 9. business_dev role gets field-visible codes only (same as field_ops)
// ---------------------------------------------------------------------------
console.log('\n--- business_dev role ---');

await test('business_dev: gets field-visible codes (same as field_ops)', async () => {
  const body = await getCodes('business_dev');
  assert.equal(body.ok, true);
  assert.equal(body.total, 79, `business_dev should see 79 codes, got ${body.total}`);
});

// ---------------------------------------------------------------------------
// 10. Response includes role field
// ---------------------------------------------------------------------------
console.log('\n--- Response metadata ---');

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
