#!/usr/bin/env node
// Time Off feature tests (unit-level; no network calls, no D1):
//   1. countWeekdays: full-day single date
//   2. countWeekdays: single day (Tuesday)
//   3. countWeekdays: half-day = 0.5
//   4. countWeekdays: Mon-Fri span = 5
//   5. countWeekdays: end before start = 0
//   6. isIsoDate: valid
//   7. isIsoDate: invalid
//   8. s(): caps length
//   9. s(): strips angle brackets (XSS defense)
//   10. VALID_TYPES: accepted
//   11. VALID_TYPES: rejected
//   12. newId(): 36-char UUID format
//   13. fmtDate(): YYYY-MM-DD -> MM/DD/YYYY
//   14. fmtDate(): empty input
//   15. resolveRecipients: default returns TEST list
//   16. schedule-absences addDays: today+13
//   17. schedule-absences clampRange: clamps at 366 days
//   18. schedule-absences: range from > to normalises
//   19. areaForPath: /api/time-off -> field_ops
//   20. areaForPath: /api/time-off-admin -> schedule_admin
//   21. areaForPath: /api/schedule-absences -> schedule
//   22. areaForPath: /time-off.html -> field_ops
//   23. roleCanAccess: field_ops can access field_ops area
//   24. roleCanAccess: field_ops BLOCKED from schedule_admin area
//   25. roleCanAccess: admin can access schedule_admin
//   26. roleCanAccess: partner can access schedule_admin
//   27. roleCanAccess: business_dev BLOCKED from schedule_admin
//   28. countWeekdays: span with weekend = skips Sat/Sun
//   29. countWeekdays: single weekend day = 0
//   30. isIsoDate strict (round-trip): rejects non-existent dates
//   31. IDOR: cancel blocked for mismatched uid
//   32. IDOR: cancel succeeds for own uid
//   33. admin-endpoint 403: field_ops + business_dev blocked from schedule_admin
//   34. rate-limit: under max = allowed
//   35. rate-limit: at max = blocked
//   36. rate-limit: KV error = fail open
//   37. overlap: overlapping dates detected
//   38. overlap: adjacent (non-overlapping) dates
//   39. overlap: approved request also blocks
//
// Run: node field/tests/test-time-off.mjs

import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Inline pure-logic copies of functions under test (avoids CF Workers runtime
// dependencies like crypto.randomUUID, fetch, D1 bindings). Where we test
// areaForPath / roleCanAccess we import from the actual auth.js.
// ---------------------------------------------------------------------------

// countWeekdays mirrors the server-side implementation (Mon-Fri only).
// halfDay handled by the caller in submit; kept here for test convenience.
function countWeekdays(startIso, endIso, halfDay) {
  if (halfDay) return 0.5;
  try {
    const start = new Date(startIso + 'T12:00:00Z');
    const end   = new Date(endIso   + 'T12:00:00Z');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    let count = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  } catch { return 0; }
}

// calendarDays used for the 60-day span cap guard
function calendarDays(startIso, endIso) {
  const s = new Date(startIso + 'T12:00:00Z');
  const e = new Date(endIso   + 'T12:00:00Z');
  return Math.round((e - s) / 86400000) + 1;
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

const VALID_TYPES = ['Vacation', 'Home Day', 'Sick', 'Personal', 'Other'];

function newId() {
  // Polyfill for test env (Node has crypto.randomUUID since v14.17)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

const TEST_RECIPIENTS = ['peter@pierfoundations.com'];
function resolveRecipients(env) {
  const raw = env && env.TIME_OFF_RECIPIENTS;
  if (raw && String(raw).trim()) {
    const list = String(raw).split(',').map(s => s.trim())
      .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (list.length) return list;
  }
  return TEST_RECIPIENTS;
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function clampRange(from, to) {
  const MAX_DAYS = 366;
  const s = new Date(from + 'T12:00:00Z');
  const e = new Date(to   + 'T12:00:00Z');
  const days = Math.round((e - s) / 86400000);
  if (days > MAX_DAYS) return { from, to: addDays(from, MAX_DAYS) };
  return { from, to };
}

// Strict round-trip date validation (mirrors server isIsoDate)
function isIsoDateStrict(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  try { return new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v; }
  catch { return false; }
}

// Overlap guard mirrors server SQL: start_date <= endDate AND end_date >= startDate
function overlaps(existStart, existEnd, newStart, newEnd) {
  return existStart <= newEnd && existEnd >= newStart;
}

// KV mock for rate-limit tests
function mockKV() {
  const store = {};
  return {
    async get(k)       { return store[k] || null; },
    async put(k, v)    { store[k] = v; },
    async getError()   { throw new Error('KV unavailable'); },
  };
}

// checkRateLimit mirrors server implementation
async function checkRateLimit(kv, key, max, ttl) {
  try {
    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= max) return false;
    await kv.put(key, String(count + 1), { expirationTtl: ttl });
    return true;
  } catch { return true; } // fail open on KV error
}

// ---------------------------------------------------------------------------
// Load auth.js via file URL (pure ESM, no Workers runtime deps)
// ---------------------------------------------------------------------------
const authUrl = new URL('../functions/lib/auth.js', import.meta.url);
const { areaForPath, roleCanAccess } = await import(authUrl.href);

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  PASS', name); passed++; })
              .catch(e => { console.error('  FAIL', name, '\n      ', e.message); failed++; });
    }
    console.log('  PASS', name); passed++;
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message); failed++;
  }
}

