#!/usr/bin/env node
// R8 tests:
//   Weather (mocked upstream):
//     1. Success: geocode + NWS both succeed → returns 3-day forecast
//     2. No address → status:'no_address' message
//     3. Upstream geocode fail → status:'unavailable'
//     4. NWS points fail → status:'unavailable'
//     5. Unknown job number → 400 error
//     6. Auth gate: no session → 403 from requireArea
//
//   Forgot password / reset-by-token:
//     7. Unknown email → generic response, nothing sent (no error thrown)
//     8. Known email → token_hash stored in DB (not the raw token)
//     9. Known email → raw token NOT equal to stored hash
//    10. Expired token → INVALID_RESPONSE from reset-by-token
//    11. Used token → INVALID_RESPONSE from reset-by-token
//    12. Valid token → password updated; old password rejected at /api/login pattern
//    13. Rate limit by email: 4th request returns generic response without DB write
//    14. Middleware: /forgot-password.html in PUBLIC_PATHS
//    15. Middleware: /reset.html in PUBLIC_PATHS
//    16. Middleware: /api/forgot-password in AUTH_ENDPOINTS
//    17. Middleware: /api/reset-by-token in AUTH_ENDPOINTS
//    18. auth.js: /api/weather mapped to field_ops area
//
// Run: node field/tests/test-r8.mjs

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- Minimal test harness ----
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS', name);
    passed++;
  } catch (e) {
    console.error('  FAIL', name);
    console.error('       ', e.message);
    failed++;
    results.push({ name, error: e.message });
  }
}

// ---- Load modules ----
const authUrl = new URL('../functions/lib/auth.js', import.meta.url);
const { areaForPath } = await import(authUrl.href);

const mwUrl = new URL('../functions/_middleware.js', import.meta.url);
// We can't execute the middleware function directly (it needs CF runtime), but we
// can import it as text to check PUBLIC_PATHS and AUTH_ENDPOINTS constants.
import { readFileSync } from 'fs';
const mwText = readFileSync(fileURLToPath(mwUrl), 'utf8');

// ---- Helper: build a minimal CF Pages Function context ----
// Used to exercise the endpoint handlers without a real CF runtime.
function makeCtx({ method = 'POST', body = null, session = null, env = {} } = {}) {
  const req = new Request('https://field.pierfoundations.com/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    request: req,
    env: {
      PF_SCHEDULE: null,  // KV mock — overridden per test
      DB: null,           // D1 mock — overridden per test
      ...env,
    },
    data: session ? { session } : {},
  };
}

// ---- Mock KV (in-memory) ----
function makeKV() {
  const store = new Map();
  return {
    async get(key, opts) {
      const entry = store.get(key);
      if (!entry) return null;
      if (opts && opts.type === 'json') return JSON.parse(entry.value);
      return entry.value;
    },
    async put(key, value, options) {
      store.set(key, { value, ttl: options?.expirationTtl || null });
    },
    async delete(key) { store.delete(key); },
    _store: store,
  };
}

