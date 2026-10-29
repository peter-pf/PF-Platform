#!/usr/bin/env node
// Regression tests for 2026-10-29 EI bug fixes.
//
// Bug 1 (Invalid id format): submitting EI or TT without a prior save produced
//   "Invalid id format" 400 from the server.  Root cause: EI used a local
//   'ei-<timestamp>' fallback id that the server UUID regex rejects; TT sent
//   action='submit' with id=null which also fails the UUID check.
//
// Bug 2 (form state bleed): answers entered for one machine type appeared in
//   other machines' forms.  Root cause: a single flat eiState.items object was
//   shared across all machine types.  Fix: per-machine eiMachineStates map.
//
// Run: node field/tests/test-ei-fix-20261029.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';

const __dir    = dirname(fileURLToPath(import.meta.url));
const htmlSrc  = readFileSync(resolve(__dir, '../equipment-inspection.html'),  'utf8');
const ttSrc    = readFileSync(resolve(__dir, '../toolbox-talk.html'),          'utf8');
const apiSrc   = readFileSync(resolve(__dir, '../functions/api/equipment-inspection.js'), 'utf8');
const ttApiSrc = readFileSync(resolve(__dir, '../functions/api/toolbox-talk.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ===========================================================================
// P. BUG 1 — EI "Invalid id format" fix (source-level checks)
// ===========================================================================

// P1: The 'ei-' fallback id is gone from eiCollectBody.
// Old code: id: eiState.id || ('ei-' + Date.now() + ...) — this produced a
// non-UUID that the server's UUID_RE rejected on update/submit.
test('P1: eiCollectBody no longer generates "ei-" fallback id', () => {
  assert.ok(
    !htmlSrc.includes("'ei-' + Date.now()"),
    'eiCollectBody must not generate ei-<timestamp> fallback ids'
  );
});

// P2: UUID_RE_CLIENT is defined in the HTML so action dispatch can validate ids.
test('P2: HTML defines UUID_RE_CLIENT for client-side id validation', () => {
  assert.ok(htmlSrc.includes('UUID_RE_CLIENT'), 'UUID_RE_CLIENT must be defined in HTML');
  assert.ok(
    htmlSrc.includes('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i'),
    'UUID_RE_CLIENT must use the standard UUID v4 pattern'
  );
});

// P3: Save Draft uses UUID_RE_CLIENT to choose create vs update (not length check).
// Old code: eiState.id && eiState.id.length > 10 ? 'update' : 'create' — this
// always sent 'update' for fresh forms because the fallback string was >10 chars.
test('P3: Save Draft determines action via UUID_RE_CLIENT, not string length', () => {
  assert.ok(
    !htmlSrc.includes('eiState.id.length > 10'),
    'length-based action check must be removed from Save Draft handler'
  );
  assert.ok(
    htmlSrc.includes('UUID_RE_CLIENT.test(ms.id'),
    'Save Draft must use UUID_RE_CLIENT.test to determine action'
  );
});

// P4: Submit button calls eiDoSubmit (the extracted helper) and auto-creates first.
test('P4: eiDoSubmit helper function exists in HTML', () => {
  assert.ok(htmlSrc.includes('function eiDoSubmit('), 'eiDoSubmit must be defined');
});

// P5: Submit handler checks UUID_RE_CLIENT before sending 'submit' action.
test('P5: Submit handler auto-creates when ms.id is not a UUID', () => {
  assert.ok(
    htmlSrc.includes("UUID_RE_CLIENT.test(ms.id || '')"),
    "Submit handler must guard with UUID_RE_CLIENT.test(ms.id || '')"
  );
  assert.ok(
    htmlSrc.includes("action: 'create'") && htmlSrc.includes('eiDoSubmit(body)'),
    'Submit handler must auto-create then call eiDoSubmit'
  );
});

// P6: API still requires UUID on update/submit (server-side validation unchanged).
test('P6: API still validates id with UUID_RE on update and submit', () => {
  assert.ok(apiSrc.includes('UUID_RE.test(clientId)'),   'API must validate clientId with UUID_RE');
  assert.ok(apiSrc.includes("'Invalid id format', 400"), 'API must return 400 for invalid id');
});

// P7: eiCollectBody returns ms.id (null for new forms, UUID after save).
test('P7: eiCollectBody returns ms.id (null-safe, no fallback)', () => {
  assert.ok(
    htmlSrc.includes('id:               ms.id,'),
    'eiCollectBody must return ms.id not a generated fallback'
  );
});

// P8: Save Draft no longer sets eiState.id to body.id before the action check.
// Old code set eiState.id = body.id first (overwriting with fallback), making
// the subsequent length check always choose 'update'.
test('P8: Save Draft does not overwrite ms.id before action check', () => {
  // The broken pattern was: eiState.id = body.id; ... action: eiState.id ... 'update'
  assert.ok(
    !htmlSrc.includes('eiState.id = body.id'),
    'broken "eiState.id = body.id" assignment must be removed'
  );
});

// ===========================================================================
// Q. BUG 1 — TT "Invalid id format" fix (source-level checks)
// ===========================================================================

// Q1: TT HTML defines TT_UUID_RE for its id validation.
test('Q1: TT HTML defines TT_UUID_RE', () => {
  assert.ok(ttSrc.includes('TT_UUID_RE'), 'toolbox-talk.html must define TT_UUID_RE');
  assert.ok(
    ttSrc.includes('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i'),
    'TT_UUID_RE must use the standard UUID v4 pattern'
  );
});

// Q2: TT ttSave auto-creates a draft before submitting when no UUID exists.
test('Q2: ttSave auto-creates draft when submitting with no server UUID', () => {
  assert.ok(
    ttSrc.includes("TT_UUID_RE.test(ttState.id || '')"),
    "ttSave must guard submit with TT_UUID_RE.test(ttState.id || '')"
  );
  assert.ok(
    ttSrc.includes("action: 'create'"),
    "ttSave must send action: 'create' in the auto-create path"
  );
  assert.ok(
    ttSrc.includes('ttSave(true)'),
    'ttSave must retry submit (ttSave(true)) after auto-create succeeds'
  );
});

// Q3: TT save-draft path uses UUID check (not just ttState.id truthy).
test('Q3: TT save-draft uses TT_UUID_RE check for action dispatch', () => {
  assert.ok(
    ttSrc.includes("TT_UUID_RE.test(ttState.id || '') ? 'update' : 'create'"),
    "TT save-draft action must use TT_UUID_RE.test, not just ttState.id truthy"
  );
});

// Q4: TT API still validates UUID on update/submit (server-side unchanged).
test('Q4: TT API validates id with UUID_RE on update/submit', () => {
  assert.ok(ttApiSrc.includes('UUID_RE.test(clientId)'),     'TT API must validate clientId');
  assert.ok(ttApiSrc.includes("'Invalid id format', 400"),   'TT API must return 400 for bad id');
});

// ===========================================================================
// R. BUG 2 — EI form state bleed fix (source-level checks)
// ===========================================================================

// R1: eiMachineStates variable replaces flat id/items/safeToOperate/sectionPhotos.
test('R1: HTML has eiMachineStates per-machine state map', () => {
  assert.ok(htmlSrc.includes('var eiMachineStates = {}'), 'eiMachineStates must be defined');
});

// R2: eiInitMachineState initialises per-machine state with isolated fields.
test('R2: HTML has eiInitMachineState function', () => {
  assert.ok(htmlSrc.includes('function eiInitMachineState('), 'eiInitMachineState must be defined');
  // Must include the per-machine id field
  assert.ok(
    htmlSrc.includes('id: null,           // server-generated UUID'),
    'eiInitMachineState must initialise id to null'
  );
});

// R3: eiSaveDomToCurrentState persists DOM values before a machine switch.
test('R3: HTML has eiSaveDomToCurrentState function', () => {
  assert.ok(
    htmlSrc.includes('function eiSaveDomToCurrentState()'),
    'eiSaveDomToCurrentState must be defined'
  );
});

// R4: eiLoadStateToDom restores per-machine DOM values after a machine switch.
test('R4: HTML has eiLoadStateToDom function', () => {
  assert.ok(
    htmlSrc.includes('function eiLoadStateToDom('),
    'eiLoadStateToDom must be defined'
  );
});

// R5: eiSetType calls eiSaveDomToCurrentState before switching.
test('R5: eiSetType calls eiSaveDomToCurrentState before switching machine type', () => {
  // Search for the CALL (with semicolon), which won't match the function definition
  // (which ends with '{', not ';').
  assert.ok(
    htmlSrc.includes('eiSaveDomToCurrentState();'),
    'eiSetType must call eiSaveDomToCurrentState (with semicolon)'
  );
  const setTypeIdx  = htmlSrc.indexOf('function eiSetType(');
  // indexOf with semicolon finds the call site, not the definition
  const saveCallIdx = htmlSrc.indexOf('eiSaveDomToCurrentState();');
  assert.ok(
    saveCallIdx > setTypeIdx,
    'eiSaveDomToCurrentState(); call must appear after eiSetType definition'
  );
});

// R6: eiSetType calls eiLoadStateToDom to restore the new machine's values.
test('R6: eiSetType calls eiLoadStateToDom to restore new machine DOM values', () => {
  assert.ok(
    htmlSrc.includes('eiLoadStateToDom(eiMachineStates[type])'),
    'eiSetType must call eiLoadStateToDom with the new machine state'
  );
});

// R7: eiOnItemChange writes to per-machine state, not flat eiState.items.
test('R7: eiOnItemChange uses eiMachineStates, not flat eiState.items', () => {
  assert.ok(
    !htmlSrc.includes('eiState.items[key]'),
    'eiOnItemChange must not reference flat eiState.items[key]'
  );
  assert.ok(
    htmlSrc.includes('ms.items[key]'),
    'eiOnItemChange must write to ms.items[key]'
  );
});

// R8: eiRenderChecklist reads items from per-machine state, not flat eiState.items.
test('R8: eiRenderChecklist reads from per-machine ms.items', () => {
  assert.ok(
    htmlSrc.includes('var ms   = eiMachineStates[type]'),
    'eiRenderChecklist must obtain ms from eiMachineStates[type]'
  );
  assert.ok(
    htmlSrc.includes('var saved = ms.items[d.key]'),
    'eiRenderChecklist must read from ms.items[d.key]'
  );
});

// R9: Safe-to-operate handlers update per-machine state.
test('R9: Safe-to-operate Yes/No handlers update eiMachineStates, not flat eiState', () => {
  assert.ok(
    !htmlSrc.includes('eiState.safeToOperate = true'),
    'safeToOperate must not be written to flat eiState'
  );
  assert.ok(
    htmlSrc.includes('eiMachineStates[eiState.machineType].safeToOperate = true'),
    'eiSafeYes must update eiMachineStates[...].safeToOperate'
  );
  assert.ok(
    htmlSrc.includes('eiMachineStates[eiState.machineType].safeToOperate = false'),
    'eiSafeNo must update eiMachineStates[...].safeToOperate'
  );
});

// R10: eiCollectBody reads safeToOperate from per-machine state.
test('R10: eiCollectBody reads safeToOperate from ms.safeToOperate', () => {
  assert.ok(
    htmlSrc.includes('safeToOperate:    ms.safeToOperate,'),
    'eiCollectBody must use ms.safeToOperate'
  );
  assert.ok(
    !htmlSrc.includes('safeToOperate:    eiState.safeToOperate,'),
    'eiCollectBody must not use flat eiState.safeToOperate'
  );
});

// R11: eiOnPhotoSelected and eiOnPhotoDelete use per-machine ms.id and ms.sectionPhotos.
test('R11: photo handlers use per-machine ms.id and ms.sectionPhotos', () => {
  // eiOnPhotoSelected must guard with ms.id (not eiState.id)
  assert.ok(
    htmlSrc.includes('!ms.id') && htmlSrc.includes('var ms = eiMachineStates[eiState.machineType]'),
    'eiOnPhotoSelected must obtain ms from eiMachineStates and guard with ms.id'
  );
  assert.ok(
    !htmlSrc.includes('id: eiState.id,'),
    'photo handlers must not send flat eiState.id as photo record id'
  );
  assert.ok(
    htmlSrc.includes('id: ms.id,'),
    'photo handlers must send ms.id as photo record id'
  );
});

// R12: eiNewForm resets only current machine's state (not global flat state).
test('R12: eiNewForm resets per-machine state, not flat eiState fields', () => {
  assert.ok(
    !htmlSrc.includes('eiState.id = null; eiState.items = {}'),
    'eiNewForm must not reset flat eiState fields (old pattern)'
  );
  assert.ok(
    htmlSrc.includes("ms.id = null;\n  ms.items = {};"),
    'eiNewForm must reset ms.id and ms.items'
  );
});

// R13: eiLoadRecord populates per-machine state (not flat eiState fields).
test('R13: eiLoadRecord loads into per-machine state', () => {
  assert.ok(
    !htmlSrc.includes('eiState.id = rec.id;'),
    'eiLoadRecord must not assign rec.id to flat eiState.id'
  );
  assert.ok(
    htmlSrc.includes('ms.id = rec.id;'),
    'eiLoadRecord must assign rec.id to ms.id'
  );
});

// R14: Boot init calls eiInitMachineState for all 3 types.
test('R14: Boot init calls eiInitMachineState for all 3 machine types', () => {
  assert.ok(
    htmlSrc.includes("['skid_steer', 'predrill_excavator', 'vibro_excavator'].forEach(eiInitMachineState)"),
    'Boot must initialise per-machine state for all 3 types'
  );
});

// ===========================================================================
// S. INTERACTION SAFETY CHECKS (cross-contamination guard)
// ===========================================================================

// S1: flat eiState no longer has items, id, safeToOperate, or sectionPhotos fields.
test('S1: flat eiState declaration no longer has id/items/safeToOperate/sectionPhotos', () => {
  // The eiState declaration block should not contain the old fields.
  // We check the declaration block specifically.
  const stateIdx = htmlSrc.indexOf('var eiState = {');
  const stateEnd = htmlSrc.indexOf('};', stateIdx) + 2;
  const stateBlock = htmlSrc.slice(stateIdx, stateEnd);
  assert.ok(!stateBlock.includes('id: null,'),          'flat eiState must not have id field');
  assert.ok(!stateBlock.includes('items:'),              'flat eiState must not have items field');
  assert.ok(!stateBlock.includes('safeToOperate:'),      'flat eiState must not have safeToOperate');
  assert.ok(!stateBlock.includes('sectionPhotos:'),      'flat eiState must not have sectionPhotos');
});

// S2: no remaining references to eiState.id (should all be ms.id now).
test('S2: no remaining references to eiState.id in HTML', () => {
  // Strip HTML comments so we don't false-positive on commented-out old code.
  const stripped = htmlSrc.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !stripped.includes('eiState.id'),
    'HTML must have no remaining eiState.id references (all replaced by ms.id)'
  );
});

// S3: no remaining references to eiState.items.
test('S3: no remaining references to eiState.items in HTML', () => {
  const stripped = htmlSrc.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !stripped.includes('eiState.items'),
    'HTML must have no remaining eiState.items references'
  );
});

// S4: no remaining references to eiState.safeToOperate.
test('S4: no remaining references to eiState.safeToOperate in HTML', () => {
  const stripped = htmlSrc.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !stripped.includes('eiState.safeToOperate'),
    'HTML must have no remaining eiState.safeToOperate references'
  );
});

// S5: no remaining references to eiState.sectionPhotos.
test('S5: no remaining references to eiState.sectionPhotos in HTML', () => {
  const stripped = htmlSrc.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !stripped.includes('eiState.sectionPhotos'),
    'HTML must have no remaining eiState.sectionPhotos references'
  );
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 100);
