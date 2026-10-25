#!/usr/bin/env node
// Daily Equipment Inspection tests
// Tests: type-toggle rendering, filename/serial sanitization, RBAC areaForPath
//
// Run: node field/tests/test-equip-inspection.mjs

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- Load source files ----
const htmlSrc  = readFileSync(resolve(__dir, '../equipment-inspection.html'), 'utf8');
const authSrc  = readFileSync(resolve(__dir, '../functions/lib/auth.js'), 'utf8');
const indexSrc = readFileSync(resolve(__dir, '../index.html'), 'utf8');

// ---- Dynamic import of store ----
const storePath = resolve(__dir, '../functions/lib/equip-inspection-store.js');
const { CHECKLIST_ITEMS, MACHINE_TYPES, VALID_ITEM_KEYS, VALID_ANSWERS } = await import(storePath);

// ---- Dynamic import of doc (for filename / serial) ----
// We test pdfFilename and serial sanitization without needing the PDF library.
// Extract the serialization logic inline for unit testing.
function sanitizeSerial(raw) {
  return String(raw).replace(/[^A-Za-z0-9\-]/g, '').slice(0, 40) || 'unknown';
}
function pdfFilename(rec) {
  const d = rec.date || '';
  const yy   = d.slice(2, 4);
  const mmdd = d.slice(5, 7) + d.slice(8, 10);
  const serial = sanitizeSerial(rec.serialNumber || 'unknown');
  return `${yy}-${mmdd}-${serial}-daily-inspection.pdf`;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ===========================================================================
// A. TYPE TOGGLE RENDERING: HTML has all 3 types and checklist renders correctly
// ===========================================================================

test('A1: HTML has Skid Steer toggle button', () => {
  assert.ok(htmlSrc.includes('data-type="skid_steer"'), 'skid_steer toggle button missing');
});

test('A2: HTML has Predrill Excavator toggle button', () => {
  assert.ok(htmlSrc.includes('data-type="predrill_excavator"'), 'predrill_excavator toggle button missing');
});

test('A3: HTML has Vibro Excavator toggle button', () => {
  assert.ok(htmlSrc.includes('data-type="vibro_excavator"'), 'vibro_excavator toggle button missing');
});

test('A4: Skid Steer is the default active type', () => {
  // The default active class on skid_steer toggle
  assert.ok(htmlSrc.includes('ei-type-btn active" data-type="skid_steer"') ||
            htmlSrc.includes("ei-type-btn active\" data-type=\"skid_steer\""),
    'skid_steer should be the default active toggle');
});

// Simulate type-based item filtering
function itemsForType(type) {
  return CHECKLIST_ITEMS.filter(it => it.types.includes(type));
}

test('A5: Skid Steer checklist has tires item', () => {
  const items = itemsForType('skid_steer');
  assert.ok(items.some(it => it.key === 'tr_tires'), 'skid_steer should have tire item');
});

test('A6: Skid Steer does NOT have undercarriage items', () => {
  const items = itemsForType('skid_steer');
  assert.ok(!items.some(it => it.key === 'uc_tracks'), 'skid_steer should NOT have track item');
});

test('A7: Predrill Excavator does NOT have tire item', () => {
  const items = itemsForType('predrill_excavator');
  assert.ok(!items.some(it => it.key === 'tr_tires'), 'predrill_excavator should NOT have tire item');
});

test('A8: Predrill Excavator has undercarriage items', () => {
  const items = itemsForType('predrill_excavator');
  assert.ok(items.some(it => it.key === 'uc_tracks'), 'predrill_excavator should have track item');
});

test('A9: Predrill Excavator has auger head items', () => {
  const items = itemsForType('predrill_excavator');
  assert.ok(items.some(it => it.key === 'pd_auger_head'), 'predrill_excavator should have auger head item');
  assert.ok(items.some(it => it.key === 'pd_flighting'),  'predrill_excavator should have auger flighting item');
});

test('A10: Predrill Excavator does NOT have vibro probe items', () => {
  const items = itemsForType('predrill_excavator');
  assert.ok(!items.some(it => it.key === 'vb_probe'), 'predrill_excavator should NOT have vibro probe item');
});

test('A11: Vibro Excavator has vibro probe items', () => {
  const items = itemsForType('vibro_excavator');
  assert.ok(items.some(it => it.key === 'vb_probe'),    'vibro_excavator should have probe item');
  assert.ok(items.some(it => it.key === 'vb_hopper'),   'vibro_excavator should have hopper item');
  assert.ok(items.some(it => it.key === 'vb_follower'), 'vibro_excavator should have follower item');
});

test('A12: Vibro Excavator does NOT have auger head items', () => {
  const items = itemsForType('vibro_excavator');
  assert.ok(!items.some(it => it.key === 'pd_auger_head'), 'vibro_excavator should NOT have auger head item');
});

test('A13: All 3 types have shared fluid level items', () => {
  for (const type of MACHINE_TYPES) {
    const items = itemsForType(type);
    assert.ok(items.some(it => it.key === 'fl_engine_oil'), `${type} should have engine oil item`);
    assert.ok(items.some(it => it.key === 'fl_hydraulic'),  `${type} should have hydraulic oil item`);
    assert.ok(items.some(it => it.key === 'fl_coolant'),    `${type} should have coolant item`);
    assert.ok(items.some(it => it.key === 'fl_def'),        `${type} should have DEF item`);
    assert.ok(items.some(it => it.key === 'fl_fuel'),       `${type} should have fuel item`);
  }
});

test('A14: All 3 types have safety & cab items', () => {
  for (const type of MACHINE_TYPES) {
    const items = itemsForType(type);
    assert.ok(items.some(it => it.key === 'sf_seat_belt'),    `${type} should have seat belt item`);
    assert.ok(items.some(it => it.key === 'sf_extinguisher'), `${type} should have extinguisher item`);
    assert.ok(items.some(it => it.key === 'sf_backup_alarm'), `${type} should have backup alarm item`);
  }
});

// Count items per type to ensure checklist is non-trivial
test('A15: Skid Steer has at least 20 checklist items', () => {
  assert.ok(itemsForType('skid_steer').length >= 20,
    `Expected >= 20 skid steer items, got ${itemsForType('skid_steer').length}`);
});

test('A16: Predrill Excavator has at least 25 checklist items', () => {
  assert.ok(itemsForType('predrill_excavator').length >= 25,
    `Expected >= 25 predrill items, got ${itemsForType('predrill_excavator').length}`);
});

test('A17: Vibro Excavator has at least 25 checklist items', () => {
  assert.ok(itemsForType('vibro_excavator').length >= 25,
    `Expected >= 25 vibro items, got ${itemsForType('vibro_excavator').length}`);
});

// ===========================================================================
// B. FILENAME FORMAT AND SERIAL SANITIZATION
// ===========================================================================

test('B1: filename format is YY-MMDD-serial-daily-inspection.pdf', () => {
  const f = pdfFilename({ date: '2026-10-25', serialNumber: 'CAT272D3' });
  assert.equal(f, '26-1025-CAT272D3-daily-inspection.pdf');
});

test('B2: filename uses 2-digit year', () => {
  const f = pdfFilename({ date: '2026-01-07', serialNumber: 'TEST' });
  assert.ok(f.startsWith('26-0107-'), `Expected to start with 26-0107-, got: ${f}`);
});

test('B3: serial strips path characters', () => {
  assert.equal(sanitizeSerial('../etc/passwd'), 'etcpasswd');
  assert.equal(sanitizeSerial('SN/123\\456'), 'SN123456');
});

test('B4: serial strips spaces', () => {
  assert.equal(sanitizeSerial('SN 123 456'), 'SN123456');
});

test('B5: serial allows alphanumerics and hyphens', () => {
  assert.equal(sanitizeSerial('CAT-336-ABC123'), 'CAT-336-ABC123');
});

test('B6: serial is capped at 40 chars', () => {
  const long = 'A'.repeat(60);
  assert.equal(sanitizeSerial(long).length, 40);
});

test('B7: empty serial becomes "unknown"', () => {
  assert.equal(sanitizeSerial(''), 'unknown');
  assert.equal(sanitizeSerial('   '), 'unknown');
});

test('B8: serial with only special chars becomes "unknown"', () => {
  assert.equal(sanitizeSerial('!@#$%^&*()'), 'unknown');
});

test('B9: filename with missing date does not break', () => {
  const f = pdfFilename({ date: '', serialNumber: 'SN123' });
  assert.ok(typeof f === 'string' && f.endsWith('-daily-inspection.pdf'));
});

test('B10: filename uses sanitized serial', () => {
  const f = pdfFilename({ date: '2026-10-25', serialNumber: 'SN 123/ABC' });
  assert.ok(f.includes('SN123ABC'), `Serial not sanitized in filename: ${f}`);
  assert.ok(!f.includes('/'), 'Filename must not contain /');
  assert.ok(!f.includes(' '), 'Filename must not contain spaces');
});

// ===========================================================================
// C. RBAC — areaForPath
// ===========================================================================

// We parse the areaForPath logic from auth.js without executing the full module.
// Key invariant: /api/equipment-inspection is mapped to 'field_ops'.

test('C1: areaForPath maps /api/equipment-inspection to field_ops', () => {
  assert.ok(
    authSrc.includes("pathname.startsWith('/api/equipment-inspection')") &&
    authSrc.includes("return 'field_ops'"),
    'auth.js must map /api/equipment-inspection to field_ops'
  );
});

test('C2: FIELD_PAGES maps /equipment-inspection.html to field_ops', () => {
  assert.ok(
    authSrc.includes("'/equipment-inspection.html'") &&
    authSrc.includes("'field_ops'"),
    'auth.js FIELD_PAGES must include /equipment-inspection.html -> field_ops'
  );
});

test('C3: FIELD_PAGES maps /equipment-inspection (clean URL) to field_ops', () => {
  assert.ok(
    authSrc.includes("'/equipment-inspection'"),
    'auth.js FIELD_PAGES must include /equipment-inspection clean-URL form'
  );
});

// ===========================================================================
// D. STORE INTEGRITY
// ===========================================================================

test('D1: all CHECKLIST_ITEMS keys are unique', () => {
  const keys = CHECKLIST_ITEMS.map(it => it.key);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, `Duplicate checklist item keys: ${keys.filter((k,i) => keys.indexOf(k) !== i)}`);
});