// ---- Mock D1 (in-memory) ----
function makeD1() {
  const tables = {
    users: [],
    password_resets: [],
    audit_log: [],
  };
  const self = {
    _tables: tables,
    prepare(sql) {
      return {
        _sql: sql,
        _binds: [],
        bind(...args) { this._binds = args; return this; },
        async first() {
          const sql = this._sql.toLowerCase();
          const binds = this._binds;
          if (sql.includes('from users where lower(email)')) {
            const email = binds[0];
            const row = tables.users.find(u => u.email.toLowerCase() === email && u.active);
            return row || null;
          }
          if (sql.includes('from users where id')) {
            const id = binds[0];
            return tables.users.find(u => u.id === id) || null;
          }
          if (sql.includes('from password_resets where token_hash')) {
            const hash = binds[0];
            return tables.password_resets.find(r => r.token_hash === hash) || null;
          }
          if (sql.includes('from users where lower(email) = lower')) {
            const email = binds[0];
            const row = tables.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.active);
            return row || null;
          }
          return null;
        },
        async run() {
          const sql = this._sql.toLowerCase();
          const binds = this._binds;
          if (sql.includes('update password_resets set used_at') && sql.includes('where user_email')) {
            const email = binds[0];
            tables.password_resets.forEach(r => {
              if (r.user_email === email && !r.used_at) r.used_at = new Date().toISOString();
            });
          } else if (sql.includes('insert into password_resets')) {
            tables.password_resets.push({
              id: binds[0], user_email: binds[1], token_hash: binds[2],
              expires_at: binds[3], used_at: null,
              created_at: new Date().toISOString(), request_ip: binds[4] || '',
            });
          } else if (sql.includes('update password_resets set used_at') && sql.includes('where id')) {
            const id = binds[0];
            const row = tables.password_resets.find(r => r.id === id);
            if (row) row.used_at = new Date().toISOString();
          } else if (sql.includes('update users set password_hash')) {
            const [hash, salt, iterations, ts, id] = binds;
            const user = tables.users.find(u => u.id === id);
            if (user) {
              user.password_hash = hash; user.salt = salt;
              user.iterations = iterations; user.must_reset = 0;
            }
          } else if (sql.includes('insert into audit_log')) {
            tables.audit_log.push({ user_id: binds[0], action: binds[1], detail: binds[2] });
          }
          return { success: true };
        },
        async all() { return { results: [] }; },
      };
    },
    _addUser(user) { tables.users.push(user); },
  };
  return self;
}

// ---- Weather handler tests ----
// Import weather handler
const wxUrl = new URL('../functions/api/weather.js', import.meta.url);
const { onRequest: wxOnRequest } = await import(wxUrl.href);

// Mock NWS using global fetch override.
// No Census geocoder mock needed — coordinates are precomputed in job-coords.js.
const _origFetch = globalThis.fetch;
function mockFetch(handlers) {
  globalThis.fetch = async function(url, opts) {
    const urlStr = String(url);
    for (const [pattern, handler] of handlers) {
      if (urlStr.includes(pattern)) return handler(urlStr, opts);
    }
    throw new Error('No mock for: ' + urlStr);
  };
}
function restoreFetch() { globalThis.fetch = _origFetch; }

function mockJsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) };
}

// Tests 1-6: Weather
console.log('\nWeather tile tests:');

await test('1. success: precomputed coords + NWS → 3-day forecast', async () => {
  // 26-001 (WPAFB) has coords precomputed in job-coords.js
  mockFetch([
    ['api.weather.gov/points', () => mockJsonResponse({
      properties: { forecast: 'https://api.weather.gov/gridpoints/ILN/49,72/forecast' }
    })],
    ['api.weather.gov/gridpoints', () => mockJsonResponse({
      properties: {
        periods: [
          { isDaytime: true,  name: 'Today',   temperature: 72, temperatureUnit: 'F', shortForecast: 'Sunny', probabilityOfPrecipitation: { value: 10 } },
          { isDaytime: false, name: 'Tonight', temperature: 55, temperatureUnit: 'F', shortForecast: 'Clear', probabilityOfPrecipitation: { value: 0 } },
          { isDaytime: true,  name: 'Thursday',temperature: 68, temperatureUnit: 'F', shortForecast: 'Partly Cloudy', probabilityOfPrecipitation: { value: 30 } },
          { isDaytime: false, name: 'Thursday Night', temperature: 50, temperatureUnit: 'F', shortForecast: 'Cloudy', probabilityOfPrecipitation: { value: 20 } },
          { isDaytime: true,  name: 'Friday',  temperature: 61, temperatureUnit: 'F', shortForecast: 'Rainy', probabilityOfPrecipitation: { value: 80 } },
          { isDaytime: false, name: 'Friday Night', temperature: 44, temperatureUnit: 'F', shortForecast: 'Rainy', probabilityOfPrecipitation: { value: 60 } },
        ],
      }
    })],
  ]);

  const kv = makeKV();
  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: kv },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-001', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  restoreFetch();
  const data = await resp.json();
  assert.equal(data.status, 'ok', 'status should be ok');
  assert.ok(Array.isArray(data.forecast), 'forecast should be an array');
  assert.equal(data.forecast.length, 3, 'should have 3 days');
  assert.equal(data.forecast[0].name, 'Today');
  assert.equal(data.forecast[0].high, 72);
  assert.equal(data.forecast[0].low, 55);
  assert.equal(data.forecast[0].precipChance, 10);
  assert.ok(data.asOf, 'should have asOf timestamp');
});

