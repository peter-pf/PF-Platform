// ============================================================================
// REMOVE STANDALONE "Budget vs Actual - 26-002 POET" from Project Management
// (Brad 2026-08-13)  —  branch remove-poet-budget-sheet-pm-20260813
// ----------------------------------------------------------------------------
// Brad: "In the Project Management section, can delete the 'Budget vs Actual -
// 26-002 POET' financials sheet. This now lives in each project so no need to
// have it here."
//
// This harness asserts, against the REAL index.html (+ auth.js), that:
//   REMOVED  the standalone nav item, its module view (#mod-budget-actual-poet),
//            the label-map entry, the standalone renderer (PF_BUDGET_ACTUAL_POET
//            -> #baRoot), and the two client preload references to the data feed.
//   INTACT   the PER-PROJECT financials (cost-code template + saved budgets +
//            synced actuals + invoicing) — a DIFFERENT data path — plus the data
//            file on disk and its server-side RBAC gate (data is preserved, not
//            deleted).
//   CLEAN    no dangling showModule('budget-actual-poet') / data-module route.
// ============================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const authJs = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// Strip HTML comments so "removed" assertions ignore the removal-marker comments
// we intentionally leave behind (mirrors the earlier Subcontracts removal style).
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');

console.log('\n==== Standalone POET Budget vs Actual — REMOVED ====');

// 1) nav item gone (no clickable nav entry / data-module)
ok(!/data-module=["']budget-actual-poet["']/.test(htmlNoComments),
   'nav item data-module="budget-actual-poet" is gone');
ok(!/showModule\(['"]budget-actual-poet['"]\)/.test(htmlNoComments),
   "no dangling showModule('budget-actual-poet') route");

// 2) module view container gone
ok(!/id=["']mod-budget-actual-poet["']/.test(htmlNoComments),
   '#mod-budget-actual-poet module view is gone');
ok(!/id=["']baRoot["']/.test(htmlNoComments),
   '#baRoot render target is gone');

// 3) label-map entry gone
ok(!/['"]budget-actual-poet['"]\s*:/.test(htmlNoComments),
   "label-map entry 'budget-actual-poet': ... is gone");

// 4) standalone renderer + global consumer gone
ok(!/window\.PF_BUDGET_ACTUAL_POET/.test(htmlNoComments),
   'window.PF_BUDGET_ACTUAL_POET is no longer consumed anywhere');

// 5) client preload references to the standalone feed gone
ok(!/['"]\/data\/budget-actual-poet\.js['"]/.test(htmlNoComments),
   'client preload references to /data/budget-actual-poet.js are gone');

console.log('\n==== Per-project financials + data — INTACT ====');

// Per-project data path (the replacement) must survive untouched.
ok(/window\.PF_COST_CODE_TEMPLATE/.test(html),
   'per-project PF_COST_CODE_TEMPLATE still referenced');
ok(/window\.PF_PROJECT_BUDGETS/.test(html),
   'per-project PF_PROJECT_BUDGETS still referenced');
ok(/window\.PF_PROJECT_INVOICING/.test(html),
   'per-project PF_PROJECT_INVOICING still referenced');
ok(/function budgetVsActualTable\(/.test(html),
   'per-project budgetVsActualTable() renderer still present');
ok(/Project Costs \(Budget vs Actual\)/.test(html),
   "per-project 'Project Costs (Budget vs Actual)' section still present");
ok(/loadBudgetSync\(/.test(html) && /loadInvoicingSync\(/.test(html),
   'per-project loadBudgetSync / loadInvoicingSync still present');

// Per-project data feeds still preloaded for privileged users.
ok(/['"]\/data\/cost-code-template\.js['"]/.test(html),
   'preload of /data/cost-code-template.js intact');
ok(/['"]\/data\/budget-actuals\.js['"]/.test(html),
   'preload of /data/budget-actuals.js (synced actuals) intact');
ok(/['"]\/data\/invoice-ledger\.js['"]/.test(html),
   'preload of /data/invoice-ledger.js intact');

// Data file preserved on disk (NOT deleted) + server RBAC gate preserved.
ok(fs.existsSync(path.join(ROOT, 'data', 'budget-actual-poet.js')),
   'data/budget-actual-poet.js file preserved on disk (data not deleted)');
ok(/['"]\/data\/budget-actual-poet\.js['"]\s*:\s*['"]financials['"]/.test(authJs),
   "server-side auth.js RBAC gate ('financials') for the data feed preserved");

console.log('\n----------------------------------------');
console.log('  ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
