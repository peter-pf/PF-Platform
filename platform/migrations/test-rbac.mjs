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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));

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
  // [SEC-12] the raw schedule feeds embed per-job contract value ($) + gc_name.
  // Reclassified financials -> field_ops DENIED. The crew uses schedule-field.js.
  '/data/schedule-data.js',      // SEC-12: per-job value + gc_name
  '/data/schedule-seed.js',      // SEC-12: per-job value + gc_name
  '/data/schedule-seed-state.json', // SEC-12: per-job value + gc_name
];

// [SEC-09] /data/ payload files field_ops SHOULD reach (operational, NO $).
const DATA_FIELD_SAFE = [
  '/data/progress-data.js',      // GUHMA %-complete (no $)
  '/data/production-data.js',    // cols/LF/days (no $)
  '/data/schedule-field.js',     // SEC-12 field-safe schedule derivative (no value/gc_name)
  '/data/timesheets.js',         // hours/cost-codes/names (no $ wages)
  '/data/fo-projects-field.js',  // field-safe project list (no $/GC/contract)
];

// --- 1. areaForPath classification + default-deny ---------------------------
section('areaForPath classification');
for (const p of SENSITIVE_PAGES) {
  const area = areaForPath(p);
  ok(`${p} -> sensitive area (${area})`,
     ['financials', 'financials_global', 'contracts', 'preconstruction'].includes(area));
  ok(`${p} BLOCKED for field_ops`, roleCanAccess('field_ops', area) === false);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', area) === true);
}
for (const p of SENSITIVE_APIS) {
  const path = p.split('?')[0];
  const area = areaForPath(path);
  ok(`${path} -> non-general sensitive area (${area})`,
     area !== 'general' && roleCanAccess('field_ops', area) === false);
}
ok('/api/data -> financials (BD sees full bid log, Brad 2026-06-23)', areaForPath('/api/data') === 'financials');
ok('/api/doc -> documents', areaForPath('/api/doc') === 'documents');
ok('/api/users -> user_admin', areaForPath('/api/users') === 'user_admin');

section('default-DENY for unmapped paths');
ok('unmapped /api/secret-thing -> admin-only',
   areaForPath('/api/secret-thing') === 'user_admin' &&
   roleCanAccess('field_ops', areaForPath('/api/secret-thing')) === false &&
   roleCanAccess('partner', areaForPath('/api/secret-thing')) === false);
ok('unmapped /random-page.html -> admin-only (field_ops blocked)',
   roleCanAccess('field_ops', areaForPath('/random-page.html')) === false);
ok('heuristic /budget-2026.html -> financials_global (field_ops + BD blocked, fail safe)',
   areaForPath('/budget-2026.html') === 'financials_global' &&
   roleCanAccess('field_ops', 'financials_global') === false);
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
ok('/data/2026-budget-draft.json -> financials_global by heuristic (field_ops + BD blocked, fail safe)',
   areaForPath('/data/2026-budget-draft.json') === 'financials_global' &&
   roleCanAccess('field_ops', areaForPath('/data/2026-budget-draft.json')) === false);

section('SEC-09 /api/me reachable by any authenticated role');
ok('/api/me -> general', areaForPath('/api/me') === 'general');
ok('/api/me allowed field_ops', roleCanAccess('field_ops', areaForPath('/api/me')) === true);
ok('/api/me allowed partner', roleCanAccess('partner', areaForPath('/api/me')) === true);

// --- SEC-12: schedule leak (per-job value $ + gc_name) ----------------------
section('SEC-12 raw schedule feeds DENIED for field_ops (value $ + gc_name)');
const SCHED_RAW = ['/data/schedule-data.js', '/data/schedule-seed.js', '/data/schedule-seed-state.json'];
for (const p of SCHED_RAW) {
  const area = areaForPath(p);
  ok(`${p} -> sensitive area (${area})`,
     area !== 'general' && area !== 'schedule' && area !== 'field_ops');
  ok(`${p} BLOCKED for field_ops`, roleCanAccess('field_ops', area) === false);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', area) === true);
  ok(`${p} ALLOWED for admin`, roleCanAccess('admin', area) === true);
}
ok('SEC-13: dead /data/schedule-seed-state.JS entry not field-safe (file does not exist; classified by default-deny)',
   roleCanAccess('field_ops', areaForPath('/data/schedule-seed-state.js')) === false);

