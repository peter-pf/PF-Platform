#!/usr/bin/env node
// test-site-readiness-r14.mjs
// Tests for 2026-10-27 Derek request:
//   A. Section 5a/5b dropdown options: Standard Operation / GC Restriction / Needs Review
//   B. Section 5c dropdown options: None Required / Needs Review
//   C. computeResult: new passing/failing values + backward compat with legacy Yes/N/A
//   D. API: VALID_ANSWERS includes all new + legacy values
//   E. HTML: SR_ITEM_ANSWERS defined correctly; legacy value rendered as (legacy) option
//   F. HTML: GC Signature / Pier Foundations Signature labels + placeholder text
//   G. PDF: signature label strings updated
//   H. PDF: renders with new Section 5 values without throwing

import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const wt = resolve(__dir, '..');

const htmlSrc   = readFileSync(resolve(wt, 'site-readiness.html'), 'utf8');
const apiSrc    = readFileSync(resolve(wt, 'functions/api/site-readiness.js'), 'utf8');
const storeSrc  = readFileSync(resolve(wt, 'functions/lib/site-readiness-store.js'), 'utf8');
const docSrc    = readFileSync(resolve(wt, 'functions/lib/site-readiness-doc.js'), 'utf8');

const { CHECKLIST_ITEMS, computeResult } = await import(
  resolve(wt, 'functions/lib/site-readiness-store.js')
);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch(e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// Helper: build an items array with all items answered 'Yes', overriding specific keys.
function makeItems(overrides = {}) {
  return CHECKLIST_ITEMS.map(d => ({
    key: d.key,
    answer: overrides[d.key] !== undefined ? overrides[d.key] : 'Yes',
    note: '',
  }));
}

console.log('\n--- A. computeResult: new passing values for 5a / 5b ---');

test('A1: Standard Operation on 5a counts as READY', () => {
  const items = makeItems({ '5a': 'Standard Operation' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('A2: Standard Operation on 5b counts as READY', () => {
  const items = makeItems({ '5b': 'Standard Operation' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('A3: GC Restriction on 5a counts as READY (documented constraint, crew plans around it)', () => {
  const items = makeItems({ '5a': 'GC Restriction' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('A4: GC Restriction on 5b counts as READY (documented constraint, crew plans around it)', () => {
  const items = makeItems({ '5b': 'GC Restriction' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('A5: Needs Review on 5a is NOT READY', () => {
  const items = makeItems({ '5a': 'Needs Review' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5a'), '5a must be in openItems');
});

test('A6: Needs Review on 5b is NOT READY (only unresolved state)', () => {
  const items = makeItems({ '5b': 'Needs Review' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5b'), '5b must be in openItems');
});

console.log('\n--- B. computeResult: new passing values for 5c ---');

test('B1: None Required on 5c counts as READY', () => {
  const items = makeItems({ '5c': 'None Required' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('B2: Needs Review on 5c is NOT READY', () => {
  const items = makeItems({ '5c': 'Needs Review' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5c'), '5c must be in openItems');
});

console.log('\n--- C. computeResult: backward compat with legacy Yes / N/A / No ---');

test('C1: legacy Yes on 5a still READY', () => {
  const items = makeItems({ '5a': 'Yes' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY');
});

test('C2: legacy Yes on 5b still READY', () => {
  const items = makeItems({ '5b': 'Yes' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY');
});

test('C3: legacy N/A on 5c still READY', () => {
  const items = makeItems({ '5c': 'N/A' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'READY');
});

test('C4: legacy No on 5a still NOT READY', () => {
  const items = makeItems({ '5a': 'No' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5a'));
});

test('C5: legacy No on 5c still NOT READY', () => {
  const items = makeItems({ '5c': 'No' });
  const r = computeResult(items, 12);
  assert.equal(r.result, 'NOT READY');
  assert.ok(r.openItems.includes('5c'));
});

test('C6: pre-R12 record: 5a=GC Restriction, 5b=Standard Operation, 5c=None Required is READY', () => {
  // For a pre-R12 record, 1d-1h are skipped; 5a/5b/5c still scored.
  const items = makeItems({ '5a': 'GC Restriction', '5b': 'Standard Operation', '5c': 'None Required' });
  const r = computeResult(items, 11);
  assert.equal(r.result, 'READY', `Expected READY, got ${r.result}; open: ${r.openItems}`);
});

test('C7: legacy record (no schemaVersion): new values still pass correctly', () => {
  const items = makeItems({ '5a': 'Standard Operation', '5c': 'None Required' });
  const r = computeResult(items, undefined);
  assert.equal(r.result, 'READY');
});

console.log('\n--- D. API VALID_ANSWERS ---');

test('D1: API VALID_ANSWERS includes Standard Operation', () => {
  assert.ok(apiSrc.includes("'Standard Operation': 1"), "API VALID_ANSWERS must include 'Standard Operation'");
});

test('D2: API VALID_ANSWERS includes GC Restriction', () => {
  assert.ok(apiSrc.includes("'GC Restriction': 1"), "API VALID_ANSWERS must include 'GC Restriction'");
});

test('D3: API VALID_ANSWERS includes Needs Review', () => {
  assert.ok(apiSrc.includes("'Needs Review': 1"), "API VALID_ANSWERS must include 'Needs Review'");
});

test('D4: API VALID_ANSWERS includes None Required', () => {
  assert.ok(apiSrc.includes("'None Required': 1"), "API VALID_ANSWERS must include 'None Required'");
});

test('D5: API VALID_ANSWERS still includes legacy Yes / No / N/A for backward compat', () => {
  assert.ok(apiSrc.includes("'Yes': 1"),  "API must still have 'Yes' for backward compat");
  assert.ok(apiSrc.includes("'No': 1"),   "API must still have 'No' for backward compat");
  assert.ok(apiSrc.includes("'N/A': 1"),  "API must still have 'N/A' for backward compat");
});

console.log('\n--- E. HTML: SR_ITEM_ANSWERS and dropdown rendering ---');

test('E1: HTML defines SR_ITEM_ANSWERS with 5a options', () => {
  assert.ok(htmlSrc.includes("'5a': ['Standard Operation', 'GC Restriction', 'Needs Review']"),
    "SR_ITEM_ANSWERS must define 5a with Standard Operation / GC Restriction / Needs Review");
});

test('E2: HTML defines SR_ITEM_ANSWERS with 5b options', () => {
  assert.ok(htmlSrc.includes("'5b': ['Standard Operation', 'GC Restriction', 'Needs Review']"),
    "SR_ITEM_ANSWERS must define 5b with Standard Operation / GC Restriction / Needs Review");
});

test('E3: HTML defines SR_ITEM_ANSWERS with 5c options', () => {
  assert.ok(htmlSrc.includes("'5c': ['None Required', 'Needs Review']"),
    "SR_ITEM_ANSWERS must define 5c with None Required / Needs Review");
});

test('E4: HTML uses SR_ITEM_ANSWERS in renderChecklist', () => {
  assert.ok(htmlSrc.includes('SR_ITEM_ANSWERS[def.key]'),
    "renderChecklist must look up SR_ITEM_ANSWERS[def.key]");
});

test('E5: HTML shows legacy option with (legacy) label for unknown stored values', () => {
  assert.ok(htmlSrc.includes("(legacy)"),
    "HTML must add a '(legacy)' option for stored values outside the new answer set");
  assert.ok(htmlSrc.includes("legacyAns"),
    "HTML must have a legacyAns variable for backward compat");
});

test('E6: Standard Operation appears in html as an answer option', () => {
  assert.ok(htmlSrc.includes('Standard Operation'), "'Standard Operation' must appear in HTML");
});

test('E7: GC Restriction appears in html as an answer option', () => {
  assert.ok(htmlSrc.includes('GC Restriction'), "'GC Restriction' must appear in HTML");
});

test('E8: None Required appears in html as an answer option', () => {
  assert.ok(htmlSrc.includes('None Required'), "'None Required' must appear in HTML");
});

console.log('\n--- F. HTML: signature labels and placeholder ---');

test('F1: HTML has GC Signature label (not Site Superintendent signature)', () => {
  assert.ok(htmlSrc.includes('GC Signature'),
    'HTML must have label "GC Signature"');
  assert.ok(!htmlSrc.includes('Site Superintendent signature'),
    'Old label "Site Superintendent signature" must be removed');
});

test('F2: HTML has Pier Foundations Signature label (not PF Field Ops Mgr signature)', () => {
  assert.ok(htmlSrc.includes('Pier Foundations Signature'),
    'HTML must have label "Pier Foundations Signature"');
  assert.ok(!htmlSrc.includes('PF Field Ops Mgr signature'),
    'Old label "PF Field Ops Mgr signature" must be removed');
});

test('F3: HTML placeholder is Printed name of PF representative (not PF Field Ops Mgr printed name)', () => {
  assert.ok(htmlSrc.includes('Printed name of PF representative'),
    'Placeholder must read "Printed name of PF representative"');
  assert.ok(!htmlSrc.includes('PF Field Ops Mgr printed name'),
    'Old placeholder "PF Field Ops Mgr printed name" must be removed');
});

console.log('\n--- G. PDF (site-readiness-doc.js): signature labels ---');

test('G1: doc.js has GC Signature label (R10 sitePlan sign-off)', () => {
  assert.ok(docSrc.includes("label: 'GC Signature'"),
    "doc.js sitePlan must use 'GC Signature'");
});

test('G2: doc.js has Pier Foundations Signature label (R10 sitePlan sign-off)', () => {
  assert.ok(docSrc.includes("label: 'Pier Foundations Signature'"),
    "doc.js sitePlan must use 'Pier Foundations Signature'");
});

test('G3: doc.js no longer has old Site Superintendent label', () => {
  assert.ok(!docSrc.includes("label: 'Site Superintendent'"),
    "doc.js must not have old 'Site Superintendent' label");
});

test('G4: doc.js no longer has old PF Field Ops Mgr label', () => {
  assert.ok(!docSrc.includes("label: 'PF Field Ops Mgr'"),
    "doc.js must not have old 'PF Field Ops Mgr' label");
});

console.log('\n--- H. PDF smoke: renders with new Section 5 values ---');

let renderSiteReadinessPdf;
try {
  const mod = await import(resolve(wt, 'functions/lib/site-readiness-doc.js'));
  renderSiteReadinessPdf = mod.renderSiteReadinessPdf;
} catch(e) {
  console.error('  WARN: could not import site-readiness-doc.js for H tests:', e && e.message);
}

function makeSrRecord(overrides = {}) {
  return Object.assign({
    id:           'sr_r14_test_01',
    projectId:    '26-100',
    projectName:  'R14 Test Project',
    date:         '2026-10-27',
    gcContact:    'Acme GC',
    siteAddress:  '123 Test Lane, Fort Wayne IN',
    inspectedBy:  'Peter',
    result:       'READY',
    openItems:    [],
    schemaVersion: 12,
    items: CHECKLIST_ITEMS.map(d => ({
      key:    d.key,
      answer: (['5a','5b'].includes(d.key) ? 'Standard Operation'
              : d.key === '5c' ? 'None Required' : 'Yes'),
      note: '',
    })),
    opsSignoffs: {
      sitePlan: {
        desc:      'Stone on NW corner; spoils along east fence',
        superName: 'John Smith GC',
        pfMgrName: 'Derek Franke',
        signedAt:  '2026-10-27T09:00:00.000Z',
        capturedByName: 'Peter',
      },
    },
    attachments: [],
    sigName: 'Derek Franke',
    sigDate: '2026-10-27',
    status:  'sent',
  }, overrides);
}

if (renderSiteReadinessPdf) {
  test('H1: PDF renders with Standard Operation / None Required without throwing', () => {
    const rec = makeSrRecord();
    assert.doesNotThrow(() => renderSiteReadinessPdf(rec));
    const bytes = renderSiteReadinessPdf(rec);
    assert.ok(bytes instanceof Uint8Array, 'must return Uint8Array');
    assert.equal(String.fromCharCode(...bytes.slice(0,5)), '%PDF-');
    assert.ok(bytes.length > 1000, 'PDF must be at least 1 KB');
  });

  test('H2: PDF renders with GC Restriction / None Required (READY) without throwing', () => {
    // GC Restriction on 5a/5b is a passing state; only Needs Review blocks
    const rec = makeSrRecord({
      result: 'READY',
      openItems: [],
      items: CHECKLIST_ITEMS.map(d => ({
        key:    d.key,
        answer: (['5a','5b'].includes(d.key) ? 'GC Restriction'
                : d.key === '5c' ? 'None Required' : 'Yes'),
        note: d.key === '5a' ? 'Contractor access restriction until next week' : '',
      })),
    });
    assert.doesNotThrow(() => renderSiteReadinessPdf(rec));
    const bytes = renderSiteReadinessPdf(rec);
    assert.equal(String.fromCharCode(...bytes.slice(0,5)), '%PDF-');
  });

  test('H2b: PDF renders with Needs Review on 5a/5b/5c (NOT READY) without throwing', () => {
    const rec = makeSrRecord({
      result: 'NOT READY',
      openItems: ['5a', '5b', '5c'],
      items: CHECKLIST_ITEMS.map(d => ({
        key:    d.key,
        answer: (['5a','5b','5c'].includes(d.key) ? 'Needs Review' : 'Yes'),
        note: d.key === '5a' ? 'Stone location still being worked out with GC' : '',
      })),
    });
    assert.doesNotThrow(() => renderSiteReadinessPdf(rec));
    const bytes = renderSiteReadinessPdf(rec);
    assert.equal(String.fromCharCode(...bytes.slice(0,5)), '%PDF-');
  });

  test('H3: legacy record (Yes/No/N/A on 5a/5b/5c, no schemaVersion) renders without throwing', () => {
    const legacyRec = makeSrRecord({
      schemaVersion: undefined,
      result: 'NOT READY',
      openItems: ['5a'],
      items: CHECKLIST_ITEMS.map(d => ({
        key:    d.key,
        answer: d.key === '5a' ? 'No' : (d.key === '5c' ? 'N/A' : 'Yes'),
        note:   d.key === '5a' ? 'Stone location TBD' : '',
      })),
    });
    assert.doesNotThrow(() => renderSiteReadinessPdf(legacyRec));
    const bytes = renderSiteReadinessPdf(legacyRec);
    assert.equal(String.fromCharCode(...bytes.slice(0,5)), '%PDF-');
  });
} else {
  console.log('  SKIP H1-H3: site-readiness-doc.js could not be imported');
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
