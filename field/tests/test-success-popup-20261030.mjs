#!/usr/bin/env node
// test-success-popup-20261030.mjs
//
// Tests for the 2026-10-30 success modal feature (Derek request):
//   - After a successful submit on all 5 forms, an in-page success modal
//     shows "Confirmed: submitted" plus "Emailed to:" with the recipient list.
//   - Each submit endpoint now returns emailedTo: [{name,email}] in the response.
//   - field-lists.js SEED now includes Christian Boutte; "test" is filtered.
//   - TT ttShowSubmitMsg handles {name,email} objects.
//
// CLICK HARNESS APPROACH:
//   For each form we build a minimal DOM containing only the confirm modal,
//   success modal, and submit button. We extract the modal-helper JS from the
//   HTML source (pfShowConfirmModal*, pfHideConfirmModal*, pfShowSuccessModal*)
//   and inject a minimal save-stub that calls fetch and on success calls the
//   success modal function. Then we click Submit → click Confirm → assert fetch
//   fired exactly once and success modal is visible.
//
//   "Fail proof" section uses a deliberately broken handler (calls hide before
//   capturing callback, replicating the 10/29 bug) and shows the harness fails.
//
// Run: node field/tests/test-success-popup-20261030.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';
import { createRequire }     from 'module';

const require  = createRequire(import.meta.url);
const { JSDOM } = require('/home/aiciv/PF-Platform/node_modules/jsdom');

const __dir   = dirname(fileURLToPath(import.meta.url));
const fieldDir = resolve(__dir, '..');

const drSrc   = readFileSync(resolve(fieldDir, 'daily-report.html'),         'utf8');
const srSrc   = readFileSync(resolve(fieldDir, 'site-readiness.html'),       'utf8');
const ttSrc   = readFileSync(resolve(fieldDir, 'toolbox-talk.html'),         'utf8');
const eiSrc   = readFileSync(resolve(fieldDir, 'equipment-inspection.html'), 'utf8');
const toSrc   = readFileSync(resolve(fieldDir, 'time-off.html'),             'utf8');

const mlSrc   = readFileSync(resolve(fieldDir, 'functions/lib/mailing-lists.js'), 'utf8');
const drApiSrc = readFileSync(resolve(fieldDir, 'functions/api/daily-report.js'), 'utf8');
const srApiSrc = readFileSync(resolve(fieldDir, 'functions/api/site-readiness.js'), 'utf8');
const ttApiSrc = readFileSync(resolve(fieldDir, 'functions/api/toolbox-talk.js'), 'utf8');
const eiApiSrc = readFileSync(resolve(fieldDir, 'functions/api/equipment-inspection.js'), 'utf8');
const toApiSrc = readFileSync(resolve(fieldDir, 'functions/api/time-off.js'), 'utf8');
const flSrc   = readFileSync(resolve(fieldDir, 'functions/api/field-lists.js'), 'utf8');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}
function testFail(name, fn) {
  // This is a test that EXPECTS the inner assertion to fail. Returns true if it failed.
  try { fn(); console.error('  FAIL', name, '(expected failure but it passed)'); failed++; }
  catch { console.log('  PASS (expected fail)', name); passed++; }
}

// ============================================================================
// A. SOURCE-TEXT: server-side changes
// ============================================================================

console.log('\n--- A. Server: mailing-lists.js ---');
test('A1: resolveMailingListWithNames exported', () => {
  assert.ok(mlSrc.includes('resolveMailingListWithNames'), 'must export resolveMailingListWithNames');
});
test('A2: resolveMailingListWithNames queries users table for names', () => {
  assert.ok(mlSrc.includes('SELECT email, name FROM users'), 'must query users table');
});
test('A3: resolveMailingListWithNames returns {name,email} objects', () => {
  assert.ok(
    mlSrc.includes('name: nameMap[') || mlSrc.includes('.name =') || mlSrc.includes('name,'),
    'must build {name,email} objects'
  );
});
test('A4: resolveMailingListWithNames falls back to email as name on lookup error', () => {
  assert.ok(
    mlSrc.includes('name: email, email') || mlSrc.includes('{ name: email'),
    'must fall back to email as name on catch'
  );
});

