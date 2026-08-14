// Unit harness for the Estimated Stone (TN) <- Turnover Budget wiring.
// Extracts the REAL pfTurnoverStone() from index.html (no re-implementation) and
// exercises it + the field's fail-closed empty-state logic across scenarios.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// --- pull the exact pfTurnoverStone() source out of index.html ---
const m = html.match(/function pfTurnoverStone\(num\)\{[\s\S]*?\n    \}/);
if (!m) { console.error('FAIL: pfTurnoverStone() not found in index.html'); process.exit(1); }
const src = m[0];

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}

// Build a callable with an injectable `window`.
function makePf(win) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', src + '\nreturn pfTurnoverStone;');
  return factory(win);
}

console.log('pfTurnoverStone() accessor:');

// 1. real POET data -> 4195.01
let pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-002': { stone_tn: 4195.01, status: 'ok' } } } });
check('POET 26-002 returns 4195.01', pf('26-002') === 4195.01);

// 2. missing global -> null (fail-closed)
pf = makePf({});
check('missing global -> null', pf('26-002') === null);

// 3. project not present -> null
pf = makePf({ PF_TURNOVER_STONE: { projects: {} } });
check('unknown project -> null', pf('99-999') === null);

// 4. status != ok (formula-no-cache) -> null (NEVER a stale number)
pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-050': { stone_tn: 1234, status: 'formula-no-cache' } } } });
check('formula-no-cache status -> null (no stale value leaks)', pf('26-050') === null);

// 5. status ok but stone_tn null -> null
pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-060': { stone_tn: null, status: 'ok' } } } });
check('ok but null value -> null', pf('26-060') === null);

// 6. no-tab / no-line status -> null
pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-070': { stone_tn: null, status: 'no-line' } } } });
check('no-line status -> null', pf('26-070') === null);

// 7. empty num -> null
pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-002': { stone_tn: 5, status: 'ok' } } } });
check('empty num -> null', pf('') === null);

// 8. value of 0 is a real reading, still returned (0 tons is legitimate data, not blank)
pf = makePf({ PF_TURNOVER_STONE: { projects: { '26-080': { stone_tn: 0, status: 'ok' } } } });
check('zero tons is returned (real reading)', pf('26-080') === 0);

// --- the field() call replicates the exact expression from index.html ---
// field('Estimated Stone (TN)', (_ts==null?'':_ts), (_ts!=null?'Turnover Budget':''))
console.log('field() fail-closed empty-state logic:');
function fieldArgs(win, num) {
  const p = makePf(win);
  const _ts = p(num);
  return { value: (_ts == null) ? '' : _ts, source: (_ts != null) ? 'Turnover Budget' : '' };
}

// A) real value -> value shown, source labelled "Turnover Budget"
let a = fieldArgs({ PF_TURNOVER_STONE: { projects: { '26-002': { stone_tn: 4195.01, status: 'ok' } } } }, '26-002');
check('A: real -> value=4195.01 & source="Turnover Budget"', a.value === 4195.01 && a.source === 'Turnover Budget');

// B) unresolved -> value '' (amber blank), source '' (no fabricated Bid-Log substitute)
let b = fieldArgs({}, '26-002');
check('B: unresolved -> value="" & source="" (fail-closed blank)', b.value === '' && b.source === '');

// C) stale formula cache -> blank, not the stale number
let c = fieldArgs({ PF_TURNOVER_STONE: { projects: { '26-050': { stone_tn: 9999, status: 'formula-no-cache' } } } }, '26-050');
check('C: stale-cache -> value="" (stale number NOT shown)', c.value === '' && c.source === '');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
