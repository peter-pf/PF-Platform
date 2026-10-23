// Test harness for platform/functions/api/time-off-review.js
// Run: node platform/tests/time-off-review.test.mjs
//
// Covers:
//   1. AREA GATE     — schedule_admin defined + role matrix correct
//   2. AUTH GATE     — field_ops, business_dev, hr all get 403; admin + partner allowed
//   3. GET           — returns requests + allocations + users on success
//   4. APPROVE       — race-safe WHERE status='pending'; 409 on already-actioned; 404 on missing
//   5. DENY          — same race-safe pattern + denial_reason stored
//   6. SET-ALLOC     — upsert + validates year/days range + user-exists check
//   7. HARDENING     — Content-Type gate, cross-site gate, payload-too-large, unknown action
//   8. RATE LIMIT    — 60 actions/hr per uid; 61st → 429
//   9. NO DB         — fail-closed 503 on both GET and POST
//  10. AREA PATH MAP — areaForPath('/api/time-off-review') === 'schedule_admin'

import { onRequestGet, onRequestPost } from '../functions/api/time-off-review.js';
import { roleCanAccess, areaForPath }   from '../functions/lib/auth.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else       { fail++; console.log('  FAIL', name, extra != null ? '-> ' + JSON.stringify(extra) : ''); }
}

// ---- helpers ----------------------------------------------------------------
function makeDB(rows) {
  // Minimal D1 mock: .prepare(sql) returns an object with .bind() -> .all()/.run()/.first()
  const _rows = rows || {};
  function stmt(sql) {
    let _binds = [];
    const obj = {
      bind(...args) { _binds = args; return obj; },
      async all() {
        // Dispatch by SQL keyword pattern
        if (/FROM absence_requests/i.test(sql))   return { results: _rows.requests   || [] };
        if (/FROM employee_allocations/i.test(sql)) return { results: _rows.allocations || [] };
        if (/FROM users ORDER BY name/i.test(sql))  return { results: _rows.users      || [] };
        return { results: [] };
      },
      async run() {
        // Approve/Deny: return changes=1 for id 'good-id', 0 otherwise.
        // APPROVE binds: [now, uid, name, now, id]      → id at [4]
        // DENY    binds: [now, uid, name, now, reason, id] → id at [5]
        if (/UPDATE absence_requests/i.test(sql)) {
          const id = /denial_reason/i.test(sql) ? _binds[5] : _binds[4];
          if (id === 'good-id')   return { meta: { changes: 1 } };
          // 'already-id' and 'no-id' → 0 changes (already-actioned / not found)
          return { meta: { changes: 0 } };
        }
        // set-allocation INSERT/ON CONFLICT
        if (/INSERT INTO employee_allocations/i.test(sql)) return { meta: { changes: 1 } };
        return { meta: { changes: 0 } };
      },
      async first() {
        // SELECT uid FROM absence_requests (self-review check)
        if (/SELECT uid FROM absence_requests/i.test(sql)) {
          const id = _binds[0];
          if (id === 'no-id')   return null;
          if (id === 'self-id') return { uid: 'brad' };  // session.uid == requester uid
          return { uid: 'crew-member' };                  // different uid → allowed
        }
        // SELECT status FROM absence_requests (race-safe fallback)
        if (/SELECT status FROM absence_requests/i.test(sql)) {
          const id = _binds[0];
          if (id === 'no-id')      return null;
          if (id === 'already-id') return { status: 'approved' };
          return { status: 'pending' };
        }
        if (/SELECT id FROM users/i.test(sql)) {
          const uid = _binds[0];
          return uid === 'good-user' ? { id: uid } : null;
        }
        return null;
      },
    };
    return obj;
  }
  return { prepare: (sql) => stmt(sql) };
}

function makeKV() {
  const store = new Map();
  return {
    async get(k)           { return store.has(k) ? store.get(k) : null; },
    async put(k, v, _opts) { store.set(k, v); },
  };
}

function makeEnv(opts) {
  opts = opts || {};
  return {
    DB:          opts.db  !== undefined ? opts.db  : makeDB(),
    PF_SCHEDULE: opts.kv  !== undefined ? opts.kv  : makeKV(),
  };
}

const ctx = (session, env, request) => ({ data: { session }, env, request });

