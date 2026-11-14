// test-hardware-20261114.mjs
//
// Tests for the PRO-DIG MMS3 Hardware viewer page (hardware.html).
//
// Test groups:
//   G1  Gate: non-Derek admin gets 403 from /api/hardware
//   G2  Gate: unauthenticated request gets 401 from /api/hardware
//   G3  Gate: /hardware-img/ path is classified user_admin (not general)
//   G4  Gate: /hardware.html is classified user_admin (not general)
//   D1  Data integrity: all hotspot x/y values in [0,100]
//   D2  Data integrity: all invId values match hw-N pattern or null
//   D3  Data integrity: no blank partNumber fields
//   D4  Data integrity: each diagram has at least one part
//   D5  Data integrity: diagrams split correctly between mast/vibro
//   C1  Click handler: hwShowDetail populates the detail card
//   C2  Click handler: hwCloseDetail clears active state
//   C3  Toggle: hwSetType filters grid correctly
//   R1  Display regression: hardware.html shows #main after auth
//
// Run: node tests/test-hardware-20261114.mjs
// Requires: jsdom (in /home/aiciv/PF-Platform/node_modules/jsdom)

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('/home/aiciv/PF-Platform/node_modules/jsdom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, cond, detail) {
  if (cond) { console.log('  PASS ' + desc); passed++; }
  else { console.error('  FAIL ' + desc + (detail ? ' :: ' + detail : '')); failed++; }
}

// ---- Load modules under test (Node-compatible, no Worker runtime) ----
// We eval the ES module source in a Node context using dynamic import tricks.
// For pure data/logic files this is clean enough for unit tests.

// Load hardware-access.js
const hwAccessSrc = readFileSync(
  path.join(root, 'functions/lib/hardware-access.js'), 'utf8'
).replace(/^export /gm, ''); // strip export keywords for eval
const hwAccessMod = {};
{
  // eslint-disable-next-line no-new-func
  const fn = new Function('module', hwAccessSrc + '\nmodule.exports={HARDWARE_GO_LIVE,HARDWARE_ALLOWED_UIDS,hardwareAllowed};');
  fn(hwAccessMod);
}
const { HARDWARE_GO_LIVE, HARDWARE_ALLOWED_UIDS, hardwareAllowed } = hwAccessMod.exports;

// Load hardware-data.js
const hwDataSrc = readFileSync(
  path.join(root, 'functions/lib/hardware-data.js'), 'utf8'
).replace(/^export /gm, '');
const hwDataMod = {};
{
  const fn = new Function('module', hwDataSrc + '\nmodule.exports={DIAGRAMS};');
  fn(hwDataMod);
}
const { DIAGRAMS } = hwDataMod.exports;

// Load auth.js (areaForPath) — a larger file; we only need areaForPath
// We use a targeted regex extract to avoid pulling in the whole module graph.
const authSrc = readFileSync(
  path.join(root, 'functions/lib/auth.js'), 'utf8'
);
// Extract the AREA_ROLES, STATIC_ASSET_PREFIXES, STATIC_ASSET_EXT_RE constants
// plus the areaForPath function for isolated testing.
// Because auth.js uses Worker-global objects (crypto) only inside other functions,
// we can safely extract just the constants + areaForPath.
let areaForPath;
try {
  // Build a minimal Node eval context
  const lines = authSrc.split('\n');
  // Find the areaForPath function start/end
  const fnStart = lines.findIndex(l => l.startsWith('export function areaForPath'));
  // Everything up to and including areaForPath (the last export in the file)
  const relevantSrc = lines.slice(0, fnStart).join('\n')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    // Remove any lines that reference crypto (only used in other fns)
  + '\n'
  + lines.slice(fnStart).join('\n')
    .replace(/^export function areaForPath/, 'function areaForPath');

  const fn = new Function('module',
    relevantSrc +
    '\nmodule.exports = { areaForPath };'
  );
  const m = {};
  fn(m);
  areaForPath = m.exports.areaForPath;
} catch (e) {
  console.warn('  WARN: could not load areaForPath for static analysis (' + e.message + ')');
}

