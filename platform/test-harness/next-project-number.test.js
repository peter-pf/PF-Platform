// Harness: Feature 2 — next project-number suggestion (Brad 2026-08-13).
// Proves pfNextProjectNumber(numbers, yy):
//   (a) returns max+1 for a set of YY-NNN inputs (highest existing NNN + 1);
//   (b) honors the passed year prefix and ignores other years' numbers;
//   (c) empty-year (no numbers for that prefix) -> NNN=001;
//   (d) handles GAPS -> max+1, NOT gap-fill;
//   (e) zero-pads to 3 digits;
//   (f) ignores malformed / non-YY-NNN entries;
//   (g) MATCHES the server's nextNumber() derivation in pm-project.js for the same
//       taken set (the prefilled suggestion == what the server would assign).
// Also verifies the server accepts an explicit projectNumber (confirm/override) and
// FAILS SAFE to its own derivation on a malformed/duplicate request number.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---- Extract a named function body (same brace-matcher as extract.js) ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

// pfNextProjectNumber depends on _pfCurrentYY(); pull both.
const nextSrc = extractFn(html, 'pfNextProjectNumber');
const yySrc = extractFn(html, '_pfCurrentYY');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(yySrc + '\n' + nextSrc + '\nthis.__next = pfNextProjectNumber;', sandbox);
const nextNum = sandbox.__next;

// (a) max+1 for a set
ok('(a) 26-{002,019} -> 26-020', nextNum(['26-002', '26-019', '26-007'], '26') === '26-020');

// (b) year prefix honored + other years ignored
ok('(b) mixed years, yy=26 -> 26-004', nextNum(['25-050', '26-003', '24-099'], '26') === '26-004');
ok('(b2) mixed years, yy=25 -> 25-051', nextNum(['25-050', '26-003'], '25') === '25-051');

// (c) empty year -> 001
ok('(c) no numbers -> 26-001', nextNum([], '26') === '26-001');
ok('(c2) only other-year numbers -> 26-001', nextNum(['25-030', '24-010'], '26') === '26-001');

// (d) gaps -> max+1 (not gap-fill)
ok('(d) gap 26-{001,002,005} -> 26-006 (not 003)', nextNum(['26-001', '26-002', '26-005'], '26') === '26-006');

// (e) zero-pad to 3 digits
ok('(e) 26-007 -> 26-008 (padded)', nextNum(['26-007'], '26') === '26-008');
ok('(e2) empty -> 26-001 (padded)', nextNum([], '26') === '26-001');

// (f) malformed entries ignored
ok('(f) ignores junk', nextNum(['garbage', '26-abc', '', null, undefined, '2026-1', '26-012'], '26') === '26-013');
ok('(f2) all junk -> 001', nextNum(['x', 'foo', '', null], '26') === '26-001');

// (f3) 4-digit NNN accepted (helical-style) but padded/incremented correctly
ok('(f3) 25-2001 -> 25-2002', nextNum(['25-2001'], '25') === '25-2002');

// (g) MATCHES server nextNumber() for the same taken set.
// Load pm-project.js with the ESM import stubbed and export the internals we test.
function loadPm() {
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/pm-project.js'), 'utf8');
  const stubbed = src
    .replace(/import\s*\{\s*requireArea\s*\}\s*from\s*['"][^'"]+['"];?/,
      'const requireArea = (session, area) => (session && session.area === area ? null : { __denied: true, area });')
    .replace(/export async function onRequestGet/, 'async function onRequestGet')
    .replace(/export async function onRequestPost/, 'async function onRequestPost')
    + '\nmodule.exports = { onRequestPost, onRequestGet, nextNumber, parseNum, currentYY };';
  const mod = { exports: {} };
  class Resp {
    constructor(body, init) { this._body = body; this.status = (init && init.status) || 200; }
    async json() { return JSON.parse(this._body); }
  }
  const fn = new Function('module', 'exports', 'console', 'URL', 'Response', 'Date', 'Intl', 'crypto', stubbed);
  fn(mod, mod.exports, console, URL, Resp, Date, Intl, { getRandomValues: (a) => a });
  return mod.exports;
}
const PM = loadPm();

// server nextNumber(yy, takenNs) takes the parsed integer set; build it from the
// same YY-NNN inputs the client uses, so both derive from identical data.
function serverNext(nums, yy) {
  const takenNs = [];
  nums.forEach((pn) => { const p = PM.parseNum(pn); if (p && p.yy === yy) takenNs.push(p.n); });
  return PM.nextNumber(yy, takenNs);
}
[
  [['26-002', '26-019', '26-007'], '26'],
  [['25-050', '26-003', '24-099'], '26'],
  [[], '26'],
  [['26-001', '26-002', '26-005'], '26'],
  [['garbage', '26-abc', '26-012'], '26'],
].forEach(function (tc, i) {
  const c = nextNum(tc[0], tc[1]);
  const s = serverNext(tc[0], tc[1]);
  ok('(g' + i + ') client==server: ' + c + ' == ' + s, c === s);
});

