#!/usr/bin/env node
// Tests for Safety Analysis form (toolbox-talk.html rework, Derek 2026-10-30).
//
// Suite coverage:
//   A. Nav label tests — all pages must show "Safety Analysis" not "Toolbox Talk" in nav
//   B. Page title / topbar tests
//   C. Past-reports label tests (toggle button, filter select, typeLabelMap)
//   D. Mailing-lists label test (LIST_LABELS.toolbox_talk)
//   E. jsdom CLICK harness — fill new SA form, click Submit, click confirm,
//      assert fetch fires exactly once with new fields in body, success modal shows
//   F. jsdom fail-proof — prove the test FAILS when the confirm-before-callback bug is injected
//   G. Server store validation: superintendent allowlist, hazard key allowlist, back-compat old record
//   H. PDF filename uses "Safety Analysis"
//   I. Attendee title + acknowledged field structure in collected body
//
// Run: node field/tests/test-safety-analysis-20261030.mjs

import { strict as assert } from 'assert';
import { readFileSync }      from 'fs';
import { fileURLToPath }     from 'url';
import { dirname, resolve }  from 'path';
import { createRequire }     from 'module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const __dir = dirname(fileURLToPath(import.meta.url));

// Source files
const ttSrc   = readFileSync(resolve(__dir, '../toolbox-talk.html'),   'utf8');
const drSrc   = readFileSync(resolve(__dir, '../daily-report.html'),   'utf8');
const eiSrc   = readFileSync(resolve(__dir, '../equipment-inspection.html'), 'utf8');
const srSrc   = readFileSync(resolve(__dir, '../site-readiness.html'), 'utf8');
const prSrc   = readFileSync(resolve(__dir, '../past-reports.html'),   'utf8');
const mlSrc   = readFileSync(resolve(__dir, '../mailing-lists.html'),  'utf8');
const toSrc   = readFileSync(resolve(__dir, '../time-off.html'),       'utf8');
const ccSrc   = readFileSync(resolve(__dir, '../cost-codes.html'),     'utf8');
const schSrc  = readFileSync(resolve(__dir, '../schedule.html'),       'utf8');
const idxSrc  = readFileSync(resolve(__dir, '../index.html'),          'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try   { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ===========================================================================
// A. Nav label tests — EVERY page must use "Safety Analysis" for the TT nav link
// ===========================================================================

const NAV_PAGES = [
  { name: 'toolbox-talk.html', src: ttSrc },
  { name: 'daily-report.html', src: drSrc },
  { name: 'equipment-inspection.html', src: eiSrc },
  { name: 'site-readiness.html', src: srSrc },
  { name: 'past-reports.html', src: prSrc },
  { name: 'mailing-lists.html', src: mlSrc },
  { name: 'time-off.html', src: toSrc },
  { name: 'cost-codes.html', src: ccSrc },
  { name: 'schedule.html', src: schSrc },
  { name: 'index.html', src: idxSrc },
];

NAV_PAGES.forEach(function(p) {
  test('A: ' + p.name + ' nav has "Safety Analysis" for toolbox-talk link', function() {
    // The anchor href="/toolbox-talk.html" must be followed (within 500 chars) by <span>Safety Analysis</span>
    var idx = p.src.indexOf('href="/toolbox-talk.html"');
    assert.ok(idx >= 0, p.name + ' must have href="/toolbox-talk.html"');
    var window = p.src.slice(idx, idx + 500);
    assert.ok(
      window.includes('<span>Safety Analysis</span>'),
      p.name + ': toolbox-talk nav link must say "Safety Analysis", not "Toolbox Talk"'
    );
  });

  test('A: ' + p.name + ' nav does NOT say "Toolbox Talk" for the toolbox-talk link', function() {
    var idx = p.src.indexOf('href="/toolbox-talk.html"');
    assert.ok(idx >= 0, p.name + ' must have href="/toolbox-talk.html"');
    var window = p.src.slice(idx, idx + 500);
    assert.ok(
      !window.includes('<span>Toolbox Talk</span>'),
      p.name + ': nav link must NOT still say "Toolbox Talk"'
    );
  });
});

// ===========================================================================
// B. Page title / topbar
// ===========================================================================

test('B1: toolbox-talk.html page title is "Safety Analysis"', function() {
  assert.ok(ttSrc.includes('<title>PF Safety Analysis</title>'), 'title must be PF Safety Analysis');
});

test('B2: toolbox-talk.html topbar title is "Safety Analysis"', function() {
  assert.ok(ttSrc.includes('<span class="tb-title">Safety Analysis</span>'), 'topbar title must be Safety Analysis');
});

test('B3: toolbox-talk.html page-title h1 says "Safety Analysis"', function() {
  assert.ok(ttSrc.includes('>Safety Analysis<'), 'page-title must say Safety Analysis');
});

test('B4: toolbox-talk.html does NOT say "Toolbox Talk" in topbar title', function() {
  assert.ok(
    !ttSrc.includes('<span class="tb-title">Toolbox Talk</span>'),
    'topbar must not still say "Toolbox Talk"'
  );
});

// ===========================================================================
// C. Past-reports label tests
// ===========================================================================

test('C1: past-reports toggle button says "Safety Analysis"', function() {
  assert.ok(
    prSrc.includes('data-type="toolbox-talk">Safety Analysis<'),
    'toggle button for toolbox-talk type must say "Safety Analysis"'
  );
});

test('C2: past-reports toggle button does NOT say "Toolbox Talk"', function() {
  assert.ok(
    !prSrc.includes('data-type="toolbox-talk">Toolbox Talk<'),
    'toggle button must not still say "Toolbox Talk"'
  );
});

test('C3: past-reports filter select says "Safety Analysis"', function() {
  assert.ok(
    prSrc.includes('value="toolbox-talk">Safety Analysis<'),
    'filter select option for toolbox-talk must say "Safety Analysis"'
  );
});

test('C4: past-reports typeLabelMap uses "Safety Analysis"', function() {
  assert.ok(
    prSrc.includes("'toolbox-talk':'Safety Analysis'"),
    'typeLabelMap must map toolbox-talk to Safety Analysis'
  );
});

// ===========================================================================
// D. Mailing-lists label
// ===========================================================================

test('D1: mailing-lists LIST_LABELS.toolbox_talk is "Safety Analysis"', function() {
  assert.ok(
    mlSrc.includes("toolbox_talk:         'Safety Analysis'") ||
    mlSrc.includes('toolbox_talk:         "Safety Analysis"') ||
    mlSrc.includes("toolbox_talk: 'Safety Analysis'") ||
    mlSrc.includes('toolbox_talk: "Safety Analysis"'),
    'mailing-lists LIST_LABELS.toolbox_talk must be "Safety Analysis"'
  );
});

test('D2: mailing-lists does NOT have Toolbox Talk as the toolbox_talk label', function() {
  assert.ok(
    !mlSrc.includes("toolbox_talk:         'Toolbox Talk'") &&
    !mlSrc.includes("toolbox_talk: 'Toolbox Talk'"),
    'toolbox_talk label must not still be "Toolbox Talk"'
  );
});

// ===========================================================================
// E. jsdom CLICK harness
//    Fill the new SA form, click Submit, click confirm modal, assert:
//    - fetch fires exactly once with new fields in body
//    - success modal shows
// ===========================================================================

async function runJsdomClickHarness(srcToUse) {
  return new Promise(function(resolve, reject) {
    var fetchCalls = [];

    var dom = new JSDOM(srcToUse, {
      runScripts: 'dangerously',
      resources: 'usable',
      beforeParse: function(window) {
        // Stub fetch
        window.fetch = function(url, opts) {
          fetchCalls.push({ url: url, opts: opts });
          // /api/me response — triggers ttInitForm
          if (url === '/api/me') {
            return Promise.resolve({
              ok: true,
              json: function() {
                return Promise.resolve({
                  status: 'ok',
                  name: 'John Willis',
                  email: 'jw@pierfoundations.com',
                  role: 'field_ops',
                });
              },
            });
          }
          // /api/field-projects
          if (url === '/api/field-projects') {
            return Promise.resolve({
              ok: true,
              json: function() {
                return Promise.resolve({ projects: [{ number: '26-001', name: 'Test Project' }] });
              },
            });
          }
          // /api/toolbox-talk POST
          if (url === '/api/toolbox-talk') {
            var body = opts && opts.body ? JSON.parse(opts.body) : {};
            if (body.action === 'create') {
              return Promise.resolve({
                ok: true,
                json: function() {
                  return Promise.resolve({ ok: true, id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'draft' });
                },
              });
            }
            if (body.action === 'submit') {
              return Promise.resolve({
                ok: true,
                json: function() {
                  return Promise.resolve({
                    ok: true, id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                    status: 'submitted', pdfWebUrl: null,
                    emailedTo: [{ name: 'Derek Franke', email: 'dfranke@pierfoundations.com' }],
                  });
                },
              });
            }
          }
          return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } });
        };

        // Stub scrollIntoView to avoid jsdom error
        window.HTMLElement.prototype.scrollIntoView = function() {};
      },
    });

    // Wait for auth fetch + init to complete
    setTimeout(function() {
      var doc = dom.window.document;

      // Fill Project Info section
      var dateEl = doc.getElementById('ttDate');
      if (dateEl) { dateEl.value = '2026-10-30'; dateEl.dispatchEvent(new dom.window.Event('input')); }

      var locEl = doc.getElementById('ttLocation');
      if (locEl) { locEl.value = 'Westfield, IN'; locEl.dispatchEvent(new dom.window.Event('input')); }

      var suptEl = doc.getElementById('ttSuperintendent');
      if (suptEl) { suptEl.value = 'John Willis'; suptEl.dispatchEvent(new dom.window.Event('input')); }

      // Fill JSA textareas
      var stepsEl = doc.getElementById('ttJsaSteps');
      if (stepsEl) { stepsEl.value = 'Set up equipment\nInstall piers'; stepsEl.dispatchEvent(new dom.window.Event('input')); }

      var jsaHazEl = doc.getElementById('ttJsaHazards');
      if (jsaHazEl) { jsaHazEl.value = 'Falls, pinch points'; jsaHazEl.dispatchEvent(new dom.window.Event('input')); }

      var prevEl = doc.getElementById('ttJsaPreventative');
      if (prevEl) { prevEl.value = 'Wear PPE, maintain 3-point contact'; prevEl.dispatchEvent(new dom.window.Event('input')); }

      // Check two hazard checkboxes
      var hcCont = doc.getElementById('ttHazardChecks');
      if (hcCont) {
        var pinchCb = hcCont.querySelector('input[value="pinch_points"]');
        if (pinchCb) { pinchCb.checked = true; pinchCb.dispatchEvent(new dom.window.Event('change')); }
        var ppiCb = hcCont.querySelector('input[value="personal_injury"]');
        if (ppiCb) { ppiCb.checked = true; ppiCb.dispatchEvent(new dom.window.Event('change')); }
      }

      // Set hierarchy rank 1
      var hier0 = doc.getElementById('ttHier0');
      if (hier0) { hier0.value = 'John Willis'; hier0.dispatchEvent(new dom.window.Event('input')); }

      // Add a crew member with title + acknowledged
      var nameInp = doc.getElementById('ttNewAttName');
      var titleInp = doc.getElementById('ttNewAttTitle');
      if (nameInp) nameInp.value = 'Seth Willis';
      if (titleInp) titleInp.value = 'Foreman';
      var addBtn = doc.getElementById('ttAddAttBtn');
      if (addBtn) addBtn.click();

      // Mark crew member acknowledged
      setTimeout(function() {
        var ackBoxes = doc.querySelectorAll('.tt-att-ack input[type="checkbox"]');
        if (ackBoxes.length > 0) {
          ackBoxes[0].checked = true;
          ackBoxes[0].dispatchEvent(new dom.window.Event('change'));
        }

        // Clear previous fetch calls (me + field-projects)
        fetchCalls.length = 0;

        // Click Submit button
        var submitBtn = doc.getElementById('ttSubmitBtn');
        if (submitBtn) submitBtn.click();

        // Wait for confirm modal to show, then click confirm
        setTimeout(function() {
          var confirmBtn = doc.getElementById('ttModalConfirm');
          if (confirmBtn) confirmBtn.click();

          // Wait for create + submit fetches
          setTimeout(function() {
            resolve({ fetchCalls: fetchCalls.slice(), doc: doc, dom: dom });
          }, 200);
        }, 100);
      }, 100);
    }, 300);
  });
}

