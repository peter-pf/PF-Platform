#!/usr/bin/env node
/*
 * RUNTIME test (real render, jsdom) for Derek's two precon requests:
 *   1. Budget Pricing -> Actively Pricing move (new 'pricing' pipeline status):
 *      - budget_pricing renders a DnD "Actively Pricing" zone (data-act="pricing")
 *        + a per-row "Actively Pricing" button (pfResolveBid(...,'pricing',...)).
 *      - A budget-section bid with override status 'pricing' actually RELOCATES:
 *        it appears in the actively_bidding list and is GONE from budget_pricing,
 *        via the real renderMount relocation (pullRelocated('pricing') + the
 *        budget_pricing exclusion).
 *      - The API whitelist (functions/api/pipeline-state.js) accepts 'pricing'.
 *   2. Detail dropdown wrap: a detail value computes white-space:normal (not
 *      nowrap) with overflow-wrap/word-break, so a long Address wraps instead of
 *      colliding with the next field.
 *
 * Run: node docs/precon-budget-to-pricing/move-and-detail.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = process.env.PF_INDEX_OVERRIDE || path.join(ROOT, 'platform', 'index.html');
const PIPE  = path.join(ROOT, 'platform', 'data', 'precon-pipeline.js');
const API   = path.join(ROOT, 'platform', 'functions', 'api', 'pipeline-state.js');

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

// Inject a controlled budget-section bid (auto-bucketed in budget_pricing) with a
// LONG address so we can (a) relocate it and (b) test detail wrapping.
const LONG_ADDR = '12345 Very Long Street Address Boulevard Suite 400, Fort Wayne, Indiana 46801';
const BUDGET_BID = {
  number: 'BP-001', name: 'BudgetMove Test Project', city_state: 'Fort Wayne, IN',
  gc: 'Test GC LLC', value: '$250,000', due_date: '2026-06-01',
  fields: { 'Project Number': 'BP-001', 'Project Name': 'BudgetMove Test Project',
    'City / State': 'Fort Wayne, IN', 'Address': LONG_ADDR, 'Site Size (Acres)': '4.2',
    'Bid Total Value': '$250,000', 'Due Date': '2026-06-01', 'Total LF': '1200',
    'General Contractor': 'Test GC LLC' } };
PF_PRECON.ap.budget_pricing = [BUDGET_BID].concat(PF_PRECON.ap.budget_pricing || []);

const styleTags = styleBlocks.map(s => '<style>' + s + '</style>').join('\n');
const mounts = '<div class="precon-mount" data-disc="ap" data-bucket="actively_bidding"></div>'
             + '<div class="precon-mount" data-disc="ap" data-bucket="budget_pricing"></div>';
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
function mountFor(b){ return document.querySelector('.precon-mount[data-bucket="' + b + '"]'); }
function hlNames(mount){ return [...mount.querySelectorAll('table.pf-hl-table tbody tr.pf-hl-row .pf-hl-name')].map(n => n.textContent.trim()); }

console.log('\n=== Request 1: Budget Pricing -> Actively Pricing move ===\n');

// --- DnD zone + per-row button exist on budget_pricing ---
var bp = mountFor('budget_pricing');
ok(!!bp, 'budget_pricing mount rendered');
var pricingZone = bp.querySelector('.precon-dropzone[data-act="pricing"]');
ok(!!pricingZone, 'budget_pricing DnD bar has a move zone (data-act="pricing")');
// Request 3 rename: the zone/button read "Actively Bidding" (renamed tab), not "Pricing"
ok(pricingZone && /Actively Bidding/.test(pricingZone.textContent), 'the move zone is labeled "Actively Bidding" (renamed)');
var perRowPricingBtn = [...bp.querySelectorAll('.pf-hl-action button.pf-resolve-btn')].find(b => /Actively Bidding/.test(b.textContent) && /'pricing'/.test(b.getAttribute('onclick') || ''));
ok(!!perRowPricingBtn, 'budget_pricing rows have a per-row "Actively Bidding" button posting status pricing');
// the other buckets do NOT get the pricing zone
var ap = mountFor('actively_bidding');
ok(!ap.querySelector('.precon-dropzone[data-act="pricing"]'), 'actively_bidding does NOT get a pricing zone (only budget_pricing)');

// --- the move actually relocates (real render with an override) ---
console.log('\n[relocation: set override status "pricing" on the budget bid, re-render]');
// The override map is keyed by bidLogId(p) = 'num_bp-001' for a numbered bid.
var overrideKey = 'num_' + String(BUDGET_BID.number).toLowerCase();
window.PF_PIPELINE.overrides[overrideKey] = { status: 'pricing', resolvedAt: '2026-07-18T00:00:00Z', resolvedBy: 'test' };
// re-render (window.pfRerenderPrecon is the real re-render entry the app uses after a
// pipeline-state change; re-dispatching DOMContentLoaded does NOT re-run boot()).
window.pfRerenderPrecon();
var apNames = hlNames(mountFor('actively_bidding'));
var bpNames = hlNames(mountFor('budget_pricing'));
ok(apNames.some(n => /BudgetMove Test Project/.test(n)), 'the bid now APPEARS in Actively Pricing (actively_bidding) after status=pricing');
ok(!bpNames.some(n => /BudgetMove Test Project/.test(n)), 'the bid is GONE from Budget Pricing after status=pricing');

// --- API whitelist accepts pricing ---
console.log('\n[API whitelist]');
var apiSrc = fs.readFileSync(API, 'utf8');
ok(/VALID_STATUS\s*=\s*\{[^}]*\bpricing:\s*1\b/.test(apiSrc), 'pipeline-state.js VALID_STATUS includes pricing:1');
// pricing must NOT be a dead status
ok(!/DEAD_STATUS_REASON\s*=\s*\{[^}]*\bpricing\b/.test(apiSrc), 'pricing is NOT a dead status (stays a live item)');

console.log('\n=== Request 2: detail dropdown wraps long values ===\n');
// Expand the budget bid's detail (remove the override first so it renders in budget again)
delete window.PF_PIPELINE.overrides[overrideKey];
window.pfRerenderPrecon();
bp = mountFor('budget_pricing');
// find the row for our bid and open its detail
var row = [...bp.querySelectorAll('tr.pf-hl-row')].find(tr => /BudgetMove Test Project/.test(tr.textContent));
ok(!!row, 'found the budget bid row to expand');
if (row){
  row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  // the detail panel value cells
  var values = [...bp.querySelectorAll('.pf-hl-detail .pf-hl-value')];
  ok(values.length > 0, 'detail panel rendered with value cells (' + values.length + ')');
  var allNormal = values.every(v => cs(v).whiteSpace === 'normal');
  ok(allNormal, 'ALL detail values compute white-space:normal (not nowrap)');
  var allBreak = values.every(v => { var w = cs(v); return w.overflowWrap === 'break-word' || w.wordWrap === 'break-word' || w.wordBreak === 'break-word'; });
  ok(allBreak, 'detail values allow breaking long content (overflow-wrap/word-break)');
  // the field wrapper can shrink (min-width:0) so long content does not push the grid
  var fields = [...bp.querySelectorAll('.pf-hl-detail .pf-hl-field')];
  var allMinW0 = fields.every(f => cs(f).minWidth === '0px');
  ok(allMinW0, 'detail field wrappers have min-width:0 (so a long value cannot push into the next field)');
  // the long Address value is present and is in a normal-wrapping cell
  var addrVal = values.find(v => /Very Long Street Address/.test(v.textContent));
  ok(!!addrVal, 'the long Address value is present in the detail');
  ok(addrVal && cs(addrVal).whiteSpace === 'normal', 'the long Address value wraps (white-space:normal)');
}

console.log('\n=== Request 3: rename "Actively Pricing" -> "Actively Bidding" ===\n');
var rawSrc = fs.readFileSync(INDEX, 'utf8');
// nav tabs (both disciplines) keep the internal id but read "Actively Bidding"
ok(/data-module="precon-ap-actively-bidding"[^>]*>Actively Bidding<\/a>/.test(rawSrc), 'AP nav tab reads "Actively Bidding" (id precon-ap-actively-bidding unchanged)');
ok(/data-module="precon-hp-actively-bidding"[^>]*>Actively Bidding<\/a>/.test(rawSrc), 'HP nav tab reads "Actively Bidding"');
// title map + BUCKET_LABEL
ok(/'precon-ap-actively-bidding':\s*'Aggregate Piers - Actively Bidding'/.test(rawSrc), 'AP module title reads "... - Actively Bidding"');
ok(/actively_bidding:\s*'Actively Bidding'/.test(rawSrc), "BUCKET_LABEL actively_bidding -> 'Actively Bidding'");
// the rendered in-page heading (from BUCKET_LABEL) reads "Actively Bidding"
var apHead = mountFor('actively_bidding').querySelector('.pf-index-head h2');
ok(apHead && /Actively Bidding/.test(apHead.textContent), 'rendered actively_bidding <h2> heading reads "Actively Bidding"');
ok(apHead && !/Actively Pricing/.test(apHead.textContent), 'rendered heading no longer says "Actively Pricing"');
// internal identifiers unchanged
ok(rawSrc.indexOf("data-module=\"precon-ap-actively-bidding\"") !== -1, 'internal module id precon-ap-actively-bidding still present (unchanged)');
ok(/VALID/.test(fs.readFileSync(API, 'utf8')) && fs.readFileSync(API,'utf8').indexOf('pricing: 1') !== -1, 'pipeline-state status value pricing unchanged (internal)');

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