console.log('\n--- B. Server: field-lists.js ---');
test('B1: SEED personnel includes Christian Boutte', () => {
  assert.ok(flSrc.includes("'Christian Boutte'"), "SEED.personnel must include 'Christian Boutte'");
});
test('B2: buildResponse filters out exact "test" entries', () => {
  assert.ok(
    flSrc.includes("'test'") || flSrc.includes('"test"'),
    'buildResponse must reference "test" for filtering'
  );
});
test('B3: stripTest filter is applied to personnel list', () => {
  assert.ok(
    flSrc.includes('stripTest') || flSrc.includes("toLowerCase() !== 'test'"),
    'must apply test-stripping filter'
  );
});
test('B4: Christian Boutte is in correct SEED position (after Seth, before Jordan)', () => {
  const idx_seth      = flSrc.indexOf("'Seth Willis'");
  const idx_christian = flSrc.indexOf("'Christian Boutte'");
  const idx_jordan    = flSrc.indexOf("'Jordan Lemay'");
  assert.ok(idx_seth < idx_christian && idx_christian < idx_jordan,
    'Christian Boutte must appear between Seth Willis and Jordan Lemay in the SEED');
});

console.log('\n--- C. Server: daily-report.js ---');
test('C1: DR imports resolveMailingListWithNames', () => {
  assert.ok(drApiSrc.includes('resolveMailingListWithNames'), 'must import resolveMailingListWithNames');
});
test('C2: DR uses resolveMailingListWithNames for the daily_report list', () => {
  assert.ok(drApiSrc.includes("resolveMailingListWithNames(env.DB, 'daily_report')"),
    "must call resolveMailingListWithNames with 'daily_report'");
});
test('C3: DR sends email with extracted email strings (r.email)', () => {
  assert.ok(drApiSrc.includes('recipients.map((r) => r.email)'), 'must extract .email for sendReportEmail');
});
test('C4: DR distribution includes emailedTo', () => {
  assert.ok(drApiSrc.includes('distribution: { emailedTo:'), 'distribution must include emailedTo');
});
test('C5: DR response includes emailWarning', () => {
  assert.ok(drApiSrc.includes('emailWarning:'), 'response must include emailWarning');
});

console.log('\n--- D. Server: site-readiness.js ---');
test('D1: SR imports resolveMailingListWithNames', () => {
  assert.ok(srApiSrc.includes('resolveMailingListWithNames'), 'must import resolveMailingListWithNames');
});
test('D2: SR uses resolveMailingListWithNames', () => {
  assert.ok(srApiSrc.includes("resolveMailingListWithNames(env.DB, 'site_readiness')"));
});
test('D3: SR sends email with .email extraction', () => {
  assert.ok(srApiSrc.includes('recipients.map((r) => r.email)'));
});
test('D4: SR response includes emailWarning', () => {
  assert.ok(srApiSrc.includes('emailWarning:'));
});

console.log('\n--- E. Server: toolbox-talk.js ---');
test('E1: TT imports resolveMailingListWithNames', () => {
  assert.ok(ttApiSrc.includes('resolveMailingListWithNames'), 'must import resolveMailingListWithNames');
});
test('E2: TT uses resolveMailingListWithNames', () => {
  assert.ok(ttApiSrc.includes("resolveMailingListWithNames(env.DB, 'toolbox_talk')"));
});
test('E3: TT keeps body.emailedTo = recipients.slice() (existing test compatibility)', () => {
  assert.ok(ttApiSrc.includes('body.emailedTo = recipients.slice()'));
});
test('E4: TT sends email with .email extraction', () => {
  assert.ok(ttApiSrc.includes('recipients.map((r) => r.email)'));
});

console.log('\n--- F. Server: equipment-inspection.js ---');
test('F1: EI imports resolveMailingListWithNames', () => {
  assert.ok(eiApiSrc.includes('resolveMailingListWithNames'), 'must import resolveMailingListWithNames');
});
test('F2: EI uses resolveMailingListWithNames', () => {
  assert.ok(eiApiSrc.includes("resolveMailingListWithNames(env.DB, 'equipment_inspection')"));
});
test('F3: EI response includes emailedTo', () => {
  assert.ok(eiApiSrc.includes('emailedTo:'), 'EI submit response must include emailedTo');
});
test('F4: EI response includes emailWarning', () => {
  assert.ok(eiApiSrc.includes('emailWarning:'), 'EI submit response must include emailWarning');
});
test('F5: EI sends email with .email extraction', () => {
  // EI uses variable name eiRecipients
  assert.ok(eiApiSrc.includes('eiRecipients.map((r) => r.email)'), 'must extract .email for sendEquipInspectionEmail');
});