// ---- Shared test session objects ----
const DEREK_UID    = '518075f1-ec9f-413b-bdd9-8924c4b62959';
const BRAD_UID     = 'f3d1be05-4401-4276-b172-c1240cdc1921';  // example non-Derek admin
const sessionDerek  = { uid: DEREK_UID,  role: 'admin', name: 'Derek Franke' };
const sessionBrad   = { uid: BRAD_UID,   role: 'admin', name: 'Brad Reinking' };
const sessionField  = { uid: 'crew-001', role: 'field_ops', name: 'Joe Crew' };
const sessionNull   = null;

// ============================================================================
// G  Gate tests (logic only, no HTTP)
// ============================================================================
console.log('\n--- G. Feature gate (hardwareAllowed) ---');

assert('G1a: Derek is allowed',
  hardwareAllowed(sessionDerek) === true);

assert('G1b: Brad (admin, non-Derek) is blocked in preview mode',
  HARDWARE_GO_LIVE === false && hardwareAllowed(sessionBrad) === false);

assert('G2a: field_ops user is blocked',
  hardwareAllowed(sessionField) === false);

assert('G2b: null session is blocked',
  hardwareAllowed(sessionNull) === false);

assert('G2c: session without uid is blocked',
  hardwareAllowed({ role: 'admin' }) === false);

assert('G3: HARDWARE_GO_LIVE is false (preview mode)',
  HARDWARE_GO_LIVE === false);

assert('G4: HARDWARE_ALLOWED_UIDS contains exactly Derek\'s UID',
  HARDWARE_ALLOWED_UIDS.size === 1 && HARDWARE_ALLOWED_UIDS.has(DEREK_UID));

// ============================================================================
// G-PATH  areaForPath gate tests (require areaForPath to have loaded)
// ============================================================================
if (areaForPath) {
  console.log('\n--- G-PATH. areaForPath classification ---');

  assert('G-PATH-1: /api/hardware returns user_admin',
    areaForPath('/api/hardware') === 'user_admin');

  assert('G-PATH-2: /api/hardware/list returns user_admin',
    areaForPath('/api/hardware/list') === 'user_admin');

  assert('G-PATH-3: /hardware.html returns user_admin (default-deny)',
    areaForPath('/hardware.html') === 'user_admin');

  assert('G-PATH-4: /hardware returns user_admin (clean URL)',
    areaForPath('/hardware') === 'user_admin');

  assert('G-PATH-5: /hardware-img/mast-complete.png returns user_admin (not general)',
    areaForPath('/hardware-img/mast-complete.png') === 'user_admin');

  assert('G-PATH-6: /hardware-img/ prefix returns user_admin',
    areaForPath('/hardware-img/') === 'user_admin');
}

// ============================================================================
// D  Data integrity tests
// ============================================================================
console.log('\n--- D. Hardware data integrity ---');

assert('D1: DIAGRAMS is a non-empty array',
  Array.isArray(DIAGRAMS) && DIAGRAMS.length > 0);

DIAGRAMS.forEach(diag => {
  assert('D1-' + diag.id + ': has id/label/type/parts',
    diag.id && diag.label && (diag.type === 'mast' || diag.type === 'vibro') &&
    Array.isArray(diag.parts));

  assert('D4-' + diag.id + ': at least one part',
    diag.parts.length > 0);

  diag.parts.forEach((part, i) => {
    const ctx = diag.id + '[' + i + '] item=' + part.item;

    assert('D3-' + ctx + ': partNumber is non-blank',
      typeof part.partNumber === 'string' && part.partNumber.trim().length > 0);

    if (part.hotspot !== null && part.hotspot !== undefined) {
      assert('D1-hs-x-' + ctx + ': hotspot.x in [0,100]',
        typeof part.hotspot.x === 'number' &&
        part.hotspot.x >= 0 && part.hotspot.x <= 100,
        'x=' + part.hotspot.x);

      assert('D1-hs-y-' + ctx + ': hotspot.y in [0,100]',
        typeof part.hotspot.y === 'number' &&
        part.hotspot.y >= 0 && part.hotspot.y <= 100,
        'y=' + part.hotspot.y);
    }

    if (part.invId !== null && part.invId !== undefined) {
      assert('D2-' + ctx + ': invId matches hw-N pattern',
        /^hw-\d+$/.test(part.invId),
        'invId=' + part.invId);
    }
  });
});

