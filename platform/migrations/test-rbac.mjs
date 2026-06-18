// Auth / RBAC unit tests for the PF Platform (post security-review hardening).
// Run: node platform/migrations/test-rbac.mjs
//
// Imports the REAL functions/lib/auth.js (no mocks of the logic under test).
// Node 20 needs webcrypto wired onto globalThis (Workers has it global).

import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  areaForPath, roleCanAccess, requireArea,
  mintSession, verifySession, isRestrictedSession,
  hashPassword, verifyPassword, RESET_SESSION_TTL_MS,
} from '../functions/lib/auth.js';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.error('  FAIL:', name); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const SECRET = 'test-secret-not-a-real-key-0123456789';

// Sensitive pages a field_ops user must NOT reach.
const SENSITIVE_PAGES = [
  '/project-history.html',
  '/pricing.html',
  '/subcontracts.html',
  '/quickbooks-guide.html',
  '/next-sprint.html',
  '/3-day-sprint.html',
  '/alpha-review.html',
  '/coo-checklist.html',
  '/peter-cheatsheet.html',
  '/sop-additions.html',
  '/sop-additions-standalone.html',
];

// Sensitive API routes field_ops must NOT reach.
const SENSITIVE_APIS = [
  '/api/doc?item=016ISVH64RZ6FBDCIAMNELEB5CKPHJ2UW3',
  '/api/data?type=all',
  '/api/users',
];

// Pages/paths field_ops SHOULD reach (their operational + static surface).
const FIELD_ALLOWED = [
  '/',
  '/index.html',
  '/manual.html',
  '/onboarding.html',
  '/training.html',
  '/daily-production.html',
  '/schedule.html',
  '/denied.html',
  '/reset-password.html',
  '/css/styles.css',
  '/js/main.js',
  '/images/logo.png',
  '/favicon.ico',          // resolves general by extension
];

// [SEC-09] /data/ payload files field_ops MUST NOT reach by direct URL. These
// hold dollar values / bid+contract values / margins / pricing / GC financial
// contacts. Before the fix areaForPath() blanket-allowed '/data/' as 'general'
// (field_ops ALLOWED -> data-layer RBAC bypass). After the fix each resolves to
// a sensitive area (field_ops DENIED).
const DATA_SENSITIVE = [
  '/data/bid-log.json',          // bid_value, margin notes, GC contacts
  '/data/project-history.js',    // ContractValue / totalContractValue
  '/data/pricing-data.js',       // $ pricing
  '/data/budget-actual-poet.js', // budget/cost/invoice/profit
  '/data/project-records.js',    // $ values / cost
  '/data/pf-coi.js',             // private insurance policy detail
  '/data/bd-master.json',        // EIN/tax id/credit-app, GC contacts
  '/data/live-data.js',          // bid_value/contract_value/cost (live mirror)
  '/data/projects-data.js',      // revenue/AR/paid/unpaid/contract
  '/data/project-record-poet.js',// contract_value
  '/data/project-master.json',   // contract_value/margin/profit
  '/data/precon-pipeline.js',    // $ pipeline values
  '/data/awarded-projects.js',   // contract values + GC
  '/data/estimate-template.json',// cost/amount estimating template
  '/data/insurance-baseline.js', // private policy limits/carriers
  '/data/sync-meta.json',        // bid/project counts + sensitive source URLs
];

// [SEC-09] /data/ payload files field_ops SHOULD reach (operational, NO $).
const DATA_FIELD_SAFE = [
  '/data/progress-data.js',      // GUHMA %-complete (no $)
  '/data/production-data.js',    // cols/LF/days (no $)
  '/data/schedule-seed.js',      // crew schedule seed (no $)
  '/data/schedule-data.js',      // crews/equipment/jobs (no $)
  '/data/timesheets.js',         // hours/cost-codes/names (no $ wages)
  '/data/fo-projects-field.js',  // field-safe project list (no $/GC/contract)
];

// --- 1. areaForPath classification + default-deny ---------------------------
section('areaForPath classification');
for (const p of SENSITIVE_PAGES) {
  const area = areaForPath(p);
  ok(`${p} -> sensitive area (${area})`,
     ['financials', 'contracts', 'preconstruction'].includes(area));
  ok(`${p} BLOCKED for field_ops`, roleCanAccess('field_ops', area) === false);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', area) === true);
}
for (const p of SENSITIVE_APIS) {
  const path = p.split('?')[0];
  const area = areaForPath(path);
  ok(`${path} -> non-general sensitive area (${area})`,
     area !== 'general' && roleCanAccess('field_ops', area) === false);
}
ok('/api/data -> financials', areaForPath('/api/data') === 'financials');
ok('/api/doc -> documents', areaForPath('/api/doc') === 'documents');
ok('/api/users -> user_admin', areaForPath('/api/users') === 'user_admin');

