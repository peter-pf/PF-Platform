// Harness: move "QA / QC" left-nav subgroup from Field Operations -> Project
// Management (Brad 2026-08-14). NAV GROUPING move only.
//
// Proves, against the live DOM of index.html (jsdom, scripts NOT executed —
// pure structural check):
//
//   [1] QA/QC nav-sub is now a direct child subgroup of Project Management.
//   [2] QA/QC nav-sub is GONE from Field Operations.
//   [3] Anchor/route ids UNCHANGED — data-module="guhma"/"modulus" + their
//       showModule() onclicks + the GUHMA label are intact (existing links/
//       bookmarks still resolve).
//   [4] Page still resolves — the moduleTitles map still maps guhma.
//   [5] RBAC/visibility PRESERVED — Project Management is data-fo-mixed, so a
//       nav-sub without data-fo-safe would be hidden from the field crew by
//       body.role-field-ops .nav-section[data-fo-mixed] .nav-sub:not([data-fo-safe]).
//       The moved subgroup + both items carry data-fo-safe="1" so whoever could
//       see QA/QC before still can (same pattern as TimeSheets). UI-only; the
//       server remains the real boundary for the guhma/modulus modules.
//   [6] Field Operations still renders its remaining items.
//   [7] Project Management still renders correctly (existing subgroups intact),
//       with QA/QC placed immediately after TimeSheets.
//   [8] Exactly one QA/QC nav-sub in the whole nav (no duplicate).
//   [9] Collapse/highlight structure intact on the moved nodes.
//
// Run (from platform/):  node test-harness/qaqc-nav-move.test.js
// jsdom resolves from the repo's node_modules (../.. relative to platform/).

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');                 // platform/
const REPO = path.resolve(ROOT, '..');                      // PF-Platform/ (has node_modules/jsdom)

// Make `require('jsdom')` resolve from the repo node_modules regardless of cwd.
const extraPaths = [
  path.join(REPO, 'node_modules'),
  path.join(ROOT, 'node_modules'),
];
for (const p of extraPaths) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) Module.globalPaths.push(p);
}
let JSDOM;
try {
  JSDOM = require(require.resolve('jsdom', { paths: extraPaths })).JSDOM;
} catch (e) {
  JSDOM = require('jsdom').JSDOM; // fall back to normal resolution
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// runScripts 'outside-only' => DOM is parsed but page scripts do NOT execute.
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const doc = dom.window.document;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS: ' + msg); }
  else { fail++; console.log('  FAIL: ' + msg); }
}

// Locate a top-level section group by its nav-section-label text.
function sectionByLabel(text) {
  const labels = [...doc.querySelectorAll('.nav-section > .nav-section-label')];
  const lbl = labels.find(l => l.textContent.trim() === text);
  return lbl ? lbl.parentElement : null;
}

const pm = sectionByLabel('Project Management');
const fo = sectionByLabel('Field Operations');
assert(!!pm, 'Project Management section exists');
assert(!!fo, 'Field Operations section exists');

// Find a QA/QC nav-sub that is a DIRECT child subgroup of a section.
function qaqcSubIn(section) {
  if (!section) return null;
  const subs = [...section.querySelectorAll(':scope > .nav-sub')];
  return subs.find(s => {
    const l = s.querySelector(':scope > .nav-sub-label');
    return l && l.textContent.trim() === 'QA/QC';
  }) || null;
}

const qaInPM = qaqcSubIn(pm);
const qaInFO = qaqcSubIn(fo);

console.log('\n[1] QA/QC now under Project Management:');
assert(!!qaInPM, 'QA/QC nav-sub is a direct child subgroup of Project Management');

console.log('\n[2] QA/QC gone from Field Operations:');
assert(!qaInFO, 'QA/QC nav-sub is NOT under Field Operations anymore');