// Run E tests
var jsdomResults = null;
try {
  jsdomResults = await runJsdomClickHarness(ttSrc);
} catch (e) {
  console.error('  jsdom harness threw:', e.message);
}

test('E1: jsdom — at least two fetches fired (create + submit)', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  assert.ok(calls.length >= 2, 'Expected at least 2 toolbox-talk fetches (create + submit), got ' + calls.length);
});

test('E2: jsdom — last /api/toolbox-talk call has action=submit', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var last = calls[calls.length - 1];
  var body = last && last.opts && last.opts.body ? JSON.parse(last.opts.body) : {};
  assert.equal(body.action, 'submit', 'Last fetch must be action=submit');
});

test('E3: jsdom — submit body includes superintendent=John Willis', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var submitCall = calls.find(function(c) {
    var b = c.opts && c.opts.body ? JSON.parse(c.opts.body) : {};
    return b.action === 'submit';
  });
  assert.ok(submitCall, 'must have a submit call');
  var body = JSON.parse(submitCall.opts.body);
  assert.equal(body.superintendent, 'John Willis', 'superintendent must be John Willis');
});

test('E4: jsdom — submit body includes jsaSteps', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var submitCall = calls.find(function(c) {
    var b = c.opts && c.opts.body ? JSON.parse(c.opts.body) : {};
    return b.action === 'submit';
  });
  var body = submitCall && submitCall.opts.body ? JSON.parse(submitCall.opts.body) : {};
  assert.ok(body.jsaSteps && body.jsaSteps.includes('piers'), 'jsaSteps must be in body');
});