console.log('\n--- G. Server: time-off.js ---');
test('G1: TO imports resolveMailingListWithNames', () => {
  assert.ok(toApiSrc.includes('resolveMailingListWithNames'), 'must import resolveMailingListWithNames');
});
test('G2: TO pre-resolves mailing list before context.waitUntil', () => {
  // resolveMailingListWithNames must appear BEFORE context.waitUntil in source
  const idx_resolve = toApiSrc.indexOf('resolveMailingListWithNames');
  const idx_waituntil = toApiSrc.indexOf('context.waitUntil');
  assert.ok(idx_resolve < idx_waituntil, 'resolveMailingListWithNames must be called before context.waitUntil');
});
test('G3: TO response includes emailedTo', () => {
  assert.ok(toApiSrc.includes('emailedTo:'), 'TO submit response must include emailedTo');
});
test('G4: TO response includes emailWarning', () => {
  assert.ok(toApiSrc.includes('emailWarning:'), 'TO submit response must include emailWarning');
});
test('G5: TO sendRequestEmail accepts preResolvedEmails parameter', () => {
  assert.ok(toApiSrc.includes('preResolvedEmails'), 'sendRequestEmail must accept preResolvedEmails');
});

// ============================================================================
// H. SOURCE-TEXT: HTML forms — success modal HTML present
// ============================================================================

console.log('\n--- H. HTML: success modals present ---');
test('H1: DR has success modal element', () => {
  assert.ok(drSrc.includes('drSuccessModal'), 'DR must have #drSuccessModal');
});
test('H2: DR success modal has "Confirmed: submitted" title', () => {
  assert.ok(drSrc.includes('Confirmed: submitted'), 'DR success modal must say "Confirmed: submitted"');
});
test('H3: DR has pfShowDRSuccessModal function', () => {
  assert.ok(drSrc.includes('pfShowDRSuccessModal'), 'DR must define pfShowDRSuccessModal');
});
test('H4: DR success modal uses textContent not innerHTML for server data', () => {
  // The function must use textContent; check there's no innerHTML on the recipients div
  const fnStart = drSrc.indexOf('function pfShowDRSuccessModal');
  const fnEnd   = drSrc.indexOf('\n// ---- Submit confirm modal', fnStart);
  const fnBody  = drSrc.slice(fnStart, fnEnd);
  assert.ok(!fnBody.includes('innerHTML'), 'pfShowDRSuccessModal must not use innerHTML');
});
test('H5: DR pfShowDRSuccessModal is called on submit success', () => {
  assert.ok(drSrc.includes('pfShowDRSuccessModal('), 'pfShowDRSuccessModal must be called on success');
});
test('H6: SR has success modal element', () => {
  assert.ok(srSrc.includes('srSuccessModal'), 'SR must have #srSuccessModal');
});
test('H7: SR has pfShowSRSuccessModal function and call', () => {
  assert.ok(srSrc.includes('pfShowSRSuccessModal'), 'SR must define and call pfShowSRSuccessModal');
});
test('H8: TT has success modal element', () => {
  assert.ok(ttSrc.includes('ttSuccessModal'), 'TT must have #ttSuccessModal');
});
test('H9: TT has pfShowTTSuccessModal function and call', () => {
  assert.ok(ttSrc.includes('pfShowTTSuccessModal'), 'TT must define and call pfShowTTSuccessModal');
});
test('H10: EI has success modal element', () => {
  assert.ok(eiSrc.includes('eiSuccessModal'), 'EI must have #eiSuccessModal');
});
test('H11: EI has pfShowEISuccessModal function and call', () => {
  assert.ok(eiSrc.includes('pfShowEISuccessModal'), 'EI must define and call pfShowEISuccessModal');
});
test('H12: TO has success modal element', () => {
  assert.ok(toSrc.includes('toSuccessModal'), 'TO must have #toSuccessModal');
});
test('H13: TO has pfShowTOSuccessModal function and call', () => {
  assert.ok(toSrc.includes('pfShowTOSuccessModal'), 'TO must define and call pfShowTOSuccessModal');
});
test('H14: TT ttShowSubmitMsg handles {name,email} objects (not plain .join)', () => {
  const fnStart = ttSrc.indexOf('function ttShowSubmitMsg');
  const fnEnd   = ttSrc.indexOf('\n// ----', fnStart);
  const fnBody  = ttSrc.slice(fnStart, fnEnd);
  assert.ok(
    !fnBody.includes('emailedTo.join(') && fnBody.includes('r.name'),
    'ttShowSubmitMsg must use r.name not join()'
  );
});