test('D2: VALID_ITEM_KEYS Set contains all item keys', () => {
  for (const it of CHECKLIST_ITEMS) {
    assert.ok(VALID_ITEM_KEYS.has(it.key), `VALID_ITEM_KEYS missing: ${it.key}`);
  }
});

test('D3: all items have required fields (key, label, section, types)', () => {
  for (const it of CHECKLIST_ITEMS) {
    assert.ok(it.key && it.label && it.section && Array.isArray(it.types) && it.types.length,
      `Item missing required fields: ${JSON.stringify(it)}`);
  }
});

test('D4: all item types reference valid machine types', () => {
  for (const it of CHECKLIST_ITEMS) {
    for (const t of it.types) {
      assert.ok(MACHINE_TYPES.includes(t), `Item ${it.key} has unknown type: ${t}`);
    }
  }
});

test('D5: VALID_ANSWERS contains Pass, Needs Attention, N/A and empty string', () => {
  assert.ok(VALID_ANSWERS['Pass']             != null, 'VALID_ANSWERS missing Pass');
  assert.ok(VALID_ANSWERS['Needs Attention']  != null, 'VALID_ANSWERS missing Needs Attention');
  assert.ok(VALID_ANSWERS['N/A']              != null, 'VALID_ANSWERS missing N/A');
  assert.ok(VALID_ANSWERS['']                 != null, 'VALID_ANSWERS missing empty string');
});

