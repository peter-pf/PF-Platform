// portal-role-gate.test.mjs — office portal role-gate tests
//
// Covers:
//  A. OFFICE_ROLES constant: field_ops excluded; all expected office roles included.
//  B. Login handler (api/login.js): field_ops with correct credentials gets 403
//     "cannot sign in to the office portal"; no Set-Cookie issued.
//  C. Middleware (_middleware.js): a valid field_ops session cookie is rejected
//     with 401 (API) or 302->login (HTML nav), and the cookie is cleared.
//
// Run: node platform/test-harness/portal-role-gate.test.mjs
//
// Uses no external test framework — follows the same pattern as derek-partner-rbac.test.mjs.

import { webcrypto as crypto } from 'node:crypto';
import { hashPassword, mintSession, verifySession } from '../functions/lib/auth.js';
import { OFFICE_ROLES, onRequestPost as loginPost } from '../functions/api/login.js';
import { onRequest as middlewareHandler } from '../functions/_middleware.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else {
    fail++;
    console.log('  FAIL', name, extra != null ? '-> ' + JSON.stringify(extra) : '');
  }
}

// ---------------------------------------------------------------------------
// A. OFFICE_ROLES constant
// ---------------------------------------------------------------------------
console.log('\n=== A. OFFICE_ROLES constant ===');

ok('field_ops is NOT in OFFICE_ROLES',
  !OFFICE_ROLES.includes('field_ops'));
ok('admin IS in OFFICE_ROLES',
  OFFICE_ROLES.includes('admin'));
ok('partner IS in OFFICE_ROLES',
  OFFICE_ROLES.includes('partner'));
ok('business_dev IS in OFFICE_ROLES',
  OFFICE_ROLES.includes('business_dev'));
ok('hr IS in OFFICE_ROLES',
  OFFICE_ROLES.includes('hr'));
ok('OFFICE_ROLES has exactly 4 entries (admin/partner/business_dev/hr)',
  OFFICE_ROLES.length === 4);

// ---------------------------------------------------------------------------
// B. Login handler: field_ops gets 403 with correct credentials
// ---------------------------------------------------------------------------
console.log('\n=== B. Login handler: field_ops denied ===');

// Build a real PBKDF2 hash for a known test password so the handler's
// verifyPassword call returns true (password is correct). The field_ops
// denial fires AFTER the password check.
const TEST_PASSWORD = 'TestPassword123!ABC';
const TEST_SECRET   = 'test-secret-32-bytes-for-testing!';
const { salt, hash, iterations } = await hashPassword(TEST_PASSWORD);

// Minimal D1 mock: first().returns the field_ops user row.
function makeDB(row) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
        run: async () => {},
      }),
    }),
  };
}

// Minimal KV mock (throttle: no failures in window).
const KV_MOCK = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
};

function makeLoginContext(email, password, role = 'field_ops') {
  const body = JSON.stringify({ email, password });
  const request = new Request('https://platform.pierfoundations.com/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '10.0.0.1',
    },
    body,
  });
  const env = {
    PF_TOKEN_SECRET: TEST_SECRET,
    DB: makeDB({
      id: 'test-uid-field-ops',
      name: 'Test Field',
      email: email,
      password_hash: hash,
      salt,
      iterations,
      role,
      active: 1,
      must_reset: 0,
    }),
    PF_SCHEDULE: KV_MOCK,
  };
  return { request, env };
}

// B1: field_ops user with correct password -> 403
{
  const ctx = makeLoginContext('jtest@pierfoundations.com', TEST_PASSWORD, 'field_ops');
  const res = await loginPost(ctx);
  const body = await res.json();
  ok('B1: field_ops correct pw -> 403',
    res.status === 403,
    { status: res.status });
  ok('B1: 403 message mentions office portal',
    typeof body.message === 'string' && body.message.includes('office portal'),
    { message: body.message });
  ok('B1: No Set-Cookie on denial (no session issued)',
    !res.headers.has('Set-Cookie'),
    { setCookie: res.headers.get('Set-Cookie') });
  ok('B1: status field is "error"',
    body.status === 'error',
    { status: body.status });
}

// B2: admin user with correct password -> 200 (gate does NOT block office roles)
{
  const ctx = makeLoginContext('bradtest@pierfoundations.com', TEST_PASSWORD, 'admin');
  const res = await loginPost(ctx);
  const body = await res.json();
  ok('B2: admin correct pw -> 200 (not blocked)',
    res.status === 200,
    { status: res.status });
  ok('B2: admin gets Set-Cookie',
    res.headers.has('Set-Cookie'),
    { setCookie: res.headers.get('Set-Cookie') });
}

// B3: partner user with correct password -> 200
{
  const ctx = makeLoginContext('jrtest@pierfoundations.com', TEST_PASSWORD, 'partner');
  const res = await loginPost(ctx);
  ok('B3: partner correct pw -> 200 (not blocked)',
    res.status === 200,
    { status: res.status });
}