// ============================================================================
// I. JSDOM CLICK HARNESS: DR (prove fetch fires once + success modal shows)
// ============================================================================

console.log('\n--- I. JSDOM click harness: DR ---');

// Build minimal HTML for the DR confirm→success flow.
// Extract just the modal helper functions from DR source.
function extractFn(src, fnName) {
  const start = src.indexOf('function ' + fnName);
  if (start < 0) return '';
  // Find the matching closing brace by counting braces
  let depth = 0; let i = start; let started = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// Build a minimal DOM for DR confirm→success modal flow
async function buildDRHarness({ fetchResponse, breakConfirmHandler }) {
  const domHtml = `<!DOCTYPE html><html><body>
    <button id="drSubmit">Submit</button>
    <div id="submitConfirmModal" style="display:none">
      <div id="drModalOverlay"></div>
      <button id="drModalCancel">Cancel</button>
      <button id="drModalConfirm">Submit</button>
    </div>
    <div id="drSuccessModal" style="display:none">
      <p id="drSuccessTitle">Confirmed: submitted</p>
      <div id="drSuccessRecipients"></div>
      <button id="drSuccessOk">OK</button>
    </div>
    <div id="drMsg"></div>
  </body></html>`;

  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'https://field.test/' });
  const win = dom.window;

  // Inject window.esc
  win.esc = (s) => s == null ? '' : String(s);

  // Inject the modal helper functions from source
  const helpers = [
    extractFn(drSrc, 'pfShowDRSuccessModal'),
    extractFn(drSrc, 'pfShowConfirmModal'),
    extractFn(drSrc, 'pfHideConfirmModal'),
  ].join('\n');
  const scriptEl = win.document.createElement('script');
  scriptEl.textContent = helpers;
  win.document.body.appendChild(scriptEl);

  // Stub fetch
  let fetchCallCount = 0;
  win.fetch = async () => {
    fetchCallCount++;
    return { ok: true, json: async () => fetchResponse };
  };

  // Wire submit button → confirm modal → fetch → success modal
  let msgShown = '';
  const submitBtn = win.document.getElementById('drSubmit');
  submitBtn.addEventListener('click', () => {
    win.pfShowConfirmModal(() => {
      // simulate save(true): call fetch, on success call pfShowDRSuccessModal
      win.fetch('/api/daily-report', { method: 'POST' }).then(async (r) => {
        const body = await r.json();
        if (body.saved) {
          const dist = body.distribution || {};
          msgShown = 'submitted';
          win.pfShowDRSuccessModal(dist.emailedTo || [], body.emailWarning, null);
        }
      });
    });
  });

  // Wire confirm modal — use BROKEN handler if requested (to prove failure)
  win.document.getElementById('drModalConfirm').addEventListener('click', function() {
    if (breakConfirmHandler) {
      // BUG: hide (nulls callback) THEN try to call it — callback is always null
      win.pfHideConfirmModal();
      const cb = win.pfConfirmModalCallback;
      if (cb) cb();
    } else {
      // CORRECT: capture callback first, then hide, then call
      const cb = win.pfConfirmModalCallback; win.pfHideConfirmModal(); if (cb) cb();
    }
  });

  // Wire OK button
  win.document.getElementById('drSuccessOk').addEventListener('click', () => {
    win.document.getElementById('drSuccessModal').style.display = 'none';
  });

  const getFetchCount  = () => fetchCallCount;
  const getModalStyle  = () => win.document.getElementById('drSuccessModal').style.display;
  const getRecipients  = () => win.document.getElementById('drSuccessRecipients').textContent;

  async function clickSubmit() {
    submitBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
  }
  async function clickConfirm() {
    win.document.getElementById('drModalConfirm').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20)); // let promise chain resolve
  }
  return { clickSubmit, clickConfirm, getFetchCount, getModalStyle, getRecipients };
}