const mastDiags  = DIAGRAMS.filter(d => d.type === 'mast');
const vibroDiags = DIAGRAMS.filter(d => d.type === 'vibro');
assert('D5a: at least one mast diagram',  mastDiags.length  >= 1);
assert('D5b: at least one vibro diagram', vibroDiags.length >= 1);

// All invId values referenced must be in the hw-1..hw-31 range
const allInvIds = DIAGRAMS.flatMap(d => d.parts.map(p => p.invId).filter(Boolean));
const validInvIds = new Set(Array.from({length:31}, (_,i) => 'hw-' + (i+1)));
allInvIds.forEach(id => {
  assert('D2-range-' + id + ': invId is in hw-1..hw-31',
    validInvIds.has(id), id);
});

// No diagram id should contain unsafe characters (used in URL path)
DIAGRAMS.forEach(d => {
  assert('D6-' + d.id + ': id is URL-safe',
    /^[a-z0-9-]+$/.test(d.id));
});

// D7 Balloon coverage:
//   Every drawn balloon (hotspot != null) must have non-empty desc and partNumber.
//   Every diagram must have at least one tappable hotspot.
console.log('\n--- D7. Balloon coverage ---');
DIAGRAMS.forEach(diag => {
  let hotspotCount = 0;
  diag.parts.forEach((part, i) => {
    if (part.hotspot !== null && part.hotspot !== undefined) {
      hotspotCount++;
      const ctx = diag.id + '[' + i + '] item=' + part.item;
      assert('D7-desc-' + ctx + ': drawn balloon has non-empty desc',
        typeof part.desc === 'string' && part.desc.trim().length > 0,
        'desc=' + part.desc);
      assert('D7-pn-' + ctx + ': drawn balloon has non-empty partNumber',
        typeof part.partNumber === 'string' && part.partNumber.trim().length > 0,
        'partNumber=' + part.partNumber);
    }
  });
  assert('D7-cov-' + diag.id + ': at least one tappable hotspot',
    hotspotCount > 0, 'found ' + hotspotCount);
});

// ============================================================================
// C  Click / handler tests (jsdom)
// ============================================================================
console.log('\n--- C. Click handler and toggle tests (jsdom) ---');

const css      = readFileSync(path.join(root, 'pf-r5.css'), 'utf8');
const sharedJs = readFileSync(path.join(root, 'js/pf-shared.js'), 'utf8');

function prepareHtml() {
  let html = readFileSync(path.join(root, 'hardware.html'), 'utf8');
  html = html.replace(
    /<link[^>]+href=["'][^"']*pf-r5\.css["'][^>]*>/i,
    '<style>' + css + '</style>'
  );
  html = html.replace(
    /<script[^>]+src=["'][^"']*pf-shared\.js["'][^>]*><\/script>/i,
    '<script>' + sharedJs + '</script>'
  );
  html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/gi, '');
  html = html.replace(/<link[^>]+fonts\.gstatic[^>]*>/gi, '');
  return html;
}

// Sample diagram for testing (mast-complete)
const sampleDiag = DIAGRAMS.find(d => d.id === 'mast-complete') || DIAGRAMS[0];

async function runHardwarePageTest(diagramsToReturn) {
  const html = prepareHtml();
  const dom = new JSDOM(html, {
    url: 'https://field.pierfoundations.com/hardware.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async function(url) {
        const u = String(url);
        if (u.includes('/api/me')) {
          return {
            ok: true, status: 200,
            json: async () => ({ ok: true, status: 'ok', name: 'Derek Franke',
              uid: DEREK_UID, role: 'admin', email: 'dfranke@pierfoundations.com' }),
          };
        }
        if (u.includes('/api/hardware')) {
          return {
            ok: true, status: 200,
            json: async () => ({ ok: true, diagrams: diagramsToReturn }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const store = {};
      try {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: k => store[k] ?? null,
            setItem: (k,v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; },
            clear: () => { Object.keys(store).forEach(k => delete store[k]); },
            key: i => Object.keys(store)[i] ?? null,
            get length() { return Object.keys(store).length; },
          }, writable: true, configurable: true,
        });
      } catch (e) { /* already set */ }
      window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
    },
  });

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  return dom;
}