section('SEC-12 field-safe schedule derivative ALLOWED for field_ops');
ok('/data/schedule-field.js -> schedule', areaForPath('/data/schedule-field.js') === 'schedule');
ok('/data/schedule-field.js ALLOWED for field_ops',
   roleCanAccess('field_ops', areaForPath('/data/schedule-field.js')) === true);
ok('/data/schedule-field.js ALLOWED for partner',
   roleCanAccess('partner', areaForPath('/data/schedule-field.js')) === true);

section('SEC-12 schedule-field.js content carries NO value/gc_name/$ (data-layer proof)');
{
  const fieldSrc = readFileSync(join(__dir, '../data/schedule-field.js'), 'utf8');
  ok('schedule-field.js has NO "value" key', !/"value"\s*:/.test(fieldSrc));
  ok('schedule-field.js has NO "gc_name" key', !/"gc_name"\s*:/.test(fieldSrc));
  ok('schedule-field.js has NO literal "$"', !/\$/.test(fieldSrc));
  ok('schedule-field.js exposes window.PF_SCHEDULE_FIELD', /window\.PF_SCHEDULE_FIELD\s*=/.test(fieldSrc));
}

section('SEC-12 /api/schedule redacts value/gc_name for field_ops + denies field_ops writes');
{
  const schedSrc = readFileSync(join(__dir, '../functions/api/schedule.js'), 'utf8');
  ok('api/schedule strips value/gc_name on read (stripScheduleForFieldOps)',
     /stripScheduleForFieldOps/.test(schedSrc) &&
     /const\s*\{\s*value\s*,\s*gc_name\s*,\s*\.\.\.\s*safe\s*\}\s*=\s*j/.test(schedSrc));
  ok('api/schedule GET returns redacted view for non-privileged role',
     /return json\(\{\s*seeded:\s*true,\s*fallback:\s*false,\s*state:\s*view\(state\)/.test(schedSrc));
  ok('api/schedule GET keys role off context.data.session.role',
     /context\.data\s*&&\s*context\.data\.session\s*\?\s*context\.data\.session\.role/.test(schedSrc));
  ok('api/schedule write DENIES non-privileged (field_ops) with 403',
     /if \(!isPrivileged\) \{[\s\S]*?403/.test(schedSrc));
  ok('api/schedule still PERSISTS value (sanitizeJob keeps value) — only redacts on read',
     /value:\s*num\(j\.value/.test(schedSrc));
}

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

// --- 7. ITEM E: business_dev role — project vs company-wide financials -------
section('ITEM E: business_dev role exists + area matrix');
ok('business_dev is a known role', roleCanAccess('business_dev', 'general') === true);
// PROJECT-level financials: BD ALLOWED.
ok('BD -> financials (project-level) ALLOWED', roleCanAccess('business_dev', 'financials') === true);
ok('BD -> preconstruction ALLOWED', roleCanAccess('business_dev', 'preconstruction') === true);
ok('BD -> business_dev area ALLOWED', roleCanAccess('business_dev', 'business_dev') === true);
ok('BD -> estimating ALLOWED', roleCanAccess('business_dev', 'estimating') === true);
ok('BD -> field_ops area ALLOWED', roleCanAccess('business_dev', 'field_ops') === true);
ok('BD -> schedule ALLOWED', roleCanAccess('business_dev', 'schedule') === true);
ok('BD -> general ALLOWED', roleCanAccess('business_dev', 'general') === true);
// COMPANY-WIDE / GLOBAL financials + admin-only + contracts + documents: BD BLOCKED.
ok('BD -> financials_global BLOCKED', roleCanAccess('business_dev', 'financials_global') === false);
ok('BD -> user_admin BLOCKED', roleCanAccess('business_dev', 'user_admin') === false);
ok('BD -> contracts ALLOWED (Brad 2026-06-23)', roleCanAccess('business_dev', 'contracts') === true);
ok('BD -> documents ALLOWED (Brad 2026-06-23)', roleCanAccess('business_dev', 'documents') === true);
ok('BD -> unknown area BLOCKED (fail closed)', roleCanAccess('business_dev', 'nonexistent') === false);

section('ITEM E: business_dev CAN reach PROJECT-level financial data files');
const BD_PROJECT_DATA = [
  '/data/project-records.js',
  '/data/project-record-poet.js',
  '/data/budget-actual-poet.js',
  '/data/awarded-projects.js',
  '/data/project-master.json',
  '/data/project-history.js',
  '/data/precon-pipeline.js',
  '/data/bd-master.json',
  '/data/bid-log.json',          // BD sees full bid log (Brad 2026-06-23)
  '/data/schedule-data.js',
  '/data/schedule-seed.js',
  '/data/schedule-seed-state.json',
];
for (const p of BD_PROJECT_DATA) {
  const area = areaForPath(p);
  ok(`${p} -> project-level area (${area})`,
     ['financials', 'preconstruction', 'business_dev', 'estimating', 'schedule', 'field_ops'].includes(area));
  ok(`${p} ALLOWED for business_dev`, roleCanAccess('business_dev', area) === true);
  ok(`${p} STILL BLOCKED for field_ops`,
     ['financials', 'preconstruction', 'business_dev', 'estimating', 'contracts', 'financials_global'].includes(area)
       ? roleCanAccess('field_ops', area) === false
       : true);
}

section('ITEM E: business_dev CAN reach project pages + /api/me + field/general');
const BD_ALLOWED_PATHS = [
  '/api/me',
  '/project-history.html',   // project-level
  '/next-sprint.html',       // precon
  '/3-day-sprint.html',      // precon
  '/sop-additions.html',     // precon
  '/daily-production.html',  // field op
  '/schedule.html',          // schedule
  '/manual.html', '/onboarding.html', '/training.html', '/index.html', '/',
  '/css/styles.css',
  '/subcontracts.html',      // contracts — BD allowed (Brad 2026-06-23)
  '/api/doc?item=016ISVH64RZ6FBDCIAMNELEB5CKPHJ2UW3', // documents — BD allowed
  '/api/data?type=all',      // bid log + project master — BD allowed
];
for (const p of BD_ALLOWED_PATHS) {
  const area = areaForPath(p);
  ok(`${p} ALLOWED for business_dev (area=${area})`, roleCanAccess('business_dev', area) === true);
}

section('ITEM E: business_dev CANNOT reach company-wide / global financials');
const BD_BLOCKED_DATA = [
  '/data/projects-data.js',     // cross-job revenue/AR rollup
  '/data/live-data.js',         // global live mirror
  '/data/pricing-data.js',      // global pricing master
  '/data/sync-meta.json',       // cross-job sync meta
  '/data/pf-coi.js',            // company insurance
  '/data/insurance-baseline.js',// company insurance baseline
  '/data/estimate-template.json',// company estimating template
  '/data/pf-dashboard.js',      // company-wide monthly KPI/financial dashboard
];
for (const p of BD_BLOCKED_DATA) {
  const area = areaForPath(p);
  ok(`${p} -> financials_global (${area})`, area === 'financials_global');
  ok(`${p} BLOCKED for business_dev`, roleCanAccess('business_dev', area) === false);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', area) === true);
  ok(`${p} ALLOWED for admin`, roleCanAccess('admin', area) === true);
}

section('ITEM E: business_dev BLOCKED from global pages, /api/data, contracts, user_admin');
const BD_BLOCKED_PATHS = [
  '/api/users',              // user_admin
  '/pricing.html',           // global pricing master
  '/quickbooks-guide.html',  // global accounting
  '/alpha-review.html',      // global financial review
  '/coo-checklist.html',     // global COO oversight
  '/peter-cheatsheet.html',  // global internal cheatsheet
];
for (const p of BD_BLOCKED_PATHS) {
  const area = areaForPath(p);
  ok(`${p} BLOCKED for business_dev (area=${area})`, roleCanAccess('business_dev', area) === false);
}

section('ITEM E: business_dev default-DENY for unmapped + unclassified sensitive');
ok('unmapped /api/secret-thing BLOCKED for BD',
   roleCanAccess('business_dev', areaForPath('/api/secret-thing')) === false);
ok('unmapped /random-page.html BLOCKED for BD',
   roleCanAccess('business_dev', areaForPath('/random-page.html')) === false);
ok('NEW sensitive /data/2026-budget-draft.json -> financials_global (BD blocked, fail safe)',
   areaForPath('/data/2026-budget-draft.json') === 'financials_global' &&
   roleCanAccess('business_dev', '/data/2026-budget-draft.json'.length ? areaForPath('/data/2026-budget-draft.json') : '') === false);
ok('NEW sensitive /financials-summary.html -> financials_global (BD blocked, fail safe)',
   areaForPath('/financials-summary.html') === 'financials_global' &&
   roleCanAccess('business_dev', areaForPath('/financials-summary.html')) === false);
ok('unclassified /data/new-secret-feed.js -> user_admin (BD blocked)',
   roleCanAccess('business_dev', areaForPath('/data/new-secret-feed.js')) === false);

section('ITEM E: requireArea backstop for business_dev');
const bdSession = { uid: 'u5', role: 'business_dev', name: 'BD Staff' };
ok('requireArea(BD, financials) => null (allowed)',
   requireArea(bdSession, 'financials') === null);
ok('requireArea(BD, preconstruction) => null (allowed)',
   requireArea(bdSession, 'preconstruction') === null);
ok('requireArea(BD, financials_global) => 403',
   requireArea(bdSession, 'financials_global')?.status === 403);
ok('requireArea(BD, contracts) => null (allowed, Brad 2026-06-23)',
   requireArea(bdSession, 'contracts') === null);
ok('requireArea(BD, documents) => null (allowed, Brad 2026-06-23)',
   requireArea(bdSession, 'documents') === null);
ok('requireArea(BD, user_admin) => 403',
   requireArea(bdSession, 'user_admin')?.status === 403);
ok('requireArea(BD, financials_global) still => 403',
   requireArea(bdSession, 'financials_global')?.status === 403);

section('ITEM E: REGRESSION — field_ops/partner/admin unchanged on split areas');
ok('field_ops -> financials STILL DENIED', roleCanAccess('field_ops', 'financials') === false);
ok('field_ops -> financials_global STILL DENIED', roleCanAccess('field_ops', 'financials_global') === false);
ok('partner -> financials ALLOWED', roleCanAccess('partner', 'financials') === true);
ok('partner -> financials_global ALLOWED', roleCanAccess('partner', 'financials_global') === true);
ok('admin -> financials_global ALLOWED', roleCanAccess('admin', 'financials_global') === true);
ok('partner -> projects-data.js (global) ALLOWED',
   roleCanAccess('partner', areaForPath('/data/projects-data.js')) === true);
ok('field_ops -> projects-data.js (global) DENIED',
   roleCanAccess('field_ops', areaForPath('/data/projects-data.js')) === false);

// --- PF DASHBOARD: company-wide KPI feed is financials_global (owners only) ---
section('PF Dashboard feed: /data/pf-dashboard.js -> financials_global (OWNERS ONLY)');
ok('/data/pf-dashboard.js -> financials_global',
   areaForPath('/data/pf-dashboard.js') === 'financials_global');
ok('pf-dashboard.js ALLOWED for admin',
   roleCanAccess('admin', areaForPath('/data/pf-dashboard.js')) === true);
ok('pf-dashboard.js ALLOWED for partner',
   roleCanAccess('partner', areaForPath('/data/pf-dashboard.js')) === true);
ok('pf-dashboard.js BLOCKED for business_dev',
   roleCanAccess('business_dev', areaForPath('/data/pf-dashboard.js')) === false);
ok('pf-dashboard.js BLOCKED for field_ops',
   roleCanAccess('field_ops', areaForPath('/data/pf-dashboard.js')) === false);
ok('requireArea(business_dev, pf-dashboard area) => 403',
   requireArea({ uid: 'bd', role: 'business_dev', name: 'BD' }, areaForPath('/data/pf-dashboard.js'))?.status === 403);
ok('requireArea(field_ops, pf-dashboard area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/data/pf-dashboard.js'))?.status === 403);

// --- PRECON + BD DASHBOARDS: new section-dashboard feeds --------------------
// precon-dashboard.js -> preconstruction (admin/partner/business_dev; field_ops BLOCKED)
// bd-dashboard.js      -> business_dev   (admin/partner/business_dev; field_ops BLOCKED)
section('Precon Dashboard feed: /data/precon-dashboard.js -> preconstruction');
ok('/data/precon-dashboard.js -> preconstruction',
   areaForPath('/data/precon-dashboard.js') === 'preconstruction');
ok('precon-dashboard.js ALLOWED for admin',
   roleCanAccess('admin', areaForPath('/data/precon-dashboard.js')) === true);
ok('precon-dashboard.js ALLOWED for partner',
   roleCanAccess('partner', areaForPath('/data/precon-dashboard.js')) === true);
ok('precon-dashboard.js ALLOWED for business_dev',
   roleCanAccess('business_dev', areaForPath('/data/precon-dashboard.js')) === true);
ok('precon-dashboard.js BLOCKED for field_ops',
   roleCanAccess('field_ops', areaForPath('/data/precon-dashboard.js')) === false);
ok('requireArea(field_ops, precon-dashboard area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/data/precon-dashboard.js'))?.status === 403);
ok('requireArea(business_dev, precon-dashboard area) => null (allowed)',
   requireArea({ uid: 'bd', role: 'business_dev', name: 'BD' }, areaForPath('/data/precon-dashboard.js')) === null);

