#!/usr/bin/env node
/*
 * Verify Derek's PROJECT/NAME column WIDENING (~2x) across tables.
 *
 * jsdom has no layout engine (offsetWidth is 0), so we verify the AUTHORITATIVE
 * width signals the browser uses for these tables:
 *   - pf-hl-table (precon buckets, table-layout:fixed): the name <col> explicit
 *     width attribute (2nd col, after the 34px disc col). Before = flex (no width);
 *     After = an explicit NAME_W px. Also the table min-width (enables the wrapper's
 *     horizontal scroll instead of crushing the name).
 *   - pf-wide (feasibility_review, width:max-content): the sticky Project column's
 *     computed min-width / max-width (Before max-width 240px / no min; After
 *     min 320 / max 480).
 *   - Projects table: the Name th/td inline min-width.
 * Also confirms the name column still carries the sortable header + arrow, and that
 * .pf-hl-wrap scrolls (overflow-x:auto) rather than clips (was overflow:hidden).
 *
 * PF_INDEX_OVERRIDE points the harness at a scratch copy for a before/after diff.
 * Run: node docs/table-headers/name-width.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = process.env.PF_INDEX_OVERRIDE || path.join(ROOT, 'platform', 'index.html');
const PIPE  = path.join(ROOT, 'platform', 'data', 'precon-pipeline.js');

const html = fs.readFileSync(INDEX, 'utf8');
const styleBlocks  = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const iife = scriptBlocks.find(b => b.includes('function renderMount') && b.includes('renderHighlightTable'));

function loadDataObject(file){
  const txt = fs.readFileSync(file, 'utf8');
  const eq = txt.indexOf('='); let body = txt.slice(eq + 1).trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  return JSON.parse(body);
}
const PF_PRECON = loadDataObject(PIPE);
function mkRow(name, number, city){
  return { number, name, city_state: city, gc: 'Some GC LLC', value: '$500,000', due_date: '2026-06-01',
    fields: { 'Project Number': number, 'Project Name': name, 'City / State': city,
      'Bid Total Value': '$500,000', 'Due Date': '2026-06-01', 'Total LF': '1000', 'General Contractor': 'Some GC LLC' } };
}
PF_PRECON.ap.feasibility_review = [ mkRow('A Long Project Name For Feasibility Review', 'F-001', 'Fort Wayne, IN') ];

const styleTags = styleBlocks.map(s => '<style>' + s + '</style>').join('\n');
const mounts = '<div class="precon-mount" data-disc="ap" data-bucket="actively_bidding"></div>'
             + '<div class="precon-mount" data-disc="ap" data-bucket="feasibility_review"></div>';
const dom = new JSDOM('<!DOCTYPE html><html><head>' + styleTags + '</head><body>' + mounts + '</body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom; const { document } = window;

window.esc = v => v == null ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
window.PF_PRECON = PF_PRECON; window.PF_PROJECT_MASTER = { projects: [] };
window.PF_ME = { role: 'partner' }; window.PF_PIPELINE = { overrides: {} };
window.PF_GARBIN = {}; window.PF_BIDMETA = {}; window.PF_MANUAL_BIDS = []; window.PF_PM = {};
window.pfPmRecordFor = () => null;
['pfResolveBid','pfToggleGarbin','pfToggleHot','pfBidPriceSave','pfDateEditOpen','pfDateEditSave','pfGcAddRow','pfGcRemoveRow','pfGcSave','pfGcSetAwarded','pfDocAddRow','pfDocRemoveRow','pfDocSave','pfManualBidFormToggle','pfManualBidRemove','pfManualBidSubmit','pfSetBidPrice','pfAutoCreatePmOnAward','pfRerenderPrecon'].forEach(n => { if (typeof window[n] !== 'function') window[n] = () => {}; });

new window.Function(iife).call(window);
document.dispatchEvent(new window.Event('DOMContentLoaded'));

var pass = 0, fail = 0;
function ok(c, m){ if (c){ pass++; console.log('  PASS ' + m);} else { fail++; console.log('  FAIL ' + m);} }
function cs(el){ return window.getComputedStyle(el); }

console.log('\n=== NAME-column widening verification ===\n');

// ---- pf-hl-table (Actively Pricing / actively_bidding) ----
console.log('[pf-hl-table actively_bidding: name <col> width]');
var ap = document.querySelector('.precon-mount[data-bucket="actively_bidding"]');
var apCols = [...ap.querySelectorAll('table.pf-hl-table colgroup col')];
ok(apCols.length >= 2, 'colgroup present (' + apCols.length + ' cols)');
var discCol = apCols[0], nameCol = apCols[1];
var discW = (discCol.getAttribute('style') || '').match(/width:\s*(\d+)px/);
var nameW = (nameCol.getAttribute('style') || '').match(/width:\s*(\d+)px/);
console.log('    disc col:', discCol.getAttribute('style'), '| name col:', nameCol.getAttribute('style') || '(flex/no width)');
ok(discW && discW[1] === '34', 'disc col still 34px');
ok(!!nameW, 'name col now has an EXPLICIT width (was flex/no width)');
var nameWidthPx = nameW ? parseInt(nameW[1], 10) : 0;
console.log('    -> name column width =', nameWidthPx + 'px');
ok(nameWidthPx >= 320, 'name col width >= 320px (~2x the old ~170-200px flex)');
// table min-width set so the wrapper can scroll
var apTable = ap.querySelector('table.pf-hl-table');
var minW = (apTable.getAttribute('style') || '').match(/min-width:\s*(\d+)px/);
ok(!!minW, 'pf-hl-table has an explicit min-width (' + (minW ? minW[1] + 'px' : 'none') + ') so the wrap scrolls');
// wrapper scrolls, not clips
var wrap = ap.querySelector('.pf-hl-wrap');
ok(cs(wrap).overflowX === 'auto', '.pf-hl-wrap overflow-x === auto (was overflow:hidden -> would clip)');
// name column still holds the sortable Project header + arrow after a click
var projTh = [...ap.querySelectorAll('table.pf-hl-table thead th.pf-hl-sortable')].find(t => /Project/.test(t.textContent));
ok(!!projTh && projTh.getAttribute('data-hl-sort') === '-1', 'Project header still sortable (data-hl-sort=-1)');
projTh.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
var projTh2 = [...ap.querySelectorAll('table.pf-hl-table thead th.pf-hl-sortable')].find(t => /Project/.test(t.textContent));
ok(projTh2 && /[▲▼]/.test(projTh2.textContent), 'Project header shows sort arrow after click (still works)');

// ---- pf-wide sticky Project column ----
console.log('\n[pf-wide feasibility_review: sticky Project column]');
var fr = document.querySelector('.precon-mount[data-bucket="feasibility_review"]');
var stickyTh = fr.querySelector('table.pf-wide thead th.pf-sticky-col');
ok(!!stickyTh, 'wide sticky Project header present');
if (stickyTh){
  var scStyle = cs(stickyTh);
  console.log('    sticky col: min-width=' + scStyle.minWidth + ' max-width=' + scStyle.maxWidth + ' position=' + scStyle.position);
  ok(parseInt(scStyle.minWidth, 10) >= 320, 'sticky Project min-width >= 320px (was none)');
  ok(parseInt(scStyle.maxWidth, 10) >= 480, 'sticky Project max-width >= 480px (~2x the old 240px)');
  ok(/sticky/.test(scStyle.position), 'sticky Project header still position:sticky');
}

// ---- Projects table Name column ----
console.log('\n[Projects table: Name column min-width]');
// The Projects module is not mounted here; verify the source markup carries the
// min-width on the Name th + td (grep-equivalent via the raw index.html).
var idxSrc = fs.readFileSync(INDEX, 'utf8');
ok(idxSrc.indexOf('cursor:pointer;min-width:280px" onclick="window._projectsSort(\\\'name\\\')">Name') !== -1,
   'Projects Name header has min-width:280px');
ok(idxSrc.indexOf('font-weight:500;min-width:280px">\' + esc(p.name)') !== -1,
   'Projects Name body cell has min-width:280px');

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
