#!/usr/bin/env node
/*
 * RUNTIME sort test for the precon column-header sorting (index.html).
 *
 * Unlike sort-logic.test.js (which tested the comparators in ISOLATION and MISSED
 * a real bug), this harness exercises the ACTUAL click -> renderMount -> applyHlSort
 * render path in a real DOM (jsdom), with REAL columns + REAL sample rows loaded
 * from data/precon-pipeline.js. It:
 *   1. Injects the real precon IIFE from index.html into a jsdom window.
 *   2. Renders a bucket (submitted_bids) into a mount.
 *   3. Dispatches a real click on a NON-Project sortable header.
 *   4. Asserts the rendered row order ACTUALLY changes and is correct asc + desc.
 *   5. Confirms Project still sorts and Resolution stays inert.
 * Also covers the wide feasibility_review table.
 *
 * Run: node docs/precon-sort/runtime-sort.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
// PF_INDEX_OVERRIDE lets us point the harness at a scratch copy of index.html to
// PROVE the before(fail)/after(pass) of a fix (e.g. a copy with the bug re-introduced).
const INDEX = process.env.PF_INDEX_OVERRIDE || path.join(ROOT, 'platform', 'index.html');
const PIPE  = path.join(ROOT, 'platform', 'data', 'precon-pipeline.js');
const MASTER= path.join(ROOT, 'platform', 'data', 'project-master.js');

// ---- extract the precon IIFE (the <script> block with renderMount) ----------
function extractPreconIIFE(){
  const html = fs.readFileSync(INDEX, 'utf8');
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const blk = blocks.find(b => b.includes('function renderMount') && b.includes('renderHighlightTable'));
  if (!blk) throw new Error('precon IIFE block not found in index.html');
  return blk;
}
// load a `window.X = {...};` data file and return the object
function loadDataObject(file){
  const txt = fs.readFileSync(file, 'utf8');
  const eq = txt.indexOf('=');
  let body = txt.slice(eq + 1).trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  return JSON.parse(body);
}

const PF_PRECON = loadDataObject(PIPE);
let PF_PROJECT_MASTER = null;
try { PF_PROJECT_MASTER = loadDataObject(MASTER); } catch (e) { PF_PROJECT_MASTER = { projects: [] }; }
const iife = extractPreconIIFE();

// feasibility_review is the ONLY bucket that renders the WIDE table, but the live
// feed currently has 0 feasibility_review rows -> it renders the empty state and no
// table. Inject a few REAL-shaped rows so the wide render path is actually exercised.
// (Real p.fields shape: mirrors data/precon-pipeline.js rows.)
function mkRow(name, number, city, btv, due){
  return { number: number, name: name, city_state: city, gc: 'Test GC', value: btv,
    due_date: due, invite_date: '', completed: false, record: '',
    fields: { 'Project Number': number, 'Project Name': name, 'City / State': city,
      'Bid Total Value': btv, 'Due Date': due, 'Total LF': '1000', 'General Contractor': 'Test GC' } };
}
// Number order (F-001..F-004) is DELIBERATELY different from money order so the
// "order changed after sorting" assertion is a real discriminator:
//   default sortByNumber -> alpha, Bravo, charlie, Delta
//   money DESC           -> Delta(1.25M), alpha(460k), charlie(300k), Bravo(75k)
PF_PRECON.ap.feasibility_review = [
  mkRow('alpha Feasibility',   'F-001', 'Akron, OH',      '$460,000',   '2026-06-24'),
  mkRow('Bravo Feasibility',   'F-002', 'Fort Wayne, IN', '$75,000',    '2026-01-15'),
  mkRow('charlie Feasibility', 'F-003', 'Kokomo, IN',     '$300,000',   '2026-03-10'),
  mkRow('Delta Feasibility',   'F-004', 'Muncie, IN',     '$1,250,000', '2026-06-01'),
];

// ---- build the mounts markup (one per bucket we test) -----------------------
const mountsHtml = `
  <div class="pf-index-root precon-mount" data-disc="ap" data-bucket="submitted_bids"></div>
  <div class="pf-index-root precon-mount" data-disc="ap" data-bucket="feasibility_review"></div>
`;

const dom = new JSDOM(`<!DOCTYPE html><html><body>${mountsHtml}</body></html>`, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// ---- globals the IIFE reads (privileged role so actionCol renders) ----------
window.esc = function(v){
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};
window.PF_PRECON = PF_PRECON;
window.PF_PROJECT_MASTER = PF_PROJECT_MASTER;
window.PF_ME = { role: 'partner' };            // canResolve() -> true (actionCol shows)
window.PF_PIPELINE = { overrides: {} };
window.PF_GARBIN = {};
window.PF_BIDMETA = {};
window.PF_MANUAL_BIDS = [];
window.PF_PM = {};
window.pfPmRecordFor = function(){ return null; };
window.pfAwardedGcFor = undefined;              // let the IIFE define its own
// no-op stubs for handlers referenced in inline onclicks (never fired in test)
['pfResolveBid','pfToggleGarbin','pfToggleHot','pfBidPriceSave','pfDateEditOpen',
 'pfDateEditSave','pfGcAddRow','pfGcRemoveRow','pfGcSave','pfGcSetAwarded','pfDocAddRow',
 'pfDocRemoveRow','pfDocSave','pfManualBidFormToggle','pfManualBidRemove','pfManualBidSubmit',
 'pfSetBidPrice','pfAutoCreatePmOnAward','pfRerenderPrecon'].forEach(function(n){
  if (typeof window[n] !== 'function') window[n] = function(){};
});

// ---- inject + run the real IIFE ---------------------------------------------
// The IIFE self-boots (boot() on DOMContentLoaded / readyState!=='loading') and
// renders all .precon-mount nodes. We eval it in the window context.
const runner = new window.Function(iife + '\n//# sourceURL=precon-iife.js');
runner.call(window);
// jsdom outside-only has readyState 'loading', so the IIFE registered boot() on
// DOMContentLoaded. Fire it to trigger the initial render of every mount.
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

// ---- helpers to read rendered state -----------------------------------------
function mountFor(bucket){
  return document.querySelector('.precon-mount[data-bucket="' + bucket + '"]');
}
// The rendered row order = the project NAME text of each data row, top to bottom.
function hlRowNames(mount){
  return [...mount.querySelectorAll('table.pf-hl-table tbody tr.pf-hl-row')].map(function(tr){
    var nm = tr.querySelector('.pf-hl-name');
    return nm ? nm.textContent.trim() : '';
  });
}
function wideRowNames(mount){
  return [...mount.querySelectorAll('table.pf-wide tbody tr')].map(function(tr){
    var td = tr.querySelector('td.pf-sticky-col');
    return td ? (td.querySelector('div') ? td.querySelector('div').textContent.trim() : td.textContent.trim()) : '';
  });
}
function clickHeaderByText(mount, tableSel, sortAttr, label){
  var ths = [...mount.querySelectorAll(tableSel + ' thead th[' + sortAttr + ']')];
  var th = ths.find(function(t){ return t.textContent.replace(/[▲▼\s]+$/,'').trim() === label; });
  if (!th) throw new Error('header not found: ' + label + ' (have: ' + ths.map(function(t){return JSON.stringify(t.textContent);}).join(', ') + ')');
  th.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return th;
}
function headerHasArrow(mount, tableSel, sortAttr, label){
  var ths = [...mount.querySelectorAll(tableSel + ' thead th[' + sortAttr + ']')];
  var th = ths.find(function(t){ return t.textContent.replace(/[▲▼\s]+$/,'').trim() === label; });
  return th ? /[▲▼]/.test(th.textContent) : false;
}

// numeric parse for asserting monotonicity from displayed money cells
function parseMoney(s){ var n = parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isFinite(n) ? n : null; }

// ---- assert harness ---------------------------------------------------------
var pass = 0, fail = 0;
function ok(cond, msg){ if (cond){ pass++; console.log('  PASS ' + msg);} else { fail++; console.log('  FAIL ' + msg);} }
function isSorted(arr, dir){ // dir 'desc' large->small ignoring nulls-at-end
  var vals = arr.filter(function(v){ return v != null; });
  for (var i = 1; i < vals.length; i++){
    if (dir === 'desc' && vals[i] > vals[i-1]) return false;
    if (dir === 'asc'  && vals[i] < vals[i-1]) return false;
  }
  return true;
}

console.log('\n=== RUNTIME precon sort test (real click -> render path) ===\n');

// ---------- BUCKET: submitted_bids ----------
var sb = mountFor('submitted_bids');
ok(!!sb, 'submitted_bids mount rendered');
var hlTable = sb.querySelector('table.pf-hl-table');
ok(!!hlTable, 'submitted_bids highlight table present');

var namesDefault = hlRowNames(sb);
ok(namesDefault.length > 3, 'submitted_bids has rows (' + namesDefault.length + ')');

// find the money column index by header text 'Bid Total'
function moneyCells(mount){
  // Bid Total is the FIRST num cell in each row for submitted_bids
  return [...mount.querySelectorAll('table.pf-hl-table tbody tr.pf-hl-row')].map(function(tr){
    var td = tr.querySelector('td.num');
    return td ? parseMoney(td.textContent) : null;
  });
}

console.log('\n[submitted_bids: click NON-Project header "Bid Total" (money)]');
var moneyBefore = moneyCells(sb);
clickHeaderByText(sb, 'table.pf-hl-table', 'data-hl-sort', 'Bid Total'); // 1st click -> desc (large->small)
var namesAfterMoneyDesc = hlRowNames(sb);
var moneyDesc = moneyCells(sb);
ok(JSON.stringify(namesAfterMoneyDesc) !== JSON.stringify(namesDefault),
   'row order CHANGED after clicking Bid Total (this is the bug under test)');
ok(isSorted(moneyDesc, 'desc'), 'Bid Total 1st click = money DESC large->small');
ok(headerHasArrow(sb, 'table.pf-hl-table', 'data-hl-sort', 'Bid Total'), 'Bid Total header shows an arrow when active');

clickHeaderByText(sb, 'table.pf-hl-table', 'data-hl-sort', 'Bid Total'); // 2nd click -> asc
var moneyAsc = moneyCells(sb);
ok(isSorted(moneyAsc, 'asc'), 'Bid Total 2nd click = money ASC small->large (toggle)');

console.log('\n[submitted_bids: click "Submitted" (date)]');
clickHeaderByText(sb, 'table.pf-hl-table', 'data-hl-sort', 'Submitted'); // date -> desc newest first
var namesDate = hlRowNames(sb);
ok(JSON.stringify(namesDate) !== JSON.stringify(namesAfterMoneyDesc), 'Submitted date click reorders rows');

console.log('\n[submitted_bids: Project (idx -1) still sorts]');
clickHeaderByText(sb, 'table.pf-hl-table', 'data-hl-sort', 'Project');
// Compare the RENDERED order to a locale-sorted copy of the SAME rendered strings
// (robust vs inline name tags like the Hot flame; the project name is the leading
// text so localeCompare on the whole cell reflects the intended A->Z order).
var namesProj = hlRowNames(sb);
var projSorted = namesProj.slice().sort(function(a,b){ return a.toLowerCase().localeCompare(b.toLowerCase()); });
ok(JSON.stringify(namesProj) === JSON.stringify(projSorted), 'Project 1st click = name A->Z (real render order matches sorted)');

console.log('\n[submitted_bids: Resolution header is NOT sortable]');
var resTh = [...sb.querySelectorAll('table.pf-hl-table thead th')].find(function(t){ return /Resolution/.test(t.textContent); });
ok(!!resTh, 'Resolution header present');
ok(resTh && !resTh.hasAttribute('data-hl-sort') && !resTh.classList.contains('pf-hl-sortable'),
   'Resolution header has no data-hl-sort / not pf-hl-sortable');

// ---------- WIDE: feasibility_review ----------
console.log('\n[feasibility_review WIDE: click "Bid Total Value" (money)]');
var fr = mountFor('feasibility_review');
ok(!!fr, 'feasibility_review mount rendered');
var wide = fr.querySelector('table.pf-wide');
ok(!!wide, 'feasibility_review wide table present');
if (wide){
  var wNamesDefault = wideRowNames(fr);
  // find Bid Total Value column position among data headers
  var dataThs = [...fr.querySelectorAll('table.pf-wide thead th[data-wide-sort]')];
  var btvIdx = dataThs.findIndex(function(t){ return t.textContent.replace(/[▲▼\s]+$/,'').trim() === 'Bid Total Value'; });
  ok(btvIdx >= 0, 'Bid Total Value header is sortable (present with data-wide-sort)');
  function wideMoneyCells(){
    var colPos = [...fr.querySelectorAll('table.pf-wide thead th')].findIndex(function(t){ return t.textContent.replace(/[▲▼\s]+$/,'').trim() === 'Bid Total Value'; });
    return [...fr.querySelectorAll('table.pf-wide tbody tr')].map(function(tr){
      var tds = tr.querySelectorAll('td');
      return tds[colPos] ? parseMoney(tds[colPos].textContent) : null;
    });
  }
  clickHeaderByText(fr, 'table.pf-wide', 'data-wide-sort', 'Bid Total Value'); // desc
  var wNamesAfter = wideRowNames(fr);
  ok(JSON.stringify(wNamesAfter) !== JSON.stringify(wNamesDefault), 'wide row order CHANGED after clicking Bid Total Value');
  // money DESC of injected rows: Delta(1.25M), alpha(460k), charlie(300k), Bravo(75k)
  ok(JSON.stringify(wNamesAfter.map(function(s){return s.split(' ')[0];})) === JSON.stringify(['Delta','alpha','charlie','Bravo']),
     'wide Bid Total Value DESC gives Delta,alpha,charlie,Bravo (exact order)');
  ok(isSorted(wideMoneyCells(), 'desc'), 'wide Bid Total Value 1st click = money DESC');
  clickHeaderByText(fr, 'table.pf-wide', 'data-wide-sort', 'Bid Total Value'); // asc
  ok(isSorted(wideMoneyCells(), 'asc'), 'wide Bid Total Value 2nd click = money ASC (toggle)');
  var wAscNames = wideRowNames(fr).map(function(s){return s.split(' ')[0];});
  ok(JSON.stringify(wAscNames) === JSON.stringify(['Bravo','charlie','alpha','Delta']),
     'wide Bid Total Value ASC gives Bravo,charlie,alpha,Delta (toggle, exact order)');

  var wResTh = [...fr.querySelectorAll('table.pf-wide thead th')].find(function(t){ return /Activity|Resolution|Record/.test(t.textContent); });
  ok(wResTh && !wResTh.hasAttribute('data-wide-sort'), 'wide control column (Activity/Resolution/Record) not sortable');
}

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
