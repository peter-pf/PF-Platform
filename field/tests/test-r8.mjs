#!/usr/bin/env node
// R8 tests:
//   Weather (mocked upstream):
//     1. Success: precomputed coords + NWS → returns 3-day forecast
//     2. Coverage: 26-007 now has address-level coords (previously null) → returns forecast
//     3. NWS /points fails → status:'unavailable'
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
//    12. Valid token → password updated; audit written
//    13. Rate limit by email: 4th request returns generic response without DB write
//    14. Middleware: /forgot-password.html in PUBLIC_PATHS
//    15. Middleware: /reset.html in PUBLIC_PATHS
//    16. Middleware: /api/forgot-password in AUTH_ENDPOINTS (exact match)
//    17. Middleware: /api/reset-by-token in AUTH_ENDPOINTS (exact match)
//    18. auth.js: /api/weather mapped to field_ops area
//
//   Security hardening (R8 audit):
//    19. Timing: both paths (known + unknown) return before background tasks run
//    20. Atomic single-use: two concurrent consumes → exactly one succeeds
//    21. Session revocation: old session rejected after reset; new session passes
//    22. CT + cross-site guards: form-encoded and cross-site requests rejected, no DB write
//    23. Fragment token: email link uses #token= not ?token=
//    24. WX_PROJECTS removed: index.html has no hard-coded list; dropdown built from /api/field-projects
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
// Provides a waitUntil() method that captures background tasks so tests can:
//   1. Verify the response arrives before background work runs (timing invariant).
//   2. Explicitly await ctx._bgTasks before asserting DB side-effects.
function makeCtx({ method = 'POST', body = null, session = null, env = {} } = {}) {
  const bgTasks = [];
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
    waitUntil(p) { bgTasks.push(p); },
    _bgTasks: bgTasks,
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
// run() returns { meta: { changes: n } } for UPDATE statements that modify rows,
// which is what reset-by-token checks to enforce single-use token consumption.
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
            // Invalidate old tokens for same email (non-atomic, bulk invalidation)
            const email = binds[0];
            const excludeId = binds[1];
            tables.password_resets.forEach(r => {
              if (r.user_email === email && !r.used_at && r.id !== excludeId) {
                r.used_at = new Date().toISOString();
              }
            });
            return { meta: { changes: 0 } };
          } else if (sql.includes('insert into password_resets')) {
            tables.password_resets.push({
              id: binds[0], user_email: binds[1], token_hash: binds[2],
              expires_at: binds[3], used_at: null,
              created_at: new Date().toISOString(), request_ip: binds[4] || '',
            });
            return { meta: { changes: 1 } };
          } else if (
            sql.includes('update password_resets set used_at') &&
            sql.includes('where id') &&
            sql.includes('and used_at is null')
          ) {
            // ATOMIC single-use consume:
            //   UPDATE ... SET used_at=datetime('now') WHERE id=? AND used_at IS NULL AND expires_at>?
            // Returns meta.changes=1 only if the row was actually consumed.
            const id = binds[0];
            const expiresCheck = binds[1];
            const row = tables.password_resets.find(r =>
              r.id === id && !r.used_at && r.expires_at > expiresCheck
            );
            if (row) {
              row.used_at = new Date().toISOString();
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          } else if (sql.includes('update password_resets set used_at') && sql.includes('where id')) {
            // Simple mark-used (on email send failure, etc.)
            const id = binds[0];
            const row = tables.password_resets.find(r => r.id === id);
            if (row) row.used_at = new Date().toISOString();
            return { meta: { changes: row ? 1 : 0 } };
          } else if (sql.includes('update users set password_hash')) {
            const [hash, salt, iterations, ts, id] = binds;
            const user = tables.users.find(u => u.id === id);
            if (user) {
              user.password_hash = hash; user.salt = salt;
              user.iterations = iterations; user.must_reset = 0;
            }
            return { meta: { changes: user ? 1 : 0 } };
          } else if (sql.includes('insert into audit_log')) {
            tables.audit_log.push({ user_id: binds[0], action: binds[1], detail: binds[2] });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
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

await test('2. coverage improvement: 26-007 now has address-level coords → returns forecast', async () => {
  // Before R8 coverage fix, 26-007 had null coords and returned no_location.
  // After fix, it has address-level coords (South Bend, IN).
  // This test verifies the improvement by confirming NWS is called and forecast returned.
  mockFetch([
    ['api.weather.gov/points', () => mockJsonResponse({
      properties: { forecast: 'https://api.weather.gov/gridpoints/IWX/55,63/forecast' }
    })],
    ['api.weather.gov/gridpoints', () => mockJsonResponse({
      properties: {
        periods: [
          { isDaytime: true,  name: 'Today',   temperature: 60, temperatureUnit: 'F', shortForecast: 'Cloudy', probabilityOfPrecipitation: { value: 20 } },
          { isDaytime: false, name: 'Tonight', temperature: 45, temperatureUnit: 'F', shortForecast: 'Cloudy', probabilityOfPrecipitation: { value: 10 } },
          { isDaytime: true,  name: 'Tomorrow',temperature: 64, temperatureUnit: 'F', shortForecast: 'Sunny',  probabilityOfPrecipitation: { value: 5 } },
          { isDaytime: false, name: 'Tomorrow Night', temperature: 48, temperatureUnit: 'F', shortForecast: 'Clear', probabilityOfPrecipitation: { value: 0 } },
          { isDaytime: true,  name: 'Friday',  temperature: 58, temperatureUnit: 'F', shortForecast: 'Rain',   probabilityOfPrecipitation: { value: 70 } },
          { isDaytime: false, name: 'Friday Night', temperature: 40, temperatureUnit: 'F', shortForecast: 'Rain', probabilityOfPrecipitation: { value: 50 } },
        ],
      }
    })],
  ]);

  const ctx = makeCtx({
    method: 'GET',
    session: { uid: 'u1', role: 'field_ops', name: 'Test' },
    env: { PF_SCHEDULE: makeKV() },
  });
  ctx.request = new Request('https://field.pierfoundations.com/api/weather?job=26-007', { method: 'GET' });

  const resp = await wxOnRequest(ctx);
  restoreFetch();
  const data = await resp.json();
  assert.equal(data.status, 'ok', 'should return ok (has coords after coverage fix)');
  assert.ok(Array.isArray(data.forecast), 'forecast is array');
  assert.equal(data.forecast.length, 3, '3 days returned');
  assert.equal(data.job, '26-007');
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

await test('7. unknown email → generic response, no error, no DB write', async () => {
  const db = makeD1();  // no users
  const ctx = makeCtx({ body: { email: 'nobody@example.com' }, env: { DB: db, PF_SCHEDULE: makeKV() } });

  const resp = await fpOnRequest(ctx);
  // Await background tasks (no user found → exits early with no writes)
  await Promise.all(ctx._bgTasks);
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
  // Must await background tasks before asserting DB state
  await Promise.all(ctx._bgTasks);
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
  // Await background tasks so email is sent and capturedBody is set
  await Promise.all(ctx._bgTasks);
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
  const { b64urlEncode } = await import(authUrl.href);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
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

await test('13. rate limit: 4th email request returns generic, email sent at most 3 times', async () => {
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

  // First 3 requests — should succeed; await background so email sends are counted
  for (let i = 0; i < 3; i++) {
    const ctx = makeCtx({ body: { email: 'ratelimit@pierfoundations.com' }, env });
    await fpOnRequest(ctx);
    await Promise.all(ctx._bgTasks);
  }

  // 4th request — should be rate-limited (no background queued, no email sent)
  const ctx4 = makeCtx({ body: { email: 'ratelimit@pierfoundations.com' }, env });
  const resp4 = await fpOnRequest(ctx4);
  await Promise.all(ctx4._bgTasks); // empty — rate limited before waitUntil
  restoreFetch();
  const data4 = await resp4.json();
  assert.equal(resp4.status, 200, '4th request still returns 200');
  assert.equal(data4.status, 'ok', 'still generic response');
  // sendCount should be exactly 3 (4th was rate-limited)
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

// ---- Security hardening tests (R8 audit) ----
console.log('\nSecurity hardening tests:');

await test('19. timing: both paths (known + unknown) return before background tasks run', async () => {
  // Known-email path: response should arrive before background task executes
  const db1 = makeD1();
  db1._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });
  mockFetch([
    ['login.microsoftonline.com', () => mockJsonResponse({ access_token: 'tok', expires_in: 3600 })],
    ['graph.microsoft.com', () => ({ ok: true, status: 202, json: async () => ({}) })],
  ]);
  const ctx1 = makeCtx({
    body: { email: 'peter@pierfoundations.com' },
    env: {
      DB: db1,
      PF_SCHEDULE: makeKV(),
      AZURE_CLIENT_ID: 'cid', AZURE_CLIENT_SECRET: 'csec',
      AZURE_TENANT_ID: 'tid', SP_DRIVE_ID: 'did',
    },
  });
  const resp1 = await fpOnRequest(ctx1);
  // Response arrived. Background tasks are queued but NOT yet run (waitUntil captured them).
  assert.equal(db1._tables.password_resets.length, 0,
    'known-email: no DB write before background runs (timing invariant)');
  // Now run the background — DB write should happen
  await Promise.all(ctx1._bgTasks);
  restoreFetch();
  assert.equal(db1._tables.password_resets.length, 1,
    'known-email: DB write happens after background runs');
  assert.equal(resp1.status, 200);

  // Unknown-email path: response arrives immediately, background runs but finds no user
  const db2 = makeD1();  // no users
  const ctx2 = makeCtx({
    body: { email: 'nobody@example.com' },
    env: { DB: db2, PF_SCHEDULE: makeKV() },
  });
  const resp2 = await fpOnRequest(ctx2);
  assert.equal(db2._tables.password_resets.length, 0,
    'unknown-email: no DB write before background runs');
  await Promise.all(ctx2._bgTasks);
  assert.equal(db2._tables.password_resets.length, 0,
    'unknown-email: still no DB write after background runs (user not found)');
  assert.equal(resp2.status, 200);
});

await test('20. atomic single-use: two concurrent consumes → exactly one succeeds', async () => {
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

  // Fire two concurrent requests with the same valid token
  const makeReq = () => makeCtx({
    body: { token: rawToken, password: 'Concurrent123!', confirm: 'Concurrent123!' },
    env: { DB: db },
  });

  const [resp1, resp2] = await Promise.all([
    rbtOnRequest(makeReq()),
    rbtOnRequest(makeReq()),
  ]);
  const [d1, d2] = await Promise.all([resp1.json(), resp2.json()]);

  const successes = [d1, d2].filter(d => d.status === 'ok').length;
  const invalids  = [d1, d2].filter(d => d.status === 'invalid').length;
  assert.equal(successes, 1, 'exactly one concurrent request succeeds');
  assert.equal(invalids,  1, 'exactly one concurrent request gets INVALID_RESPONSE');
});

await test('21. session revocation: old session rejected after reset; new session passes', async () => {
  const { checkSessionRevoked, revokeOldSessions } = await import(authUrl.href);
  const kv = makeKV();
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1, role: 'field_ops' });

  // Simulate a session issued 60 seconds before the reset
  const oldIat = Math.floor(Date.now() / 1000) - 60;
  const oldSession = { uid: 'u1', role: 'field_ops', iat: oldIat };

  // Before any reset, old session should be valid (not revoked)
  const notRevoked = await checkSessionRevoked(oldSession, kv);
  assert.equal(notRevoked, false, 'old session not yet revoked before reset');

  // Perform a successful password reset via reset-by-token
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
    body: { token: rawToken, password: 'PostReset123!', confirm: 'PostReset123!' },
    env: { DB: db, PF_SCHEDULE: kv },
  });

  const resp = await rbtOnRequest(ctx);
  const data = await resp.json();
  assert.equal(data.status, 'ok', 'reset succeeded');

  // Old session (iat < revocation epoch) should now be rejected
  const isRevoked = await checkSessionRevoked(oldSession, kv);
  assert.equal(isRevoked, true, 'old session is revoked after password reset');

  // A session with iat after the revocation epoch should pass
  const newIat = Math.floor(Date.now() / 1000) + 2; // 2 seconds after now
  const newSession = { uid: 'u1', role: 'field_ops', iat: newIat };
  const newRevoked = await checkSessionRevoked(newSession, kv);
  assert.equal(newRevoked, false, 'session issued after reset is not revoked');

  // A session without iat should be treated as iat=0 (revoked)
  const noIatSession = { uid: 'u1', role: 'field_ops' };
  const noIatRevoked = await checkSessionRevoked(noIatSession, kv);
  assert.equal(noIatRevoked, true, 'session without iat (treated as iat=0) is revoked');
});

await test('22. CT + cross-site guards: form-encoded and cross-site requests rejected, no DB write', async () => {
  const db = makeD1();
  db._addUser({ id: 'u1', name: 'Test User', email: 'peter@pierfoundations.com', active: 1 });

  // Form-encoded → rejected with generic response, no DB write
  const formReq = new Request('https://field.pierfoundations.com/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=peter%40pierfoundations.com',
  });
  const ctx1 = { request: formReq, env: { DB: db, PF_SCHEDULE: makeKV() }, data: {}, waitUntil() {} };
  const resp1 = await fpOnRequest(ctx1);
  const d1 = await resp1.json();
  assert.equal(resp1.status, 200, 'form-encoded: 200');
  assert.equal(d1.status, 'ok', 'form-encoded: generic response');
  assert.equal(db._tables.password_resets.length, 0, 'form-encoded: no DB write');

  // Sec-Fetch-Site: cross-site → rejected
  const xsiteReq = new Request('https://field.pierfoundations.com/api/forgot-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'cross-site',
      'Origin': 'https://evil.example.com',
    },
    body: JSON.stringify({ email: 'peter@pierfoundations.com' }),
  });
  const ctx2 = { request: xsiteReq, env: { DB: db, PF_SCHEDULE: makeKV() }, data: {}, waitUntil() {} };
  const resp2 = await fpOnRequest(ctx2);
  const d2 = await resp2.json();
  assert.equal(resp2.status, 200, 'cross-site: 200');
  assert.equal(d2.status, 'ok', 'cross-site: generic response');
  assert.equal(db._tables.password_resets.length, 0, 'cross-site: no DB write');

  // Wrong Origin (non-matching, even without cross-site header) → rejected
  const wrongOriginReq = new Request('https://field.pierfoundations.com/api/forgot-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
      'Origin': 'https://evil.example.com',
    },
    body: JSON.stringify({ email: 'peter@pierfoundations.com' }),
  });
  const ctx3 = { request: wrongOriginReq, env: { DB: db, PF_SCHEDULE: makeKV() }, data: {}, waitUntil() {} };
  const resp3 = await fpOnRequest(ctx3);
  const d3 = await resp3.json();
  assert.equal(resp3.status, 200, 'wrong-origin: 200');
  assert.equal(d3.status, 'ok', 'wrong-origin: generic response');
  assert.equal(db._tables.password_resets.length, 0, 'wrong-origin: no DB write');
});

