#!/usr/bin/env node
// Regression tests for 2026-10-29 EI SharePoint upload fix.
//
// Root cause (this fix): uploadEquipInspectionPdf returned `{ ..., serialFolderId }`
// where `serialFolderId` was an undeclared variable (the local var is `serialId`).
// In ES module strict mode this throws ReferenceError AFTER the PDF is already
// uploaded to SharePoint.  The throw was caught silently in the API, so the submit
// returned ok:true but pdfItemId/pdfWebUrl were never stored.
//
// Fixes verified here:
//   V: equip-inspection-doc.js – return uses serialFolderId: serialId (correct key)
//   W: equipment-inspection.js – spUploadWarning set on catch; returned as spWarning
//   X: equipment-inspection.html – eiDoSubmit shows warning when d.spWarning present
//
// Run: node field/tests/test-ei-sp-upload-20261029.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}` + (detail ? ': ' + detail : ''));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// V: equip-inspection-doc.js return statement fix
// ---------------------------------------------------------------------------
console.log('\n--- V: equip-inspection-doc.js serialFolderId return fix ---');
{
  const src = readFileSync(
    path.join(ROOT, 'functions/lib/equip-inspection-doc.js'), 'utf8'
  );

  // V1: The return must use `serialFolderId: serialId` (property: variable), NOT bare `serialFolderId`
  assert(
    'V1: return uses serialFolderId: serialId (not bare shorthand)',
    src.includes('serialFolderId: serialId') && !src.match(/,\s*serialFolderId\s*[},]/)
  );

  // V2: The local variable is declared as `serialId`
  assert(
    'V2: local variable serialId is declared (ensureChildFolder result)',
    src.includes('const serialId  = await ensureChildFolder') || src.includes('const serialId = await ensureChildFolder')
  );

  // V3: The function still returns all expected properties
  const returnLine = src.match(/return \{[^}]+serialFolderId[^}]+\}/)?.[0] || '';
  assert('V3: return includes name, itemId, webUrl, serialFolderId',
    returnLine.includes('name:') && returnLine.includes('itemId:') &&
    returnLine.includes('webUrl:') && returnLine.includes('serialFolderId:')
  );

  // V4: The return statement must NOT use bare shorthand `serialFolderId }` or `serialFolderId,`.
  // The bug was `return { ..., serialFolderId }` (shorthand = undeclared ReferenceError).
  // After the fix it must be `serialFolderId: serialId` (explicit key: value).
  // We specifically check the return line in uploadEquipInspectionPdf.
  const returnMatch = src.match(/return \{[^}]+\}/)?.[0] || '';
  const hasShorthand = /,\s*serialFolderId\s*[},]/.test(returnMatch);
  assert(
    'V4: return statement does not use bare serialFolderId shorthand',
    !hasShorthand,
    hasShorthand ? 'return still contains bare shorthand: ' + returnMatch : ''
  );

  // V5: The EQUIP_CHECKLIST_ID constant is still present and unchanged
  assert(
    'V5: EQUIP_CHECKLIST_ID hardcoded folder ID present',
    src.includes("const EQUIP_CHECKLIST_ID = '016ISVH63BW25FXFK2Y5H2UPBKEI2ZRSW2'")
  );

  // V6: pdfFilename still produces correct format for known inputs
  // Inline smoke test of the pure function via regex on source (no import needed):
  // pdfFilename uses rec.date slice + sanitizeSerial.  Verify the formula is present.
  assert(
    'V6: pdfFilename formula uses yy + mmdd + serial slices',
    src.includes("d.slice(2, 4)") && src.includes("d.slice(5, 7)") && src.includes("d.slice(8, 10)")
  );
}