function req(url, body, extraHeaders) {
  if (!body) return new Request(url, { method: 'GET' });
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

const ADMIN   = { uid: 'brad',     role: 'admin',        name: 'Brad'     };
const PARTNER = { uid: 'jonathan', role: 'partner',      name: 'Jonathan' };
const FO      = { uid: 'crew1',    role: 'field_ops',    name: 'Crew1'    };
const BD      = { uid: 'derek',    role: 'business_dev', name: 'Derek'    };
const HR      = { uid: 'mel',      role: 'hr',           name: 'Mel'      };

// =============================================================================
// 1. AREA GATE
// =============================================================================
console.log('1. AREA GATE');
{
  ok('schedule_admin area defined',           roleCanAccess('admin',        'schedule_admin') === true);
  ok('partner can access schedule_admin',     roleCanAccess('partner',      'schedule_admin') === true);
  ok('business_dev BLOCKED schedule_admin',   roleCanAccess('business_dev', 'schedule_admin') === false);
  ok('field_ops BLOCKED schedule_admin',      roleCanAccess('field_ops',    'schedule_admin') === false);
  ok('hr BLOCKED schedule_admin',            roleCanAccess('hr',           'schedule_admin') === false);
}

// =============================================================================
// 2. AUTH GATE (handler-level defense-in-depth)
// =============================================================================
console.log('2. AUTH GATE');
{
  const env = makeEnv();
  // field_ops
  const g1 = await onRequestGet(ctx(FO, env, req('https://x/api/time-off-review')));
  ok('GET blocks field_ops (403)',     g1.status === 403, g1.status);
  const p1 = await onRequestPost(ctx(FO, env, req('https://x/api/time-off-review', { action:'approve', id:'x' })));
  ok('POST blocks field_ops (403)',    p1.status === 403, p1.status);
  // business_dev
  const g2 = await onRequestGet(ctx(BD, env, req('https://x/api/time-off-review')));
  ok('GET blocks business_dev (403)', g2.status === 403, g2.status);
  // hr
  const g3 = await onRequestGet(ctx(HR, env, req('https://x/api/time-off-review')));
  ok('GET blocks hr (403)',           g3.status === 403, g3.status);
  // admin allowed
  const g4 = await onRequestGet(ctx(ADMIN, env, req('https://x/api/time-off-review')));
  ok('GET allows admin (200)',        g4.status === 200, g4.status);
  // partner allowed
  const g5 = await onRequestGet(ctx(PARTNER, env, req('https://x/api/time-off-review')));
  ok('GET allows partner (200)',      g5.status === 200, g5.status);
}

// =============================================================================
// 3. GET — payload shape
// =============================================================================
console.log('3. GET PAYLOAD');
{
  const db = makeDB({
    requests:    [{ id:'r1', uid:'u1', name:'Alice', start_date:'2026-12-20', end_date:'2026-12-22', half_day:0, type:'vacation', note:'', day_count:3, status:'pending', created_at:'2026-10-01T00:00:00Z', updated_at:'2026-10-01T00:00:00Z', approved_by:null, approved_by_name:null, approved_at:null, denied_by:null, denied_by_name:null, denied_at:null, denial_reason:null }],
    allocations: [{ uid:'u1', year:2026, allocated_days:10, updated_by:'brad', updated_at:'2026-10-01T00:00:00Z' }],
    users:       [{ id:'u1', name:'Alice', role:'field_ops' }],
  });
  const env = makeEnv({ db });
  const g = await onRequestGet(ctx(ADMIN, env, req('https://x/api/time-off-review')));
  const j = await g.json();
  ok('GET ok:true',                     j.ok === true,              j.ok);
  ok('GET requests array',              Array.isArray(j.requests),   j.requests);
  ok('GET allocations array',           Array.isArray(j.allocations),j.allocations);
  ok('GET users array',                 Array.isArray(j.users),      j.users);
  ok('GET request has expected fields', j.requests[0].status === 'pending', j.requests[0]);
  ok('GET users mapped uid/name/role',  j.users[0] && j.users[0].uid === 'u1', j.users[0]);
}

// =============================================================================
// 4. APPROVE (race-safe)
// =============================================================================
console.log('4. APPROVE');
{
  const env = makeEnv();
  // Happy path
  const p1 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'good-id' })));
  const j1 = await p1.json();
  ok('approve good-id -> 200 ok',         p1.status === 200 && j1.ok === true, j1);
  ok('approve returns status=approved',   j1.status === 'approved', j1.status);

  // Already approved -> 409
  const p2 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'already-id' })));
  const j2 = await p2.json();
  ok('approve already-id -> 409',         p2.status === 409, p2.status);

  // Not found -> 404
  const p3 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'no-id' })));
  const j3 = await p3.json();
  ok('approve no-id -> 404',              p3.status === 404, p3.status);

  // Missing id -> 400
  const p4 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve' })));
  ok('approve missing id -> 400',         p4.status === 400, p4.status);
}

