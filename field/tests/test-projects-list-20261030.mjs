#!/usr/bin/env node
// test-projects-list-20261030.mjs
// Tests for the 2026-10-30 project list update (Derek request):
//   P1: fo-projects-data.js contains exactly the 11 requested projects
//   P2: All display labels use "Number - Name" format consistently (DR, SR, EI, TT, weather)
//   P3: spFolder: nameMatchesProject resolves the known SP folder for each of the 11
//   P4: Back-compat — old project numbers no longer in list load correctly in DR, SR, EI, TT
//   P5: Weather tile fallback — new projects without coords return status:no_location gracefully
//
// Run: node field/tests/test-projects-list-20261030.mjs

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
function assertIncludes(desc, str, sub) {
  assert(String(str).includes(sub), `${desc}: expected to find: ${JSON.stringify(sub)}`);
}
function assertNotIncludes(desc, str, sub) {
  assert(!String(str).includes(sub), `${desc}: expected NOT to find: ${JSON.stringify(sub)}`);
}

// ---- Source loading -------------------------------------------------------
import { FO_PROJECTS } from '../functions/lib/fo-projects-data.js';
import { nameMatchesProject } from '../functions/lib/sp-project-folders.js';

const drHtmlSrc  = readFileSync(resolve(root, 'daily-report.html'),         'utf8');
const srHtmlSrc  = readFileSync(resolve(root, 'site-readiness.html'),       'utf8');
const eiHtmlSrc  = readFileSync(resolve(root, 'equipment-inspection.html'), 'utf8');
const ttHtmlSrc  = readFileSync(resolve(root, 'toolbox-talk.html'),         'utf8');
const idxHtmlSrc = readFileSync(resolve(root, 'index.html'),                'utf8');

// ============================================================
// P1: List contents
// ============================================================
console.log('\nP1: List contents');

const EXPECTED = [
  { number: '25-026', name: 'The Granary' },
  { number: '26-007', name: 'Madison Lifestyle' },
  { number: '26-014', name: 'TPS Dayton' },
  { number: '26-019', name: 'Vivera Northbrook' },
  { number: '26-020', name: 'EVPL Red Bank Rd Bldg' },
  { number: '26-023', name: 'Village Premier' },
  { number: '26-024', name: 'Leslie Co. ATC' },
  { number: '26-025', name: 'Prysmian Expansion' },
  { number: '26-026', name: 'POET - N Manchester' },
  { number: '26-027', name: 'Westfield Ice Arena' },
  { number: '26-028', name: 'The Hangar' },
];

test('P1a: exactly 11 projects in FO_PROJECTS', () => {
  assert.equal(FO_PROJECTS.length, 11, `expected 11, got ${FO_PROJECTS.length}`);
});

test('P1b: all project numbers match exactly', () => {
  const numbers = FO_PROJECTS.map(p => p.number);
  const expectedNumbers = EXPECTED.map(p => p.number);
  assert.deepEqual(numbers, expectedNumbers, `numbers mismatch:\n  got: ${JSON.stringify(numbers)}\n  exp: ${JSON.stringify(expectedNumbers)}`);
});

test('P1c: all project names match exactly (no "(Garbin)" suffix)', () => {
  for (const exp of EXPECTED) {
    const found = FO_PROJECTS.find(p => p.number === exp.number);
    assert.ok(found, `project ${exp.number} not found`);
    assert.equal(found.name, exp.name, `${exp.number}: name mismatch — got '${found.name}', expected '${exp.name}'`);
  }
});

test('P1d: no entry has a "(Garbin)" suffix in its name', () => {
  for (const p of FO_PROJECTS) {
    assert.ok(!p.name.includes('(Garbin)'), `${p.number} still has (Garbin): '${p.name}'`);
  }
});

test('P1e: each entry has {number, name} fields', () => {
  for (const p of FO_PROJECTS) {
    assert.ok(p.number && typeof p.number === 'string', `missing number on ${JSON.stringify(p)}`);
    assert.ok(p.name   && typeof p.name   === 'string', `missing name on ${p.number}`);
  }
});