section('BD Dashboard feed: /data/bd-dashboard.js -> business_dev');
ok('/data/bd-dashboard.js -> business_dev',
   areaForPath('/data/bd-dashboard.js') === 'business_dev');
ok('bd-dashboard.js ALLOWED for admin',
   roleCanAccess('admin', areaForPath('/data/bd-dashboard.js')) === true);
ok('bd-dashboard.js ALLOWED for partner',
   roleCanAccess('partner', areaForPath('/data/bd-dashboard.js')) === true);
ok('bd-dashboard.js ALLOWED for business_dev',
   roleCanAccess('business_dev', areaForPath('/data/bd-dashboard.js')) === true);
ok('bd-dashboard.js BLOCKED for field_ops',
   roleCanAccess('field_ops', areaForPath('/data/bd-dashboard.js')) === false);
ok('requireArea(field_ops, bd-dashboard area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/data/bd-dashboard.js'))?.status === 403);
ok('requireArea(business_dev, bd-dashboard area) => null (allowed)',
   requireArea({ uid: 'bd', role: 'business_dev', name: 'BD' }, areaForPath('/data/bd-dashboard.js')) === null);

// Data-layer proof: the feed files must not leak company-wide $ that BD/field
// shouldn't compute. (precon = project/BD bid economics by design; assert the
// generated feeds carry the expected window globals + no surprise globals.)
section('Precon + BD dashboard feeds: generated shape sanity');
{
  const preconSrc = readFileSync(join(__dir, '../data/precon-dashboard.js'), 'utf8');
  const bdSrc = readFileSync(join(__dir, '../data/bd-dashboard.js'), 'utf8');
  ok('precon-dashboard.js exposes window.PF_PRECON_DASH', /window\.PF_PRECON_DASH\s*=/.test(preconSrc));
  ok('bd-dashboard.js exposes window.PF_BD_DASH', /window\.PF_BD_DASH\s*=/.test(bdSrc));
  ok('precon feed has metricsMeta', /"metricsMeta"/.test(preconSrc));
  ok('bd feed has metricsMeta', /"metricsMeta"/.test(bdSrc));
  ok('bd feed documents OMITTED metrics (no fabrication)', /"_omitted"/.test(bdSrc));

  // FIX 2: Win Rate declares a pooled-ratio basis so quarter/annual rollups use
  // sum(Awarded)/sum(Awarded+Not Awarded), not the mean of monthly rates.
  const preconJson = JSON.parse(preconSrc.replace(/^[\s\S]*?window\.PF_PRECON_DASH\s*=/, '').replace(/;\s*$/, ''));
  const winRate = preconJson.metricsMeta.find(m => m.metric === 'Win Rate');
  ok('precon Win Rate metricsMeta exists', !!winRate);
  ok('Win Rate declares basisNum = Awarded', winRate && winRate.basisNum === 'Awarded');
  ok('Win Rate declares basisDen = [Awarded, Not Awarded]',
     winRate && Array.isArray(winRate.basisDen) &&
     winRate.basisDen.join(',') === 'Awarded,Not Awarded');
  const names = preconJson.metricsMeta.map(m => m.metric);
  ok('basisNum metric exists in feed', names.includes(winRate.basisNum));
  ok('all basisDen metrics exist in feed', winRate.basisDen.every(n => names.includes(n)));
  // No OTHER pct metric carries a basis (so company-dashboard margins, which
  // live in a different feed, keep the averaging path; here we just assert the
  // precon feed only attaches a basis to a ratio-of-counts metric).
  preconJson.metricsMeta.forEach(function (m) {
    if (m.metric !== 'Win Rate') {
      ok(m.metric + ' carries NO basis (only ratio-of-counts gets pooled)', !m.basisNum && !m.basisDen);
    }
  });
  ok('precon isTemplateData is a real computed boolean', typeof preconJson.isTemplateData === 'boolean');
  const bdJson = JSON.parse(bdSrc.replace(/^[\s\S]*?window\.PF_BD_DASH\s*=/, '').replace(/;\s*$/, ''));
  ok('bd isTemplateData is a real computed boolean', typeof bdJson.isTemplateData === 'boolean');
}