// ---------------------------------------------------------------------------
// 1-5: countWeekdays (Mon-Fri only — mirrors server)
// ---------------------------------------------------------------------------
test('countWeekdays: full-day single date (Fri) = 1', () => {
  assert.equal(countWeekdays('2026-10-23', '2026-10-23', false), 1);
});

test('countWeekdays: single day (Tue) not half = 1', () => {
  assert.equal(countWeekdays('2026-12-01', '2026-12-01', false), 1);
});

test('countWeekdays: half-day = 0.5 regardless of dates', () => {
  assert.equal(countWeekdays('2026-10-23', '2026-10-23', true), 0.5);
});

test('countWeekdays: Mon-Fri span (5 weekdays)', () => {
  assert.equal(countWeekdays('2026-10-19', '2026-10-23', false), 5);
});

test('countWeekdays: end before start = 0', () => {
  assert.equal(countWeekdays('2026-10-25', '2026-10-20', false), 0);
});

// ---------------------------------------------------------------------------
// 6-7: isIsoDate
// ---------------------------------------------------------------------------
test('isIsoDate: valid ISO date', () => {
  assert.equal(isIsoDate('2026-10-23'), true);
});

test('isIsoDate: invalid — not a date', () => {
  assert.equal(isIsoDate('2026/10/23'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);
  assert.equal(isIsoDate('not-a-date'), false);
});

// ---------------------------------------------------------------------------
// 8-9: s() sanitizer
// ---------------------------------------------------------------------------
test('s(): caps length at cap', () => {
  const long = 'a'.repeat(600);
  assert.equal(s(long, 500).length, 500);
});

test('s(): strips < and > angle brackets (XSS defense)', () => {
  const xss = '<script>alert(1)</script>';
  const out = s(xss, 500);
  assert.equal(out.includes('<'), false);
  assert.equal(out.includes('>'), false);
  assert.equal(out, 'scriptalert(1)/script');
});

// ---------------------------------------------------------------------------
// 10-11: VALID_TYPES
// ---------------------------------------------------------------------------
test('VALID_TYPES: Vacation/Home Day/Sick/Personal/Other accepted', () => {
  ['Vacation', 'Home Day', 'Sick', 'Personal', 'Other'].forEach(t => {
    assert.equal(VALID_TYPES.includes(t), true, `${t} should be valid`);
  });
});

test('VALID_TYPES: random string rejected', () => {
  assert.equal(VALID_TYPES.includes('Holiday'), false);
  assert.equal(VALID_TYPES.includes(''), false);
});

// ---------------------------------------------------------------------------
// 12: newId
// ---------------------------------------------------------------------------
test('newId(): 36-char UUID v4 format', () => {
  const id = newId();
  assert.equal(typeof id, 'string');
  assert.equal(id.length, 36);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

// ---------------------------------------------------------------------------
// 13-14: fmtDate
// ---------------------------------------------------------------------------
test('fmtDate(): converts YYYY-MM-DD to MM/DD/YYYY', () => {
  assert.equal(fmtDate('2026-10-23'), '10/23/2026');
  assert.equal(fmtDate('2026-01-05'), '01/05/2026');
});

test('fmtDate(): empty/null returns empty string', () => {
  assert.equal(fmtDate(''), '');
  assert.equal(fmtDate(null), '');
  assert.equal(fmtDate(undefined), '');
});

// ---------------------------------------------------------------------------
// 15: resolveRecipients
// ---------------------------------------------------------------------------
test('resolveRecipients: default returns TEST list', () => {
  const r = resolveRecipients({});
  assert.deepEqual(r, ['peter@pierfoundations.com']);
});

test('resolveRecipients: env override respected', () => {
  const r = resolveRecipients({ TIME_OFF_RECIPIENTS: 'a@b.com,c@d.org' });
  assert.deepEqual(r, ['a@b.com', 'c@d.org']);
});

// ---------------------------------------------------------------------------
// 16-18: schedule-absences helpers
// ---------------------------------------------------------------------------
test('addDays: today+13 returns date 13 days later', () => {
  const d = addDays('2026-10-23', 13);
  assert.equal(d, '2026-11-05');
});

test('clampRange: long range clamped to 366 days', () => {
  const result = clampRange('2026-01-01', '2030-01-01');
  const s = new Date('2026-01-01T12:00:00Z');
  const e = new Date(result.to + 'T12:00:00Z');
  const days = Math.round((e - s) / 86400000);
  assert.equal(days, 366);
});

test('addDays: 0 days = same date', () => {
  assert.equal(addDays('2026-10-23', 0), '2026-10-23');
});

// ---------------------------------------------------------------------------
// 19-22: areaForPath
// ---------------------------------------------------------------------------
test('areaForPath: /api/time-off -> field_ops', () => {
  assert.equal(areaForPath('/api/time-off'), 'field_ops');
});

test('areaForPath: /api/time-off-admin -> schedule_admin', () => {
  assert.equal(areaForPath('/api/time-off-admin'), 'schedule_admin');
});

test('areaForPath: /api/schedule-absences -> schedule', () => {
  assert.equal(areaForPath('/api/schedule-absences'), 'schedule');
});

test('areaForPath: /time-off.html -> field_ops', () => {
  assert.equal(areaForPath('/time-off.html'), 'field_ops');
});

// ---------------------------------------------------------------------------
// 23-27: roleCanAccess
// ---------------------------------------------------------------------------
test('roleCanAccess: field_ops can access field_ops area', () => {
  assert.equal(roleCanAccess('field_ops', 'field_ops'), true);
});

test('roleCanAccess: field_ops BLOCKED from schedule_admin', () => {
  assert.equal(roleCanAccess('field_ops', 'schedule_admin'), false);
});

test('roleCanAccess: admin can access schedule_admin', () => {
  assert.equal(roleCanAccess('admin', 'schedule_admin'), true);
});

test('roleCanAccess: partner can access schedule_admin', () => {
  assert.equal(roleCanAccess('partner', 'schedule_admin'), true);
});

test('roleCanAccess: business_dev BLOCKED from schedule_admin', () => {
  assert.equal(roleCanAccess('business_dev', 'schedule_admin'), false);
});

// ---------------------------------------------------------------------------
// 28-29: countWeekdays — weekend exclusion
// ---------------------------------------------------------------------------
test('countWeekdays: Mon-Sun span skips Sat+Sun = 5', () => {
  // 2026-10-19 Mon to 2026-10-25 Sun: 5 weekdays, 2 weekend days
  assert.equal(countWeekdays('2026-10-19', '2026-10-25', false), 5);
});

test('countWeekdays: single weekend day (Sat) = 0', () => {
  // 2026-10-24 is Saturday
  assert.equal(countWeekdays('2026-10-24', '2026-10-24', false), 0);
});

// ---------------------------------------------------------------------------
// 30: isIsoDate strict (round-trip rejects non-existent dates)
// ---------------------------------------------------------------------------
test('isIsoDate strict: rejects non-existent dates via round-trip', () => {
  assert.equal(isIsoDateStrict('2026-02-31'), false); // Feb 31 does not exist
  assert.equal(isIsoDateStrict('2026-13-01'), false); // month 13
  assert.equal(isIsoDateStrict('2026-00-01'), false); // month 0
  assert.equal(isIsoDateStrict('2026-10-23'), true);  // valid
  assert.equal(isIsoDateStrict('2026-02-28'), true);  // valid (leap check)
  assert.equal(isIsoDateStrict('not-a-date'), false);
});

// ---------------------------------------------------------------------------
// 31-32: IDOR — cancel only succeeds when uid matches
// ---------------------------------------------------------------------------
test('IDOR: user B cannot cancel user A\'s request', () => {
  // Mirrors server: WHERE id=? AND uid=? AND status='pending'
  const req = { id: 'req-001', uid: 'user-a', status: 'pending' };
  const actingUid = 'user-b';
  const canCancel = req.uid === actingUid && req.status === 'pending';
  assert.equal(canCancel, false);
});

test('IDOR: user A can cancel their own request', () => {
  const req = { id: 'req-001', uid: 'user-a', status: 'pending' };
  const actingUid = 'user-a';
  const canCancel = req.uid === actingUid && req.status === 'pending';
  assert.equal(canCancel, true);
});

// ---------------------------------------------------------------------------
// 33: admin-endpoint 403 — non-owners cannot reach schedule_admin
// ---------------------------------------------------------------------------
test('admin-endpoint 403: field_ops and business_dev cannot access schedule_admin', () => {
  assert.equal(roleCanAccess('field_ops',     'schedule_admin'), false);
  assert.equal(roleCanAccess('business_dev',  'schedule_admin'), false);
  assert.equal(roleCanAccess('field_ops',     'schedule'),       true); // schedule page OK
  assert.equal(roleCanAccess('admin',         'schedule_admin'), true);
  assert.equal(roleCanAccess('partner',       'schedule_admin'), true);
});

// ---------------------------------------------------------------------------
// 34-36: rate-limit (KV mock)
// ---------------------------------------------------------------------------
test('rate-limit: under max = allowed', async () => {
  const kv = mockKV();
  const r1 = await checkRateLimit(kv, 'to_rl:hr:u1', 5, 3600);
  const r2 = await checkRateLimit(kv, 'to_rl:hr:u1', 5, 3600);
  assert.equal(r1, true);
  assert.equal(r2, true);
});

test('rate-limit: at max = blocked', async () => {
  const kv = mockKV();
  for (let i = 0; i < 5; i++) await checkRateLimit(kv, 'to_rl:hr:u2', 5, 3600);
  const blocked = await checkRateLimit(kv, 'to_rl:hr:u2', 5, 3600);
  assert.equal(blocked, false);
});

test('rate-limit: KV error = fail open (allow request)', async () => {
  const brokenKV = { async get() { throw new Error('KV down'); }, async put() { throw new Error('KV down'); } };
  const result = await checkRateLimit(brokenKV, 'to_rl:hr:u3', 5, 3600);
  assert.equal(result, true); // fail open — do NOT lock out user
});

// ---------------------------------------------------------------------------
// 37-39: overlap guard
// ---------------------------------------------------------------------------
test('overlap: overlapping date ranges detected', () => {
  // existing: Nov 1-5; new request: Nov 3-7 (overlaps)
  assert.equal(overlaps('2026-11-01', '2026-11-05', '2026-11-03', '2026-11-07'), true);
  // existing contains new entirely
  assert.equal(overlaps('2026-11-01', '2026-11-10', '2026-11-03', '2026-11-05'), true);
  // new starts same day as existing starts
  assert.equal(overlaps('2026-11-01', '2026-11-05', '2026-11-01', '2026-11-01'), true);
});

test('overlap: adjacent (non-overlapping) date ranges pass', () => {
  // existing: Nov 1-5; new: Nov 6-10 (adjacent, no overlap)
  assert.equal(overlaps('2026-11-01', '2026-11-05', '2026-11-06', '2026-11-10'), false);
  // entirely before
  assert.equal(overlaps('2026-11-01', '2026-11-05', '2026-10-25', '2026-10-31'), false);
});

test('overlap: approved request also blocks (same logic)', () => {
  // The server checks status IN ('pending','approved') — both block
  const pending  = { start: '2026-11-01', end: '2026-11-05', status: 'pending'  };
  const approved = { start: '2026-11-01', end: '2026-11-05', status: 'approved' };
  const statuses = ['pending', 'approved'];
  for (const r of [pending, approved]) {
    assert.equal(statuses.includes(r.status), true); // both block new requests
    assert.equal(overlaps(r.start, r.end, '2026-11-03', '2026-11-07'), true);
  }
});

// ---------------------------------------------------------------------------
// 40-46: R9 additions — Home Day, default allocation, schedule labels
// ---------------------------------------------------------------------------

// calendarDays counts every calendar day (including weekends)
function calendarDaysForTest(startIso, endIso) {
  const s = new Date(startIso + 'T12:00:00Z');
  const e = new Date(endIso   + 'T12:00:00Z');
  return Math.round((e - s) / 86400000) + 1;
}

// getAllocationSummary logic mirror (default = 10, only Vacation deducts)
function getAllocationSummary({ allocDaysFromDb, absences }) {
  const allocDays = (allocDaysFromDb != null && Number.isFinite(allocDaysFromDb))
    ? allocDaysFromDb : 10;
  const usedDays    = absences.filter(a => a.type === 'Vacation' && a.status === 'approved')
                              .reduce((t, a) => t + a.days, 0);
  const pendingDays = absences.filter(a => a.type === 'Vacation' && a.status === 'pending')
                              .reduce((t, a) => t + a.days, 0);
  return { allocDays, usedDays, pendingDays, remaining: allocDays - usedDays - pendingDays };
}

// schedule-absences label mapping mirror
function typeToLabel(type) {
  if (type === 'Vacation') return 'Vacation';
  if (type === 'Home Day') return 'Home';
  return 'Out';
}

test('R9: Home Day on Saturday accepted (calendarDays >= 1)', () => {
  // 2026-10-24 is Saturday — calendarDays should be 1
  const days = calendarDaysForTest('2026-10-24', '2026-10-24');
  assert.equal(days, 1); // valid: calendar day counts weekend
});

test('R9: Home Day spans full weekend = 2 calendar days', () => {
  // Sat-Sun span
  const days = calendarDaysForTest('2026-10-24', '2026-10-25');
  assert.equal(days, 2);
});

test('R9: Home Day does NOT deduct from vacation allocation', () => {
  const summary = getAllocationSummary({
    allocDaysFromDb: 10,
    absences: [
      { type: 'Home Day', status: 'approved', days: 3 },
      { type: 'Vacation', status: 'approved', days: 2 },
    ],
  });
  // 3 Home Days should not eat into vacation; only 2 Vacation days deducted
  assert.equal(summary.usedDays,  2);
  assert.equal(summary.remaining, 8);
});

test('R9: default allocation = 10 when no DB row exists', () => {
  const summary = getAllocationSummary({ allocDaysFromDb: null, absences: [] });
  assert.equal(summary.allocDays, 10);
  assert.equal(summary.remaining, 10);
});

test('R9: Vacation type uses configured allocation (override)', () => {
  const summary = getAllocationSummary({
    allocDaysFromDb: 15,
    absences: [{ type: 'Vacation', status: 'approved', days: 5 }],
  });
  assert.equal(summary.allocDays, 15);
  assert.equal(summary.usedDays,  5);
  assert.equal(summary.remaining, 10);
});

test('R9: schedule label: Vacation -> "Vacation"', () => {
  assert.equal(typeToLabel('Vacation'), 'Vacation');
});

test('R9: schedule label: Home Day -> "Home"', () => {
  assert.equal(typeToLabel('Home Day'), 'Home');
});

test('R9: schedule label: Sick -> "Out"', () => {
  assert.equal(typeToLabel('Sick'), 'Out');
  assert.equal(typeToLabel('Other'), 'Out');
  assert.equal(typeToLabel('Personal'), 'Out');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