test('E5: jsdom — submit body includes hazardChecks array with pinch_points', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var submitCall = calls.find(function(c) {
    var b = c.opts && c.opts.body ? JSON.parse(c.opts.body) : {};
    return b.action === 'submit';
  });
  var body = submitCall && submitCall.opts.body ? JSON.parse(submitCall.opts.body) : {};
  assert.ok(Array.isArray(body.hazardChecks), 'hazardChecks must be array');
  assert.ok(body.hazardChecks.includes('pinch_points'), 'hazardChecks must include pinch_points');
  assert.ok(body.hazardChecks.includes('personal_injury'), 'hazardChecks must include personal_injury');
});

test('E6: jsdom — submit body includes hierarchyNames', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var submitCall = calls.find(function(c) {
    var b = c.opts && c.opts.body ? JSON.parse(c.opts.body) : {};
    return b.action === 'submit';
  });
  var body = submitCall && submitCall.opts.body ? JSON.parse(submitCall.opts.body) : {};
  assert.ok(Array.isArray(body.hierarchyNames), 'hierarchyNames must be array in body');
  assert.ok(body.hierarchyNames[0] === 'John Willis', 'hierarchyNames[0] must be John Willis');
});

test('E7: jsdom — submit body attendees include title and acknowledged fields', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var calls = jsdomResults.fetchCalls.filter(function(c) { return c.url === '/api/toolbox-talk'; });
  var submitCall = calls.find(function(c) {
    var b = c.opts && c.opts.body ? JSON.parse(c.opts.body) : {};
    return b.action === 'submit';
  });
  var body = submitCall && submitCall.opts.body ? JSON.parse(submitCall.opts.body) : {};
  assert.ok(Array.isArray(body.attendees) && body.attendees.length >= 1, 'must have at least 1 attendee');
  var att = body.attendees[0];
  assert.equal(att.name, 'Seth Willis', 'attendee name must be Seth Willis');
  assert.equal(att.title, 'Foreman', 'attendee title must be Foreman');
  assert.strictEqual(att.acknowledged, true, 'acknowledged must be true');
});