// Both new feeds DENIED to field_ops (consolidated, mirrors the spec ask).
section('Precon + BD dashboards: field_ops sees ZERO of either');
for (const p of ['/data/precon-dashboard.js', '/data/bd-dashboard.js']) {
  ok(`${p} BLOCKED for field_ops`, roleCanAccess('field_ops', areaForPath(p)) === false);
  ok(`${p} ALLOWED for admin`, roleCanAccess('admin', areaForPath(p)) === true);
  ok(`${p} ALLOWED for partner`, roleCanAccess('partner', areaForPath(p)) === true);
  ok(`${p} ALLOWED for business_dev`, roleCanAccess('business_dev', areaForPath(p)) === true);
}

// --- BD CRM backbone: companies + contacts + interactions -------------------
// bd-records.js -> business_dev (base feed). /api/bd-record + /api/bd-interaction
// -> business_dev (write-back). admin/partner/business_dev allowed; field_ops
// BLOCKED everywhere (feed + both endpoints), by direct URL too.
section('BD CRM: /data/bd-records.js -> business_dev');
ok('/data/bd-records.js -> business_dev', areaForPath('/data/bd-records.js') === 'business_dev');
ok('bd-records.js ALLOWED for admin', roleCanAccess('admin', areaForPath('/data/bd-records.js')) === true);
ok('bd-records.js ALLOWED for partner', roleCanAccess('partner', areaForPath('/data/bd-records.js')) === true);
ok('bd-records.js ALLOWED for business_dev', roleCanAccess('business_dev', areaForPath('/data/bd-records.js')) === true);
ok('bd-records.js BLOCKED for field_ops', roleCanAccess('field_ops', areaForPath('/data/bd-records.js')) === false);
ok('requireArea(field_ops, bd-records area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/data/bd-records.js'))?.status === 403);