// I1: DR click harness — success with recipients
await (async () => {
  const resp = {
    saved: true, record: { id: 'r1' },
    distribution: { emailedTo: [{ name: 'Brad Reinking', email: 'breinking@pierfoundations.com' }] },
    emailWarning: undefined,
  };
  const h = await buildDRHarness({ fetchResponse: resp, breakConfirmHandler: false });
  await h.clickSubmit();
  await h.clickConfirm();
  test('I1: DR: fetch fires exactly once after submit → confirm click', () => {
    assert.strictEqual(h.getFetchCount(), 1, `Expected 1 fetch call, got ${h.getFetchCount()}`);
  });
  test('I2: DR: success modal becomes visible after submit', () => {
    assert.strictEqual(h.getModalStyle(), 'flex', 'drSuccessModal must be display:flex after submit');
  });
  test('I3: DR: success modal recipients text includes Brad Reinking', () => {
    assert.ok(h.getRecipients().includes('Brad Reinking'), 'Recipients must show Brad Reinking');
  });
  test('I4: DR: success modal recipients text includes email address', () => {
    assert.ok(h.getRecipients().includes('breinking@pierfoundations.com'), 'Recipients must show email');
  });
})();

// I5: DR click harness — warning (empty list)
await (async () => {
  const resp = {
    saved: true, record: { id: 'r2' },
    distribution: { emailedTo: [] },
    emailWarning: 'Email not sent: the mailing list for this form is empty.',
  };
  const h = await buildDRHarness({ fetchResponse: resp, breakConfirmHandler: false });
  await h.clickSubmit();
  await h.clickConfirm();
  test('I5: DR: success modal shows when emailWarning is set', () => {
    assert.strictEqual(h.getModalStyle(), 'flex', 'drSuccessModal must show even with emailWarning');
  });
  test('I6: DR: success modal shows warning text when list is empty', () => {
    assert.ok(h.getRecipients().includes('mailing list'), 'Must show warning text about mailing list');
  });
})();

// I7: DR click harness — empty emailedTo, no warning
await (async () => {
  const resp = {
    saved: true, record: { id: 'r3' },
    distribution: { emailedTo: [] },
    emailWarning: undefined,
  };
  const h = await buildDRHarness({ fetchResponse: resp, breakConfirmHandler: false });
  await h.clickSubmit();
  await h.clickConfirm();
  test('I7: DR: success modal shows "No recipients" text for empty list without warning', () => {
    assert.ok(h.getRecipients().includes('No recipients'), 'Must show "No recipients" for empty list');
  });
})();

// ============================================================================
// J. FAIL PROOF: DR with broken confirm handler (replicates 10/29 bug)
// ============================================================================

console.log('\n--- J. FAIL PROOF: broken confirm handler ---');

await (async () => {
  const resp = {
    saved: true, record: { id: 'r4' },
    distribution: { emailedTo: [{ name: 'Test Owner', email: 'to@pierfoundations.com' }] },
  };
  const h = await buildDRHarness({ fetchResponse: resp, breakConfirmHandler: true });
  await h.clickSubmit();
  await h.clickConfirm();
  // With broken handler: pfHideConfirmModal() nulls the callback before it is called.
  // So fetch is NEVER called and the success modal NEVER shows.
  testFail('J1: (fail proof) broken confirm handler: fetch count should NOT be 0 — harness detects bug', () => {
    assert.strictEqual(h.getFetchCount(), 1, `Expected 1 but got ${h.getFetchCount()} — if this says 0, the bug is detected`);
  });
  testFail('J2: (fail proof) broken confirm handler: success modal should NOT be hidden — harness detects bug', () => {
    assert.strictEqual(h.getModalStyle(), 'flex', `Modal style is ${h.getModalStyle()} — if none, the bug is detected`);
  });
  console.log(`  (Fail proof results: fetchCount=${h.getFetchCount()}, modalStyle="${h.getModalStyle()}" — confirms harness can detect the 10/29 bug)`);
})();

// ============================================================================
// K. JSDOM CLICK HARNESS: SR, EI, TT, TO (abbreviated — prove same pattern)
// ============================================================================

console.log('\n--- K. JSDOM click harness: SR, EI, TT, TO ---');