section('default-DENY for unmapped paths');
ok('unmapped /api/secret-thing -> admin-only',
   areaForPath('/api/secret-thing') === 'user_admin' &&
   roleCanAccess('field_ops', areaForPath('/api/secret-thing')) === false &&
   roleCanAccess('partner', areaForPath('/api/secret-thing')) === false);
ok('unmapped /random-page.html -> admin-only (field_ops blocked)',
   roleCanAccess('field_ops', areaForPath('/random-page.html')) === false);
ok('heuristic /budget-2026.html -> financials (field_ops blocked)',
   areaForPath('/budget-2026.html') === 'financials' &&
   roleCanAccess('field_ops', 'financials') === false);
ok('heuristic /contract-summary.html -> financials (blocked)',
   roleCanAccess('field_ops', areaForPath('/contract-summary.html')) === false);

section('field_ops ALLOWED surface');
for (const p of FIELD_ALLOWED) {
  const area = areaForPath(p);
  ok(`${p} -> field_ops allowed (area=${area})`, roleCanAccess('field_ops', area) === true);
}

// --- SEC-09: /data/ payload classification (the data-layer boundary) --------
section('SEC-09 sensitive /data/* files DENIED for field_ops');
for (const p of DATA_SENSITIVE) {
  const area = areaForPath(p);
  ok(`${p} -> sensitive area (${area})`,
     area !== 'general' && area !== 'schedule' && area !== 'field_ops');
  ok(`${p} BLOCKED for field_ops`, roleCanAccess('field_ops', area) === false);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', area) === true);
  ok(`${p} ALLOWED for admin`, roleCanAccess('admin', area) === true);
}

section('SEC-09 field-safe /data/* files ALLOWED for field_ops');
for (const p of DATA_FIELD_SAFE) {
  const area = areaForPath(p);
  ok(`${p} -> field-safe area (${area})`,
     area === 'field_ops' || area === 'schedule');
  ok(`${p} ALLOWED for field_ops`, roleCanAccess('field_ops', area) === true);
}

section('SEC-09 default-DENY for an UNCLASSIFIED /data/* file');
ok('/data/new-secret-feed.js -> admin-only (field_ops + partner blocked)',
   areaForPath('/data/new-secret-feed.js') === 'user_admin' &&
   roleCanAccess('field_ops', areaForPath('/data/new-secret-feed.js')) === false &&
   roleCanAccess('partner', areaForPath('/data/new-secret-feed.js')) === false);
ok('/data/2026-budget-draft.json -> financials by heuristic (field_ops blocked)',
   areaForPath('/data/2026-budget-draft.json') === 'financials' &&
   roleCanAccess('field_ops', areaForPath('/data/2026-budget-draft.json')) === false);

section('SEC-09 /api/me reachable by any authenticated role');
ok('/api/me -> general', areaForPath('/api/me') === 'general');
ok('/api/me allowed field_ops', roleCanAccess('field_ops', areaForPath('/api/me')) === true);
ok('/api/me allowed partner', roleCanAccess('partner', areaForPath('/api/me')) === true);

// --- 2. roleCanAccess matrix ------------------------------------------------
section('roleCanAccess matrix');
ok('admin -> financials', roleCanAccess('admin', 'financials') === true);
ok('admin -> user_admin', roleCanAccess('admin', 'user_admin') === true);
ok('partner -> user_admin DENIED', roleCanAccess('partner', 'user_admin') === false);
ok('field_ops -> field_ops', roleCanAccess('field_ops', 'field_ops') === true);
ok('field_ops -> financials DENIED', roleCanAccess('field_ops', 'financials') === false);
ok('field_ops -> contracts DENIED', roleCanAccess('field_ops', 'contracts') === false);
ok('field_ops -> documents DENIED', roleCanAccess('field_ops', 'documents') === false);
ok('field_ops -> preconstruction DENIED', roleCanAccess('field_ops', 'preconstruction') === false);
ok('unknown role DENIED', roleCanAccess('intern', 'general') === false);
ok('unknown area => admin only', roleCanAccess('partner', 'nonexistent') === false);

// --- 3. requireArea behaves as a backstop -----------------------------------
section('requireArea backstop (used in doc.js/data.js)');
const fieldSession = { uid: 'u1', role: 'field_ops', name: 'Crew' };
const partnerSession = { uid: 'u2', role: 'partner', name: 'Jonathan' };
const adminSession = { uid: 'u3', role: 'admin', name: 'Brad' };
ok('requireArea(field_ops, financials) => 403',
   requireArea(fieldSession, 'financials')?.status === 403);
ok('requireArea(field_ops, documents) => 403',
   requireArea(fieldSession, 'documents')?.status === 403);