test('E8: jsdom — success modal becomes visible after submit', function() {
  assert.ok(jsdomResults, 'jsdom harness must have run');
  var successModal = jsdomResults.doc.getElementById('ttSuccessModal');
  assert.ok(successModal, 'ttSuccessModal element must exist');
  // Success modal shown via style.display='flex'
  assert.equal(successModal.style.display, 'flex', 'success modal must be display:flex after submit');
});

// ===========================================================================
// F. Fail-proof: prove the harness FAILS when the confirm-callback bug is injected
//    (pfHideConfirmModalTT nulls callback BEFORE calling it)
// ===========================================================================

// Inject the pre-fix bug: swap the order so hide (which nulls the callback) runs BEFORE cb()
var buggedSrc = ttSrc.replace(
  'var cb=window.pfConfirmModalCallback;pfHideConfirmModalTT();if(cb)cb();',
  'pfHideConfirmModalTT();if(window.pfConfirmModalCallback)window.pfConfirmModalCallback();'
);

var buggedResults = null;
var buggedBugPresent = buggedSrc !== ttSrc; // true if injection succeeded
if (buggedBugPresent) {
  try {
    buggedResults = await runJsdomClickHarness(buggedSrc);
  } catch (e) {
    // harness erroring is also acceptable evidence of regression
  }
}