// Generic minimal click harness builder for a form
async function buildFormHarness(formSrc, ids, fetchResponse) {
  const { submitId, confirmId, cancelId, overlayId, successModalId, recipientsId, successOkId,
          showConfirmFn, hideConfirmFn, showSuccessFn, callbackVar } = ids;

  const domHtml = `<!DOCTYPE html><html><body>
    <button id="${submitId}">Submit</button>
    <div id="submitConfirmModal" style="display:none">
      <div id="${overlayId}"></div>
      <button id="${cancelId}">Cancel</button>
      <button id="${confirmId}">Submit</button>
    </div>
    <div id="${successModalId}" style="display:none">
      <p id="${successModalId}Title">Confirmed: submitted</p>
      <div id="${recipientsId}"></div>
      <button id="${successOkId}">OK</button>
    </div>
  </body></html>`;

  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'https://field.test/' });
  const win = dom.window;
  win.esc = (s) => s == null ? '' : String(s);

  const helpers = [
    extractFn(formSrc, showSuccessFn),
    extractFn(formSrc, showConfirmFn),
    extractFn(formSrc, hideConfirmFn),
  ].join('\n');
  const scriptEl = win.document.createElement('script');
  scriptEl.textContent = helpers;
  win.document.body.appendChild(scriptEl);

  let fetchCount = 0;
  win.fetch = async () => { fetchCount++; return { ok: true, json: async () => fetchResponse }; };

  let called = false;
  win.document.getElementById(submitId).addEventListener('click', () => {
    win[showConfirmFn](() => {
      win.fetch('/api/submit', { method: 'POST' }).then(async (r) => {
        const body = await r.json();
        if (body.ok || body.saved) {
          called = true;
          // call the success modal function based on form type
          const emailedTo = (body.emailedTo || (body.distribution && body.distribution.emailedTo)) || [];
          win[showSuccessFn](emailedTo, body.emailWarning, body.spWarning);
        }
      });
    });
  });
  win.document.getElementById(confirmId).addEventListener('click', function() {
    const cb = win[callbackVar]; win[hideConfirmFn](); if (cb) cb();
  });

  async function run() {
    win.document.getElementById(submitId).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    win.document.getElementById(confirmId).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
  }
  return {
    run,
    getFetchCount: () => fetchCount,
    getModalStyle: () => win.document.getElementById(successModalId).style.display,
    getRecipients: () => win.document.getElementById(recipientsId).textContent,
  };
}

// SR
await (async () => {
  const resp = {
    saved: true, record: { id: 's1' },
    distribution: { emailedTo: [{ name: 'Jonathan Reinking', email: 'jreinking@pierfoundations.com' }] },
  };
  const h = await buildFormHarness(srSrc, {
    submitId: 'srSubmit', confirmId: 'srModalConfirm', cancelId: 'srModalCancel',
    overlayId: 'srModalOverlay', successModalId: 'srSuccessModal',
    recipientsId: 'srSuccessRecipients', successOkId: 'srSuccessOk',
    showConfirmFn: 'pfShowConfirmModalSR', hideConfirmFn: 'pfHideConfirmModalSR',
    showSuccessFn: 'pfShowSRSuccessModal', callbackVar: 'pfConfirmModalCallbackSR',
  }, resp);
  await h.run();
  test('K1: SR: fetch fires exactly once', () => { assert.strictEqual(h.getFetchCount(), 1); });
  test('K2: SR: success modal visible after submit', () => { assert.strictEqual(h.getModalStyle(), 'flex'); });
  test('K3: SR: success modal shows recipient name', () => {
    assert.ok(h.getRecipients().includes('Jonathan Reinking'));
  });
})();

// EI
await (async () => {
  const resp = {
    ok: true, id: 'e1', status: 'submitted',
    emailedTo: [{ name: 'Derek Franke', email: 'dfranke@pierfoundations.com' }],
    emailWarning: undefined, spWarning: undefined,
  };
  const h = await buildFormHarness(eiSrc, {
    submitId: 'eiSubmit', confirmId: 'eiModalConfirm', cancelId: 'eiModalCancel',
    overlayId: 'eiModalOverlay', successModalId: 'eiSuccessModal',
    recipientsId: 'eiSuccessRecipients', successOkId: 'eiSuccessOk',
    showConfirmFn: 'pfShowConfirmModalEI', hideConfirmFn: 'pfHideConfirmModalEI',
    showSuccessFn: 'pfShowEISuccessModal', callbackVar: 'pfConfirmModalCallback',
  }, resp);
  await h.run();
  test('K4: EI: fetch fires exactly once', () => { assert.strictEqual(h.getFetchCount(), 1); });
  test('K5: EI: success modal visible after submit', () => { assert.strictEqual(h.getModalStyle(), 'flex'); });
  test('K6: EI: success modal shows recipient name', () => {
    assert.ok(h.getRecipients().includes('Derek Franke'));
  });
})();

