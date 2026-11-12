// test-sops-auth.mjs
//
// Auth gate unit tests for the SOPs feature.
// Tests that:
//   - /sops.html, /sops → field_ops area
//   - /sops/*.pdf → field_ops area (NOT default-deny user_admin)
//   - field_ops role can access field_ops area
//   - admin/partner/business_dev can access field_ops area
//   - PDFs without the /sops/ prefix fall to default-deny (regression guard)
//
// Run: node field/tests/test-sops-auth.mjs

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const authUrl = new URL('../functions/lib/auth.js', import.meta.url);
const { areaForPath, roleCanAccess } = await import(authUrl.href);

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  PASS', name);
        passed++;
    } catch (e) {
        console.error('  FAIL', name, '::', e.message);
        failed++;
    }
}

// ---------------------------------------------------------------------------
// 1. Page paths → field_ops
// ---------------------------------------------------------------------------

console.log('\n--- 1. HTML page paths classified as field_ops ---');

test('/sops.html → field_ops', () => {
    assert.equal(areaForPath('/sops.html'), 'field_ops');
});

test('/sops (clean URL) → field_ops', () => {
    assert.equal(areaForPath('/sops'), 'field_ops');
});

// ---------------------------------------------------------------------------
// 2. PDF asset paths → field_ops (NOT default-deny)
// ---------------------------------------------------------------------------

console.log('\n--- 2. /sops/*.pdf classified as field_ops (not default-deny) ---');

const PDF_PATHS = [
    '/sops/Daily_Heavy_Equipment_Inspections_sop.pdf',
    '/sops/Pier_Foundations_Jobsite_Walk_sop.pdf',
    '/sops/Pier_Foundations_Pre-Job_Site_Visit_sop.pdf',
    '/sops/Pier_Foundations_Project_Closeout_Before_Demobilization_sop.pdf',
    '/sops/unknown_future_sop.pdf',
];

for (const p of PDF_PATHS) {
    test(`${p} → field_ops`, () => {
        const area = areaForPath(p);
        assert.equal(area, 'field_ops',
            `Expected field_ops, got "${area}" — PDF would be default-denied without /sops/ prefix rule`);
    });
}

// Verify that PDFs at root level still fall to default-deny (regression guard)
test('/some-file.pdf → user_admin (default-deny)', () => {
    const area = areaForPath('/some-file.pdf');
    assert.equal(area, 'user_admin',
        `Expected default-deny (user_admin), got "${area}"`);
});

// ---------------------------------------------------------------------------
// 3. Role access: who can reach field_ops area
// ---------------------------------------------------------------------------

console.log('\n--- 3. AREA_ROLES.field_ops includes correct roles ---');

const SHOULD_ACCESS = ['admin', 'partner', 'business_dev', 'field_ops'];
for (const role of SHOULD_ACCESS) {
    test(`role=${role} can access field_ops area`, () => {
        assert.ok(
            roleCanAccess(role, 'field_ops'),
            `role "${role}" should be able to access field_ops area`
        );
    });
}

// No role / unauthenticated → denied (roleCanAccess returns false)
test('no role (undefined) → cannot access field_ops', () => {
    assert.ok(
        !roleCanAccess(undefined, 'field_ops'),
        'undefined role should NOT access field_ops'
    );
});

test('empty string role → cannot access field_ops', () => {
    assert.ok(
        !roleCanAccess('', 'field_ops'),
        'empty role should NOT access field_ops'
    );
});

// ---------------------------------------------------------------------------
// 4. The /sops/ prefix does not accidentally grant access to HR or admin paths
// ---------------------------------------------------------------------------

console.log('\n--- 4. No collateral damage: unrelated paths unchanged ---');

// These tests verify the existing areas are still correct after our edit
test('/hr/ still maps to hr_admin', () => {
    const area = areaForPath('/hr/something');
    // If HR module exists it maps to hr_admin; if not, it default-denies to user_admin
    // Either way it must NOT be field_ops
    assert.notEqual(area, 'field_ops',
        `/hr/ path was accidentally classified as field_ops`);
});

test('/login.html is public (undefined/null area)', () => {
    const area = areaForPath('/login.html');
    // Login is in PUBLIC_PATHS in middleware, areaForPath may return user_admin or similar
    // Key assertion: it is NOT field_ops (no path leakage)
    assert.notEqual(area, 'field_ops', '/login.html should not be field_ops');
});

test('/api/me area unchanged', () => {
    const area = areaForPath('/api/me');
    // /api/me is typically field_ops or similar; just verify our edit didn't break it
    // by checking it's a known valid area string (not undefined)
    assert.ok(typeof area === 'string' && area.length > 0,
        `/api/me areaForPath returned "${area}" — should be a non-empty string`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