// =============================================================================
// 5. DENY (race-safe)
// =============================================================================
console.log('5. DENY');
{
  const env = makeEnv();
  const p1 = await onRequestPost(ctx(PARTNER, env, req('https://x/api/time-off-review', { action:'deny', id:'good-id', denial_reason:'Conflict' })));
  const j1 = await p1.json();
  ok('deny good-id -> 200 ok',         p1.status === 200 && j1.ok === true, j1);
  ok('deny returns status=denied',     j1.status === 'denied', j1.status);

  // Already denied -> 409
  const p2 = await onRequestPost(ctx(PARTNER, env, req('https://x/api/time-off-review', { action:'deny', id:'already-id' })));
  ok('deny already-id -> 409',         p2.status === 409, p2.status);

  // Not found -> 404
  const p3 = await onRequestPost(ctx(PARTNER, env, req('https://x/api/time-off-review', { action:'deny', id:'no-id' })));
  ok('deny no-id -> 404',              p3.status === 404, p3.status);
}

// =============================================================================
// 6. SET-ALLOCATION
// =============================================================================
console.log('6. SET-ALLOCATION');
{
  const env = makeEnv();
  // Valid
  const p1 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', uid:'good-user', year:2026, allocated_days:10 })));
  const j1 = await p1.json();
  ok('set-alloc valid -> 200 ok',           p1.status === 200 && j1.ok === true, j1);
  ok('set-alloc returns uid/year/days',     j1.uid === 'good-user' && j1.year === 2026 && j1.allocated_days === 10, j1);

  // Unknown user -> 404
  const p2 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', uid:'nobody', year:2026, allocated_days:10 })));
  ok('set-alloc unknown user -> 404',       p2.status === 404, p2.status);

  // Bad year -> 400
  const p3 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', uid:'good-user', year:1900, allocated_days:10 })));
  ok('set-alloc bad year -> 400',           p3.status === 400, p3.status);

  // Negative days -> 400
  const p4 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', uid:'good-user', year:2026, allocated_days:-5 })));
  ok('set-alloc negative days -> 400',      p4.status === 400, p4.status);

  // Over-range days -> 400
  const p5 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', uid:'good-user', year:2026, allocated_days:999 })));
  ok('set-alloc over 365 days -> 400',      p5.status === 400, p5.status);

  // Missing uid -> 400
  const p6 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'set-allocation', year:2026, allocated_days:10 })));
  ok('set-alloc missing uid -> 400',        p6.status === 400, p6.status);
}

// =============================================================================
// 7. HARDENING
// =============================================================================
console.log('7. HARDENING');
{
  const env = makeEnv();
  // Wrong Content-Type
  const r1 = new Request('https://x/api/time-off-review', { method:'POST', headers:{ 'Content-Type':'text/plain' }, body:'{}' });
  const p1 = await onRequestPost(ctx(ADMIN, env, r1));
  ok('wrong Content-Type -> 415',       p1.status === 415, p1.status);

  // Cross-site (Sec-Fetch-Site: cross-site)
  const r2 = new Request('https://x/api/time-off-review', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Sec-Fetch-Site':'cross-site' },
    body: JSON.stringify({ action:'approve', id:'x' }),
  });
  const p2 = await onRequestPost(ctx(ADMIN, env, r2));
  ok('cross-site Sec-Fetch-Site -> 403', p2.status === 403, p2.status);

  // Mismatched Origin
  const r3 = new Request('https://x/api/time-off-review', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Origin':'https://evil.com', 'Host':'portal.pierfoundations.com' },
    body: JSON.stringify({ action:'approve', id:'x' }),
  });
  const p3 = await onRequestPost(ctx(ADMIN, env, r3));
  ok('mismatched Origin -> 403',         p3.status === 403, p3.status);

  // Payload too large
  const bigBody = JSON.stringify({ action: 'approve', id: 'x', pad: 'x'.repeat(9000) });
  const r4 = new Request('https://x/api/time-off-review', {
    method: 'POST', headers:{ 'Content-Type':'application/json' }, body: bigBody,
  });
  const p4 = await onRequestPost(ctx(ADMIN, env, r4));
  ok('payload >8192 -> 413',             p4.status === 413, p4.status);

  // Invalid JSON
  const r5 = new Request('https://x/api/time-off-review', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{not json' });
  const p5 = await onRequestPost(ctx(ADMIN, env, r5));
  ok('invalid JSON -> 400',              p5.status === 400, p5.status);

  // Unknown action
  const p6 = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'hack' })));
  ok('unknown action -> 400',            p6.status === 400, p6.status);
}

// =============================================================================
// 8. RATE LIMIT (60 actions/hr)
// =============================================================================
console.log('8. RATE LIMIT');
{
  // Shared KV so the counter accumulates across calls
  const kv = makeKV();
  // Seed: set count to 60 already so the NEXT call is over-limit
  const rlKey = 'tor_action:brad';
  const window = 3600_000;
  await kv.put(rlKey, JSON.stringify({ ts: Date.now(), count: 60 }));
  const env = makeEnv({ kv });
  const p = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'good-id' })));
  ok('61st approve -> 429 rate-limited',  p.status === 429, p.status);
}

