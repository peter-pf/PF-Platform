// portal-hardening.test.mjs — hardening items N-1 and N-5
//
// N-1: A field_ops login denial on the office portal must NOT clear the
//      per-IP / per-email brute-force fail counters. The gate fires after
//      verifyPassword but before clearFails.
//
// N-5: /api/reset-password with a field_ops row must deny with 403 + clear
//      the existing restricted session cookie, and must NOT write any DB
//      change (password not updated, must_reset not cleared).
//
// Run: node platform/test-harness/portal-hardening.test.mjs

import { hashPassword, mintSession, clearSessionCookie } from '../functions/lib/auth.js';
import { OFFICE_ROLES, onRequestPost as loginPost } from '../functions/api/login.js';
import { onRequestPost as resetPost } from '../functions/api/reset-password.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else {
    fail++;
    console.log('  FAIL', name, extra != null ? '-> ' + JSON.stringify(extra) : '');
  }
}

const TEST_SECRET   = 'test-secret-32-bytes-for-hardening!';
const TEST_PASSWORD = 'HardeningTestPw99!XY';
const { salt, hash, iterations } = await hashPassword(TEST_PASSWORD);

// ---------------------------------------------------------------------------
// N-1: fail counters NOT cleared on portal denial
// ---------------------------------------------------------------------------
console.log('\n=== N-1: fail counters untouched on portal denial ===');

// KV mock that tracks every call so we can assert delete was never called.
function makeTrackedKV(initialCount = 3) {
  const store = new Map();
  const log = [];
  return {
    _log: log,
    get: async (k) => {
      log.push({ op: 'get', k });
      return store.has(k) ? store.get(k) : null;
    },
    put: async (k, v, opts) => {
      log.push({ op: 'put', k, v });
      store.set(k, v);
    },
    delete: async (k) => {
      log.push({ op: 'delete', k });
      store.delete(k);
    },
    // Seed a pre-existing fail count so we can verify it was not cleared.
    seed: (k, count) => { store.set(k, String(count)); },
  };
}

function makeDB(row) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
        run:   async () => {},
      }),
    }),
  };
}

// N-1a: field_ops login denial — no KV delete issued
{
  const kv = makeTrackedKV();
  // Seed an existing fail count of 2 on the IP key so we can confirm it's not cleared.
  kv.seed('login_fail:ip:10.0.0.1', 2);

  const body = JSON.stringify({ email: 'jwillis@pierfoundations.com', password: TEST_PASSWORD });
  const request = new Request('https://platform.pierfoundations.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
    body,
  });
  const env = {
    PF_TOKEN_SECRET: TEST_SECRET,
    DB: makeDB({
      id: 'fo-uid-1',
      name: 'John Willis',
      email: 'jwillis@pierfoundations.com',
      password_hash: hash,
      salt,
      iterations,
      role: 'field_ops',
      active: 1,
      must_reset: 0,
    }),
    PF_SCHEDULE: kv,
  };

  const res = await loginPost({ request, env });
  const data = await res.json();

  ok('N-1a: field_ops correct pw → 403',
    res.status === 403,
    { status: res.status });
  ok('N-1a: message contains "office portal"',
    data.message && data.message.includes('office portal'),
    { message: data.message });

  const deletes = kv._log.filter(e => e.op === 'delete');
  ok('N-1a: zero KV delete calls (fail counters NOT cleared)',
    deletes.length === 0,
    { deleteCalls: deletes });

  // The seeded IP fail count should remain (not overwritten by a delete or
  // a zero-put). Check that the counter value is still intact.
  const remaining = await kv.get('login_fail:ip:10.0.0.1');
  ok('N-1a: IP fail counter preserved at seeded value',
    remaining === '2',
    { remaining });
}

// N-1b: admin login success — KV delete IS called (confirm clearFails still runs for office roles)
{
  const kv = makeTrackedKV();
  kv.seed('login_fail:ip:10.0.0.2', 1);

  const body = JSON.stringify({ email: 'brad@pierfoundations.com', password: TEST_PASSWORD });
  const request = new Request('https://platform.pierfoundations.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.2' },
    body,
  });
  const env = {
    PF_TOKEN_SECRET: TEST_SECRET,
    DB: makeDB({
      id: 'admin-uid-1',
      name: 'Brad Reinking',
      email: 'brad@pierfoundations.com',
      password_hash: hash,
      salt,
      iterations,
      role: 'admin',
      active: 1,
      must_reset: 0,
    }),
    PF_SCHEDULE: kv,
  };

  const res = await loginPost({ request, env });
  ok('N-1b: admin correct pw → 200',
    res.status === 200,
    { status: res.status });

  const deletes = kv._log.filter(e => e.op === 'delete');
  ok('N-1b: KV delete WAS called (clearFails runs for office roles)',
    deletes.length > 0,
    { deleteCalls: deletes.length });
}