// EI with warning
await (async () => {
  const resp = {
    ok: true, id: 'e2', status: 'submitted',
    emailedTo: [], emailWarning: 'Email not sent: mailing list unavailable.',
    spWarning: undefined,
  };
  const h = await buildFormHarness(eiSrc, {
    submitId: 'eiSubmit', confirmId: 'eiModalConfirm', cancelId: 'eiModalCancel',
    overlayId: 'eiModalOverlay', successModalId: 'eiSuccessModal',
    recipientsId: 'eiSuccessRecipients', successOkId: 'eiSuccessOk',
    showConfirmFn: 'pfShowConfirmModalEI', hideConfirmFn: 'pfHideConfirmModalEI',
    showSuccessFn: 'pfShowEISuccessModal', callbackVar: 'pfConfirmModalCallback',
  }, resp);
  await h.run();
  test('K7: EI: success modal shows warning text when emailWarning set', () => {
    assert.ok(h.getRecipients().includes('unavailable') || h.getRecipients().includes('mailing list'));
  });
})();

// TT
await (async () => {
  const resp = {
    ok: true, id: 't1', status: 'submitted',
    emailedTo: [{ name: 'Brad Reinking', email: 'breinking@pierfoundations.com' }],
    emailWarning: undefined,
  };
  const h = await buildFormHarness(ttSrc, {
    submitId: 'ttSubmitBtn', confirmId: 'ttModalConfirm', cancelId: 'ttModalCancel',
    overlayId: 'ttModalOverlay', successModalId: 'ttSuccessModal',
    recipientsId: 'ttSuccessRecipients', successOkId: 'ttSuccessOk',
    showConfirmFn: 'pfShowConfirmModalTT', hideConfirmFn: 'pfHideConfirmModalTT',
    showSuccessFn: 'pfShowTTSuccessModal', callbackVar: 'pfConfirmModalCallback',
  }, resp);
  await h.run();
  test('K8: TT: fetch fires exactly once', () => { assert.strictEqual(h.getFetchCount(), 1); });
  test('K9: TT: success modal visible after submit', () => { assert.strictEqual(h.getModalStyle(), 'flex'); });
  test('K10: TT: success modal shows recipient name', () => {
    assert.ok(h.getRecipients().includes('Brad Reinking'));
  });
})();

// TO
await (async () => {
  const resp = {
    ok: true, id: 'to1', status: 'pending',
    emailedTo: [{ name: 'Jonathan Reinking', email: 'jreinking@pierfoundations.com' }],
    emailWarning: undefined,
  };
  const h = await buildFormHarness(toSrc, {
    submitId: 'submitBtn', confirmId: 'toModalConfirm', cancelId: 'toModalCancel',
    overlayId: 'toModalOverlay', successModalId: 'toSuccessModal',
    recipientsId: 'toSuccessRecipients', successOkId: 'toSuccessOk',
    showConfirmFn: 'pfShowConfirmModalTO', hideConfirmFn: 'pfHideConfirmModalTO',
    showSuccessFn: 'pfShowTOSuccessModal', callbackVar: 'pfConfirmModalCallback',
  }, resp);
  await h.run();
  test('K11: TO: fetch fires exactly once', () => { assert.strictEqual(h.getFetchCount(), 1); });
  test('K12: TO: success modal visible after submit', () => { assert.strictEqual(h.getModalStyle(), 'flex'); });
  test('K13: TO: success modal shows recipient name', () => {
    assert.ok(h.getRecipients().includes('Jonathan Reinking'));
  });
})();

// ============================================================================
// L. EI crew dropdown: Christian Boutte and inspectedBy allowlist
// ============================================================================

