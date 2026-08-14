// RBAC harness for the "Derek = full partner visibility" change.
// Imports the REAL functions/lib/auth.js and asserts, per role, access to the
// areas + data files that matter. Prints a before/after table and exits non-zero
// on any assertion failure. Run: node test-harness/derek-partner-rbac.test.mjs
import { roleCanAccess, areaForPath, ROLES } from '../functions/lib/auth.js';

let fails = 0;
function assert(cond, msg) {
  const ok = !!cond;
  if (!ok) { fails++; console.log('  FAIL: ' + msg); }
  return ok;
}

// Resolve a role's access to a request PATH exactly as the middleware does:
// path -> area (areaForPath) -> roleCanAccess.
function canReach(role, path) {
  return roleCanAccess(role, areaForPath(path));
}

const roles = ['admin', 'partner', 'business_dev', 'field_ops', 'hr'];

// The surfaces that define partner-level visibility + the ones under test.
const PATHS = {
  'COO checklist page (/coo-checklist.html)':      '/coo-checklist.html',
  'COO checklist API (/api/coo-checklist)':        '/api/coo-checklist',
  'Estimated Stone feed (/data/turnover-stone.js)':'/data/turnover-stone.js',
  'Pricing master page (/pricing.html)':           '/pricing.html',
  'Company dashboard (/data/pf-dashboard.js)':     '/data/pf-dashboard.js',
  'Bid log (/data/bid-log.json)':                  '/data/bid-log.json',
  'Precon pipeline (/data/precon-pipeline.js)':    '/data/precon-pipeline.js',
  'BD CRM base (/data/bd-records.js)':             '/data/bd-records.js',
  'Contacts CRM API (/api/contacts)':              '/api/contacts',
  'BD interaction API (/api/bd-interaction)':      '/api/bd-interaction',
  'Opportunity API (/api/opportunity)':            '/api/opportunity',
  'Project records (/data/project-records.js)':    '/data/project-records.js',
  'Subcontracts page (/subcontracts.html)':        '/subcontracts.html',
  'HR roster (/data/hr-roster.json)':              '/data/hr-roster.json',
  'User admin (/api/users)':                       '/api/users',
  'Field production (/data/production-data.js)':    '/data/production-data.js',
  'Daily report API (/api/daily-report)':          '/api/daily-report',
};

console.log('\n=== ACCESS MATRIX (rows=surface, cols=role) : Y=allowed / . =denied ===');
const header = 'surface'.padEnd(48) + roles.map(r => r.padStart(13)).join('');
console.log(header);
for (const [label, path] of Object.entries(PATHS)) {
  const cells = roles.map(r => (canReach(r, path) ? 'Y' : '.').padStart(13)).join('');
  console.log(label.padEnd(48) + cells);
}

console.log('\n=== ASSERTIONS ===');

// ---- 1. Derek (partner) sees EVERYTHING Brad(admin) & Jonathan(partner) BOTH see.
// The partner intersection = every area partner holds. Assert partner reaches all
// partner-level surfaces AND the two under-test feeds.
console.log('[Derek = partner : gains partner-level visibility]');
assert(canReach('partner', '/coo-checklist.html'), 'partner reaches COO checklist page (financials_global)');
assert(canReach('partner', '/api/coo-checklist'),  'partner reaches COO checklist API (financials_global)');
assert(canReach('partner', '/data/turnover-stone.js'), 'partner reaches Estimated Stone feed');
assert(canReach('partner', '/pricing.html'),       'partner reaches pricing master');
assert(canReach('partner', '/data/pf-dashboard.js'),'partner reaches company dashboard');
assert(canReach('partner', '/subcontracts.html'),  'partner reaches subcontracts (contracts)');

// ---- 2. Derek RETAINS all prior BD/CRM access (partner is a superset of business_dev
// for every area business_dev holds). Prove partner >= business_dev on EVERY area.
console.log('[Derek loses nothing : partner is a superset of business_dev]');
const AREAS = ['field_ops','schedule','financials','financials_global','contracts',
  'preconstruction','estimating','business_dev','documents','general','crm'];