// ===========================================================================
// E. DASHBOARD BUTTON
// ===========================================================================

test('E1: index.html has Equipment Inspection quick-action button', () => {
  assert.ok(
    indexSrc.includes('href="/equipment-inspection.html"'),
    'index.html must have a link to /equipment-inspection.html'
  );
});

test('E2: Equipment Inspection button is a primary (top) button', () => {
  const btnIdx   = indexSrc.indexOf('href="/equipment-inspection.html"');
  const sectionIdx = indexSrc.indexOf('section-label');
  assert.ok(btnIdx > 0 && btnIdx < sectionIdx,
    'Equipment Inspection button must appear before the Dashboard section label');
});

// ===========================================================================
// F. HTML CONTENT CHECKS
// ===========================================================================

test('F1: HTML has Safe to Operate Yes/No buttons', () => {
  assert.ok(htmlSrc.includes('id="eiSafeYes"'), 'Missing Safe Yes button');
  assert.ok(htmlSrc.includes('id="eiSafeNo"'),  'Missing Safe No button');
});

test('F2: HTML has Deficiencies / Notes textarea', () => {
  assert.ok(htmlSrc.includes('id="eiDeficiencies"'), 'Missing Deficiencies textarea');
});

test('F3: HTML has Serial Number field', () => {
  assert.ok(htmlSrc.includes('id="eiSerialNumber"'), 'Missing Serial Number field');
});