await test('23. email reset link uses URL fragment (#token=) not query param (?token=)', async () => {
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
      AZURE_CLIENT_ID: 'cid', AZURE_CLIENT_SECRET: 'csec',
      AZURE_TENANT_ID: 'tid', SP_DRIVE_ID: 'did',
    },
  });

  await fpOnRequest(ctx);
  // Must await background tasks for the email to be sent
  await Promise.all(ctx._bgTasks);
  restoreFetch();

  assert.ok(capturedBody, 'email was sent');
  const emailText = capturedBody.message.body.content;
  // Must use fragment form: reset.html#token=<value>
  assert.ok(emailText.includes('#token='), 'link uses URL fragment (#token=)');
  // Must NOT use query param form
  assert.ok(!emailText.includes('?token='), 'link does NOT use query param (?token=)');
  // Full link should contain reset.html#token=
  assert.ok(emailText.includes('reset.html#token='), 'full fragment link present');
});

await test('24. index.html: WX_PROJECTS removed; dropdown built from /api/field-projects; uses pf-last-job key', () => {
  const indexHtml = readFileSync(
    fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8'
  );
  // Hard-coded project array must be gone
  assert.ok(!indexHtml.includes('WX_PROJECTS'),
    'WX_PROJECTS hard-coded array is removed');
  // Must fetch from the live API endpoint (same source as Daily Report / Site Readiness)
  assert.ok(indexHtml.includes('/api/field-projects'),
    'fetches project list from /api/field-projects');
  // Must use the shared last-job key (not the old pf-wx-job key)
  assert.ok(indexHtml.includes('pf-last-job'),
    'uses shared pf-last-job localStorage key');
  // Must NOT use the old per-tile key
  assert.ok(!indexHtml.includes('pf-wx-job'),
    'old pf-wx-job key is removed');
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
