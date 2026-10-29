// test-portal-display-regression.mjs
// Regression test for the "blank page" class of bug:
//   pf-r5.css hides #main and #authError with display:none.
//   If a page's auth-check sets style.display='' instead of 'block',
//   the CSS rule wins and the page stays blank.
//
// This test inlines pf-r5.css into each portal page, mocks fetch for
// /api/me (ok) and /api/field-projects, runs the page script in jsdom,
// then asserts that #main becomes visible.
//
// Run: node tests/test-portal-display-regression.mjs
// Requires: jsdom (in /home/aiciv/PF-Platform/node_modules/jsdom)

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('/home/aiciv/PF-Platform/node_modules/jsdom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, cond, detail) {
  if (cond) { console.log('  PASS ' + desc); passed++; }
  else { console.error('  FAIL ' + desc + (detail ? ' :: ' + detail : '')); failed++; }
}

// ---- Load pf-r5.css and pf-shared.js once ---------------------------------
const css       = readFileSync(path.join(root, 'pf-r5.css'), 'utf8');
const sharedJs  = readFileSync(path.join(root, 'js/pf-shared.js'), 'utf8');

// ---- Prepare HTML: inline pf-r5.css + pf-shared.js, strip font links -------
function prepareHtml(filename) {
  let html = readFileSync(path.join(root, filename), 'utf8');
  // Replace external pf-r5.css link with inline <style>
  html = html.replace(
    /<link[^>]+href=["'][^"']*pf-r5\.css["'][^>]*>/i,
    `<style>${css}</style>`
  );
  // Replace /js/pf-shared.js script tag with inline content
  html = html.replace(
    /<script[^>]+src=["'][^"']*pf-shared\.js["'][^>]*><\/script>/i,
    `<script>${sharedJs}</script>`
  );
  // Remove Google Fonts preconnect / stylesheet links (network calls not needed)
  html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/gi, '');
  html = html.replace(/<link[^>]+fonts\.gstatic[^>]*>/gi, '');
  return html;
}

// ---- Run auth-check for one page and return { mainDisplay, authErrDisplay } -
async function runPage(filename) {
  const html = prepareHtml(filename);

  const dom = new JSDOM(html, {
    url: 'https://field.pierfoundations.com/' + filename,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: 'usable',
    beforeParse(window) {
      // Mock fetch: /api/me returns authenticated, /api/field-projects returns empty list
      window.fetch = async function(url, opts) {
        const u = String(url);
        if (u.includes('/api/me')) {
          // status:'ok' is required by DR and SR auth checks; name is required by TT/EI
          // email must be an owner so mailing-lists.html shows #main (not redirect)
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, status: 'ok', name: 'Test User', uid: 'u1', role: 'field_ops', email: 'dfranke@pierfoundations.com' }),
            text: async () => '{"ok":true,"status":"ok","name":"Test User","uid":"u1","role":"field_ops","email":"dfranke@pierfoundations.com"}',
          };
        }
        if (u.includes('/api/mailing-lists')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, lists: {} }),
            text: async () => '{"ok":true,"lists":{}}',
          };
        }
        if (u.includes('/api/field-projects')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, projects: [] }),
            text: async () => '{"ok":true,"projects":[]}',
          };
        }
        if (u.includes('/api/toolbox-talk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, records: [] }),
            text: async () => '{"ok":true,"records":[]}',
          };
        }
        if (u.includes('/api/')) {
          return {
            ok: true, status: 200,
            json: async () => ({ ok: true }),
            text: async () => '{"ok":true}',
          };
        }
        // Ignore other URLs (fonts, etc.)
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      };

      // Mock localStorage (jsdom provides it but scripts may call it; no-op is fine)
      try {
        const store = {};
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
            clear: () => { Object.keys(store).forEach(k => delete store[k]); },
            key: (i) => Object.keys(store)[i] ?? null,
            get length() { return Object.keys(store).length; },
          },
          writable: true, configurable: true,
        });
      } catch (e) { /* jsdom already has localStorage; that's fine */ }

      // Suppress console noise from scripts
      window.console = {
        log: () => {}, warn: () => {}, error: () => {}, info: () => {},
      };
    },
  });

  // Allow the fetch promise chain and microtasks to settle.
  // jsdom does not have a real event loop, but resolved promises flush via
  // Node's microtask queue. A single await Promise.resolve() is not enough
  // for chained .then() calls, so we yield several times.
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 10));
  }

  const window = dom.window;
  const doc    = window.document;

  const mainEl     = doc.getElementById('main');
  const authErrEl  = doc.getElementById('authError');

  const mainStyle     = mainEl     ? window.getComputedStyle(mainEl).display     : 'NOT FOUND';
  const authErrStyle  = authErrEl  ? window.getComputedStyle(authErrEl).display  : 'NOT FOUND';

  // Also check that #main has block inline style (which overrides pf-r5.css rule)
  const mainInline    = mainEl     ? mainEl.style.display     : 'NOT FOUND';

  dom.window.close();
  return { mainDisplay: mainStyle, authErrDisplay: authErrStyle, mainInline };
}

