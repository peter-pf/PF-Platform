// Headless self-test for the "Look up County & Township" in-place fix (Brad 2026-08-27).
// Extracts the ACTUAL shipped functions from index.html and runs pfLookupCountyTownship
// against a real jsdom General Info DOM, with fetch stubbed for /api/geocode and
// /api/project-override.
//
// HAPPY PATH asserts: (1) County+Township update IN PLACE, (2) the General Info card
// STAYS OPEN (view not closed), (3) no full-record re-render helper (openProjectRecord)
// is called, (4) the .blank highlight clears + the edited pencil is stamped, (5) the
// look-up button hides once both filled, (6) unrelated fields preserved.
//
// FAIL-CLOSED asserts (5 cases): for every failure mode the handler must (a) keep the
// view OPEN, (b) write NO value to the County/Township cells (never fabricate), (c) keep
// the look-up button present for retry, (d) show an honest inline error note. It must
// also NEVER call openProjectRecord (no re-render / no view dismiss).
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

// --- Reusable harness: fresh DOM + wired-up extracted handler per test ---
// fetchImpl(url, opts) -> a fetch-like response object. This lets each case inject its
// own geocode / override behavior while running the SAME shipped functions.
function makeHarness(fetchImpl) {
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

  const state = { openProjectRecordCalled: false };
  const scope = {
    canEdit: () => true,
    _curNum: '26-999',
    _curOverrides: {},
    PF_PROJECT_OVERRIDES: {},
    // If the OLD behavior sneaks back in, this would be called -> tests fail.
    openProjectRecord: () => { state.openProjectRecordCalled = true; },
    pfCtlkWrap: (el) => { while (el && el !== window.document.body){ if (el.classList && el.classList.contains('pf-ctlk-wrap')) return el; el = el.parentNode; } return null; },
    pfCtlkMsg: (wrap, text, isErr) => { const m = wrap.querySelector('.pf-ctlk-msg'); if (m){ m.textContent = text || ''; m.style.display = text ? 'block' : 'none'; } },
    window,
    document: window.document,
    CSS: window.CSS,
  };
  window.PF_PROJECT_OVERRIDES = scope.PF_PROJECT_OVERRIDES;
  global.fetch = fetchImpl;

  const argNames = Object.keys(scope);
  const argVals = argNames.map(k => scope[k]);
  const factory = new Function(...argNames, 'fetch',
    patchFn + '\n' + lookupFn + '\n' +
    'return window.pfLookupCountyTownship;');
  const handler = factory(...argVals, global.fetch);

  return { window, doc: window.document, state, handler };
}

const q = (doc, sel) => doc.querySelector(sel);
const countyText   = (doc) => q(doc, '.pr-field[data-pr-label="County"] .pr-field-value').textContent;
const townshipText = (doc) => q(doc, '.pr-field[data-pr-label="Township"] .pr-field-value').textContent;
const flush = () => new Promise(r => setTimeout(r, 50));

