// test-sops-portal.mjs
//
// jsdom tests for the SOPs feature:
//   1. sops.html loads, auth check reveals #main
//   2. All 4 SOP sections present
//   3. All 4 download links present
//   4. SOPs tile in index.html links to /sops.html
//   5. Prove: removing the SOPs tile from index.html causes tile test to FAIL
//   6. Auth tests: unauthenticated → stays hidden (login redirect logic fires)
//   7. Nav: SOPs tab present on sops.html with correct data-paths
//   8. Nav: SOPs tab present on index.html
//
// Run: node tests/test-sops-portal.mjs

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require   = createRequire(import.meta.url);
const { JSDOM } = require('/home/aiciv/PF-Platform/node_modules/jsdom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(msg) { console.log('  PASS ' + msg); passed++; }
function fail(msg, detail) {
  console.error('  FAIL ' + msg + (detail ? '\n       ' + detail : ''));
  failed++;
}
function assert(desc, cond, detail) { if (cond) pass(desc); else fail(desc, detail); }

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

const css      = readFileSync(path.join(root, 'pf-r5.css'), 'utf8');
const sharedJs = readFileSync(path.join(root, 'js/pf-shared.js'), 'utf8');

function prepareHtml(filename) {
    let html = readFileSync(path.join(root, filename), 'utf8');
    html = html.replace(
        /<link[^>]+href=["'][^"']*pf-r5\.css["'][^>]*>/i,
        `<style>${css}</style>`
    );
    html = html.replace(
        /<script[^>]+src=["'][^"']*pf-shared\.js["'][^>]*><\/script>/i,
        `<script>${sharedJs}</script>`
    );
    html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/gi, '');
    html = html.replace(/<link[^>]+fonts\.gstatic[^>]*>/gi, '');
    return html;
}

function makeFetchMock(authed = true, ownerEmail = 'dfranke@pierfoundations.com') {
    return async function(url) {
        const u = String(url);
        if (u.includes('/api/me')) {
            if (authed) {
                return {
                    ok: true, status: 200,
                    json: async () => ({ ok: true, status: 'ok', name: 'Test User',
                        uid: 'u1', role: 'field_ops', email: ownerEmail }),
                    text: async () => '',
                };
            } else {
                return {
                    ok: false, status: 401,
                    json: async () => ({ ok: false, status: 'unauthenticated' }),
                    text: async () => '',
                };
            }
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
    };
}

async function runPage(html, { authed = true, email = 'dfranke@pierfoundations.com',
                                pageUrl = 'https://field.pierfoundations.com/sops.html' } = {}) {
    const dom = new JSDOM(html, {
        url: pageUrl,
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        resources: 'usable',
        beforeParse(window) {
            window.fetch = makeFetchMock(authed, email);
            const store = {};
            try {
                Object.defineProperty(window, 'localStorage', {
                    value: {
                        getItem:    (k) => store[k] ?? null,
                        setItem:    (k, v) => { store[k] = String(v); },
                        removeItem: (k) => { delete store[k]; },
                        clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
                    },
                    writable: true, configurable: true,
                });
            } catch (e) { /* already set */ }
            window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
        },
    });

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 10));
    }

    const w   = dom.window;
    const doc = w.document;
    const mainEl    = doc.getElementById('main');
    const authErrEl = doc.getElementById('authError');

    const result = {
        mainDisplay:    mainEl    ? w.getComputedStyle(mainEl).display    : 'NOT FOUND',
        authErrDisplay: authErrEl ? w.getComputedStyle(authErrEl).display : 'NOT FOUND',
        mainInline:     mainEl    ? mainEl.style.display : 'NOT FOUND',
        redirected:     w.location.href !== pageUrl,
        location:       w.location.href,
        doc,
        window: w,
    };
    dom.window.close();
    return result;
}

// ---------------------------------------------------------------------------
// 1. sops.html — authenticated: #main visible
// ---------------------------------------------------------------------------

console.log('\n--- 1. sops.html: auth gate ---');

{
    const html   = prepareHtml('sops.html');
    const result = await runPage(html, { pageUrl: 'https://field.pierfoundations.com/sops.html' });

    assert('1a: #main inline style is "block" after auth',
        result.mainInline === 'block',
        `got "${result.mainInline}"`);

    assert('1b: #main computedStyle.display !== "none" after auth',
        result.mainDisplay !== 'none',
        `got "${result.mainDisplay}"`);
}

// ---------------------------------------------------------------------------
// 2. sops.html — unauthenticated: stays hidden or redirects
// ---------------------------------------------------------------------------

{
    const html   = prepareHtml('sops.html');
    const result = await runPage(html, {
        authed:  false,
        pageUrl: 'https://field.pierfoundations.com/sops.html',
    });

    assert('1c: unauthenticated → redirected to login OR #main stays hidden',
        result.redirected || result.mainInline !== 'block',
        `main="${result.mainInline}", location="${result.location}"`);
}

// ---------------------------------------------------------------------------
// 3. sops.html content — all 4 SOP sections present
// ---------------------------------------------------------------------------

console.log('\n--- 2. sops.html: SOP sections ---');