// N-1c: must_reset field_ops — counters also NOT cleared
{
  const kv = makeTrackedKV();
  kv.seed('login_fail:email:swillis@pierfoundations.com', 4);

  const body = JSON.stringify({ email: 'swillis@pierfoundations.com', password: TEST_PASSWORD });
  const request = new Request('https://platform.pierfoundations.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.3' },
    body,
  });
  const env = {
    PF_TOKEN_SECRET: TEST_SECRET,
    DB: makeDB({
      id: 'fo-uid-2',
      name: 'Seth Willis',
      email: 'swillis@pierfoundations.com',
      password_hash: hash,
      salt,
      iterations,
      role: 'field_ops',
      active: 1,
      must_reset: 1,
    }),
    PF_SCHEDULE: kv,
  };

  const res = await loginPost({ request, env });
  ok('N-1c: must_reset field_ops → 403',
    res.status === 403,
    { status: res.status });
  ok('N-1c: no Set-Cookie on must_reset field_ops denial',
    !res.headers.has('Set-Cookie'),
    { setCookie: res.headers.get('Set-Cookie') });

  const deletes = kv._log.filter(e => e.op === 'delete');
  ok('N-1c: zero KV delete calls for must_reset field_ops denial',
    deletes.length === 0,
    { deleteCalls: deletes });
  const remaining = await kv.get('login_fail:email:swillis@pierfoundations.com');
  ok('N-1c: email fail counter preserved',
    remaining === '4',
    { remaining });
}

// ---------------------------------------------------------------------------
// N-5: reset-password gate for field_ops row
// ---------------------------------------------------------------------------
console.log('\n=== N-5: reset-password denies field_ops row ===');

// Mint a valid restricted session for a field_ops account — exactly what
// /api/login would have issued on the field portal (or before this guard ran).
const foRestrictedToken = await mintSession(
  { uid: 'fo-reset-uid', role: 'field_ops', name: 'Jordan Lemay', mustReset: true },
  TEST_SECRET
);

// DB mock that tracks whether UPDATE was called.
function makeResetDB(row) {
  const log = [];
  return {
    _log: log,
    prepare: (sql) => ({
      bind: (...args) => ({
        first:  async () => row,
        run:    async () => { log.push({ sql: sql.slice(0, 40) }); },
      }),
    }),
  };
}

// N-5a: field_ops restricted session → 403 + session cookie cleared, no DB write
{
  const db = makeResetDB({
    id: 'fo-reset-uid',
    name: 'Jordan Lemay',
    email: 'jlemay@pierfoundations.com',
    role: 'field_ops',
    active: 1,
  });

  const body = JSON.stringify({ password: 'NewPasswordXYZ123!', confirm: 'NewPasswordXYZ123!' });
  const request = new Request('https://platform.pierfoundations.com/api/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `pf_session=${foRestrictedToken}`,
    },
    body,
  });

  const res = await resetPost({ request, env: { PF_TOKEN_SECRET: TEST_SECRET, DB: db } });
  const data = await res.json();

  ok('N-5a: field_ops reset → 403',
    res.status === 403,
    { status: res.status });
  ok('N-5a: message contains "office portal"',
    data.message && data.message.includes('office portal'),
    { message: data.message });

  const setCookieHdr = res.headers.get('Set-Cookie') || '';
  ok('N-5a: Set-Cookie clears pf_session (Max-Age=0)',
    setCookieHdr.includes('pf_session=') && setCookieHdr.includes('Max-Age=0'),
    { setCookie: setCookieHdr });

  // The UPDATE statement (password_hash / must_reset) must NOT have run.
  const updates = db._log.filter(e => e.sql.startsWith('UPDATE'));
  ok('N-5a: no DB UPDATE executed (password not changed)',
    updates.length === 0,
    { updates });
}

// N-5b: admin restricted session still passes through the gate
{
  const adminRestrictedToken = await mintSession(
    { uid: 'admin-reset-uid', role: 'admin', name: 'Brad', mustReset: true },
    TEST_SECRET
  );
  const db = makeResetDB({
    id: 'admin-reset-uid',
    name: 'Brad Reinking',
    email: 'breinking@pierfoundations.com',
    role: 'admin',
    active: 1,
  });

  const body = JSON.stringify({ password: 'AdminNewPassword123!', confirm: 'AdminNewPassword123!' });
  const request = new Request('https://platform.pierfoundations.com/api/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `pf_session=${adminRestrictedToken}`,
    },
    body,
  });

  const res = await resetPost({ request, env: { PF_TOKEN_SECRET: TEST_SECRET, DB: db } });
  ok('N-5b: admin restricted session → 200 (not blocked)',
    res.status === 200,
    { status: res.status });

  const setCookieHdr = res.headers.get('Set-Cookie') || '';
  ok('N-5b: admin reset issues a new session cookie',
    setCookieHdr.includes('pf_session=') && !setCookieHdr.includes('Max-Age=0'),
    { setCookie: setCookieHdr.slice(0, 60) });
}

// N-5c: partner restricted session passes through
{
  const partnerRestrictedToken = await mintSession(
    { uid: 'partner-reset-uid', role: 'partner', name: 'Jonathan', mustReset: true },
    TEST_SECRET
  );
  const db = makeResetDB({
    id: 'partner-reset-uid',
    name: 'Jonathan Reinking',
    email: 'jreinking@pierfoundations.com',
    role: 'partner',
    active: 1,
  });

  const body = JSON.stringify({ password: 'PartnerPassword456!', confirm: 'PartnerPassword456!' });
  const request = new Request('https://platform.pierfoundations.com/api/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `pf_session=${partnerRestrictedToken}`,
    },
    body,
  });

  const res = await resetPost({ request, env: { PF_TOKEN_SECRET: TEST_SECRET, DB: db } });
  ok('N-5c: partner restricted session → 200 (not blocked)',
    res.status === 200,
    { status: res.status });
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
console.log('\n=== RESULT: ' + (fail === 0 ? 'ALL PASS' : (fail + ' FAILURE(S) / ' + pass + ' passed')) + ' ===\n');
process.exit(fail === 0 ? 0 : 1);