for (const area of AREAS) {
  const bd = roleCanAccess('business_dev', area);
  const pa = roleCanAccess('partner', area);
  // superset property: wherever business_dev can go, partner can go too.
  assert(!bd || pa, `partner covers business_dev area '${area}' (bd=${bd} partner=${pa})`);
}
// Concretely the BD/CRM surfaces Derek uses today:
assert(canReach('partner', '/data/bd-records.js'),   'partner reaches BD CRM base');
assert(canReach('partner', '/api/contacts'),         'partner reaches Contacts CRM API');
assert(canReach('partner', '/api/bd-interaction'),   'partner reaches BD interaction API');
assert(canReach('partner', '/api/opportunity'),      'partner reaches Opportunity API');
assert(canReach('partner', '/data/precon-pipeline.js'),'partner reaches precon pipeline');

// ---- 3. Estimated Stone now visible to partner (Derek) AND Jonathan(partner) AND admin,
// but NOT business_dev-only-below and NOT field_ops.
console.log('[Estimated Stone : partner-inclusive, field_ops still blocked]');
assert(canReach('admin', '/data/turnover-stone.js'),     'admin reaches Estimated Stone');
assert(canReach('partner', '/data/turnover-stone.js'),   'partner (Jonathan+Derek) reaches Estimated Stone');
assert(!canReach('field_ops', '/data/turnover-stone.js'),'field_ops BLOCKED from Estimated Stone');

// ---- 4. FIELD_OPS FIREWALL UNCHANGED — blocked from financials/estimating/CRM/contracts/precon.
console.log('[field_ops firewall : unchanged]');
assert(!canReach('field_ops', '/coo-checklist.html'),   'field_ops BLOCKED from COO checklist');
assert(!canReach('field_ops', '/api/coo-checklist'),    'field_ops BLOCKED from COO checklist API');
assert(!canReach('field_ops', '/pricing.html'),         'field_ops BLOCKED from pricing');
assert(!canReach('field_ops', '/data/pf-dashboard.js'), 'field_ops BLOCKED from company dashboard');
assert(!canReach('field_ops', '/data/project-records.js'),'field_ops BLOCKED from project records');
assert(!canReach('field_ops', '/data/precon-pipeline.js'),'field_ops BLOCKED from precon');
assert(!canReach('field_ops', '/api/contacts'),         'field_ops BLOCKED from CRM contacts');
assert(!canReach('field_ops', '/api/bd-interaction'),   'field_ops BLOCKED from BD interaction');
assert(!canReach('field_ops', '/subcontracts.html'),    'field_ops BLOCKED from subcontracts');
assert(!canReach('field_ops', '/data/turnover-stone.js'),'field_ops BLOCKED from Estimated Stone');
// field_ops KEEPS its operational surface:
assert(canReach('field_ops', '/data/production-data.js'),'field_ops KEEPS production data');
assert(canReach('field_ops', '/api/daily-report'),      'field_ops KEEPS daily report');
assert(canReach('field_ops', '/schedule.html'),         'field_ops KEEPS schedule');

// ---- 5. business_dev access UNCHANGED by this build (no widening of BD).
console.log('[business_dev : unchanged — no accidental widening]');
assert(canReach('business_dev', '/data/precon-pipeline.js'),'business_dev KEEPS precon');
assert(canReach('business_dev', '/api/contacts'),           'business_dev KEEPS CRM');
assert(canReach('business_dev', '/data/project-records.js'),'business_dev KEEPS project financials');
assert(!canReach('business_dev', '/coo-checklist.html'),    'business_dev STILL BLOCKED from COO checklist (financials_global)');
assert(!canReach('business_dev', '/data/pf-dashboard.js'),  'business_dev STILL BLOCKED from company dashboard');

// ---- 6. HR firewall unchanged (partner NOT in hr).
console.log('[hr module : unchanged — partner not granted hr]');
assert(canReach('hr', '/data/hr-roster.json'),      'hr role reaches HR roster');
assert(canReach('admin', '/data/hr-roster.json'),   'admin reaches HR roster');
assert(!canReach('partner', '/data/hr-roster.json'),'partner NOT granted HR (unchanged)');
assert(!canReach('business_dev','/data/hr-roster.json'),'business_dev NOT granted HR');

// ---- 7. user_admin stays admin-only (Derek-as-partner must NOT get user management).
console.log('[user management : admin-only]');
assert(canReach('admin', '/api/users'),       'admin has user management');
assert(!canReach('partner', '/api/users'),    'partner does NOT get user management');
assert(!canReach('business_dev', '/api/users'),'business_dev does NOT get user management');

console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS' : (fails + ' FAILURE(S)')) + ' ===\n');
process.exit(fails === 0 ? 0 : 1);