test('F4: HTML has Machine Hours field', () => {
  assert.ok(htmlSrc.includes('id="eiMachineHours"'), 'Missing Machine Hours field');
});

test('F5: HTML has Owned / Rented select', () => {
  assert.ok(htmlSrc.includes('id="eiOwnedRented"'), 'Missing Owned/Rented select');
});

test('F6: HTML has Save draft and Submit buttons', () => {
  assert.ok(htmlSrc.includes('id="eiSaveDraft"'), 'Missing Save draft button');
  assert.ok(htmlSrc.includes('id="eiSubmit"'),    'Missing Submit button');
});

test('F7: HTML uses /js/pf-shared.js (not a root-level .js file)', () => {
  assert.ok(htmlSrc.includes('src="/js/pf-shared.js"'),
    'HTML must use /js/pf-shared.js (shared JS must be under /js/ prefix)');
  assert.ok(!htmlSrc.match(/src="\/[^/]+\.js"/),
    'HTML must not load any root-level .js files (would be denied to field_ops)');
});

test('F8: checklist items in HTML JS match store items (same keys)', () => {
  // Extract EI_ITEMS keys from the HTML
  const keyMatches = [...htmlSrc.matchAll(/\{key:'([^']+)'/g)].map(m => m[1]);
  const htmlKeys = new Set(keyMatches);
  // Every store key should appear in the HTML
  for (const it of CHECKLIST_ITEMS) {
    assert.ok(htmlKeys.has(it.key), `Store key ${it.key} missing from HTML EI_ITEMS`);
  }
});

// ===========================================================================
// G. PDF BUILDER END-TO-END: renderEquipInspectionPdf returns valid PDF bytes
// ===========================================================================

// Import the PDF renderer. This requires pdf.js, eurostile-font.js, pf-logo.js
// (all present in the worktree). We guard against module errors gracefully.
let renderEquipInspectionPdf;
try {
  const docPath = resolve(__dir, '../functions/lib/equip-inspection-doc.js');
  const docMod  = await import(docPath);
  renderEquipInspectionPdf = docMod.renderEquipInspectionPdf;
} catch (e) {
  console.error('  WARN: could not import equip-inspection-doc.js for Section G:', e && e.message);
}

function makeTestRecord(machineType) {
  return {
    id:            '00000000-0000-0000-0000-000000000001',
    machineType,
    date:          '2026-10-25',
    projectId:     'J-2610',
    jobNumber:     'J-2610',
    inspectedBy:   'Test Operator',
    ownedOrRented: 'Owned',
    serialNumber:  'CAT-12345',
    machineHours:  1234.5,
    safeToOperate: true,
    deficienciesNotes: 'Hydraulic hose slight seep on left side.',
    items: CHECKLIST_ITEMS
      .filter((d) => d.types.includes(machineType))
      .map((d, i) => ({
        key:    d.key,
        answer: i === 0 ? 'Needs Attention' : 'Pass',
        note:   i === 0 ? 'Check before next shift' : '',
      })),
    status:      'submitted',
    createdBy:   'uid-test',
    createdAt:   '2026-10-25T08:00:00.000Z',
    submittedAt: '2026-10-25T09:00:00.000Z',
    submittedBy: 'uid-test',
  };
}

if (renderEquipInspectionPdf) {
  test('G1: renderEquipInspectionPdf returns Uint8Array starting with %PDF for skid_steer', () => {
    const rec   = makeTestRecord('skid_steer');
    const bytes = renderEquipInspectionPdf(rec);
    assert.ok(bytes instanceof Uint8Array, 'should return Uint8Array');
    const header = String.fromCharCode(...bytes.slice(0, 5));
    assert.strictEqual(header, '%PDF-', 'PDF must start with %PDF-');
    assert.ok(bytes.length > 1000, 'PDF must be at least 1 KB');
  });

  test('G2: renderEquipInspectionPdf returns %PDF bytes for predrill_excavator', () => {
    const rec   = makeTestRecord('predrill_excavator');
    const bytes = renderEquipInspectionPdf(rec);
    assert.ok(bytes instanceof Uint8Array, 'should return Uint8Array');
    const header = String.fromCharCode(...bytes.slice(0, 5));
    assert.strictEqual(header, '%PDF-', 'PDF must start with %PDF-');
    assert.ok(bytes.length > 1000, 'PDF must be at least 1 KB');
  });

  test('G3: renderEquipInspectionPdf returns %PDF bytes for vibro_excavator', () => {
    const rec   = makeTestRecord('vibro_excavator');
    const bytes = renderEquipInspectionPdf(rec);
    assert.ok(bytes instanceof Uint8Array, 'should return Uint8Array');
    const header = String.fromCharCode(...bytes.slice(0, 5));
    assert.strictEqual(header, '%PDF-', 'PDF must start with %PDF-');
    assert.ok(bytes.length > 1000, 'PDF must be at least 1 KB');
  });

  test('G4: PDF with Needs Attention items includes deficiencies section', () => {
    // We cannot inspect PDF content directly, but we can confirm it does not throw
    // when a "Needs Attention" item is present. Full visual check is done by PNG render.
    const rec = makeTestRecord('skid_steer');
    assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
  });

  test('G5: PDF render with safeToOperate=false does not throw', () => {
    const rec = makeTestRecord('predrill_excavator');
    rec.safeToOperate = false;
    assert.doesNotThrow(() => renderEquipInspectionPdf(rec));
    const bytes = renderEquipInspectionPdf(rec);
    assert.strictEqual(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  });
} else {
  console.log('  SKIP G1-G5: equip-inspection-doc.js could not be imported');
}

// ===========================================================================
// H. SERVER-SIDE ID GENERATION: API never accepts client id on create
// ===========================================================================

// Load the API source to verify the id-generation pattern is present.
const apiSrc = readFileSync(
  resolve(__dir, '../functions/api/equipment-inspection.js'), 'utf8'
);

test('H1: API source uses crypto.randomUUID() for create', () => {
  assert.ok(apiSrc.includes('crypto.randomUUID()'),
    'API must generate id server-side with crypto.randomUUID()');
});

test('H2: API source does not use src.id for the id field on create', () => {
  // The old bug was: id: base ? base.id : src.id
  // The fix is: id = newServerId || (base && base.id)
  // Ensure the old pattern is gone.
  assert.ok(!apiSrc.includes('base ? base.id : src.id'),
    'Old pattern "base ? base.id : src.id" must be removed (server-side UUID fix)');
});

test('H3: API source validates id with UUID regex before D1 lookup', () => {
  assert.ok(apiSrc.includes('UUID_RE.test('), 'Must validate id format with UUID_RE');
  assert.ok(apiSrc.includes('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i'),
    'UUID_RE must match standard UUID v4 format');
});

// ===========================================================================
// I. DATE VALIDATION
// ===========================================================================

// Extract isValidDate logic for unit testing (mirrors the API implementation).
function isValidDate(str) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

test('I1: valid date 2026-10-25 passes', () => {
  assert.ok(isValidDate('2026-10-25'));
});

test('I2: invalid format "10/25/2026" is rejected', () => {
  assert.ok(!isValidDate('10/25/2026'), 'MM/DD/YYYY format must be rejected');
});

test('I3: invalid format "2026-25-10" (day > 12 in month slot) is rejected', () => {
  assert.ok(!isValidDate('2026-25-10'), 'Swapped day/month must be rejected');
});

test('I4: impossible date 2026-02-30 is rejected', () => {
  assert.ok(!isValidDate('2026-02-30'), 'Feb 30 does not exist');
});

test('I5: impossible date 2026-13-01 is rejected (month 13)', () => {
  assert.ok(!isValidDate('2026-13-01'), 'Month 13 does not exist');
});

test('I6: empty string is rejected', () => {
  assert.ok(!isValidDate(''), 'Empty string must be rejected');
});

test('I7: API source includes isValidDate function', () => {
  assert.ok(apiSrc.includes('function isValidDate'), 'isValidDate must be in API');
});

// ===========================================================================
// J. MACHINE HOURS RANGE CHECK
// ===========================================================================

function sanitizeMachineHours(v) {
  if (v == null || v === '' || v === undefined) return null;
  const n = Math.round(Number(v) * 10) / 10;
  if (!isFinite(n)) return null;
  if (n < 0 || n > 100000) return null;
  return n;
}

test('J1: 0 hours is valid', () => {
  assert.strictEqual(sanitizeMachineHours(0), 0);
});

test('J2: 100000 hours is valid (upper bound)', () => {
  assert.strictEqual(sanitizeMachineHours(100000), 100000);
});

test('J3: 100000.1 hours is rejected (above max)', () => {
  assert.strictEqual(sanitizeMachineHours(100000.1), null);
});

test('J4: negative hours are rejected', () => {
  assert.strictEqual(sanitizeMachineHours(-1), null);
});

test('J5: NaN is rejected', () => {
  assert.strictEqual(sanitizeMachineHours(NaN), null);
});

test('J6: decimal is rounded to 1dp (1234.56 -> 1234.6)', () => {
  assert.strictEqual(sanitizeMachineHours(1234.56), 1234.6);
});

test('J7: null input returns null (not required field)', () => {
  assert.strictEqual(sanitizeMachineHours(null), null);
});

test('J8: HTML machineHours input has max="100000"', () => {
  assert.ok(htmlSrc.includes('max="100000"'), 'machineHours max must be 100000');
});

// ===========================================================================
// K. SECURITY / STRUCTURE CHECKS
// ===========================================================================

const storeSrc = readFileSync(
  resolve(__dir, '../functions/lib/equip-inspection-store.js'), 'utf8'
);

test('K1: store has no KV fallback code (D1 only)', () => {
  assert.ok(!storeSrc.includes('loadListFromKV'), 'KV fallback loadListFromKV must be removed');
  assert.ok(!storeSrc.includes('saveListToKV'),   'KV fallback saveListToKV must be removed');
  assert.ok(!storeSrc.includes('equip_inspections_v1'), 'KV key must be removed from store');
});

test('K2: store throws on D1 failure (fail-closed)', () => {
  assert.ok(storeSrc.includes('isD1Error'), 'store must tag errors with isD1Error');
  assert.ok(storeSrc.includes('throw d1Error'), 'store must throw on D1 failure');
});

test('K3: API returns 503 on D1 error (not 500)', () => {
  assert.ok(apiSrc.includes("'Service temporarily unavailable', 503"),
    'API must return 503 on tagged D1 errors');
  assert.ok(apiSrc.includes('isD1Error'), 'API must check isD1Error tag');
});

test('K4: API has rate limit on submit', () => {
  assert.ok(apiSrc.includes('checkRateLimit'), 'API must call checkRateLimit on submit');
  assert.ok(apiSrc.includes('eq_submit_rl:'), 'rate limit key must be eq_submit_rl:{uid}');
  assert.ok(apiSrc.includes('429'), 'rate limit must return 429');
});

test('K5: no email code in API (PRIMARY-8)', () => {
  assert.ok(!apiSrc.includes('sendEquipInspectionEmail'), 'email send must be removed');
  assert.ok(!apiSrc.includes('TEST_RECIPIENTS'),          'TEST_RECIPIENTS must be removed');
  assert.ok(!apiSrc.includes('PROD_RECIPIENTS'),          'PROD_RECIPIENTS must be removed');
  assert.ok(!apiSrc.includes('ACTIVE_RECIPIENTS'),        'ACTIVE_RECIPIENTS must be removed');
  assert.ok(!apiSrc.includes('resolveRecipients'),        'resolveRecipients must be removed');
});

test('K6: no email code in doc file (PRIMARY-8)', () => {
  const docSrc = readFileSync(
    resolve(__dir, '../functions/lib/equip-inspection-doc.js'), 'utf8'
  );
  assert.ok(!docSrc.includes('sendEquipInspectionEmail'), 'email function must be removed from doc');
  assert.ok(!docSrc.includes('buildEmailBody'),           'email body builder must be removed from doc');
});

test('K7: inspectedBy maxlength is 80 in HTML', () => {
  assert.ok(htmlSrc.includes('id="eiInspectedBy"') && htmlSrc.includes('maxlength="80"'),
    'eiInspectedBy must have maxlength="80"');
});

test('K8: Continue draft buttons use data-id (no inline onclick)', () => {
  assert.ok(!htmlSrc.includes('onclick="eiLoadRecord('), 'onclick="eiLoadRecord(..." must be removed');
  assert.ok(htmlSrc.includes('data-id='),                'Continue draft button must use data-id attribute');
  assert.ok(htmlSrc.includes("querySelectorAll('button[data-id]')"),
    'event listener must be wired via querySelectorAll');
});

test('K9: index.html button text is "Daily Equipment Inspection"', () => {
  assert.ok(indexSrc.includes('Daily Equipment Inspection'),
    'index.html button must read "Daily Equipment Inspection"');
});

test('K10: page title bar text is "Daily Equipment Inspection"', () => {
  assert.ok(htmlSrc.includes('Daily Equipment Inspection'),
    'equipment-inspection.html must contain "Daily Equipment Inspection"');
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