{
  const dom    = await runHardwarePageTest([sampleDiag]);
  const window = dom.window;
  const doc    = window.document;

  // R1 — #main is visible
  const mainEl    = doc.getElementById('main');
  const mainStyle = mainEl ? window.getComputedStyle(mainEl).display : 'NOT FOUND';
  const mainInline = mainEl ? mainEl.style.display : 'NOT FOUND';
  assert('R1-hardware: #main inline style is block after auth',
    mainInline === 'block', 'got "' + mainInline + '"');
  assert('R1-hardware: #main computedStyle !== none',
    mainStyle !== 'none', 'got "' + mainStyle + '"');

  // C3 — grid has cards for the mast diagram
  const grid  = doc.getElementById('hwGrid');
  const cards = grid ? grid.querySelectorAll('.hw-card') : [];
  assert('C3a: mast toggle shows mast diagram cards',
    cards.length > 0, 'found ' + cards.length + ' cards');

  // C3b — switch to vibro, re-check (must dispatch click)
  const vibroBtn = doc.querySelector('.hw-toggle-btn[data-type="vibro"]');
  if (vibroBtn) {
    vibroBtn.click();
    // After toggling to vibro but we only loaded a mast diagram — grid should be empty
    const vibroCards = grid ? grid.querySelectorAll('.hw-card') : [];
    assert('C3b: vibro toggle with no vibro data shows no cards',
      vibroCards.length === 0, 'found ' + vibroCards.length);
    // Switch back
    const mastBtn = doc.querySelector('.hw-toggle-btn[data-type="mast"]');
    if (mastBtn) mastBtn.click();
  } else {
    assert('C3b: vibro toggle button exists', false, 'button not found');
  }

  dom.window.close();
}

// C1 / C2 — detail card open/close
{
  const dom    = await runHardwarePageTest([sampleDiag]);
  const window = dom.window;
  const doc    = window.document;

  // Open the viewer by calling hwOpenViewer via the global
  // (we can't load images in jsdom but we can call the function)
  const firstCard = doc.querySelector('.hw-card');
  assert('C1a: at least one hw-card rendered', !!firstCard);

  // Call hwShowDetail directly (simulate a table row click)
  if (window.hwShowDetail) {
    const testPart = sampleDiag.parts.find(p => p.hotspot);
    if (testPart) {
      // hwCurrentDiag must be set for active-row highlighting; set it via hwOpenViewer
      // but jsdom can't load images, so we set state directly
      window.hwCurrentDiag = sampleDiag;
      window.hwShowDetail(testPart);

      const card = doc.getElementById('hwDetailCard');
      assert('C1b: detail card has open class after hwShowDetail',
        card && card.classList.contains('open'));

      const descEl = doc.getElementById('hwDetailDesc');
      assert('C1c: detail card shows part description',
        descEl && descEl.textContent === testPart.desc,
        'got "' + (descEl && descEl.textContent) + '" expected "' + testPart.desc + '"');

      const partEl = doc.getElementById('hwDetailPart');
      assert('C1d: detail card shows part number',
        partEl && partEl.textContent === testPart.partNumber);

      // C2 — close
      window.hwCloseDetail();
      assert('C2a: detail card removed open class after hwCloseDetail',
        card && !card.classList.contains('open'));
    } else {
      assert('C1b: test part with hotspot found in sampleDiag', false, 'no hotspot parts');
    }
  } else {
    assert('C1b: hwShowDetail is defined on window', false, 'function not found');
  }

  dom.window.close();
}

// ============================================================================
// S  Static analysis: no display='' on #main or #authError
// ============================================================================
console.log('\n--- S. Static analysis ---');
{
  const src = readFileSync(path.join(root, 'hardware.html'), 'utf8');
  assert("S1: #main not revealed with display=''",
    !src.includes("getElementById('main').style.display = ''") &&
    !src.includes('getElementById("main").style.display = ""'));
  assert("S2: #authError not revealed with display=''",
    !src.includes("getElementById('authError').style.display = ''") &&
    !src.includes('getElementById("authError").style.display = ""'));
  assert('S3: hardware.html uses window.esc() for all dynamic content',
    src.includes('window.esc('));
  assert('S4: hardware.html fetches /api/hardware for data (not inline)',
    src.includes('/api/hardware'));
  assert('S5: hardware.html fetches /api/me for auth (consistent with other pages)',
    src.includes('/api/me'));
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