// =============================================================================
// 9. NO DB (fail-closed)
// =============================================================================
console.log('9. FAIL-CLOSED');
{
  const env = makeEnv({ db: null });
  const g = await onRequestGet(ctx(ADMIN, env, req('https://x/api/time-off-review')));
  ok('GET no-DB -> 503',    g.status === 503, g.status);
  const p = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'x' })));
  ok('POST no-DB -> 503',   p.status === 503, p.status);
}

// =============================================================================
// 10. AREA PATH MAP
// =============================================================================
console.log('10. PATH MAP');
{
  ok("areaForPath('/api/time-off-review') === 'schedule_admin'",
     areaForPath('/api/time-off-review') === 'schedule_admin',
     areaForPath('/api/time-off-review'));
  ok("areaForPath('/api/time-off-review/') === 'schedule_admin'",
     areaForPath('/api/time-off-review/') === 'schedule_admin',
     areaForPath('/api/time-off-review/'));
}

// =============================================================================
// 11. SELF-REVIEW BLOCK (MED security fix)
// =============================================================================
console.log('11. SELF-REVIEW BLOCK');
{
  const env = makeEnv();
  // approve own request (self-id returns uid='brad', session uid='brad') → 403
  const pa = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'self-id' })));
  const ja = await pa.json();
  ok('approve self → 403',                  pa.status === 403, pa.status);
  ok('approve self error message',           ja.error === 'Another owner must review your own request.', ja.error);

  // deny own request → 403
  const pd = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'deny', id:'self-id' })));
  const jd = await pd.json();
  ok('deny self → 403',                     pd.status === 403, pd.status);
  ok('deny self error message',             jd.error === 'Another owner must review your own request.', jd.error);

  // approve another's request (good-id uid='crew-member', session uid='brad') → 200
  const po = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'good-id' })));
  ok('approve other → still 200',           po.status === 200, po.status);

  // deny another's request → 200
  const pdo = await onRequestPost(ctx(PARTNER, env, req('https://x/api/time-off-review', { action:'deny', id:'good-id' })));
  ok('deny other → still 200',              pdo.status === 200, pdo.status);
}

// =============================================================================
// 12. BLOCKER FIX — usedMap only counts type='Vacation' (client-side logic test)
// =============================================================================
console.log('12. USED-MAP VACATION-ONLY');
{
  // Replicate the renderAllocations usedMap logic exactly as fixed.
  const year = 2026;
  const requests = [
    { uid:'u1', type:'Vacation', status:'approved', start_date:'2026-07-01', day_count:3 },
    { uid:'u1', type:'Sick',     status:'approved', start_date:'2026-07-05', day_count:1 },
    { uid:'u1', type:'Home Day', status:'approved', start_date:'2026-07-10', day_count:1 },
    { uid:'u1', type:'Vacation', status:'pending',  start_date:'2026-08-01', day_count:2 },  // pending: not counted
    { uid:'u1', type:'Vacation', status:'approved', start_date:'2025-12-20', day_count:1 },  // prior year: not counted
  ];
  const usedMap = {};
  requests.forEach(function(r){
    if (r.type === 'Vacation' && r.status === 'approved' &&
        r.start_date && r.start_date.slice(0,4) === String(year)) {
      usedMap[r.uid] = (usedMap[r.uid] || 0) + (r.day_count || 0);
    }
  });
  ok('only approved Vacation in current year counted', usedMap['u1'] === 3, usedMap['u1']);
  ok('Sick days NOT counted in usedMap',               (usedMap['u1'] || 0) !== 5, usedMap['u1']); // would be 5 if Sick counted
  ok('pending Vacation NOT counted',                   (usedMap['u1'] || 0) !== 5, usedMap['u1']);
  ok('prior-year Vacation NOT counted',                (usedMap['u1'] || 0) !== 4, usedMap['u1']);
}

// =============================================================================
// 13. RATE LIMIT FAIL-CLOSED (no KV → 503, not skip)
// =============================================================================
console.log('13. RATE LIMIT NO-KV FAIL-CLOSED');
{
  // isRateLimited with no KV must return true → handler returns 503
  // (previously returned false → would have allowed the request)
  const env = makeEnv({ kv: null });  // no KV binding
  const p = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'approve', id:'good-id' })));
  ok('approve with no KV → 503 (fail-closed)',  p.status === 503, p.status);
  const pd = await onRequestPost(ctx(ADMIN, env, req('https://x/api/time-off-review', { action:'deny', id:'good-id' })));
  ok('deny with no KV → 503 (fail-closed)',     pd.status === 503, pd.status);
}

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