// ---------------------------------------------------------------------------
// W: equipment-inspection.js spUploadWarning wiring
// ---------------------------------------------------------------------------
console.log('\n--- W: equipment-inspection.js spUploadWarning wiring ---');
{
  const src = readFileSync(
    path.join(ROOT, 'functions/api/equipment-inspection.js'), 'utf8'
  );

  // W1: spUploadWarning variable is declared before the if (graphConfigured) block
  assert(
    'W1: spUploadWarning variable declared',
    src.includes('let spUploadWarning = null')
  );

  // W2: spUploadWarning is set when getGraphToken throws
  assert(
    'W2: spUploadWarning set on graph token failure',
    src.includes("spUploadWarning = 'PDF could not be saved to SharePoint (auth error)")
  );

  // W3: spUploadWarning is set in the uploadEquipInspectionPdf catch block
  assert(
    'W3: spUploadWarning set on SP upload failure catch',
    src.includes("spUploadWarning = 'PDF could not be saved to SharePoint. Your submission")
  );

  // W4: spWarning is returned in the json response
  assert(
    'W4: spWarning included in submit response',
    src.includes('spWarning: spUploadWarning')
  );

  // W5: console.error still present for the SP upload failure (server-side logging retained)
  assert(
    'W5: console.error logging retained for SP upload failure',
    src.includes("console.error('[equip-inspection] SP upload failed:'")
  );

  // W6: The existing catch for photo batch upload is NOT changed (separate concern)
  assert(
    'W6: photo SP upload batch catch unchanged (console.error only)',
    src.includes("console.error('[equip-inspection] photo SP upload batch failed:'")
  );

  // W7: The successful path still sets body.pdfItemId and body.pdfWebUrl
  assert(
    'W7: success path still sets pdfItemId and pdfWebUrl',
    src.includes('body.pdfItemId = ref.itemId') && src.includes('body.pdfWebUrl = ref.webUrl')
  );

  // W8: spWarning field is null on success (it is only set in catch blocks)
  // Verify there is no unconditional assignment of spUploadWarning outside catch paths.
  // The declaration is `let spUploadWarning = null` and it is only set in catch blocks.
  const assignLines = src.match(/spUploadWarning\s*=/g) || [];
  // Should be exactly: declaration (= null) + 2 catch assignments = 3
  assert(
    'W8: spUploadWarning assigned exactly 3 times (init + 2 catch paths)',
    assignLines.length === 3,
    'found ' + assignLines.length + ' assignments'
  );
}

// ---------------------------------------------------------------------------
// X: equipment-inspection.html eiDoSubmit spWarning display
// ---------------------------------------------------------------------------
console.log('\n--- X: equipment-inspection.html eiDoSubmit spWarning display ---');
{
  const src = readFileSync(
    path.join(ROOT, 'equipment-inspection.html'), 'utf8'
  );

  // X1: d.spWarning is checked in the success branch
  assert(
    'X1: d.spWarning checked in eiDoSubmit success branch',
    src.includes('if (d.spWarning)')
  );

  // X2: When spWarning present, eiShowMsg is called with isError=true (second arg true)
  assert(
    'X2: spWarning path calls eiShowMsg with error flag',
    src.includes("eiShowMsg('Submitted. WARNING: ' + d.spWarning, true)")
  );

  // X3: The normal success path (no spWarning) still shows the SP confirmation
  assert(
    'X3: normal success path shows PDF saved to SharePoint message',
    src.includes("eiShowMsg('Submitted. PDF saved to SharePoint (' + (d.pdfName || '') + ').', false)")
  );

  // X4: eiMarkSaved('Submitted') is still called on both paths (record IS submitted)
  // Count occurrences after the d.ok block
  const markCalls = (src.match(/eiMarkSaved\('Submitted'\)/g) || []).length;
  assert(
    'X4: eiMarkSaved Submitted called (once, shared across both warning paths)',
    markCalls >= 1,
    'found ' + markCalls
  );

  // X5: The spWarning branch is inside the d.ok branch (not in the else).
  // eiMarkSaved('Submitted') may also appear elsewhere (e.g. on record load);
  // verify the LAST occurrence of eiMarkSaved('Submitted') comes after spWarning check.
  const okIdx   = src.indexOf('if (d && d.ok)');
  const warnIdx = src.indexOf('if (d.spWarning)');
  // Find the eiMarkSaved('Submitted') that is INSIDE the eiDoSubmit function
  // (after the d.ok check), not the earlier guard on page load.
  const markIdx = src.lastIndexOf("eiMarkSaved('Submitted')");
  assert(
    'X5: spWarning check inside d.ok block; eiMarkSaved follows',
    okIdx > -1 && warnIdx > okIdx && markIdx > warnIdx
  );

  // X6: Error path (d.ok false) is unchanged: shows d.error or 'Submission failed'
  assert(
    'X6: error path still shows d.error or Submission failed',
    src.includes("eiShowMsg((d && d.error) || 'Submission failed', true)")
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