ok('requireArea(partner, financials) => null (allowed)',
   requireArea(partnerSession, 'financials') === null);
ok('requireArea(partner, documents) => null (allowed)',
   requireArea(partnerSession, 'documents') === null);
ok('requireArea(admin, financials) => null', requireArea(adminSession, 'financials') === null);
ok('requireArea(null session, financials) => 403 (fail closed)',
   requireArea(null, 'financials')?.status === 403);
ok('requireArea(undefined, documents) => 403 (fail closed)',
   requireArea(undefined, 'documents')?.status === 403);

// --- 4. must_reset restricted sessions --------------------------------------
section('must_reset restricted sessions');
const restricted = await mintSession({ uid: 'u9', role: 'partner', name: 'New', mustReset: true }, SECRET, RESET_SESSION_TTL_MS);
const normal = await mintSession({ uid: 'u9', role: 'partner', name: 'New' }, SECRET);
const rDec = await verifySession(restricted, SECRET);
const nDec = await verifySession(normal, SECRET);
ok('restricted session verifies', rDec !== null);
ok('restricted session flagged', isRestrictedSession(rDec) === true);
ok('normal session NOT restricted', isRestrictedSession(nDec) === false);
ok('restricted carries role (for reset endpoint)', rDec.role === 'partner');

// Simulate the middleware restricted gate: a restricted session may ONLY reach
// the reset page/endpoint/logout/assets; everything else is blocked.
function restrictedAllows(path) {
  const isAsset = path !== '/' && !path.endsWith('.html') &&
                  !path.startsWith('/api/') && areaForPath(path) === 'general';
  return path === '/reset-password.html' ||
         path === '/api/reset-password' ||
         path === '/api/logout' ||
         isAsset;
}
ok('restricted CAN reach /reset-password.html', restrictedAllows('/reset-password.html') === true);
ok('restricted CAN reach /api/reset-password', restrictedAllows('/api/reset-password') === true);
ok('restricted CAN reach static /css/styles.css', restrictedAllows('/css/styles.css') === true);
ok('restricted CANNOT reach / (portal)', restrictedAllows('/') === false);
ok('restricted CANNOT reach /index.html', restrictedAllows('/index.html') === false);
ok('restricted CANNOT reach /pricing.html', restrictedAllows('/pricing.html') === false);
ok('restricted CANNOT reach /api/data', restrictedAllows('/api/data') === false);
ok('restricted CANNOT reach /api/doc', restrictedAllows('/api/doc') === false);

// --- 5. crypto sanity (unchanged layer, regression guard) -------------------
section('crypto regression (PBKDF2 + session)');
const { salt, hash, iterations } = await hashPassword('CorrectHorseBattery!');
ok('right password verifies', await verifyPassword('CorrectHorseBattery!', hash, salt, iterations) === true);
ok('wrong password rejected', await verifyPassword('wrong', hash, salt, iterations) === false);
const tampered = restricted.slice(0, -2) + (restricted.slice(-1) === 'a' ? 'b' : 'a') + 'X';
ok('tampered session rejected', await verifySession(tampered, SECRET) === null);
const expired = await mintSession({ uid: 'x', role: 'admin', name: 'X' }, SECRET, -1000);
ok('expired session rejected', await verifySession(expired, SECRET) === null);
ok('wrong secret rejected', await verifySession(normal, 'other-secret') === null);

// --- 6. endpoints actually CALL requireArea (static source check) -----------
section('source-level: requireArea invoked in doc.js + data.js');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const docSrc = readFileSync(join(__dir, '../functions/api/doc.js'), 'utf8');
const dataSrc = readFileSync(join(__dir, '../functions/api/data.js'), 'utf8');
const mwSrc = readFileSync(join(__dir, '../functions/_middleware.js'), 'utf8');
ok('doc.js imports requireArea', /import\s*\{[^}]*requireArea[^}]*\}\s*from/.test(docSrc));
ok('doc.js calls requireArea(...documents)', /requireArea\([^)]*['"]documents['"]\)/.test(docSrc));
ok('data.js imports requireArea', /import\s*\{[^}]*requireArea[^}]*\}\s*from/.test(dataSrc));
ok('data.js calls requireArea(...financials)', /requireArea\([^)]*['"]financials['"]\)/.test(dataSrc));
ok('middleware gate is OUTSIDE the /api/ branch (gates pages)',
   /Normal session: server-side area gate for PAGES/.test(mwSrc) &&
   /const area = areaForPath\(path\);\s*\n\s*if \(!roleCanAccess/.test(mwSrc));
ok('middleware handles restricted sessions', /isRestrictedSession\(session\)/.test(mwSrc));

// --- summary ----------------------------------------------------------------
console.log(`\n${'='.repeat(48)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:', fails); process.exit(1); }
console.log('ALL TESTS PASS');