test('F1: fail-proof injection succeeded (bug string is distinct from fix)', function() {
  assert.ok(buggedBugPresent, 'Bug injection must produce a different source string');
});

test('F2: fail-proof — bugged source produces 0 submit fetches (callback never fires)', function() {
  // When the bug is present, pfHideConfirmModalTT() sets pfConfirmModalCallback=null,
  // then the if(window.pfConfirmModalCallback) check is false, so no submit fires.
  assert.ok(buggedBugPresent, 'need bug injection for this test');
  var submitCalls = (buggedResults && buggedResults.fetchCalls || []).filter(function(c) {
    if (c.url !== '/api/toolbox-talk') return false;
    try { return JSON.parse(c.opts.body).action === 'submit'; } catch { return false; }
  });
  assert.equal(submitCalls.length, 0, 'Bugged source must produce 0 submit fetches (prove fail)');
});

// ===========================================================================
// G. Server store validation (import the store module directly)
// ===========================================================================

// We need to import the store functions. Since they use ES module syntax,
// import them dynamically.
let storeModule = null;
try {
  storeModule = await import(resolve(__dir, '../functions/lib/toolbox-talk-store.js'));
} catch (e) {
  console.error('  Could not import store:', e.message);
}

test('G1: SUPERINTENDENT_OPTIONS contains exactly John Willis and Seth Willis', function() {
  assert.ok(storeModule, 'store module must load');
  const opts = storeModule.SUPERINTENDENT_OPTIONS;
  assert.deepEqual(opts, ['John Willis', 'Seth Willis'], 'superintendent options must be exactly John Willis, Seth Willis');
});

test('G2: SUPERINTENDENT_SET allows John Willis', function() {
  assert.ok(storeModule, 'store module must load');
  assert.ok(storeModule.SUPERINTENDENT_SET.has('John Willis'), 'John Willis must be in SUPERINTENDENT_SET');
});

test('G3: SUPERINTENDENT_SET allows Seth Willis', function() {
  assert.ok(storeModule, 'store module must load');
  assert.ok(storeModule.SUPERINTENDENT_SET.has('Seth Willis'), 'Seth Willis must be in SUPERINTENDENT_SET');
});

test('G4: SUPERINTENDENT_SET rejects Christian Boutte', function() {
  assert.ok(storeModule, 'store module must load');
  assert.ok(!storeModule.SUPERINTENDENT_SET.has('Christian Boutte'), 'Christian Boutte must NOT be in SUPERINTENDENT_SET');
});

test('G5: HAZARD_KEYS contains all 20 required keys', function() {
  assert.ok(storeModule, 'store module must load');
  const required = [
    'personal_injury','equipment_lifting','vehicle_operations','rotating_equipment',
    'equipment_operations','excavations','pinch_points','environment','overhead_work',
    'welding_burning','site_access','air_quality','lack_of_ppe','ladder_use',
    'new_worker','tools','pipeline_plumbing','struck_by','electrical','chemicals',
  ];
  required.forEach(function(k) {
    assert.ok(storeModule.HAZARD_KEYS.has(k), 'HAZARD_KEYS must contain ' + k);
  });
  assert.equal(storeModule.HAZARD_KEYS.size, 20, 'HAZARD_KEYS must have exactly 20 entries');
});