console.log('\n[3] Anchor/route ids unchanged (guhma + modulus present, correct labels):');
if (qaInPM) {
  const items = [...qaInPM.querySelectorAll('a.nav-item')];
  const modules = items.map(a => a.getAttribute('data-module'));
  const onclicks = items.map(a => a.getAttribute('onclick'));
  assert(modules.includes('guhma'), 'data-module="guhma" present');
  assert(modules.includes('modulus'), 'data-module="modulus" present');
  assert(onclicks.includes("showModule('guhma')"), "onclick showModule('guhma') intact");
  assert(onclicks.includes("showModule('modulus')"), "onclick showModule('modulus') intact");
  const guhma = items.find(a => a.getAttribute('data-module') === 'guhma');
  assert(guhma.textContent.trim() === 'QA/QC - GUHMA', 'GUHMA label unchanged');
}

console.log('\n[4] Page still resolves — moduleTitles map still has guhma:');
assert(html.includes("guhma: 'QA/QC - GUHMA'"), "showModule title map still has guhma -> 'QA/QC - GUHMA'");

console.log('\n[5] RBAC/visibility preserved (PM is data-fo-mixed; QA/QC + items must be data-fo-safe):');
assert(pm.getAttribute('data-fo-mixed') === '1', 'Project Management is data-fo-mixed');
if (qaInPM) {
  assert(qaInPM.getAttribute('data-fo-safe') === '1', 'QA/QC nav-sub marked data-fo-safe (crew keeps access under mixed PM)');
  const items = [...qaInPM.querySelectorAll('a.nav-item')];
  assert(items.every(a => a.getAttribute('data-fo-safe') === '1'), 'both QA/QC items marked data-fo-safe');
}

console.log('\n[6] Field Operations still renders its remaining items:');
if (fo) {
  const foSubs = [...fo.querySelectorAll(':scope > .nav-sub > .nav-sub-label')].map(l => l.textContent.trim());
  const foItems = [...fo.querySelectorAll(':scope > a.nav-item')].map(a => (a.getAttribute('data-module') || a.getAttribute('href')));
  console.log('  FO subgroups: ' + JSON.stringify(foSubs));
  console.log('  FO direct items: ' + JSON.stringify(foItems));
  assert(foSubs.includes('Daily Reports'), 'FO still has Daily Reports');
  assert(foSubs.includes('Safety'), 'FO still has Safety');
  assert(!foSubs.includes('QA/QC'), 'FO no longer lists QA/QC subgroup');
  assert(foItems.includes('fo-projects'), 'FO still has Projects item');
  assert(foItems.includes('maintenance'), 'FO still has Maintenance item');
  assert(foItems.includes('inventory'), 'FO still has Inventory item');
}

console.log('\n[7] Project Management still renders correctly (existing subgroups intact):');
if (pm) {
  const pmSubs = [...pm.querySelectorAll(':scope > .nav-sub > .nav-sub-label')].map(l => l.textContent.trim());
  console.log('  PM subgroups: ' + JSON.stringify(pmSubs));
  assert(pmSubs.includes('Projects'), 'PM still has Projects subgroup');
  assert(pmSubs.includes('Insurance'), 'PM still has Insurance subgroup');
  assert(pmSubs.includes('TimeSheets'), 'PM still has TimeSheets subgroup');
  assert(pmSubs.includes('QA/QC'), 'PM now has QA/QC subgroup');
  const idxTS = pmSubs.indexOf('TimeSheets');
  const idxQA = pmSubs.indexOf('QA/QC');
  assert(idxQA === idxTS + 1, 'QA/QC placed immediately after TimeSheets');
}

console.log('\n[8] No duplicate QA/QC nav-sub anywhere:');
const allQaSubs = [...doc.querySelectorAll('.nav-sub > .nav-sub-label')].filter(l => l.textContent.trim() === 'QA/QC');
assert(allQaSubs.length === 1, 'exactly one QA/QC nav-sub in the whole nav (count=' + allQaSubs.length + ')');

console.log('\n[9] Collapse/highlight structure intact (class names + handler unchanged):');
if (qaInPM) {
  assert(qaInPM.classList.contains('nav-sub') && qaInPM.classList.contains('collapsed'), 'QA/QC nav-sub keeps class "nav-sub collapsed"');
  const lbl = qaInPM.querySelector(':scope > .nav-sub-label');
  assert(lbl.getAttribute('onclick') === "this.parentElement.classList.toggle('collapsed')", 'collapse toggle handler intact');
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