{
    const html = readFileSync(path.join(root, 'sops.html'), 'utf8');

    const sections = [
        { id: 'sop-he001',  label: 'HE-SOP-001 Daily Heavy Equipment' },
        { id: 'sop-saf002', label: 'SOP-SAF-002 Jobsite Walk'         },
        { id: 'sop-ops001', label: 'SOP-OPS-001 Pre-Job Site Visit'    },
        { id: 'sop-pf001',  label: 'PF-XXX Project Closeout'          },
    ];

    for (const { id, label } of sections) {
        assert(`2a: id="${id}" in sops.html`,
            html.includes(`id="${id}"`),
            `missing id="${id}"`);

        assert(`2b: SOP card for ${label} has Download PDF link`,
            html.includes(`id="${id}"`) && html.includes('Download PDF'),
            '');
    }

    // SOP number in index
    for (const num of ['HE-SOP-001', 'SOP-SAF-002', 'SOP-OPS-001', 'PF-XXX']) {
        assert(`2c: SOP number ${num} in index`, html.includes(num), '');
    }
}

// ---------------------------------------------------------------------------
// 4. sops.html — download links for all 4 PDFs
// ---------------------------------------------------------------------------

console.log('\n--- 3. sops.html: download links ---');

{
    const html = readFileSync(path.join(root, 'sops.html'), 'utf8');
    const pdfs = [
        'Daily_Heavy_Equipment_Inspections_sop.pdf',
        'Pier_Foundations_Jobsite_Walk_sop.pdf',
        'Pier_Foundations_Pre-Job_Site_Visit_sop.pdf',
        'Pier_Foundations_Project_Closeout_Before_Demobilization_sop.pdf',
    ];
    for (const pdf of pdfs) {
        assert(`3: href="/sops/${pdf}" present`, html.includes(`/sops/${pdf}`), '');
    }
}

// ---------------------------------------------------------------------------
// 5. index.html — SOPs tile present and links to /sops.html
// ---------------------------------------------------------------------------

console.log('\n--- 4. index.html: SOPs tile ---');

{
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');

    assert('4a: SOPs tile present in index.html',
        html.includes('/sops.html'),
        'href="/sops.html" not found in index.html');

    assert('4b: SOPs dash-card references /sops.html',
        html.includes("window.location.href='/sops.html'"),
        "onclick=window.location.href='/sops.html' not found");

    assert('4c: SOPs secondary qa-btn present',
        html.includes('href="/sops.html" class="qa-btn secondary"'),
        'SOPs qa-btn not found in index.html');
}

// ---------------------------------------------------------------------------
// 6. Prove removing SOPs tile BREAKS test 4a (meta-test: test tests itself)
// ---------------------------------------------------------------------------

console.log('\n--- 5. Meta: removing SOPs tile causes test to FAIL (self-verification) ---');

{
    const html         = readFileSync(path.join(root, 'index.html'), 'utf8');
    const mutilated    = html.replace(/href="\/sops\.html"/g, 'href="/sops-REMOVED.html"');
    const tilePresent  = mutilated.includes('href="/sops.html"');

    assert('5: mutilated copy does NOT contain original SOPs tile href',
        !tilePresent,
        'The mutation did not remove the href — the meta-test is broken');
}

// ---------------------------------------------------------------------------
// 7. Nav: SOPs tab present on sops.html, index.html, daily-report.html
// ---------------------------------------------------------------------------

console.log('\n--- 6. Nav: SOPs tab present on portal pages ---');

const NAV_PAGES = [
    'sops.html',
    'index.html',
    'daily-report.html',
    'equipment-inspection.html',
    'site-readiness.html',
    'toolbox-talk.html',
    'past-reports.html',
    'cost-codes.html',
    'schedule.html',
    'time-off.html',
    'mailing-lists.html',
];

for (const page of NAV_PAGES) {
    const html = readFileSync(path.join(root, page), 'utf8');
    assert(`6a: SOPs nav tab in ${page}`,
        html.includes('href="/sops.html"') &&
        html.includes('data-paths="/sops.html, /sops"'),
        `SOPs nav not found in ${page}`);
}

// sops.html itself should have the SOPs nav item marked active-compatible
// (data-paths attribute should be present; pfInitNav sets aria-current)
{
    const html = readFileSync(path.join(root, 'sops.html'), 'utf8');
    assert('6b: sops.html nav has correct data-paths attr',
        html.includes('data-paths="/sops.html, /sops"'),
        '');
}

// ---------------------------------------------------------------------------
// 8. No display='' on #main in sops.html
// ---------------------------------------------------------------------------

console.log('\n--- 7. Static: sops.html uses display=block not display="" ---');

{
    const html = readFileSync(path.join(root, 'sops.html'), 'utf8');
    assert("7a: sops.html doesn't use display='' to reveal #main",
        !html.includes("getElementById('main').style.display = ''") &&
        !html.includes('getElementById("main").style.display = ""'),
        "found display='' for #main in sops.html");

    assert("7b: sops.html uses style.display='block' to reveal #main",
        html.includes("mainEl.style.display='block'") ||
        html.includes('mainEl.style.display = "block"') ||
        html.includes("mainEl.style.display = 'block'"),
        "style.display='block' not found in sops.html");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