// B4: must_reset field_ops user -> 403 (must NOT get a restricted reset session)
{
  const ctx = makeLoginContext('jtest@pierfoundations.com', TEST_PASSWORD, 'field_ops');
  // Patch the DB mock to return must_reset=1.
  ctx.env.DB = makeDB({
    id: 'test-uid-field-ops-reset',
    name: 'Test Field Reset',
    email: 'jtest@pierfoundations.com',
    password_hash: hash,
    salt,
    iterations,
    role: 'field_ops',
    active: 1,
    must_reset: 1,
  });
  const res = await loginPost(ctx);
  const body = await res.json();
  ok('B4: must_reset field_ops -> 403 (NOT a restricted reset session)',
    res.status === 403,
    { status: res.status });
  ok('B4: No Set-Cookie on must_reset field_ops denial',
    !res.headers.has('Set-Cookie'),
    { setCookie: res.headers.get('Set-Cookie') });
}

// ---------------------------------------------------------------------------
// C. Middleware: field_ops session cookie is cleared and rejected
// ---------------------------------------------------------------------------
console.log('\n=== C. Middleware: field_ops session cleared ===');

// Mint a valid field_ops session (would have been issued before the gate was added).
const foToken = await mintSession(
  { uid: 'fo-uid', role: 'field_ops', name: 'Field Op' },
  TEST_SECRET
);

// Verify our test token is a valid session (confirms mintSession/verifySession work).
const foSession = await verifySession(foToken, TEST_SECRET);
ok('C0: test field_ops token verifies correctly',
  foSession !== null && foSession.role === 'field_ops',
  foSession);

function makeMiddlewareEnv() {
  return { PF_TOKEN_SECRET: TEST_SECRET };
}

function makeMiddlewareContext(request) {
  const ctx = {
    request,
    env: makeMiddlewareEnv(),
    data: {},
    next: async () => new Response('OK', { status: 200 }),
  };
  return ctx;
}

// C1: API request with field_ops session -> 401 + Set-Cookie clears the session
{
  const request = new Request('https://platform.pierfoundations.com/api/daily-report', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cookie': `pf_session=${foToken}`,
    },
  });
  const ctx = makeMiddlewareContext(request);
  const res = await middlewareHandler(ctx);
  const setCookieHdr = res.headers.get('Set-Cookie') || '';
  ok('C1: field_ops API request -> 401',
    res.status === 401,
    { status: res.status });
  ok('C1: Set-Cookie clears pf_session (Max-Age=0)',
    setCookieHdr.includes('pf_session=') && setCookieHdr.includes('Max-Age=0'),
    { setCookie: setCookieHdr });
}

// C2: HTML nav with field_ops session -> 302 to /login.html + cookie cleared
{
  const request = new Request('https://platform.pierfoundations.com/index.html', {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Cookie': `pf_session=${foToken}`,
    },
  });
  const ctx = makeMiddlewareContext(request);
  const res = await middlewareHandler(ctx);
  const location = res.headers.get('Location') || '';
  const setCookieHdr = res.headers.get('Set-Cookie') || '';
  ok('C2: field_ops HTML nav -> 302',
    res.status === 302,
    { status: res.status });
  ok('C2: redirect target is /login.html',
    location === '/login.html',
    { location });
  ok('C2: Set-Cookie clears pf_session (Max-Age=0)',
    setCookieHdr.includes('pf_session=') && setCookieHdr.includes('Max-Age=0'),
    { setCookie: setCookieHdr });
}

// C3: Valid admin session is NOT affected by the gate
{
  const adminToken = await mintSession(
    { uid: 'admin-uid', role: 'admin', name: 'Brad' },
    TEST_SECRET
  );
  const request = new Request('https://platform.pierfoundations.com/', {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Cookie': `pf_session=${adminToken}`,
    },
  });
  const ctx = makeMiddlewareContext(request);
  const res = await middlewareHandler(ctx);
  ok('C3: admin session NOT rejected by portal gate (reaches next())',
    res.status === 200,
    { status: res.status });
}

// C4: Valid partner session passes through
{
  const partnerToken = await mintSession(
    { uid: 'partner-uid', role: 'partner', name: 'Jonathan' },
    TEST_SECRET
  );
  const request = new Request('https://platform.pierfoundations.com/', {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Cookie': `pf_session=${partnerToken}`,
    },
  });
  const ctx = makeMiddlewareContext(request);
  const res = await middlewareHandler(ctx);
  ok('C4: partner session NOT rejected by portal gate',
    res.status === 200,
    { status: res.status });
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
console.log('\n=== RESULT: ' + (fail === 0 ? 'ALL PASS' : (fail + ' FAILURE(S) / ' + pass + ' passed')) + ' ===\n');
process.exit(fail === 0 ? 0 : 1);