section('BD CRM: write-back endpoints -> business_dev (field_ops denied)');
const BD_API = ['/api/bd-record', '/api/bd-interaction',
                '/api/bd-interaction?entityType=company&entityId=co_x',
                '/api/bd-record?foo=bar'];
for (const p of BD_API) {
  const path = p.split('?')[0];
  const area = areaForPath(path);
  ok(`${path} -> business_dev (${area})`, area === 'business_dev');
  ok(`${path} ALLOWED for admin`, roleCanAccess('admin', area) === true);
  ok(`${path} ALLOWED for partner`, roleCanAccess('partner', area) === true);
  ok(`${path} ALLOWED for business_dev`, roleCanAccess('business_dev', area) === true);
  ok(`${path} BLOCKED for field_ops`, roleCanAccess('field_ops', area) === false);
}
ok('requireArea(field_ops, /api/bd-record area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/api/bd-record'))?.status === 403);
ok('requireArea(field_ops, /api/bd-interaction area) => 403',
   requireArea({ uid: 'fo', role: 'field_ops', name: 'Crew' }, areaForPath('/api/bd-interaction'))?.status === 403);
ok('requireArea(business_dev, /api/bd-record area) => null (allowed)',
   requireArea({ uid: 'bd', role: 'business_dev', name: 'BD' }, areaForPath('/api/bd-record')) === null);