// ==========================================================================
// HAPPY PATH
// ==========================================================================
console.log('--- HAPPY PATH ---');
{
  const okGeocode = async (url, opts) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: true, status: 200, json: async () => ({ matched: true, county: 'Allen County', township: 'Washington Township', note: '' }) };
    if (String(url).startsWith('/api/project-override')) {
      const body = JSON.parse(opts.body);
      const sections = { general: Object.assign({}, body.fields) };
      return { ok: true, status: 200, json: async () => ({ ok: true, saved: true, sections, _meta: { updatedBy: 'peter', updatedAt: new Date().toISOString() } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { doc, state, handler } = makeHarness(okGeocode);
  const card = q(doc, '.pr-card[data-pr-section="general"]');
  ok(card.classList.contains('open'), 'card starts OPEN (precondition)');
  ok(countyText(doc).trim() === '-', 'County cell starts blank "-" (precondition)');

  handler(q(doc, '.pf-cpull-btn'));
  await flush();

  ok(countyText(doc) === 'Allen County', 'County updated IN PLACE to "Allen County"');
  ok(townshipText(doc) === 'Washington Township', 'Township updated IN PLACE to "Washington Township"');
  ok(!q(doc, '.pr-field[data-pr-label="County"] .pr-field-value').classList.contains('blank'), 'County .blank highlight cleared (now filled)');
  ok(!q(doc, '.pr-field[data-pr-label="Township"] .pr-field-value').classList.contains('blank'), 'Township .blank highlight cleared (now filled)');
  ok(!!q(doc, '.pr-field[data-pr-label="County"] .pr-field-edited'), 'County stamped with "manually edited" pencil');
  ok(card.classList.contains('open'), 'General Info card STAYS OPEN after lookup (view not closed)');
  ok(state.openProjectRecordCalled === false, 'openProjectRecord() NOT called (no full-record re-render / no view dismiss)');
  ok(!!q(doc, '.pr-card[data-pr-section="general"]'), 'General card still present in DOM (not replaced)');
  ok(q(doc, '.pr-field[data-pr-label="Total Bldg SF"] .pr-field-value').textContent === '50,000', 'unrelated field preserved (no re-render wiped it)');
  ok(q(doc, '.pf-cpull-btn') === null, 'look-up button removed once both fields filled');
  const noteEl = q(doc, '.pf-ctlk-msg');
  ok(noteEl && /filled from the US Census Geocoder/.test(noteEl.textContent), 'success note displayed');
}

// ==========================================================================
// FAIL-CLOSED CASES — shared assertion block
// ==========================================================================
// For every failure mode: view OPEN, no value written, button remains, honest error,
// and openProjectRecord never called.
async function failClosedCase(name, fetchImpl, expectNoteRe) {
  console.log('--- FAIL-CLOSED: ' + name + ' ---');
  const { doc, state, handler } = makeHarness(fetchImpl);
  const card = q(doc, '.pr-card[data-pr-section="general"]');

  handler(q(doc, '.pf-cpull-btn'));
  await flush();

  ok(card.classList.contains('open'), name + ': (a) view STAYS OPEN');
  ok(countyText(doc).trim() === '-', name + ': (b) County NOT written (still "-")');
  ok(townshipText(doc).trim() === '-', name + ': (b) Township NOT written (still "-")');
  ok(q(doc, '.pr-field[data-pr-label="County"] .pr-field-value').classList.contains('blank'), name + ': (b) County stays .blank (no fabricated fill)');
  ok(q(doc, '.pf-cpull-btn') !== null, name + ': (c) look-up button REMAINS for retry');
  const btn = q(doc, '.pf-cpull-btn');
  ok(btn && btn.disabled === false, name + ': (c) button re-enabled for retry');
  const noteEl = q(doc, '.pf-ctlk-msg');
  ok(noteEl && expectNoteRe.test(noteEl.textContent), name + ': (d) honest error note shown');
  ok(state.openProjectRecordCalled === false, name + ': openProjectRecord() NOT called');
}

// Case 1: geocode returns matched:false
await failClosedCase('geocode matched:false',
  async (url) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: true, status: 200, json: async () => ({ matched: false, note: 'No county/township match. Enter County/Township manually.' }) };
    return { ok: false, status: 500, json: async () => ({}) };
  },
  /No county\/township match/);

// Case 2: geocode matched:true but county empty/missing (must still fail closed)
await failClosedCase('geocode matched:true but county missing',
  async (url) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: true, status: 200, json: async () => ({ matched: true, county: '', township: 'Washington Township' }) };
    return { ok: false, status: 500, json: async () => ({}) };
  },
  /No county\/township match|manually/);

// Case 3: geocode HTTP 403
await failClosedCase('geocode HTTP 403',
  async (url) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: false, status: 403, json: async () => ({}) };
    return { ok: false, status: 500, json: async () => ({}) };
  },
  /permission/);

// Case 4: geocode OK but /api/project-override returns saved:false (save-fail)
await failClosedCase('override saved:false (save-fail)',
  async (url) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: true, status: 200, json: async () => ({ matched: true, county: 'Allen County', township: 'Washington Township' }) };
    if (String(url).startsWith('/api/project-override'))
      return { ok: true, status: 200, json: async () => ({ ok: true, saved: false, message: 'Save failed — nothing was recorded.' }) };
    return { ok: false, status: 500, json: async () => ({}) };
  },
  /Save failed|not.*recorded|retry/i);

// Case 5: geocode OK but network REJECT on the override POST (.catch path)
await failClosedCase('override network reject (.catch)',
  async (url) => {
    if (String(url).startsWith('/api/geocode'))
      return { ok: true, status: 200, json: async () => ({ matched: true, county: 'Allen County', township: 'Washington Township' }) };
    if (String(url).startsWith('/api/project-override'))
      throw new Error('network down');
    return { ok: false, status: 500, json: async () => ({}) };
  },
  /could not reach the server|retry/i);

console.log('\nRESULT: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