// (h) SERVER accepts an explicit projectNumber (confirm/override) end-to-end.
async function runServerCases() {
  function makeKV() {
    const store = new Map();
    return { _store: store, async get(k){ return store.has(k) ? store.get(k) : null; }, async put(k, v){ store.set(k, v); } };
  }
  const session = { area: 'preconstruction', role: 'partner', name: 'Tester' };
  function ctx(kv, body) {
    return { env: { PF_SCHEDULE: kv }, data: { session },
      request: { headers: { get: () => String(JSON.stringify(body).length) }, text: async () => JSON.stringify(body) } };
  }

  // (h1) explicit valid projectNumber is honored verbatim.
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Override Job', projectNumber: '26-042', existingNumbers: ['26-001'] }));
    const b = await res.json();
    ok('(h1) explicit number honored', b.ok === true && b.record && b.record.projectNumber === '26-042');
  }
  // (h2) malformed projectNumber -> server FAILS SAFE to derived max+1.
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Bad Number Job', projectNumber: 'not-a-number', existingNumbers: ['26-018'] }));
    const b = await res.json();
    ok('(h2) malformed -> derived 26-019', b.ok === true && b.record.projectNumber === '26-019');
  }
  // (h3) duplicate projectNumber (already in overlay) -> server derives instead.
  {
    const kv = makeKV();
    // seed the overlay with 26-005 already taken
    await kv.put('pm_projects_v1', JSON.stringify({ version: 1, projects: [{ id: 'x', projectNumber: '26-005', name: 'Existing' }], meta: {} }));
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Dup Job', projectNumber: '26-005', existingNumbers: ['26-004'] }));
    const b = await res.json();
    ok('(h3) duplicate -> derived (not 26-005)', b.ok === true && b.record.projectNumber !== '26-005' && b.record.projectNumber === '26-006');
  }
  // (h4) NO projectNumber sent -> pure server derivation (backward compat).
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Auto Job', existingNumbers: ['26-011', '26-003'] }));
    const b = await res.json();
    ok('(h4) no number -> derived 26-012', b.ok === true && b.record.projectNumber === '26-012');
  }
  // (h6) BASE-COLLISION: explicit number equals a base `existingNumbers` entry that is
  // NOT in the overlay. The server must reject it (base feed is authoritative) and
  // derive instead. Overlay is empty; 26-004 lives only in existingNumbers.
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Base Collide Job', projectNumber: '26-004', existingNumbers: ['26-001', '26-004'] }));
    const b = await res.json();
    ok('(h6) base-collision -> derived 26-005 (not 26-004)', b.ok === true && b.record.projectNumber !== '26-004' && b.record.projectNumber === '26-005');
  }
  // (h7) FORMAT-VARIANT duplicate: explicit "26-4" against an existing "26-004" must be
  // caught as a duplicate (normalized before compare) -> derive.
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Variant Dup Job', projectNumber: '26-4', existingNumbers: ['26-004', '26-009'] }));
    const b = await res.json();
    ok('(h7) format-variant 26-4 vs 26-004 -> derived 26-010', b.ok === true && b.record.projectNumber !== '26-4' && b.record.projectNumber !== '26-004' && b.record.projectNumber === '26-010');
  }
  // (h8) YY-MISMATCH: explicit "99-001" when the award/derivation year is "26" -> reject
  // (no cross-year explicit numbers) and derive in the current year.
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Wrong Year Job', year: '26', projectNumber: '99-001', existingNumbers: ['26-007'] }));
    const b = await res.json();
    ok('(h8) yy-mismatch 99-001 (year=26) -> derived 26-008', b.ok === true && b.record.projectNumber === '26-008');
  }
  // (h9) FORMAT-VARIANT that is genuinely UNUSED is still honored (canonical zero-pad):
  // "26-7" with no 26-007 taken -> accepted, persisted as "26-007".
  {
    const kv = makeKV();
    const res = await PM.onRequestPost(ctx(kv, { action: 'create', name: 'Variant OK Job', projectNumber: '26-7', existingNumbers: ['26-001', '26-002'] }));
    const b = await res.json();
    ok('(h9) unused variant 26-7 honored as 26-007', b.ok === true && b.record.projectNumber === '26-007');
  }

  // (h5) field_ops (wrong area) -> denied (no record).
  {
    const kv = makeKV();
    const denyCtx = { env: { PF_SCHEDULE: kv }, data: { session: { area: 'field_ops', role: 'field_ops' } },
      request: { headers: { get: () => '10' }, text: async () => JSON.stringify({ action: 'create', name: 'x' }) } };
    const res = await PM.onRequestPost(denyCtx);
    // The stubbed requireArea returns a {__denied} guard object for the wrong area; the
    // handler returns it directly (never reaching create). A real deployment returns a
    // 403 Response. Either way: NOT a successful create (no record minted).
    ok('(h5) field_ops denied (no record minted)', res && res.__denied === true && res.area === 'preconstruction');
  }
}

runServerCases().then(function () {
  console.log('\nFeature 2 (next project number): ' + pass + ' passed, ' + fail + ' failed'
    + (fail ? ('\nFAILURES: ' + fails.join(', ')) : ''));
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error('harness error:', e);
  process.exit(1);
});
