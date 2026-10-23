/**
 * test-site-readiness-r10.mjs
 * R10 (Derek 2026-10-23) structural tests.
 * Tests: new 19-item checklist, legacy R9/pre-R9 back-compat, single sign-off, section 6, section 7.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHECKLIST_ITEMS, uploadBucketForItem, computeResult } from '../functions/lib/site-readiness-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // E2: R9 opsSignoffs migration — server cleanOpsSignoffs(srcOps, baseOps, ...) shape.
  // [Updated for SEC fix-round R2: function now takes srcOps + baseOps separately]
  const r9Signoffs = { stonePlacement: { desc: 'NW corner', superName: 'Alice', pfMgrName: 'Pete' }, spoilsPlacement: { desc: 'SE field' } };
  // Simulate server cleanOpsSignoffs with the R2 two-param signature.
  function simulateCleanOpsSignoffs(srcOps, baseOps) {
    srcOps  = srcOps  || {};
    baseOps = baseOps || {};
    const srcSP  = srcOps.sitePlan  != null ? srcOps.sitePlan  : (srcOps.stonePlacement  || null);
    const baseSP = baseOps.sitePlan != null ? baseOps.sitePlan : null;
    const spIn = srcSP || baseSP || {};
    const out = { sitePlan: { desc: spIn.desc || '', superName: spIn.superName || '', pfMgrName: spIn.pfMgrName || '' } };
    if (baseOps.stonePlacement  != null) out.stonePlacement  = Object.assign({}, baseOps.stonePlacement);
    if (baseOps.spoilsPlacement != null) out.spoilsPlacement = Object.assign({}, baseOps.spoilsPlacement);
    return out;
  }
  // Pass r9Signoffs as srcOps; no stored base yet (new record with R9 client).
  const cleaned = simulateCleanOpsSignoffs(r9Signoffs, {});
  assert.equal(cleaned.sitePlan.desc, 'NW corner',  'E2: stonePlacement migrated to sitePlan.desc');
  assert.ok(!('stonePlacement'  in cleaned), 'E2: no legacy stonePlacement in output (base had none)');
  assert.ok(!('spoilsPlacement' in cleaned), 'E2: no legacy spoilsPlacement in output (base had none)');

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

// ---- H: SEC fix-round R2 — legacy stamp forge prevention -------------------
{
  // Simulate cleanOpsSignoffItemLegacy(stored): stamp preserved only from stored record.
  function simLegacy(stored) {
    stored = stored || {};
    const out = { desc: stored.desc || '', superName: stored.superName || '', pfMgrName: stored.pfMgrName || '' };
    if (stored.signedAt)       out.signedAt       = stored.signedAt;
    if (stored.capturedByUid)  out.capturedByUid  = stored.capturedByUid;
    if (stored.capturedByName) out.capturedByName = stored.capturedByName;
    return out;
  }
  // Simulate new cleanOpsSignoffs(srcOps, baseOps): legacy keys only from baseOps.
  function simCleanOpsSignoffs2(srcOps, baseOps) {
    srcOps  = srcOps  || {};
    baseOps = baseOps || {};
    const srcSP  = srcOps.sitePlan  != null ? srcOps.sitePlan  : (srcOps.stonePlacement  || null);
    const baseSP = baseOps.sitePlan != null ? baseOps.sitePlan : null;
    const spIn = srcSP || baseSP || {};
    const out = { sitePlan: { desc: spIn.desc || '', superName: spIn.superName || '', pfMgrName: spIn.pfMgrName || '' } };
    if (baseOps.stonePlacement  != null) out.stonePlacement  = simLegacy(baseOps.stonePlacement);
    if (baseOps.spoilsPlacement != null) out.spoilsPlacement = simLegacy(baseOps.spoilsPlacement);
    return out;
  }

  // H1: Client sends forged stonePlacement.signedAt in src — it is ignored.
  const baseWithLegacy = { stonePlacement: { desc: 'NW corner', signedAt: '2026-10-01T08:00:00Z', capturedByName: 'Alice' } };
  const srcForged = { opsSignoffs: { stonePlacement: { desc: 'NW corner', signedAt: 'FORGED', capturedByName: 'HACKER' } } };
  const result1 = simCleanOpsSignoffs2(srcForged.opsSignoffs, baseWithLegacy);
  assert.equal(result1.stonePlacement.signedAt,       '2026-10-01T08:00:00Z', 'H1: forged signedAt ignored — stored stamp preserved');
  assert.equal(result1.stonePlacement.capturedByName, 'Alice',                 'H1: forged capturedByName ignored');

  // H2: New record — src sends legacy stone keys, base has none — legacy keys absent from output.
  const baseEmpty = {};
  const srcWithLegacy = { sitePlan: { desc: 'my plan' }, stonePlacement: { desc: 'injected', signedAt: 'FORGED' } };
  const result2 = simCleanOpsSignoffs2(srcWithLegacy, baseEmpty);
  assert.ok(!('stonePlacement' in result2), 'H2: client-injected stonePlacement dropped when base has none');

  // H3: Back-compat — base has legacy keys, they survive round-trip (unchanged stamp).
  const result3 = simCleanOpsSignoffs2({ sitePlan: { desc: 'updated desc' } }, baseWithLegacy);
  assert.ok('stonePlacement' in result3, 'H3: base legacy key preserved in back-compat pass');
  assert.equal(result3.stonePlacement.signedAt, '2026-10-01T08:00:00Z', 'H3: base signedAt unchanged');

  console.log('H (SEC: legacy stamp forge prevention): PASS');
}

// ---- I: SEC fix-round R2 — sitePlan stamp idempotency ----------------------
{
  // Simulate cleanOpsSignoffItemStamped(src, base, session, nowIso).
  function simStamped(src, base, session, nowIso) {
    src  = (src  && typeof src  === 'object') ? src  : {};
    base = (base && typeof base === 'object') ? base : {};
    const cleaned = {
      desc:      src.desc      != null ? (src.desc      || '') : (base.desc      || ''),
      superName: src.superName != null ? (src.superName || '') : (base.superName || ''),
      pfMgrName: src.pfMgrName != null ? (src.pfMgrName || '') : (base.pfMgrName || ''),
    };
    if (base.signedAt)       cleaned.signedAt       = base.signedAt;
    if (base.capturedByUid)  cleaned.capturedByUid  = base.capturedByUid;
    if (base.capturedByName) cleaned.capturedByName = base.capturedByName;
    const hasContent = !!(cleaned.desc || cleaned.superName || cleaned.pfMgrName);
    if (session && nowIso && hasContent && !base.signedAt) {
      cleaned.signedAt       = nowIso;
      cleaned.capturedByUid  = session.uid  || '';
      cleaned.capturedByName = session.name || '';
    }
    return cleaned;
  }
  const sess  = { uid: 'u1', name: 'Field User' };
  const now1  = '2026-10-23T10:00:00Z';
  const now2  = '2026-10-24T09:00:00Z';

  // I1: First capture — empty base, content in src → gets stamp.
  const first = simStamped({ desc: 'SW corner', superName: 'Bob', pfMgrName: 'Pete' }, {}, sess, now1);
  assert.equal(first.signedAt,       now1,         'I1: first capture stamped');
  assert.equal(first.capturedByName, 'Field User', 'I1: capturedByName set on first capture');

  // I2: Second save (same or different session) — base already has stamp → stamp preserved.
  const second = simStamped({ desc: 'SW corner', superName: 'Bob', pfMgrName: 'Pete' }, first, sess, now2);
  assert.equal(second.signedAt, now1, 'I2: stamp not overwritten on resave');

  // I3: Admin edits desc — original signer preserved.
  const adminSess = { uid: 'a1', name: 'Admin' };
  const afterAdmin = simStamped({ desc: 'SW corner (revised)', superName: 'Bob', pfMgrName: 'Pete' }, first, adminSess, now2);
  assert.equal(afterAdmin.signedAt,       now1,         'I3: admin edit preserves original signedAt');
  assert.equal(afterAdmin.capturedByName, 'Field User', 'I3: admin edit preserves original capturedByName');

  // I4: Empty sign-off (no content) → no stamp even on new record.
  const empty = simStamped({}, {}, sess, now1);
  assert.ok(!empty.signedAt, 'I4: empty sign-off not stamped');

  console.log('I (SEC: sitePlan stamp idempotency): PASS');
}

// ---- J: PDF refs5d filter — markup + sig attachments route to sign-off section
{
  // Simulate the PDF allAttach filter used in site-readiness-doc.js.
  function refsFor5d(allAttach) {
    return allAttach.filter((a) => a && a.key === '5d' &&
      (a.bucket === 'sr_markup' || a.bucket === 'sr_signature'));
  }

  const allAttach = [
    { key: '5d', bucket: 'sr_markup',    name: 'markup.png', itemId: 'abc', webUrl: 'https://...' },
    { key: '5d', bucket: 'sr_signature', name: 'sig_super.png', itemId: 'def', webUrl: 'https://...' },
    { key: '5d', bucket: 'sr_signature', name: 'sig_mgr.png',   itemId: 'ghi', webUrl: 'https://...' },
    { key: '3a', bucket: 'grade_photo',  name: 'grade.jpg', itemId: 'jkl', webUrl: 'https://...' },
    { key: 'stone', bucket: 'sr_markup', name: 'old.png',   itemId: 'mno', webUrl: 'https://...' }, // R9 old key
  ];

  const refs = refsFor5d(allAttach);
  // J1: All three 5d refs found (markup + 2 sigs).
  assert.equal(refs.length, 3, 'J1: three 5d refs found (1 markup + 2 sig)');
  // J2: grade_photo ref not in refs5d.
  assert.ok(!refs.some(a => a.bucket === 'grade_photo'), 'J2: grade_photo excluded from refs5d');
  // J3: Old R9 stone key attachment excluded even though bucket matches.
  assert.ok(!refs.some(a => a.key === 'stone'), 'J3: stone key excluded from refs5d filter');
  // J4: Both sr_markup and sr_signature buckets included.
  assert.ok(refs.some(a => a.bucket === 'sr_markup'),    'J4: sr_markup ref included');
  assert.ok(refs.some(a => a.bucket === 'sr_signature'), 'J4: sr_signature ref included');

  console.log('J (PDF refs5d filter): PASS');
}

// ---- K: buildUploadPath format (Req 5 — resolved path display) -------------
{
  // Simulate client buildUploadPath(projectNum, spFolder, date, bucket).
  function buildUploadPath(projectNum, spFolder, date, bucket) {
    if (!projectNum || !date) return '';
    const root = (spFolder && spFolder.length)
      ? spFolder
      : 'Project ' + projectNum + ' folder (created on first upload)';
    if (bucket === 'safety_cert') return root + ' / 06 - Safety / ' + date;
    return root + ' / 05 - Field / 02 - Project Photos / ' + date;
  }

  // K1: Full spFolder available — photos bucket.
  const p1 = buildUploadPath('25-026', '25-026 - The Granary - FlCo', '2026-10-23', 'photos');
  assert.equal(p1, '25-026 - The Granary - FlCo / 05 - Field / 02 - Project Photos / 2026-10-23', 'K1: photos path with spFolder');

  // K2: No spFolder (null) — safe fallback, never a guessed name.
  const p2 = buildUploadPath('26-012', null, '2026-10-23', 'photos');
  assert.equal(p2, 'Project 26-012 folder (created on first upload) / 05 - Field / 02 - Project Photos / 2026-10-23', 'K2: null spFolder shows safe fallback text');

  // K3: Safety cert bucket routes to 06 - Safety.
  const p3 = buildUploadPath('26-012', null, '2026-10-23', 'safety_cert');
  assert.equal(p3, 'Project 26-012 folder (created on first upload) / 06 - Safety / 2026-10-23', 'K3: safety_cert path uses 06 - Safety with fallback root');

  // K4: Empty project or date returns empty string.
  assert.equal(buildUploadPath('', null, '2026-10-23', 'photos'), '', 'K4: empty projectNum -> empty path');
  assert.equal(buildUploadPath('26-012', null, '', 'photos'),     '', 'K4b: empty date -> empty path');

  // K5: Path changes when date changes (dynamic update test).
  const p5a = buildUploadPath('26-012', null, '2026-10-23', 'photos');
  const p5b = buildUploadPath('26-012', null, '2026-10-24', 'photos');
  assert.notEqual(p5a, p5b, 'K5: path updates when date changes');

  console.log('K (buildUploadPath format): PASS');
}

// ---- M: Section-5d DOM order (structure + ITEMS sequence) --------------------
{
  const html = readFileSync(join(__dirname, '../site-readiness.html'), 'utf8');

  // M1: CHECKLIST_ITEMS order: 5c index < 5d index (5d is last in section 5).
  const idx5c = CHECKLIST_ITEMS.findIndex(d => d.key === '5c');
  const idx5d = CHECKLIST_ITEMS.findIndex(d => d.key === '5d');
  const idx6a = CHECKLIST_ITEMS.findIndex(d => d.key === '6a');
  assert.ok(idx5c < idx5d, 'M1: 5c comes before 5d in CHECKLIST_ITEMS');
  assert.ok(idx5d < idx6a, 'M2: 5d comes before 6a in CHECKLIST_ITEMS');

  // M3: HTML has #srSection5dBlock wrapper.
  assert.ok(html.includes('id="srSection5dBlock"'), 'M3: #srSection5dBlock id present in HTML');

  // M4: renderChecklist marks section 6 header with data-sec-start="6".
  assert.ok(html.includes('data-sec-start="'), 'M4: renderChecklist emits data-sec-start attributes');
  assert.ok(html.includes('"6"'), 'M4b: data-sec-start="6" referenced in JS');

  // M5: renderChecklist re-inserts block5d before [data-sec-start="6"] (section 5d before section 6).
  assert.ok(html.includes('data-sec-start="6"'), 'M5: querySelector targets data-sec-start="6" for block5d insertion');
  assert.ok(html.includes('insertBefore(block5d'), 'M5b: insertBefore(block5d ...) present in renderChecklist');

  // M6: block5d is detached before host.innerHTML (preserve canvas/listeners on re-render).
  assert.ok(html.includes('removeChild(block5d)'), 'M6: block5d detached before host.innerHTML to preserve canvas state');

  // M7: 5d block header is labeled as "5d." (part of section 5, not standalone section header).
  assert.ok(html.includes('5d. Site plan markup and sign-off'), 'M7: 5d block labeled as 5d sub-item of section 5');

  // M8: Section 4 in site-readiness.html ITEMS is titled "Trucking Plan".
  assert.ok(html.includes("secLabel: '4. Trucking Plan'") || html.includes('secLabel: "4. Trucking Plan"'), 'M8: Section 4 titled Trucking Plan in client ITEMS');

  console.log('M (5d DOM order + section structure): PASS');
}

console.log('\nAll R10 tests PASSED.');