test('P1f: no financial or GC keys exposed', () => {
  const forbidden = ['bid', 'contract', 'value', 'gc', 'budget', 'cost', 'award', 'margin'];
  for (const p of FO_PROJECTS) {
    for (const k of Object.keys(p)) {
      const kl = k.toLowerCase();
      for (const f of forbidden) {
        assert.ok(!kl.includes(f), `project ${p.number} exposes key '${k}' (contains '${f}')`);
      }
    }
  }
});

test('P1g: sorted by project number ascending', () => {
  const numbers = FO_PROJECTS.map(p => p.number);
  const sorted  = [...numbers].sort();
  assert.deepEqual(numbers, sorted, `not sorted: ${JSON.stringify(numbers)}`);
});

test('P1h: previously removed projects are NOT in the list (26-012, 26-022, 25-015, 26-001)', () => {
  const removed = ['26-012', '26-022', '25-015', '26-001', '26-002', '26-008', '26-009',
                   '26-010', '26-011', '26-013', '26-015', '26-016', '26-017',
                   '25-2001', '25-2002', '26-003', '26-004', '26-006'];
  for (const num of removed) {
    assert.ok(!FO_PROJECTS.find(p => p.number === num), `removed project ${num} is still in list`);
  }
});

// ============================================================
// P2: Label format consistency across all forms
// ============================================================
console.log('\nP2: Label format — "Number - Name" on all pickers');

// DR: label construction uses number + ' - ' + name
test('P2a: DR builds label with " - " separator (not ": ")', () => {
  // The DR fetch callback at ~line 830 builds: label:(number?number+' - ':'')+name
  assertIncludes('P2a', drHtmlSrc, "number+' - '");
  assertNotIncludes('P2a colon', drHtmlSrc, "number+': '");
});

// SR: same
test('P2b: SR builds label with " - " separator (not ": ")', () => {
  assertIncludes('P2b', srHtmlSrc, "number + ' - '");
  assertNotIncludes('P2b colon', srHtmlSrc, "number + ': '");
});

// EI: picker items and searchEl.value both use ' - ' (not ': ')
test('P2c: EI picker list items use " - " separator', () => {
  assertIncludes('P2c li', eiHtmlSrc, "p.name ? ' - ' + p.name");
  assertNotIncludes('P2c colon', eiHtmlSrc, "p.name ? ': ' + p.name");
});

test('P2d: EI searchEl.value on select uses " - " separator', () => {
  assertIncludes('P2d select', eiHtmlSrc, "p.name ? ' - ' + p.name");
  // No ': ' + p.name anywhere in EI
  assertNotIncludes('P2d colon', eiHtmlSrc, "': ' + p.name");
});

test('P2e: EI eiLoadStateToDom sets search field with " - " (not ": ")', () => {
  // eiLoadStateToDom sets eiProjectSearch.value using ms.projectName
  assertIncludes('P2e', eiHtmlSrc, "' - ' + ms.projectName");
  assertNotIncludes('P2e colon', eiHtmlSrc, "': ' + ms.projectName");
});

// TT: picker items and searchEl.value both use ' - '
test('P2f: TT picker list items use " - " separator', () => {
  assertIncludes('P2f li', ttHtmlSrc, "p.name ? ' - ' + p.name");
  assertNotIncludes('P2f colon', ttHtmlSrc, "p.name ? ': ' + p.name");
});

test('P2g: TT searchEl.value on select uses " - " separator', () => {
  assertIncludes('P2g', ttHtmlSrc, "p.name ? ' - ' + p.name");
  assertNotIncludes('P2g colon', ttHtmlSrc, "': ' + p.name");
});

test('P2h: TT record load sets project search with " - " separator', () => {
  assertIncludes('P2h', ttHtmlSrc, "rec.projectName ? ' - ' + rec.projectName");
  assertNotIncludes('P2h colon', ttHtmlSrc, "rec.projectName ? ': ' + rec.projectName");
});

// Weather tile (index.html): option text uses number + ' - ' + name
test('P2i: weather tile option text uses "number + \' - \' + name" format', () => {
  assertIncludes('P2i', idxHtmlSrc, "p.number + ' - ' + p.name");
  // The old format was esc(p.name) — just name, no number prefix
});

