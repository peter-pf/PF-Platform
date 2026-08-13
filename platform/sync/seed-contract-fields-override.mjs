#!/usr/bin/env node
// Seed a project's `contract` override with the flat contract-field VALUES pulled from its
// fully-executed subcontract (Stage 2, Brad 2026-08-13), keyed by the EXACT portal labels,
// plus the __contract_pull provenance. PRESERVES everything already stored under `contract`
// (the __subcontract_analysis YELLOW review + every existing manual field NOT in the payload)
// and every OTHER section untouched. This mirrors the /api/project-override merge exactly:
// contract fields overlay via Object.assign; __contract_pull is a whole-object replace; all
// sibling reserved keys are carried forward.
//
// USAGE (from platform/, with CLOUDFLARE_API_TOKEN sourced from /home/aiciv/.env):
//   node sync/seed-contract-fields-override.mjs <projnum> <payload.json> [--write]
//   Without --write it DRY-RUNS: prints the exact merged contract section + a diff, writes
//   nothing. With --write it PUTs the merged override back to the PF_SCHEDULE KV namespace.
//
// The payload.json is the engine output (e.g. /home/aiciv/fe-contract-fields/26-002.json):
//   { payload: { "<Exact Label>": { value, source, confidence }, ... },
//     contract_status, source_document, ... }
//
// Only the fields present in payload.payload (+ Contract Status from contract_status) are
// written; every other contract field is left as-is. FAIL-SAFE: reads current KV first; if the
// read fails, aborts (never fabricates an empty base that would wipe existing data).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NS = '6c8bd3b9bf3a464ca8d1a5d939231858'; // PF_SCHEDULE
const [, , num, payloadPath, writeFlag] = process.argv;
const DO_WRITE = writeFlag === '--write';

if (!num || !payloadPath) {
  console.error('usage: node sync/seed-contract-fields-override.mjs <projnum> <payload.json> [--write]');
  process.exit(2);
}

const KEY = `project_override_v1:${num}`;

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    env: { ...process.env, OMP_NUM_THREADS: '1', GOMAXPROCS: '1' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

// ---- 1. Read the CURRENT override from KV (fail-safe: abort if unreadable) ----
let current;
try {
  const raw = wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote']);
  current = JSON.parse(raw);
} catch (e) {
  console.error('ABORT: could not read current KV override for ' + KEY + ' — refusing to seed onto an unknown base.');
  console.error(String(e.message || e).slice(0, 500));
  process.exit(1);
}
if (!current || typeof current !== 'object' || !current.sections) {
  console.error('ABORT: current override has no sections object; refusing to overwrite.');
  process.exit(1);
}

// ---- 2. Build the flat contract-field overlay from the payload ----
const payloadDoc = JSON.parse(readFileSync(payloadPath, 'utf8'));
const overlay = {};
for (const [label, entry] of Object.entries(payloadDoc.payload || {})) {
  overlay[label] = String(entry && entry.value != null ? entry.value : '');
}
if (payloadDoc.contract_status) overlay['Contract Status'] = String(payloadDoc.contract_status);

// ---- 3. Provenance (__contract_pull) — status 'pulled' ----
// fully_executed_date: prefer the payload's "Fully Executed Contract Date" value.
const feDate =
  (payloadDoc.payload && payloadDoc.payload['Fully Executed Contract Date'] && payloadDoc.payload['Fully Executed Contract Date'].value) || '';
const contractPull = {
  source_doc: String(payloadDoc.source_document || ''),
  fully_executed_date: String(feDate || ''),
  contract_status: String(payloadDoc.contract_status || ''),
  pulled_at: String(payloadDoc.pulled_at || new Date().toISOString()),
  requested_at: '',
  status: 'pulled',
};

// ---- 4. Merge exactly like /api/project-override: overlay fields, replace __contract_pull,
//         preserve __subcontract_analysis + every other existing contract key + all sections. ----
const existingContract = (current.sections.contract && typeof current.sections.contract === 'object')
  ? current.sections.contract : {};
const before = JSON.parse(JSON.stringify(existingContract));
const mergedContract = Object.assign({}, existingContract, overlay);
mergedContract['__contract_pull'] = contractPull; // whole-object replace
current.sections.contract = mergedContract;
current._meta = { updatedBy: 'Peter (contract-fields seed)', updatedAt: new Date().toISOString() };

// ---- 5. Report the diff ----
console.log('=== Contract-fields seed for ' + num + ' ===');
console.log('Source FE document: ' + contractPull.source_doc);
console.log('Fully executed: ' + contractPull.fully_executed_date);
console.log('\nFields written (from payload):');
for (const label of Object.keys(overlay)) {
  const was = before[label];
  const now = overlay[label];
  const tag = (was === undefined) ? 'NEW ' : (was === now ? 'SAME' : 'CHG ');
  const show = (v) => (v == null ? '(absent)' : (String(v).length > 90 ? String(v).slice(0, 87) + '…' : String(v)));
  console.log('  [' + tag + '] ' + label);
  if (tag === 'CHG ') { console.log('        was: ' + show(was)); console.log('        now: ' + show(now)); }
}
console.log('\n__contract_pull provenance set (status=pulled).');
console.log('__subcontract_analysis preserved: ' + (!!mergedContract.__subcontract_analysis));
console.log('__subcontract_analysis verdict: ' + (mergedContract.__subcontract_analysis && mergedContract.__subcontract_analysis.verdict));
console.log('Other contract fields preserved (count kept, not in payload): '
  + Object.keys(before).filter((k) => !(k in overlay) && k !== '__contract_pull').length);
console.log('Other sections untouched: ' + Object.keys(current.sections).filter((s) => s !== 'contract').join(', '));

if (!DO_WRITE) {
  console.log('\nDRY-RUN (no --write): nothing written to KV. Re-run with --write to persist.');
  process.exit(0);
}

// ---- 6. Write back to KV ----
import { writeFileSync } from 'node:fs';
const tmp = '/tmp/seed-' + num + '-override.json';
writeFileSync(tmp, JSON.stringify({ version: 1, num: current.num || num, sections: current.sections, _meta: current._meta }));
wrangler(['kv', 'key', 'put', KEY, '--path', tmp, '--namespace-id', NS, '--remote']);
console.log('\nWROTE ' + KEY + ' to KV namespace ' + NS + '.');