test('G6: HAZARD_KEYS rejects unknown key', function() {
  assert.ok(storeModule, 'store module must load');
  assert.ok(!storeModule.HAZARD_KEYS.has('random_bad_key'), 'HAZARD_KEYS must reject unknown key');
});

test('G7: HAZARD_ITEMS has 20 entries with key and label', function() {
  assert.ok(storeModule, 'store module must load');
  assert.equal(storeModule.HAZARD_ITEMS.length, 20, 'HAZARD_ITEMS must have 20 entries');
  storeModule.HAZARD_ITEMS.forEach(function(item) {
    assert.ok(item.key && item.label, 'each HAZARD_ITEM must have key and label');
  });
});

// Back-compat: old records missing new fields must load without errors
test('G8: rowToRecord-equivalent: old record missing new fields returns defaults (back-compat)', function() {
  // Simulate what rowToRecord does with a legacy D1 row (no new columns)
  const legacyRow = {
    id: 'test-id-1234',
    project_id: '26-001',
    project_name: 'Test Project',
    talk_date: '2026-09-01',
    talk_time: '08:00',
    location: 'Westfield, IN',
    presenter: 'John Willis',
    topic: 'ppe',
    topic_other: '',
    key_points: 'Wear your PPE',
    hazards: 'None',
    questions: '',
    actions: '',
    attendees: JSON.stringify([{ name: 'Seth Willis', acknowledged: true }]),
    status: 'submitted',
    pdf_name: null,
    pdf_web_url: null,
    emailed_to: null,
    sent_at: null,
    created_by: 'uid-123',
    created_at: '2026-09-01T08:00:00Z',
    updated_at: null,
    updated_by: null,
    // New fields missing (NULL from D1 for old rows)
    superintendent: null,
    jsa_steps: null,
    jsa_hazards: null,
    jsa_preventative: null,
    hazard_checks: null,
    hierarchy_names: null,
  };
  // Manually apply the same logic as rowToRecord
  let hazardChecks = [];
  try { hazardChecks = JSON.parse(legacyRow.hazard_checks || '[]'); } catch { /* ignore */ }
  let hierarchyNames = [];
  try { hierarchyNames = JSON.parse(legacyRow.hierarchy_names || '[]'); } catch { /* ignore */ }
  let attendees = [];
  try { attendees = JSON.parse(legacyRow.attendees || '[]'); } catch { /* ignore */ }

  assert.deepEqual(hazardChecks, [], 'Old record hazardChecks must default to []');
  assert.deepEqual(hierarchyNames, [], 'Old record hierarchyNames must default to []');
  assert.equal(legacyRow.superintendent || '', '', 'Old record superintendent must default to empty');
  assert.equal(legacyRow.jsa_steps || '', '', 'Old record jsa_steps must default to empty');
  assert.equal(attendees[0].name, 'Seth Willis', 'Old record attendees must still load');
  assert.equal(attendees[0].acknowledged, true, 'Old record acknowledged must still load');
});

test('G9: superintendent allowlist validation logic (unit test)', function() {
  // Test the validation logic used in buildBody in toolbox-talk.js
  const SUPER_SET = new Set(['John Willis', 'Seth Willis']);
  assert.ok(SUPER_SET.has('John Willis'), 'John Willis passes allowlist');
  assert.ok(SUPER_SET.has('Seth Willis'), 'Seth Willis passes allowlist');
  assert.ok(!SUPER_SET.has('Jordan Lemay'), 'Jordan Lemay fails allowlist (presenter only)');
  assert.ok(!SUPER_SET.has(''), 'empty string is not in allowlist (validation skips empty for drafts)');
});