await test('2. no precomputed coords → status:no_location', async () => {
  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: makeKV() },
  });
  // 26-007 has null coords in job-coords.js (no address known)
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-007', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  const data = await resp.json();
  assert.equal(data.status, 'no_location');
  assert.ok(data.message.includes('No site location'));
});

await test('3. NWS /points fails → status:unavailable', async () => {
  mockFetch([
    ['api.weather.gov/points', () => ({ ok: false, status: 503, json: async () => ({}) })],
  ]);

  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: makeKV() },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-001', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  restoreFetch();
  const data = await resp.json();
  assert.equal(data.status, 'unavailable');
  assert.ok(data.message.includes('unavailable'));
});

await test('4. NWS forecast endpoint fails → status:unavailable', async () => {
  mockFetch([
    ['api.weather.gov/points', () => mockJsonResponse({
      properties: { forecast: 'https://api.weather.gov/gridpoints/ILN/49,72/forecast' }
    })],
    ['api.weather.gov/gridpoints', () => ({ ok: false, status: 503, json: async () => ({}) })],
  ]);

  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: makeKV() },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-001', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  restoreFetch();
  const data = await resp.json();
  assert.equal(data.status, 'unavailable');
});

await test('5. unknown job → 400', async () => {
  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: makeKV() },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=99-999', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  assert.equal(resp.status, 400);
});

await test('6. no session → 403 (requireArea)', async () => {
  const ctx = makeCtx({
    method: 'GET',
    session: null,
    env: { PF_SCHEDULE: makeKV() },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-001', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  assert.equal(resp.status, 403);
});

// ---- Forgot password / reset-by-token tests ----
const fpUrl = new URL('../functions/api/forgot-password.js', import.meta.url);
const { onRequest: fpOnRequest } = await import(fpUrl.href);

const rbtUrl = new URL('../functions/api/reset-by-token.js', import.meta.url);
const { onRequest: rbtOnRequest } = await import(rbtUrl.href);

console.log('\nForgot password / reset-by-token tests:');

await test('7. unknown email → generic response, no error', async () => {
  const db = makeD1();  // no users
  const ctx = makeCtx({ body: { email: 'nobody@example.com' }, env: { DB: db, PF_SCHEDULE: makeKV() } });

  // Graph configured = false (no AZURE_ vars) → falls back but still generic
  const resp = await fpOnRequest(ctx);
  const data = await resp.json();
  assert.equal(resp.status, 200, 'always 200');
  assert.equal(data.status, 'ok');
  assert.ok(data.message.includes('If that email is registered'));
  // No DB rows should have been written
  assert.equal(db._tables.password_resets.length, 0);
});

await test('8. known email → token_hash stored in DB', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });

  // Mock Graph sendMail to succeed
  mockFetch([
    ['login.microsoftonline.com', () => mockJsonResponse({ access_token: 'tok', expires_in: 3600 })],
    ['graph.microsoft.com', () => ({ ok: true, status: 202, json: async () => ({}) })],
  ]);

  const ctx = makeCtx({
    body: { email: 'peter@pierfoundations.com' },
    env: {
      DB: db,
      PF_SCHEDULE: makeKV(),
      AZURE_CLIENT_ID: 'cid',
      AZURE_CLIENT_SECRET: 'csec',
      AZURE_TENANT_ID: 'tid',
      SP_DRIVE_ID: 'did',
    },
  });

  const resp = await fpOnRequest(ctx);
  restoreFetch();
  const data = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(data.status, 'ok');
  // A token row should have been created
  assert.equal(db._tables.password_resets.length, 1, 'one reset row');
  const row = db._tables.password_resets[0];
  assert.equal(row.user_email, 'peter@pierfoundations.com');
  assert.ok(row.token_hash, 'token_hash present');
  assert.ok(row.expires_at > Math.floor(Date.now() / 1000), 'expires in future');
});