// PDF headers: still use projectName only (separate projectId field for number)
test('P2j: DR PDF header shows Project (name) and Project No (id) separately', () => {
  const drDocSrc = readFileSync(resolve(root, 'functions/lib/daily-report-doc.js'), 'utf8');
  assertIncludes('P2j project', drDocSrc, "label: 'Project'");
  assertIncludes('P2j no', drDocSrc, "label: 'Project No'");
  assertIncludes('P2j name val', drDocSrc, "rec.projectName || '-'");
  assertIncludes('P2j id val',  drDocSrc, "rec.projectId || '-'");
});

// ============================================================
// P3: spFolder — nameMatchesProject resolves each project's known SP folder
// ============================================================
console.log('\nP3: spFolder resolution — nameMatchesProject');

// These are the actual SP folder names found via Graph on 2026-10-30.
const SP_FOLDERS = {
  '25-026': '25-026 - The Granary - FlCo',
  '26-007': '26-007 - Madison Lifestyle Garage - Wilhelm',
  '26-014': '26-014 - TPS Dayton - Brackett',
  '26-019': '26-019 - Vivera Northbrook - Marion Group',
  '26-020': '26-020 - Evansville Library - Arc Const',
  '26-023': '26-023 - Village Premiere - Inherent',
  '26-024': '26-024 - Leslie County ATC - F&M',
  '26-025': '26-025 - Prysmian Expansion - Shiel',
  '26-026': '26-026 - POET N Manchester - POET',
  '26-027': '26-027 - Westfield Ice Arena - Nicholas',
  '26-028': '26-028 - The Hangar - Elford',
};

test('P3a: nameMatchesProject resolves each of the 11 SP folder names', () => {
  for (const p of FO_PROJECTS) {
    const folderName = SP_FOLDERS[p.number];
    assert.ok(folderName, `No known SP folder for ${p.number} — add it to SP_FOLDERS`);
    assert.ok(
      nameMatchesProject(folderName, p.number),
      `nameMatchesProject('${folderName}', '${p.number}') returned false`
    );
  }
});

test('P3b: all 11 projects have an SP folder (none MISSING)', () => {
  assert.equal(Object.keys(SP_FOLDERS).length, 11, 'SP_FOLDERS should list all 11 projects');
  for (const num of FO_PROJECTS.map(p => p.number)) {
    assert.ok(SP_FOLDERS[num], `${num} has no SP folder entry`);
  }
});

test('P3c: nameMatchesProject does not false-positive on similar but different numbers', () => {
  // e.g. "26-0260" should NOT match "26-026"
  assert.ok(!nameMatchesProject('26-0260 - Something', '26-026'), 'should not match 26-0260 as 26-026');
  assert.ok(!nameMatchesProject('26-0280 - Other',     '26-028'), 'should not match 26-0280 as 26-028');
});

// ============================================================
// P4: Back-compat — old projects still load correctly
// ============================================================
console.log('\nP4: Back-compat for removed projects');

// DR has explicit unshift: if project not in list, a synthetic entry is added.
test('P4a: DR injects synthetic picker entry for project not in current list', () => {
  // The unshift code: state.projects.unshift({id:pid, name:..., label:...})
  assertIncludes('P4a', drHtmlSrc, 'state.projects.unshift');
  assertIncludes('P4a pid', drHtmlSrc, 'if(!present&&pid)');
});

test('P4b: DR synthetic entry uses "Number - Name" label format for back-compat entries', () => {
  // r.projectId?r.projectId+' - '+r.projectName:...
  assertIncludes('P4b', drHtmlSrc, "r.projectId+' - '+r.projectName");
});

// SR has the same unshift pattern
test('P4c: SR injects synthetic picker entry for project not in current list', () => {
  assertIncludes('P4c', srHtmlSrc, 'state.projects.unshift');
  assertIncludes('P4c pid', srHtmlSrc, 'if (!present && pid)');
});

test('P4d: SR synthetic entry uses "Number - Name" label format', () => {
  assertIncludes('P4d', srHtmlSrc, "r.projectId + ' - '");
});