// ============================================================================
// Tests
// ============================================================================

const FORMS = [
  { file: 'toolbox-talk.html',       label: 'Toolbox Talk'          },
  { file: 'daily-report.html',       label: 'Daily Report'          },
  { file: 'site-readiness.html',     label: 'Site Readiness'        },
  { file: 'equipment-inspection.html', label: 'Equipment Inspection' },
  { file: 'mailing-lists.html',      label: 'Mailing Lists'         },
];

// ---- Static analysis: no `display = ''` for CSS-hidden elements ------------
console.log('\n--- S. Static analysis: no display="" on CSS-hidden elements ---');

for (const { file, label } of FORMS) {
  const src = readFileSync(path.join(root, file), 'utf8');
  // #main and #authError are hidden by pf-r5.css; setting display='' keeps them hidden
  assert(
    `S-${label}: #main not revealed with display=''`,
    !src.includes("getElementById('main').style.display = ''") &&
    !src.includes('getElementById("main").style.display = ""'),
    `found display='' for #main in ${file}`
  );
  assert(
    `S-${label}: #authError not revealed with display=''`,
    !src.includes("getElementById('authError').style.display = ''") &&
    !src.includes('getElementById("authError").style.display = ""'),
    `found display='' for #authError in ${file}`
  );
}

// Toolbox Talk specific: ttOtherRow is hidden by <style> in the page
{
  const src = readFileSync(path.join(root, 'toolbox-talk.html'), 'utf8');
  assert(
    'S-TT-ttOtherRow: show path uses explicit block, not empty string',
    src.includes("? 'block' : 'none'") && !src.includes("? '' : 'none'"),
    "found display='' for ttOtherRow in toolbox-talk.html"
  );
}

// ---- Runtime tests: jsdom with pf-r5.css inlined ---------------------------
console.log('\n--- R. Runtime: #main visible after auth (jsdom + inlined CSS) ---');

for (const { file, label } of FORMS) {
  let result;
  try {
    result = await runPage(file);
  } catch (e) {
    assert(`R-${label}: jsdom load succeeds`, false, String(e).slice(0, 200));
    continue;
  }

  // The inline style must be 'block' so it overrides pf-r5.css's display:none
  assert(
    `R-${label}: #main inline style is 'block' after auth`,
    result.mainInline === 'block',
    `got mainInline="${result.mainInline}"`
  );

  // getComputedStyle must not be 'none'
  assert(
    `R-${label}: #main computedStyle.display !== 'none' after auth`,
    result.mainDisplay !== 'none',
    `got computedStyle.display="${result.mainDisplay}"`
  );
}

// ---- Summary ---------------------------------------------------------------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
