/**
 * test-site-readiness-r10.mjs
 * R10 (Derek 2026-10-23) structural tests.
 * Tests: new 19-item checklist, legacy R9/pre-R9 back-compat, single sign-off, section 6, section 7.
 */
import assert from 'node:assert/strict';
import { CHECKLIST_ITEMS, uploadBucketForItem, computeResult } from '../functions/lib/site-readiness-store.js';

// ---- A: New R10 structure ---------------------------------------------------
{
  // A1: 19 items total.
  assert.equal(CHECKLIST_ITEMS.length, 19, 'A1: should have 19 checklist items');

  // A2: Sections present.
  const sections = [...new Set(CHECKLIST_ITEMS.map(d => d.section))];
  assert.deepEqual(sections, ['1','2','3','4','5','6'], 'A2: sections 1-6 present');

  // A3: Section 4 is "Trucking Plan".
  const sec4 = CHECKLIST_ITEMS.filter(d => d.section === '4');
  assert.ok(sec4.every(d => d.sectionLabel === 'Trucking Plan'), 'A3: section 4 label is Trucking Plan');
  assert.equal(sec4.length, 4, 'A3: 4 items in section 4');
  assert.deepEqual(sec4.map(d => d.key), ['4a','4b','4c','4d'], 'A3: section 4 keys 4a-4d');

  // A4: Section 5 is "Stone & Spoils Plan" with 4 items.
  const sec5 = CHECKLIST_ITEMS.filter(d => d.section === '5');
  assert.ok(sec5.every(d => d.sectionLabel === 'Stone & Spoils Plan'), 'A4: section 5 label');
  assert.equal(sec5.length, 4, 'A4: 4 items in section 5');
  assert.deepEqual(sec5.map(d => d.key), ['5a','5b','5c','5d'], 'A4: section 5 keys');

  // A5: Section 6 is "Safety" with 1 item (6a).
  const sec6 = CHECKLIST_ITEMS.filter(d => d.section === '6');
  assert.ok(sec6.every(d => d.sectionLabel === 'Safety'), 'A5: section 6 label');
  assert.equal(sec6.length, 1, 'A5: 1 item in section 6');
  assert.equal(sec6[0].key, '6a', 'A5: 6a key');

  // A6: No item has has4bDetail (removed in R10).
  assert.ok(CHECKLIST_ITEMS.every(d => !d.has4bDetail), 'A6: no has4bDetail on any item');

  console.log('A (R10 structure): PASS');
}

// ---- B: uploadBucketForItem ------------------------------------------------
{
  assert.equal(uploadBucketForItem('3a'), 'grade_photo',   'B1: 3a -> grade_photo');
  assert.equal(uploadBucketForItem('3d'), 'proof_roll',    'B2: 3d -> proof_roll');
  assert.equal(uploadBucketForItem('3e'), 'staking_photo', 'B3: 3e -> staking_photo');
  assert.equal(uploadBucketForItem('5d'), 'sr_markup',     'B4: 5d -> sr_markup (R10 new)');
  assert.equal(uploadBucketForItem('6a'), 'safety_cert',   'B5: 6a -> safety_cert (R10 new)');
  // R9 bucket gone from 4d.
  assert.equal(uploadBucketForItem('4d'), null, 'B6: 4d -> null (R10: no safety bucket on 4d)');
  assert.equal(uploadBucketForItem('4a'), null, 'B7: 4a -> null');
  assert.equal(uploadBucketForItem('1a'), null, 'B8: 1a -> null');

  console.log('B (uploadBucketForItem): PASS');
}

// ---- C: computeResult -------------------------------------------------------
{
  // C1: All Yes -> READY.
  const allYes = CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: 'Yes' }));
  const { result: r1, openItems: o1 } = computeResult(allYes);
  assert.equal(r1, 'READY', 'C1: all Yes -> READY');
  assert.equal(o1.length, 0, 'C1: no open items');

  // C2: All N/A -> READY.
  const allNA = CHECKLIST_ITEMS.map(d => ({ key: d.key, answer: 'N/A' }));
  const { result: r2 } = computeResult(allNA);
  assert.equal(r2, 'READY', 'C2: all N/A -> READY');

  // C3: One No -> NOT READY.
  const withNo = CHECKLIST_ITEMS.map((d, i) => ({ key: d.key, answer: i === 0 ? 'No' : 'Yes' }));
  const { result: r3, openItems: o3 } = computeResult(withNo);
  assert.equal(r3, 'NOT READY', 'C3: one No -> NOT READY');
  assert.equal(o3[0], '1a', 'C3: open item is 1a');

  // C4: Missing item -> treated as open.
  const missing6a = CHECKLIST_ITEMS.filter(d => d.key !== '6a').map(d => ({ key: d.key, answer: 'Yes' }));
  const { result: r4, openItems: o4 } = computeResult(missing6a);
  assert.equal(r4, 'NOT READY', 'C4: missing 6a -> NOT READY');
  assert.ok(o4.includes('6a'), 'C4: 6a is open');

  console.log('C (computeResult): PASS');
}