// EI: loads projectId and projectName directly from state — no list lookup needed
test('P4e: EI eiLoadStateToDom sets projectId and projectName from stored state (no list dependency)', () => {
  assertIncludes('P4e id',   eiHtmlSrc, "document.getElementById('eiProjectId').value = ms.projectId");
  assertIncludes('P4e name', eiHtmlSrc, "document.getElementById('eiProjectName').value = ms.projectName");
});

// TT: loads projectId and projectName directly from rec — no list lookup needed
test('P4f: TT record load sets ttProjectId and ttProjectName from stored record (no list dependency)', () => {
  assertIncludes('P4f id',   ttHtmlSrc, "document.getElementById('ttProjectId').value = rec.projectId");
  assertIncludes('P4f name', ttHtmlSrc, "document.getElementById('ttProjectName').value = rec.projectName");
});

// Past Reports: shows projectName from stored record, not from current list
test('P4g: past-reports.html shows projectName from stored record directly', () => {
  const prSrc = readFileSync(resolve(root, 'past-reports.html'), 'utf8');
  // The PR list renders: E(r.projectName||r.projectId||'—')
  assertIncludes('P4g', prSrc, "r.projectName||r.projectId||'—'");
  // And filter haystack includes projectId + projectName for searching
  assertIncludes('P4g filter', prSrc, "r.projectName");
});

// Draft-safe: DR collectBody stores projectId and projectName from the current picker state
// so an unloaded draft with an old project number preserves those values.
test('P4h: DR collectBody captures projectId and projectName from state for persistence', () => {
  // state.projects[i].id is the projectId; state.projects[i].name is projectName
  assertIncludes('P4h id',  drHtmlSrc, 'state.projects[i].id');
  assertIncludes('P4h name', drHtmlSrc, 'state.projects[i].name');
});

// ============================================================
// P5: Weather tile — new projects without coordinates fall back gracefully
// ============================================================
console.log('\nP5: Weather fallback for new projects without coordinates');

import { JOB_COORDS } from '../functions/lib/job-coords.js';

test('P5a: new projects 26-019 through 26-028 are NOT in JOB_COORDS (no coords yet)', () => {
  const newProjects = ['26-019', '26-020', '26-023', '26-024', '26-025', '26-026', '26-027', '26-028'];
  for (const num of newProjects) {
    // null or undefined is fine — the weather API handles it gracefully
    assert.ok(JOB_COORDS[num] === undefined || JOB_COORDS[num] === null,
      `${num} unexpectedly has coords: ${JSON.stringify(JOB_COORDS[num])}`);
  }
});

test('P5b: weather.js returns status:no_location when JOB_COORDS entry is missing', () => {
  const weatherSrc = readFileSync(resolve(root, 'functions/api/weather.js'), 'utf8');
  // The fallback: const coords = JOB_COORDS[jobNumber] || null; if(!coords) return no_location
  assertIncludes('P5b coords', weatherSrc, "JOB_COORDS[jobNumber] || null");
  assertIncludes('P5b status', weatherSrc, "status: 'no_location'");
});

test('P5c: weather.js validates jobNumber against FO_PROJECTS (prevents unknown project 400)', () => {
  const weatherSrc = readFileSync(resolve(root, 'functions/api/weather.js'), 'utf8');
  assertIncludes('P5c', weatherSrc, "FO_PROJECTS.find(p => p.number === jobNumber)");
});

test('P5d: index.html weather tile falls back to first project if stored job not in current list', () => {
  assertIncludes('P5d', idxHtmlSrc, "projects.find(function(p){return p.number===defaultJob;})");
});

test('P5e: index.html weather tile handles no_location status gracefully', () => {
  assertIncludes('P5e', idxHtmlSrc, "data.status === 'no_location'");
});

test('P5f: kept projects (25-026, 26-007, 26-014) still have coordinates', () => {
  assert.ok(JOB_COORDS['25-026'] && JOB_COORDS['25-026'].lat, '25-026 should have coords');
  assert.ok(JOB_COORDS['26-007'] && JOB_COORDS['26-007'].lat, '26-007 should have coords');
  assert.ok(JOB_COORDS['26-014'] && JOB_COORDS['26-014'].lat, '26-014 should have coords');
});

// ============================================================
// Summary
// ============================================================
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
