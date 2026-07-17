#!/usr/bin/env node
/*
 * RUNTIME verification for Derek's WRAPPING COLUMN HEADERS change (index.html).
 *
 * Loads the REAL <style> CSS + the REAL precon IIFE from index.html into jsdom,
 * renders the wide feasibility_review table and a precon bucket (submitted_bids),
 * and asserts (via getComputedStyle, which jsdom resolves from the cascade incl.
 * !important) that header cells now WRAP instead of clip:
 *   - th white-space === 'normal' (NOT 'nowrap')
 *   - th text-overflow !== 'ellipsis' (no clip)
 *   - th overflow-wrap / word-break allow breaking long labels
 *   - the sort arrow (▲/▼) is still present on an active sorted header
 * jsdom has no real layout engine (clientHeight is not computed), so multi-line
 * HEIGHT growth is verified separately with headless chromium if available (see
 * header-wrap-screenshot below); here we prove the CSS contract is authoritative.
 *
 * Run: node docs/precon-sort/header-wrap.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = process.env.PF_INDEX_OVERRIDE || path.join(ROOT, 'platform', 'index.html');
const PIPE  = path.join(ROOT, 'platform', 'data', 'precon-pipeline.js');

const html = fs.readFileSync(INDEX, 'utf8');
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const iife = scriptBlocks.find(b => b.includes('function renderMount') && b.includes('renderHighlightTable'));
if (!iife) throw new Error('precon IIFE not found');

function loadDataObject(file){
  const txt = fs.readFileSync(file, 'utf8');
  const eq = txt.indexOf('='); let body = txt.slice(eq + 1).trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  return JSON.parse(body);
}
const PF_PRECON = loadDataObject(PIPE);
// feasibility_review has 0 live rows -> inject rows with LONG column-worthy labels
function mkRow(name, number, city, btv, due){
  return { number: number, name: name, city_state: city, gc: 'A Very Long General Contractor Name LLC',
    value: btv, due_date: due, fields: { 'Project Number': number, 'Project Name': name,
      'City / State': city, 'Bid Total Value': btv, 'Due Date': due, 'Total LF': '1000',
      'General Contractor': 'A Very Long General Contractor Name LLC',
      'Design Completed Date': '2026-05-01', 'Projected Start Date': '2026-08-01' } };
}
PF_PRECON.ap.feasibility_review = [
  mkRow('alpha Feasibility',   'F-001', 'Akron, OH',      '$460,000',   '2026-06-24'),
  mkRow('Bravo Feasibility',   'F-002', 'Fort Wayne, IN', '$75,000',    '2026-01-15'),
];

const styleTags = styleBlocks.map(function(s){ return '<style>' + s + '</style>'; }).join('\n');
const mounts = `
  <div class="pf-index-root precon-mount" data-disc="ap" data-bucket="submitted_bids"></div>
  <div class="pf-index-root precon-mount" data-disc="ap" data-bucket="feasibility_review"></div>
`;
const dom = new JSDOM(`<!DOCTYPE html><html><head>${styleTags}</head><body>${mounts}</body></html>`,
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom; const { document } = window;

window.esc = function(v){ return v == null ? '' : String(v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
window.PF_PRECON = PF_PRECON;
window.PF_PROJECT_MASTER = { projects: [] };
window.PF_ME = { role: 'partner' };
window.PF_PIPELINE = { overrides: {} };
window.PF_GARBIN = {}; window.PF_BIDMETA = {}; window.PF_MANUAL_BIDS = []; window.PF_PM = {};
window.pfPmRecordFor = function(){ return null; };
['pfResolveBid','pfToggleGarbin','pfToggleHot','pfBidPriceSave','pfDateEditOpen','pfDateEditSave',
 'pfGcAddRow','pfGcRemoveRow','pfGcSave','pfGcSetAwarded','pfDocAddRow','pfDocRemoveRow','pfDocSave',
 'pfManualBidFormToggle','pfManualBidRemove','pfManualBidSubmit','pfSetBidPrice','pfAutoCreatePmOnAward',
 'pfRerenderPrecon'].forEach(function(n){ if (typeof window[n] !== 'function') window[n] = function(){}; });

new window.Function(iife + '\n//# sourceURL=precon-iife.js').call(window);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

// ---- assert harness ----
var pass = 0, fail = 0;
function ok(c, m){ if (c){ pass++; console.log('  PASS ' + m);} else { fail++; console.log('  FAIL ' + m);} }
function cs(el){ return window.getComputedStyle(el); }
function mountFor(b){ return document.querySelector('.precon-mount[data-bucket="' + b + '"]'); }

console.log('\n=== RUNTIME header-wrap verification (computed style from real CSS) ===\n');

// ---- precon bucket highlight table (submitted_bids) ----
console.log('[pf-hl-table (submitted_bids) headers]');
var sb = mountFor('submitted_bids');
var hlThs = [...sb.querySelectorAll('table.pf-hl-table thead th')];
ok(hlThs.length > 0, 'pf-hl-table has header cells (' + hlThs.length + ')');
var hlSortable = [...sb.querySelectorAll('table.pf-hl-table thead th.pf-hl-sortable')];
ok(hlSortable.length > 0, 'pf-hl-table has sortable headers');
var allNormalHl = hlThs.every(function(th){ return cs(th).whiteSpace === 'normal'; });
ok(allNormalHl, 'ALL pf-hl-table th white-space === normal (not nowrap)');
var noEllipsisHl = hlThs.every(function(th){ return cs(th).textOverflow !== 'ellipsis'; });
ok(noEllipsisHl, 'no pf-hl-table th uses text-overflow: ellipsis');
var breakHl = hlThs.every(function(th){ var w = cs(th); return (w.overflowWrap === 'break-word' || w.wordWrap === 'break-word' || w.wordBreak === 'break-word'); });
ok(breakHl, 'pf-hl-table th allow breaking long words (overflow-wrap/word-break)');
// arrow still renders: click Bid Total, confirm the header shows an arrow char
var bidTotal = hlSortable.find(function(t){ return t.textContent.replace(/[▲▼\s]+$/,'').trim() === 'Bid Total'; });
ok(!!bidTotal, 'Bid Total header found');
if (bidTotal){ bidTotal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  var bt2 = [...sb.querySelectorAll('table.pf-hl-table thead th.pf-hl-sortable')].find(function(t){ return /Bid Total/.test(t.textContent); });
  ok(bt2 && /[▲▼]/.test(bt2.textContent), 'sort arrow still present on wrapped header after click');
}

// ---- wide feasibility_review table ----
console.log('\n[pf-wide (feasibility_review) headers]');
var fr = mountFor('feasibility_review');
var wide = fr.querySelector('table.pf-wide');
ok(!!wide, 'feasibility_review wide table present');
if (wide){
  var wThs = [...fr.querySelectorAll('table.pf-wide thead th')];
  ok(wThs.length > 0, 'pf-wide has header cells (' + wThs.length + ')');
  var allNormalW = wThs.every(function(th){ return cs(th).whiteSpace === 'normal'; });
  ok(allNormalW, 'ALL pf-wide th white-space === normal (was nowrap)');
  var noEllipsisW = wThs.every(function(th){ return cs(th).textOverflow !== 'ellipsis'; });
  ok(noEllipsisW, 'no pf-wide th uses text-overflow: ellipsis');
  // sticky header still sticky: thead th position sticky OR sticky Project col sticky
  var stickyCol = fr.querySelector('table.pf-wide thead th.pf-sticky-col');
  ok(!!stickyCol, 'wide sticky Project header cell present');
  ok(stickyCol && /sticky/.test(cs(stickyCol).position), 'wide sticky Project header still position:sticky (' + (stickyCol ? cs(stickyCol).position : '') + ')');
  // a body td still ellipsis-clips (unchanged)
  var bodyTd = fr.querySelector('table.pf-wide tbody td:not(.pf-sticky-col)');
  ok(bodyTd && cs(bodyTd).textOverflow === 'ellipsis', 'wide BODY td keeps ellipsis (unchanged)');
  // long label present (Design Completed Date is a long header) and wrappable
  var longTh = wThs.find(function(t){ return /Design Completed Date/.test(t.textContent); });
  ok(!!longTh, 'a long header label (Design Completed Date) exists to wrap');
  ok(longTh && cs(longTh).whiteSpace === 'normal', 'long wide header wraps (white-space normal)');
}

// ---- base <table> (Projects-style) header rule ----
console.log('\n[base table thead th (non-precon tables)]');
var probe = document.createElement('table');
probe.innerHTML = '<thead><tr><th id="probe-th">A Long Base Table Header Label</th></tr></thead>';
document.body.appendChild(probe);
var pth = document.getElementById('probe-th');
ok(cs(pth).whiteSpace === 'normal', 'base "table thead th" white-space === normal (was nowrap)');

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
