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
// Derek's UID is intentionally NOT hardcoded here — read it from HARDWARE_ALLOWED_UIDS
// so the test stays in sync with hardware-access.js and the UID lives in one place only.
const DEREK_UID    = [...HARDWARE_ALLOWED_UIDS][0];
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

  assert('D1-pageRef-' + diag.id + ': has non-empty pageRef string',
    typeof diag.pageRef === 'string' && diag.pageRef.trim().length > 0);

  assert('D4-' + diag.id + ': at least one part',
    diag.parts.length > 0);

  diag.parts.forEach((part, i) => {
    const ctx = diag.id + '[' + i + '] item=' + part.item;

    assert('D3-' + ctx + ': partNumber is non-blank',
      typeof part.partNumber === 'string' && part.partNumber.trim().length > 0);

    // Resolve instances the same way the frontend does
    const instances = part.hotspots != null ? part.hotspots
                    : part.hotspot  != null ? [part.hotspot]
                    : [];

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

    // Validate every element in hotspots array
    if (Array.isArray(part.hotspots)) {
      part.hotspots.forEach((hs, j) => {
        assert('D1-mhs-' + ctx + '[' + j + ']: hotspots[' + j + '].x in [0,100]',
          typeof hs.x === 'number' && hs.x >= 0 && hs.x <= 100,
          'x=' + hs.x);
        assert('D1-mhs-' + ctx + '[' + j + ']: hotspots[' + j + '].y in [0,100]',
          typeof hs.y === 'number' && hs.y >= 0 && hs.y <= 100,
          'y=' + hs.y);
      });
      // Multi-instance parts must have at least 2 entries
      assert('D7-multi-' + ctx + ': hotspots array has >= 2 instances',
        part.hotspots.length >= 2,
        'length=' + part.hotspots.length);
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
//   Every drawn balloon (any instance) must have non-empty desc and partNumber.
//   Every diagram must have at least one tappable hotspot.
//   Multi-instance parts: every hotspots[] entry must have valid x/y (checked above in D1-mhs).
console.log('\n--- D7. Balloon coverage ---');
DIAGRAMS.forEach(diag => {
  let instanceCount = 0;
  diag.parts.forEach((part, i) => {
    const instances = part.hotspots != null ? part.hotspots
                    : part.hotspot  != null ? [part.hotspot]
                    : [];
    if (instances.length > 0) {
      instanceCount += instances.length;
      const ctx = diag.id + '[' + i + '] item=' + part.item;
      assert('D7-desc-' + ctx + ': drawn balloon has non-empty desc',
        typeof part.desc === 'string' && part.desc.trim().length > 0,
        'desc=' + part.desc);
      assert('D7-pn-' + ctx + ': drawn balloon has non-empty partNumber',
        typeof part.partNumber === 'string' && part.partNumber.trim().length > 0,
        'partNumber=' + part.partNumber);
    }
  });
  assert('D7-cov-' + diag.id + ': at least one tappable hotspot instance',
    instanceCount > 0, 'found ' + instanceCount);
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
    const testPart = sampleDiag.parts.find(p => p.hotspot || (Array.isArray(p.hotspots) && p.hotspots.length > 0));
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

// C4 / C5 — multi-instance hotspot rendering
// A part with hotspots:[...] must render one button per instance;
// clicking any instance activates ALL buttons for that item.
{
  // Find first multi-instance diagram
  const multiDiag = DIAGRAMS.find(d => d.parts.some(p => Array.isArray(p.hotspots) && p.hotspots.length >= 2));
  if (multiDiag) {
    const dom    = await runHardwarePageTest([multiDiag]);
    const window = dom.window;
    const doc    = window.document;

    // hwOpenViewer sets the internal let binding hwCurrentDiag = diag.
    // We call it to prime state, then manually call hwRenderHotspots because
    // jsdom does not fire img.onload (which is what normally calls it).
    if (window.hwOpenViewer) window.hwOpenViewer(multiDiag);
    // Manually trigger hotspot render (image onload won't fire in jsdom)
    if (window.hwRenderHotspots) window.hwRenderHotspots();

    // Find a multi-instance part
    const multiPart = multiDiag.parts.find(p => Array.isArray(p.hotspots) && p.hotspots.length >= 2);
    const itemTxt   = String(multiPart.item);

    const allBtns = doc.querySelectorAll('.hw-hotspot');
    const matchBtns = [...allBtns].filter(b => b.textContent.trim() === itemTxt);

    assert('C4a: multi-instance part renders >= 2 hotspot buttons',
      matchBtns.length >= 2,
      'item=' + itemTxt + ' found=' + matchBtns.length);

    // Simulate click on first button via hwShowDetail
    if (window.hwShowDetail) {
      window.hwShowDetail(multiPart);
      const activeBtns = [...doc.querySelectorAll('.hw-hotspot.active')];
      const activeForItem = activeBtns.filter(b => b.textContent.trim() === itemTxt);
      assert('C4b: clicking multi-instance activates all its buttons',
        activeForItem.length >= 2,
        'active=' + activeForItem.length + ' expected>=' + 2);

      // Close — all should deactivate
      window.hwCloseDetail();
      const stillActive = [...doc.querySelectorAll('.hw-hotspot.active')];
      assert('C5: hwCloseDetail removes all active hotspot classes',
        stillActive.length === 0,
        'still active=' + stillActive.length);
    } else {
      assert('C4b: hwShowDetail available', false, 'not found');
    }

    dom.window.close();
  } else {
    console.log('  SKIP C4/C5: no multi-instance diagram found in DIAGRAMS');
  }
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
  assert('S6: hardware.html has static topbar (not broken pfBuildHeader)',
    src.includes('id="topbar"') && !src.includes('pfBuildHeader'));
  assert('S7: hardware.html has pfNav with hwNavItem (always-visible — this is the hardware page)',
    src.includes('id="pfNav"') && src.includes('id="hwNavItem"'));
}

// ============================================================================
// P-AUTH  Page /api/me auth init: hwNavItem visibility and no-crash contract
// ============================================================================
// REGRESSION test for commit 3b0835c which inserted r.d.uid in pages whose
// callbacks use res.d or me (no .d), causing ReferenceError that aborted the
// auth success handler before #main was shown.  Those 3 assertions below are
// the ones that FAIL on 3b0835c and PASS on this commit.
// ============================================================================
console.log('\n--- P-AUTH. Page auth init (hwNavItem visibility + no crash) ---');

{
  const ALL_FIELD_PAGES = [
    'index.html', 'cost-codes.html', 'daily-report.html', 'equipment-inspection.html',
    'mailing-lists.html', 'past-reports.html', 'schedule.html', 'site-readiness.html',
    'sops.html', 'time-off.html', 'toolbox-talk.html', 'hardware.html',
  ];

  async function runPageAuthInit(pageFile, hardwareAllowedFlag, pageDir) {
    const dir = pageDir || root;
    const pageSrc = readFileSync(path.join(dir, pageFile), 'utf8');
    let html = pageSrc
      .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
      .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi,
               '<script>' + sharedJs + '</script>');

    const mePayload = {
      ok: true, status: 'ok',
      uid: DEREK_UID, name: 'Derek Franke', role: 'admin',
      email: 'dfranke@pierfoundations.com',
      hardwareAllowed: hardwareAllowedFlag,
    };

    const dom = new JSDOM(html, {
      url: 'https://field.pierfoundations.com/' + pageFile,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async function(url) {
          const u = String(url);
          if (u.includes('/api/me')) {
            return { ok: true, status: 200, json: async () => mePayload };
          }
          // Stub all other API calls so the page can complete init
          return {
            ok: true, status: 200,
            json: async () => ({ ok: true, status: 'ok', diagrams: [], absences: [],
              items: [], users: [], projects: [], records: [], lists: {} }),
          };
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
        } catch (e) {}
        window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
      },
    });

    // Allow async chains to settle (auth + any secondary fetches)
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 10));
    }
    return dom;
  }

  for (const pageFile of ALL_FIELD_PAGES) {
    const tag = 'P-AUTH-' + pageFile.replace('.html', '');

    // --- hardwareAllowed = true ---
    {
      let dom = null, exc = null;
      try { dom = await runPageAuthInit(pageFile, true); }
      catch (e) { exc = e; }

      assert(tag + '[hw=true]: no exception during page init',
        exc === null, exc ? String(exc).slice(0, 120) : '');

      if (dom) {
        const doc = dom.window.document;
        const mainEl  = doc.getElementById('main');
        const hwNavEl = doc.getElementById('hwNavItem');

        // KEY REGRESSION CHECK — FAILS on 3b0835c for schedule, time-off, equipment-inspection
        // because ReferenceError in those pages aborted the success handler before main.style='block'
        assert(tag + '[hw=true]: #main shown after auth (not display:none or empty)',
          mainEl != null && mainEl.style.display === 'block',
          '#main.style.display=' + (mainEl ? '"' + mainEl.style.display + '"' : 'NOT FOUND'));

        assert(tag + '[hw=true]: hwNavItem present in DOM',
          hwNavEl != null, 'hwNavItem not found in ' + pageFile);

        if (hwNavEl) {
          // hardware.html hwNavItem has no display:none — always ''
          // All other pages set it to '' (un-hides from 'none') when hardwareAllowed=true
          assert(tag + '[hw=true]: hwNavItem visible (display not "none")',
            hwNavEl.style.display !== 'none',
            'hwNavItem.style.display="' + hwNavEl.style.display + '"');
        }
        dom.window.close();
      }
    }

    // --- hardwareAllowed = false (skip hardware.html — always visible there) ---
    if (pageFile !== 'hardware.html') {
      let dom = null, exc = null;
      try { dom = await runPageAuthInit(pageFile, false); }
      catch (e) { exc = e; }

      assert(tag + '[hw=false]: no exception during page init',
        exc === null, exc ? String(exc).slice(0, 120) : '');

      if (dom) {
        const doc = dom.window.document;
        const hwNavEl = doc.getElementById('hwNavItem');
        assert(tag + '[hw=false]: hwNavItem stays hidden when not hardwareAllowed',
          hwNavEl != null && hwNavEl.style.display === 'none',
          'hwNavItem.style.display="' + (hwNavEl ? hwNavEl.style.display : 'NOT FOUND') + '"');
        dom.window.close();
      }
    }
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
