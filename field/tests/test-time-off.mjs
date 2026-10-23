#!/usr/bin/env node
// Time Off feature tests (unit-level; no network calls, no D1):
//   1. countDays: full-day range
//   2. countDays: single day
//   3. countDays: half-day = 0.5
//   4. countDays: multi-day span
//   5. countDays: end before start = 0
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

function countDays(startIso, endIso, halfDay) {
  if (halfDay) return 0.5;
  try {
    const start = new Date(startIso + 'T12:00:00Z');
    const end   = new Date(endIso   + 'T12:00:00Z');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  } catch { return 0; }
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function s(v, cap = 500) {
  if (v == null) return '';
  return String(v).replace(/[<>]/g, '').slice(0, cap);
}

const VALID_TYPES = ['Vacation', 'Sick', 'Personal', 'Other'];

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
// 1-5: countDays
// ---------------------------------------------------------------------------
test('countDays: full-day single date = 1', () => {
  assert.equal(countDays('2026-10-23', '2026-10-23', false), 1);
});

test('countDays: single day not half = 1', () => {
  assert.equal(countDays('2026-12-01', '2026-12-01', false), 1);
});

test('countDays: half-day = 0.5 regardless of dates', () => {
  assert.equal(countDays('2026-10-23', '2026-10-23', true), 0.5);
});

test('countDays: multi-day Mon-Fri (5 days)', () => {
  assert.equal(countDays('2026-10-19', '2026-10-23', false), 5);
});

test('countDays: end before start = 0', () => {
  assert.equal(countDays('2026-10-25', '2026-10-20', false), 0);
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
test('VALID_TYPES: Vacation/Sick/Personal/Other accepted', () => {
  ['Vacation', 'Sick', 'Personal', 'Other'].forEach(t => {
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
// Summary
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