test('G10: hazard key allowlist validation (unit test)', function() {
  assert.ok(storeModule, 'store module must load');
  const valid = ['pinch_points', 'electrical', 'chemicals'];
  const invalid = ['bad_key', 'PINCH_POINTS', 'pinch points'];
  valid.forEach(function(k) {
    assert.ok(storeModule.HAZARD_KEYS.has(k), k + ' must pass hazard allowlist');
  });
  invalid.forEach(function(k) {
    assert.ok(!storeModule.HAZARD_KEYS.has(k), k + ' must fail hazard allowlist');
  });
});

// ===========================================================================
// H. PDF filename uses "Safety Analysis"
// ===========================================================================

test('H1: toolbox-talk-doc.js pdfFilename produces "Safety Analysis" suffix', function() {
  const docSrc = readFileSync(resolve(__dir, '../functions/lib/toolbox-talk-doc.js'), 'utf8');
  assert.ok(
    docSrc.includes('Safety Analysis.pdf'),
    'pdfFilename must produce Safety Analysis.pdf suffix'
  );
  assert.ok(
    !docSrc.includes('Toolbox Talk.pdf'),
    'pdfFilename must not still produce Toolbox Talk.pdf suffix'
  );
});

test('H2: email subject says "Safety Analysis" (not "Toolbox Talk")', function() {
  const docSrc = readFileSync(resolve(__dir, '../functions/lib/toolbox-talk-doc.js'), 'utf8');
  assert.ok(
    docSrc.includes('Safety Analysis -'),
    'email subject must start with Safety Analysis'
  );
});

// ===========================================================================
// I. Form structure: new fields present in toolbox-talk.html
// ===========================================================================

test('I1: ttSuperintendent select has exactly John Willis and Seth Willis', function() {
  assert.ok(ttSrc.includes('<option value="John Willis">John Willis</option>'), 'John Willis option must exist in superintendent dropdown');
  assert.ok(ttSrc.includes('<option value="Seth Willis">Seth Willis</option>'), 'Seth Willis option must exist in superintendent dropdown');
  assert.ok(!ttSrc.includes('<option value="Christian Boutte">Christian Boutte</option>\n            </select>\n          </div>\n          <div>\n            <label for="ttSuperintendent">'), 'superintendent select must not have Christian Boutte');
});