console.log('\n--- L. EI / TT: crew names in hardcoded dropdowns ---');
test('L1: EI has Christian Boutte in inspectedBy dropdown', () => {
  assert.ok(eiSrc.includes('Christian Boutte'), 'EI must have Christian Boutte in dropdown');
});
test('L2: EI does NOT have "test" option in dropdown (never had)', () => {
  // EI dropdown is hardcoded; no "test" option should be there
  const dropStart = eiSrc.indexOf('eiInspectedBy');
  const dropEnd   = eiSrc.indexOf('</select>', dropStart);
  const dropHtml  = eiSrc.slice(dropStart, dropEnd);
  assert.ok(!dropHtml.toLowerCase().includes('>test<'), 'EI dropdown must not have "test" option');
});
test('L3: TT has Christian Boutte in presenter dropdown', () => {
  assert.ok(ttSrc.includes('Christian Boutte'), 'TT must have Christian Boutte in dropdown');
});
test('L4: equip-inspection-store.js INSPECTED_BY_OPTIONS includes Christian Boutte', () => {
  const storeSrc = readFileSync(
    resolve(fieldDir, 'functions/lib/equip-inspection-store.js'), 'utf8'
  );
  assert.ok(storeSrc.includes("'Christian Boutte'"), 'INSPECTED_BY_OPTIONS must include Christian Boutte');
});

// ============================================================================
// M. OK button closes success modal (source-text check)
// ============================================================================

console.log('\n--- M. OK button wiring ---');
test('M1: DR success OK button wired to hide modal', () => {
  assert.ok(drSrc.includes('drSuccessOk') && drSrc.includes("'none'"), 'DR: OK button must hide success modal');
});
test('M2: SR success OK button wired to hide modal', () => {
  assert.ok(srSrc.includes('srSuccessOk') && srSrc.includes("'none'"), 'SR: OK button must hide success modal');
});
test('M3: TT success OK button wired to hide modal', () => {
  assert.ok(ttSrc.includes('ttSuccessOk') && ttSrc.includes("'none'"), 'TT: OK button must hide success modal');
});
test('M4: EI success OK button wired to hide modal', () => {
  assert.ok(eiSrc.includes('eiSuccessOk') && eiSrc.includes("'none'"), 'EI: OK button must hide success modal');
});
test('M5: TO success OK button wired to hide modal', () => {
  assert.ok(toSrc.includes('toSuccessOk') && toSrc.includes("'none'"), 'TO: OK button must hide success modal');
});

// ============================================================================
// N. Existing confirm modal flow unchanged (regression)
// ============================================================================

console.log('\n--- N. Confirm modal flow unchanged ---');
test('N1: DR confirm modal still saves callback before hide', () => {
  assert.ok(drSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModal();if(cb)cb();'));
});
test('N2: SR confirm modal still saves callback before hide', () => {
  assert.ok(srSrc.includes('var cb=window.pfConfirmModalCallbackSR;pfHideConfirmModalSR();if(cb)cb();'));
});
test('N3: TT confirm modal still saves callback before hide', () => {
  assert.ok(ttSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalTT();if(cb)cb();'));
});
test('N4: EI confirm modal still saves callback before hide', () => {
  assert.ok(eiSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalEI();if(cb)cb();'));
});
test('N5: TO confirm modal still saves callback before hide', () => {
  assert.ok(toSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalTO();if(cb)cb();'));
});

// ============================================================================
// O. field-lists SEED: Christian Boutte position and "test" filter
// ============================================================================

console.log('\n--- O. field-lists.js SEED details ---');
test('O1: SEED includes all 4 crew members (John, Seth, Christian, Jordan)', () => {
  assert.ok(
    flSrc.includes("'John Willis'") &&
    flSrc.includes("'Seth Willis'") &&
    flSrc.includes("'Christian Boutte'") &&
    flSrc.includes("'Jordan Lemay'"),
    'SEED must include all 4 crew members'
  );
});
test('O2: SEED does not include "test" (never was in seed)', () => {
  // "test" must NOT appear as a personnel name in the SEED constant
  const seedStart = flSrc.indexOf('const SEED');
  const seedEnd   = flSrc.indexOf('};', seedStart) + 2;
  const seedBlock = flSrc.slice(seedStart, seedEnd);
  assert.ok(!seedBlock.toLowerCase().includes("'test'"), 'SEED must not include "test" as a name');
});
test('O3: buildResponse applies stripTest to personnel', () => {
  // The returned personnel list must use stripTest
  const respStart = flSrc.indexOf('function buildResponse');
  const respEnd   = flSrc.indexOf('\n// ---- GET', respStart);
  const respBlock = flSrc.slice(respStart, respEnd > 0 ? respEnd : flSrc.length);
  assert.ok(respBlock.includes('stripTest'), 'buildResponse must apply stripTest to personnel');
});

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}, 200);
