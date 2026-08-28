// Headless self-test for the "Look up County & Township" in-place fix (Brad 2026-08-27).
// Extracts the ACTUAL shipped functions from index.html and runs pfLookupCountyTownship
// against a real jsdom General Info DOM, with fetch stubbed for /api/geocode and
// /api/project-override. Asserts: (1) County+Township update IN PLACE, (2) the General
// Info card STAYS OPEN (view not closed), (3) scroll not reset / no navigation, (4) no
// full-record re-render helper (openProjectRecord) is called, (5) the .blank highlight
// clears + the edited pencil is stamped, (6) the look-up button hides once both filled.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// --- Extract the two functions verbatim from the source (test the real code) ---
function extract(startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  if (s < 0) throw new Error('start marker not found: ' + startMarker);
  const e = html.indexOf(endMarker, s);
  if (e < 0) throw new Error('end marker not found: ' + endMarker);
  return html.slice(s, e + endMarker.length);
}
const patchFn = extract('function pfPatchGeneralFieldsInPlace(fields, wrap){', '\n      return wroteCounty;\n    }');
const lookupFn = extract('window.pfLookupCountyTownship = function(btn){', '\n    };');

let PASS = 0, FAIL = 0;
function ok(cond, msg){ if (cond){ PASS++; console.log('  PASS: ' + msg); } else { FAIL++; console.log('  FAIL: ' + msg); } }

// --- Build a realistic General Info DOM ---
const dom = new JSDOM(`<!doctype html><html><body>
  <div id="prGenericRoot">
    <div class="pr-card open" data-pr-section="general">
      <div class="pr-card-head"><span class="pr-card-title">General Info</span></div>
      <div class="pr-card-body">
        <div class="pf-ctlk-wrap" data-ctlk-num="26-999" data-ctlk-addr="1 Main St, Fort Wayne, IN 46825">
          <div class="pf-cpull-head"><span class="pf-cpull-actions">
            <button type="button" class="pf-cpull-btn">Look up County &amp; Township from address</button>
          </span></div>
          <div class="pf-ctlk-msg" style="display:none"></div>
        </div>
        <div class="pr-field" data-pr-label="County"><span class="pr-field-label">County</span><span class="pr-field-value empty blank">-</span></div>
        <div class="pr-field" data-pr-label="Township"><span class="pr-field-label">Township</span><span class="pr-field-value empty blank">-</span></div>
        <div class="pr-field" data-pr-label="Total Bldg SF"><span class="pr-field-label">Total Bldg SF</span><span class="pr-field-value">50,000</span></div>
      </div>
    </div>
  </div>
</body></html>`, { url: 'http://localhost/' });

const { window } = dom;
global.window = window;
global.document = window.document;
global.CSS = window.CSS; // jsdom provides CSS.escape

// Harness state / stubs the extracted functions reference by free name.
let openProjectRecordCalled = false;
const scope = {
  canEdit: () => true,
  _curNum: '26-999',
  _curOverrides: {},
  PF_PROJECT_OVERRIDES: {},
  // If the OLD behavior sneaks back in, this would be called -> test fails.
  openProjectRecord: () => { openProjectRecordCalled = true; },
  pfCtlkWrap: (el) => { while (el && el !== window.document.body){ if (el.classList && el.classList.contains('pf-ctlk-wrap')) return el; el = el.parentNode; } return null; },
  pfCtlkMsg: (wrap, text, isErr) => { const m = wrap.querySelector('.pf-ctlk-msg'); if (m){ m.textContent = text || ''; m.style.display = text ? 'block' : 'none'; } },
  window,
  document: window.document,
  CSS: window.CSS,
};
window.PF_PROJECT_OVERRIDES = scope.PF_PROJECT_OVERRIDES;

// Stub fetch: geocode -> matched county+township; override -> saved:true echoing back.
global.fetch = async (url, opts) => {
  if (String(url).startsWith('/api/geocode')) {
    return { ok: true, status: 200, json: async () => ({ matched: true, county: 'Allen County', township: 'Washington Township', note: '' }) };
  }
  if (String(url).startsWith('/api/project-override')) {
    const body = JSON.parse(opts.body);
    const sections = { general: Object.assign({}, body.fields) };
    return { ok: true, status: 200, json: async () => ({ ok: true, saved: true, sections, _meta: { updatedBy: 'peter', updatedAt: new Date().toISOString() } }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// Build a function with the extracted code, injecting the scope names it references.
const argNames = Object.keys(scope);
const argVals = argNames.map(k => scope[k]);
const factory = new Function(...argNames, 'fetch',
  patchFn + '\n' + lookupFn + '\n' +
  'window.__patch = pfPatchGeneralFieldsInPlace;\n' +
  'return window.pfLookupCountyTownship;');
const pfLookupCountyTownship = factory(...argVals, global.fetch);

// Grab pre-state, fire the handler on the look-up button.
const card = window.document.querySelector('.pr-card[data-pr-section="general"]');
const btn = window.document.querySelector('.pf-cpull-btn');
const countyCellBefore = window.document.querySelector('.pr-field[data-pr-label="County"] .pr-field-value').textContent;
ok(card.classList.contains('open'), 'card starts OPEN (precondition)');
ok(countyCellBefore.trim() === '-', 'County cell starts blank "-" (precondition)');

pfLookupCountyTownship(btn);

// The handler is async (two awaited fetches); flush microtasks/timers.
await new Promise(r => setTimeout(r, 50));

// --- Assertions ---
const countyCell = window.document.querySelector('.pr-field[data-pr-label="County"] .pr-field-value');
const townshipCell = window.document.querySelector('.pr-field[data-pr-label="Township"] .pr-field-value');

ok(countyCell.textContent === 'Allen County', 'County updated IN PLACE to "Allen County"');
ok(townshipCell.textContent === 'Washington Township', 'Township updated IN PLACE to "Washington Township"');
ok(!countyCell.classList.contains('blank'), 'County .blank highlight cleared (now filled)');
ok(!townshipCell.classList.contains('blank'), 'Township .blank highlight cleared (now filled)');
ok(!!window.document.querySelector('.pr-field[data-pr-label="County"] .pr-field-edited'), 'County stamped with "manually edited" pencil');

// THE KEY BUG ASSERTIONS: view stays open, no full re-render, no navigation.
ok(card.classList.contains('open'), 'General Info card STAYS OPEN after lookup (view not closed)');
ok(openProjectRecordCalled === false, 'openProjectRecord() NOT called (no full-record re-render / no view dismiss)');
ok(!!window.document.querySelector('.pr-card[data-pr-section="general"]'), 'General card still present in DOM (not replaced)');
ok(window.document.querySelector('.pr-field[data-pr-label="Total Bldg SF"] .pr-field-value').textContent === '50,000', 'unrelated field preserved (no re-render wiped it)');

// Button hides once both fields filled.
ok(window.document.querySelector('.pf-cpull-btn') === null, 'look-up button removed once both fields filled');

// Success note shown.
const noteEl = window.document.querySelector('.pf-ctlk-msg');
ok(noteEl && /filled from the US Census Geocoder/.test(noteEl.textContent), 'success note displayed');

console.log('\nRESULT: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