ok('requireArea(null session, /api/bd-interaction) => 403 (fail closed)',
   requireArea(null, areaForPath('/api/bd-interaction'))?.status === 403);

section('BD CRM: endpoints actually CALL require(business_dev) (source check)');
{
  const ixSrc = readFileSync(join(__dir, '../functions/api/bd-interaction.js'), 'utf8');
  const recSrc = readFileSync(join(__dir, '../functions/api/bd-record.js'), 'utf8');
  ok('bd-interaction imports requireArea', /import\s*\{[^}]*requireArea[^}]*\}\s*from/.test(ixSrc));
  ok('bd-interaction calls requireArea(...business_dev)', /requireArea\([^)]*['"]business_dev['"]\)/.test(ixSrc));
  ok('bd-record imports requireArea', /import\s*\{[^}]*requireArea[^}]*\}\s*from/.test(recSrc));
  ok('bd-record calls requireArea(...business_dev)', /requireArea\([^)]*['"]business_dev['"]\)/.test(recSrc));
  // both GET and POST guard (two requireArea calls each).
  ok('bd-interaction guards GET and POST', (ixSrc.match(/requireArea\(/g) || []).length >= 2);
  ok('bd-record guards GET and POST', (recSrc.match(/requireArea\(/g) || []).length >= 2);
  // KV binding used + write-cap present.
  ok('bd-interaction uses env.PF_SCHEDULE', /env\.PF_SCHEDULE/.test(ixSrc));
  ok('bd-record uses env.PF_SCHEDULE', /env\.PF_SCHEDULE/.test(recSrc));
  ok('bd-record enforces a field allow-list', /allow/.test(recSrc) && /cleanFields/.test(recSrc));
}

section('BD CRM: bd-records.js feed shape (generated)');
{
  const recFeed = readFileSync(join(__dir, '../data/bd-records.js'), 'utf8');
  ok('bd-records.js exposes window.PF_BD_RECORDS', /window\.PF_BD_RECORDS\s*=/.test(recFeed));
  const recJson = JSON.parse(recFeed.replace(/^[\s\S]*?window\.PF_BD_RECORDS\s*=/, '').replace(/;\s*$/, ''));
  ok('feed has companies array', Array.isArray(recJson.companies) && recJson.companies.length > 0);
  ok('companies carry stable ids + fields + contacts',
     recJson.companies.every(c => c.id && c.fields && Array.isArray(c.contacts)));
  ok('company ids are unique',
     new Set(recJson.companies.map(c => c.id)).size === recJson.companies.length);
  ok('companyFields + contactFields are present (row-4 field lists)',
     Array.isArray(recJson.companyFields) && recJson.companyFields.includes('Name') &&
     Array.isArray(recJson.contactFields) && recJson.contactFields.includes('Name'));

  // FIX 3: EVERY id (companies + all contacts + unlinked) must be unique so
  // interaction logs (keyed by id) never bleed between records.
  const allIds = [];
  recJson.companies.forEach(c => { allIds.push(c.id); c.contacts.forEach(ct => allIds.push(ct.id)); });
  (recJson.unlinkedContacts || []).forEach(u => allIds.push(u.id));
  ok('ALL ids (companies + contacts + unlinked) are globally unique',
     new Set(allIds).size === allIds.length);
  ok('there is a healthy number of ids (regression guard)', allIds.length > 600);

  // FIX 1 source-check: index.html actually CONSUMES unlinkedContacts (so the 24
  // named contacts are not invisible). Before the fix the feed had them but the
  // UI never referenced the key.
  const idxSrc = readFileSync(join(__dir, '../index.html'), 'utf8');
  ok('index.html references unlinkedContacts (renders them)', /unlinkedContacts/.test(idxSrc));
  ok('index.html has the synthetic Unlinked group id __unlinked__', /__unlinked__/.test(idxSrc));

  // FIX 2: feed exposes fuzzyLinks for audit + tags ambiguous unlinked contacts.
  ok('feed exposes fuzzyLinks array (auditable second-pass links)', Array.isArray(recJson.fuzzyLinks));
  ok('unlinkedContacts is present + consumed', Array.isArray(recJson.unlinkedContacts));
  const ambig = (recJson.unlinkedContacts || []).filter(u => Array.isArray(u.ambiguousCandidates) && u.ambiguousCandidates.length);
  ok('ambiguous unlinked contacts carry candidate lists (no guessing)', ambig.length >= 1);
}

// --- summary ----------------------------------------------------------------
console.log(`\n${'='.repeat(48)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:', fails); process.exit(1); }
console.log('ALL TESTS PASS');