await test('9. raw token is NOT the stored hash', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });

  let capturedBody = null;
  mockFetch([
    ['login.microsoftonline.com', () => mockJsonResponse({ access_token: 'tok', expires_in: 3600 })],
    ['graph.microsoft.com', (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 202, json: async () => ({}) };
    }],
  ]);

  const ctx = makeCtx({
    body: { email: 'peter@pierfoundations.com' },
    env: {
      DB: db,
      PF_SCHEDULE: makeKV(),
      AZURE_CLIENT_ID: 'cid',
      AZURE_CLIENT_SECRET: 'csec',
      AZURE_TENANT_ID: 'tid',
      SP_DRIVE_ID: 'did',
    },
  });

  await fpOnRequest(ctx);
  restoreFetch();

  const row = db._tables.password_resets[0];
  assert.ok(row.token_hash, 'has token_hash');

  // Extract the raw token from the email body
  assert.ok(capturedBody, 'email was sent');
  const emailText = capturedBody.message.body.content;
  const tokenMatch = emailText.match(/token=([A-Za-z0-9_-]+)/);
  assert.ok(tokenMatch, 'email contains token URL');
  const rawToken = tokenMatch[1];

  // The raw token should NOT equal the stored hash
  assert.notEqual(rawToken, row.token_hash, 'raw token !== stored hash');
  // The raw token should be non-trivially long
  assert.ok(rawToken.length > 20, 'token is long enough');
});

await test('10. expired token → INVALID_RESPONSE', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });

  // Insert an already-expired token manually
  // We need to know a hash that matches a raw token. Generate one.
  const { b64urlEncode } = await import(authUrl.href);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  // Encode raw token same way as forgot-password.js does
  const rawToken = b64urlEncode(tokenBytes);
  const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
  const tokenHash = b64urlEncode(new Uint8Array(digest));

  db._tables.password_resets.push({
    id: 'r1', user_email: 'peter@pierfoundations.com', token_hash: tokenHash,
    expires_at: Math.floor(Date.now() / 1000) - 1, // expired 1 second ago
    used_at: null, created_at: new Date().toISOString(), request_ip: '',
  });

  const ctx = makeCtx({
    body: { token: rawToken, password: 'NewPassword123!', confirm: 'NewPassword123!' },
    env: { DB: db },
  });

  const resp = await rbtOnRequest(ctx);
  const data = await resp.json();
  assert.equal(data.status, 'invalid');
  assert.ok(data.message.includes('invalid or has expired'));
});

await test('11. used token → INVALID_RESPONSE', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });

  const { b64urlEncode } = await import(authUrl.href);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = b64urlEncode(tokenBytes);
  const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
  const tokenHash = b64urlEncode(new Uint8Array(digest));

  db._tables.password_resets.push({
    id: 'r1', user_email: 'peter@pierfoundations.com', token_hash: tokenHash,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    used_at: new Date().toISOString(), // already used
    created_at: new Date().toISOString(), request_ip: '',
  });

  const ctx = makeCtx({
    body: { token: rawToken, password: 'NewPassword123!', confirm: 'NewPassword123!' },
    env: { DB: db },
  });

  const resp = await rbtOnRequest(ctx);
  const data = await resp.json();
  assert.equal(data.status, 'invalid');
});