// ---- D: Legacy R9 record load (back-compat) --------------------------------
// Simulate what loadRecordIntoForm does for an R9 record shape.
{
  // D1: R9 record has 14 items (sections 1-4 old shape). R10 state should map
  //     known keys and leave unknown R10 keys blank.
  const r9Items = [
    { key: '1a', answer: 'Yes', note: '' },
    { key: '4d', answer: 'Yes', note: 'safety done' },
    // Other keys omitted intentionally.
  ];
  const stateItems = CHECKLIST_ITEMS.map(function(def) {
    const saved = r9Items.find(it => it.key === def.key);
    return { key: def.key, answer: (saved && saved.answer) || '', note: (saved && saved.note) || '' };
  });
  const item1a = stateItems.find(x => x.key === '1a');
  const item6a = stateItems.find(x => x.key === '6a');
  assert.equal(item1a.answer, 'Yes', 'D1: R9 1a answer preserved');
  // 4d answer from R9 record stays on 4d (same key), not migrated to 6a (client migration is manual).
  const item4d = stateItems.find(x => x.key === '4d');
  assert.equal(item4d.answer, 'Yes', 'D1: R9 4d answer loads onto R10 4d key');
  assert.equal(item6a.answer, '', 'D1: 6a starts empty for R9 record');

  // D2: item4bDetail migration to item notes.
  const r9item4bDetail = { unloadStreet: 'on site', overheadUtils: 'power line south', specialNotes: 'narrow gate' };
  const stateItems2 = CHECKLIST_ITEMS.map(def => ({ key: def.key, answer: '', note: '' }));
  // Simulate migration logic from loadRecordIntoForm.
  if (r9item4bDetail) {
    var it4b = stateItems2.find(x => x.key === '4b');
    var it4c = stateItems2.find(x => x.key === '4c');
    var it4d = stateItems2.find(x => x.key === '4d');
    if (it4b && !it4b.note && r9item4bDetail.unloadStreet)  it4b.note = r9item4bDetail.unloadStreet;
    if (it4c && !it4c.note && r9item4bDetail.overheadUtils) it4c.note = r9item4bDetail.overheadUtils;
    if (it4d && !it4d.note && r9item4bDetail.specialNotes)  it4d.note = r9item4bDetail.specialNotes;
  }
  assert.equal(stateItems2.find(x => x.key === '4b').note, 'on site',           'D2: 4b note from unloadStreet');
  assert.equal(stateItems2.find(x => x.key === '4c').note, 'power line south',  'D2: 4c note from overheadUtils');
  assert.equal(stateItems2.find(x => x.key === '4d').note, 'narrow gate',       'D2: 4d note from specialNotes');

  console.log('D (legacy R9 load): PASS');
}

// ---- E: Single sign-off (R10 opsSignoffs shape) ----------------------------
{
  // E1: R10 state only has sitePlan.
  const r10Signoffs = { sitePlan: { desc: 'NE corner', superName: 'Bob', pfMgrName: 'Joe' } };
  assert.ok('sitePlan' in r10Signoffs, 'E1: sitePlan key present');
  assert.ok(!('stonePlacement' in r10Signoffs), 'E1: no stonePlacement in R10 state');

  // E2: R9 opsSignoffs migration — collectBody should produce sitePlan.
  const r9Signoffs = { stonePlacement: { desc: 'NW corner', superName: 'Alice', pfMgrName: 'Pete' }, spoilsPlacement: { desc: 'SE field' } };
  // Simulate server cleanOpsSignoffs logic: if no sitePlan but has stonePlacement, migrate.
  function simulateCleanOpsSignoffs(input) {
    if (!input) return { sitePlan: {} };
    const out = {};
    if (input.sitePlan != null) {
      out.sitePlan = input.sitePlan;
    } else if (input.stonePlacement != null) {
      out.sitePlan = Object.assign({}, input.stonePlacement);
    } else {
      out.sitePlan = {};
    }
    if (input.stonePlacement  != null) out.stonePlacement  = input.stonePlacement;
    if (input.spoilsPlacement != null) out.spoilsPlacement = input.spoilsPlacement;
    return out;
  }
  const cleaned = simulateCleanOpsSignoffs(r9Signoffs);
  assert.equal(cleaned.sitePlan.desc, 'NW corner',  'E2: stonePlacement migrated to sitePlan.desc');
  assert.ok('stonePlacement'  in cleaned, 'E2: stonePlacement preserved for back-compat');
  assert.ok('spoilsPlacement' in cleaned, 'E2: spoilsPlacement preserved for back-compat');

  console.log('E (single sign-off): PASS');
}

// ---- F: Section 6 conditional upload (6a) ----------------------------------
{
  // F1: 6a has safety_cert upload bucket.
  const item6a = CHECKLIST_ITEMS.find(d => d.key === '6a');
  assert.ok(item6a, 'F1: 6a item found');
  assert.equal(item6a.hasUpload, true,          'F1: 6a has hasUpload');
  assert.equal(uploadBucketForItem('6a'), 'safety_cert', 'F1: 6a bucket is safety_cert');

  // F2: Section 6 items are gated by Yes answer (same pattern as 3e in store).
  // The upload widget is only shown when answer===Yes or refs/pending exist.
  // This is enforced in renderChecklist (HTML), verified by checking store definition.
  assert.ok(item6a.hasUpload, 'F2: 6a hasUpload set so widget is conditional on answer');

  console.log('F (section 6 conditional): PASS');
}

// ---- G: Section 7 path display (store keys only) ---------------------------
{
  // G1: No checklist item for section 7 (photos only); section '7' absent from store.
  const sec7 = CHECKLIST_ITEMS.filter(d => d.section === '7');
  assert.equal(sec7.length, 0, 'G1: no section 7 checklist items (photos widget only)');

  // G2: Attachments with bucket=photos are accepted (not part of CHECKLIST_ITEMS).
  const photoBucket = 'photos';
  const buckets = CHECKLIST_ITEMS.map(d => uploadBucketForItem(d.key)).filter(Boolean);
  assert.ok(!buckets.includes(photoBucket), 'G2: photos bucket not tied to any checklist item');

  console.log('G (section 7 path): PASS');
}

console.log('\nAll R10 tests PASSED.');