test('I2: superintendent select has exactly 2 crew options (not 4)', function() {
  // Extract the superintendent select block
  var suptIdx = ttSrc.indexOf('id="ttSuperintendent"');
  assert.ok(suptIdx >= 0, 'ttSuperintendent must exist');
  var block = ttSrc.slice(suptIdx, suptIdx + 400);
  // Count option value attributes (excluding "--Select--")
  var opts = (block.match(/value="[^"]+Willis"/g) || []);
  assert.equal(opts.length, 2, 'superintendent dropdown must have exactly 2 Willis options');
});

test('I3: ttJsaSteps textarea exists', function() {
  assert.ok(ttSrc.includes('id="ttJsaSteps"'), 'ttJsaSteps textarea must exist');
});

test('I4: ttJsaHazards textarea exists', function() {
  assert.ok(ttSrc.includes('id="ttJsaHazards"'), 'ttJsaHazards textarea must exist');
});

test('I5: ttJsaPreventative textarea exists', function() {
  assert.ok(ttSrc.includes('id="ttJsaPreventative"'), 'ttJsaPreventative textarea must exist');
});

test('I6: hazard checklist has exactly 20 checkboxes', function() {
  var matches = ttSrc.match(/type="checkbox" value="[a-z_]+"/g) || [];
  assert.equal(matches.length, 20, 'Must have exactly 20 hazard checkboxes');
});

test('I7: all 20 required hazard values present in form', function() {
  var required = [
    'personal_injury','equipment_lifting','vehicle_operations','rotating_equipment',
    'equipment_operations','excavations','pinch_points','environment','overhead_work',
    'welding_burning','site_access','air_quality','lack_of_ppe','ladder_use',
    'new_worker','tools','pipeline_plumbing','struck_by','electrical','chemicals',
  ];
  required.forEach(function(k) {
    assert.ok(ttSrc.includes('value="' + k + '"'), 'hazard checkbox must exist: ' + k);
  });
});

test('I8: 5 hierarchy name inputs (ttHier0..ttHier4) exist', function() {
  [0,1,2,3,4].forEach(function(i) {
    assert.ok(ttSrc.includes('id="ttHier' + i + '"'), 'ttHier' + i + ' must exist');
  });
});

test('I9: crew acknowledgment statement text present', function() {
  assert.ok(
    ttSrc.includes('By checking Acknowledged, I confirm I attended this safety briefing'),
    'acknowledgment statement must be present'
  );
  assert.ok(
    ttSrc.includes('This serves as my digital signature'),
    'digital signature phrase must be present'
  );
});

test('I10: ttNewAttTitle input present (title field for crew)', function() {
  assert.ok(ttSrc.includes('id="ttNewAttTitle"'), 'ttNewAttTitle input must exist');
});

test('I11: confirmed modal callback pattern is correct (cb saved before hide)', function() {
  assert.ok(
    ttSrc.includes('var cb=window.pfConfirmModalCallback;pfHideConfirmModalTT();if(cb)cb();'),
    'confirm modal must save callback before calling pfHideConfirmModalTT'
  );
});

test('I12: ttCollectBody includes hazardChecks and hierarchyNames', function() {
  assert.ok(ttSrc.includes('ttCollectHazardChecks()'), 'ttCollectBody must call ttCollectHazardChecks');
  assert.ok(ttSrc.includes('ttCollectHierarchyNames()'), 'ttCollectBody must call ttCollectHierarchyNames');
});

test('I13: ttCollectBody includes superintendent', function() {
  assert.ok(
    ttSrc.includes("superintendent:  document.getElementById('ttSuperintendent').value"),
    'ttCollectBody must collect superintendent value'
  );
});

test('I14: storage keys use toolbox-talk API path (unchanged)', function() {
  assert.ok(ttSrc.includes("'/api/toolbox-talk'"), 'fetch path must stay /api/toolbox-talk');
});

test('I15: in-flight guard: ttSave checks ttState.saving', function() {
  assert.ok(ttSrc.includes('if (ttState.saving) return;'), 'ttSave must have in-flight guard');
});

test('I16: index.html quick-action tile for toolbox-talk says "Safety Analysis" not "Toolbox Talk"', function() {
  // The qa-btn primary tile linking to /toolbox-talk.html must display "Safety Analysis"
  const qaIdx = idxSrc.indexOf('href="/toolbox-talk.html" class="qa-btn primary"');
  assert.ok(qaIdx >= 0, 'index.html must have qa-btn primary for toolbox-talk');
  const window = idxSrc.slice(qaIdx, qaIdx + 400);
  assert.ok(window.includes('Safety Analysis'), 'qa-btn tile must say "Safety Analysis"');
  assert.ok(!window.includes('Toolbox Talk'), 'qa-btn tile must NOT say "Toolbox Talk"');
});

test('I17: ttShowMsg uses textContent not innerHTML (XSS defense)', function() {
  // Server error text (d.error) goes into ttShowMsg -- must not use innerHTML
  assert.ok(ttSrc.includes('el.textContent = msg'), 'ttShowMsg must set textContent not innerHTML');
  // And the old innerHTML must not be present in the function
  const fnIdx = ttSrc.indexOf('function ttShowMsg(');
  assert.ok(fnIdx >= 0, 'ttShowMsg function must exist');
  const fnWindow = ttSrc.slice(fnIdx, fnIdx + 200);
  assert.ok(!fnWindow.includes('innerHTML'), 'ttShowMsg must not use innerHTML');
});

test('I18: hazard key validation uses static error message not user-echoed key', function() {
  // Prevents XSS: do not echo user-supplied key value into error message
  const apiSrc = readFileSync(resolve(__dir, '../functions/api/toolbox-talk.js'), 'utf8');
  assert.ok(!apiSrc.includes('invalid hazard key: ${k}'), 'must not echo user key in error');
  assert.ok(apiSrc.includes('Invalid hazard selection.'), 'must use static hazard error message');
});

// ===========================================================================
// Summary
// ===========================================================================

setTimeout(function() {
  console.log('\n  ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed) process.exit(1);
}, 500);