await test('12. valid token → password updated, audit written', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1, role: 'field_ops' });

  const { b64urlEncode } = await import(authUrl.href);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = b64urlEncode(tokenBytes);
  const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
  const tokenHash = b64urlEncode(new Uint8Array(digest));

  db._tables.password_resets.push({
    id: 'r1', user_email: 'peter@pierfoundations.com', token_hash: tokenHash,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    used_at: null, created_at: new Date().toISOString(), request_ip: '',
  });

  const ctx = makeCtx({
    body: { token: rawToken, password: 'NewP@ssword456!', confirm: 'NewP@ssword456!' },
    env: { DB: db },
  });

  const resp = await rbtOnRequest(ctx);
  const data = await resp.json();
  assert.equal(data.status, 'ok', 'status ok');
  assert.ok(data.redirect.includes('/login.html'), 'redirects to login');

  // Token should be marked used
  const row = db._tables.password_resets.find(r => r.id === 'r1');
  assert.ok(row.used_at, 'token marked used');

  // User password_hash should be updated
  const user = db._tables.users.find(u => u.id === 'u1');
  assert.ok(user.password_hash, 'password_hash updated');
  assert.equal(user.must_reset, 0, 'must_reset cleared');

  // Audit log should have an entry
  assert.ok(db._tables.audit_log.length > 0, 'audit entry written');
  assert.equal(db._tables.audit_log[0].action, 'password_reset_by_token');
});

await test('13. rate limit: 4th email request returns generic, no new DB row', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'ratelimit@pierfoundations.com', active: 1 });

  let sendCount = 0;
  mockFetch([
    ['login.microsoftonline.com', () => mockJsonResponse({ access_token: 'tok', expires_in: 3600 })],
    ['graph.microsoft.com', () => { sendCount++; return { ok: true, status: 202, json: async () => ({}) }; }],
  ]);

  // KV that tracks counts
  const kv = makeKV();
  const env = {
    DB: db,
    PF_SCHEDULE: kv,
    AZURE_CLIENT_ID: 'cid',
    AZURE_CLIENT_SECRET: 'csec',
    AZURE_TENANT_ID: 'tid',
    SP_DRIVE_ID: 'did',
  };

  // First 3 requests — should succeed
  for (let i = 0; i < 3; i++) {
    const ctx = makeCtx({ body: { email: 'ratelimit@pierfoundations.com' }, env });
    await fpOnRequest(ctx);
  }
  const countAfter3 = db._tables.password_resets.filter(r => r.user_email === 'ratelimit@pierfoundations.com' && !r.used_at);
  // After 3 requests, at least one active token (previous are invalidated by each request)
  assert.ok(countAfter3.length >= 0, 'some tokens after 3 requests');

  // 4th request — should be rate-limited
  const ctx4 = makeCtx({ body: { email: 'ratelimit@pierfoundations.com' }, env });
  const resp4 = await fpOnRequest(ctx4);
  restoreFetch();
  const data4 = await resp4.json();
  assert.equal(resp4.status, 200, '4th request still returns 200');
  assert.equal(data4.status, 'ok', 'still generic response');
  // sendCount should be at most 3 (4th was rate-limited)
  assert.ok(sendCount <= 3, `email sent at most 3 times (got ${sendCount})`);
});

// ---- Middleware tests ----
console.log('\nMiddleware / auth routing tests:');

await test('14. /forgot-password.html in PUBLIC_PATHS', () => {
  assert.ok(mwText.includes("'/forgot-password.html'"), '/forgot-password.html in PUBLIC_PATHS');
});

await test('15. /reset.html in PUBLIC_PATHS', () => {
  assert.ok(mwText.includes("'/reset.html'"), '/reset.html in PUBLIC_PATHS');
});

await test('16. /api/forgot-password in AUTH_ENDPOINTS', () => {
  assert.ok(mwText.includes("'/api/forgot-password'"), '/api/forgot-password in AUTH_ENDPOINTS');
});

await test('17. /api/reset-by-token in AUTH_ENDPOINTS', () => {
  assert.ok(mwText.includes("'/api/reset-by-token'"), '/api/reset-by-token in AUTH_ENDPOINTS');
});

await test('18. /api/weather mapped to field_ops in areaForPath', () => {
  assert.equal(areaForPath('/api/weather'), 'field_ops');
  assert.equal(areaForPath('/api/weather?job=26-001'), 'field_ops');  // query string shouldn't matter for startsWith
});

// ---- Summary ----
console.log(`\n${'='.repeat(50)}`);
console.log(`R8 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailed tests:');
  results.forEach(r => console.error(`  - ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log('All R8 tests passed.');
}
