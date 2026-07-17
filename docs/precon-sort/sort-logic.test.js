#!/usr/bin/env node
/*
 * Self-check for the precon column-header SORT LOGIC (index.html).
 *
 * The live page is auth-gated and cannot be headless-rendered easily, so this
 * test re-implements the EXACT comparator + value-extraction rules used by
 * applyHlSort() / hlSortValue() / hlColSortKind() in index.html and asserts that
 * ascending AND descending ordering is correct for each column data type (text,
 * money, date), including that blank / unparseable values always sort to the
 * BOTTOM regardless of direction. It also proves the Resolution/garbin columns
 * are classified as non-sortable.
 *
 * These functions are copied verbatim (behaviour-identical) from index.html.
 * Run: node docs/precon-sort/sort-logic.test.js
 */

'use strict';

// ---- mirrors of the index.html helpers (behaviour-identical) ----------------

function calParseYMD(raw){
  if (raw == null) return null;
  var s = String(raw).trim();
  if (!s) return null;
  var m;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    var iy = +m[1], iMo = +m[2], id = +m[3];
    if (iMo < 1 || iMo > 12 || id < 1 || id > 31) return null;
    return { y: iy, m: iMo - 1, d: id };
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var mo = +m[1], dd = +m[2], yy = +m[3];
    if (yy < 100) yy += 2000;
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
    return { y: yy, m: mo - 1, d: dd };
  }
  return null;
}

// effective helpers -- in the test, rows carry the already-effective values
// (override-or-feed) under p.fields, matching what effBidValue/effDate return.
function effBidValue(p){
  var f = (p && p.fields) || {};
  var v = f['Bid Total Value'];
  return (v == null) ? '' : String(v);
}
function bidPriceRaw(p){
  var f = (p && p.fields) || {};
  var v = f['__bidPrice'];
  return (v == null || v === '') ? '' : String(v);
}
function effDate(p, field){
  var f = (p && p.fields) || {};
  // map the effdate field back to the feed key it displays
  var key = { designCompletedDate: 'Design Completed Date', dueDate: 'Due Date',
              projStart: 'Projected Start Date', dateSubmitted: 'Date Submitted',
              awardDate: '__awardDate' }[field] || field;
  var v = f[key];
  return (v == null) ? '' : String(v);
}
function pfMasterFor(p){ return (p && p.master) || null; }
function pfAwardedGcFor(p){
  var f = (p && p.fields) || {};
  return (p && p.gc) || f['General Contractor'] || '';
}

function hlColSortKind(h){
  if (!h) return null;
  switch (h.type) {
    case 'garbin':   return null;
    case 'money':
    case 'effmoney':
    case 'bidprice':
    case 'num':
    case 'diam':
      return 'money';
    case 'date':
    case 'effdate':
      return 'date';
    case 'gc':
    case 'awgc':
    case 'gclist':
    case 'text':
    default:
      return 'text';
  }
}

function hlSortValue(disc, p, h){
  var kind = hlColSortKind(h);
  var f = (p && p.fields) || {};
  if (kind === 'money') {
    var raw;
    if (h.type === 'effmoney')      raw = effBidValue(p);
    else if (h.type === 'bidprice') raw = bidPriceRaw(p);
    else if (h.type === 'diam')     { var m = pfMasterFor(p); raw = (m && m.diameter) ? m.diameter : ''; }
    else                            raw = f[h.key];
    if (raw == null || String(raw).trim() === '') return null;
    var n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  if (kind === 'date') {
    var draw;
    if (h.type === 'effdate' && h.field) draw = effDate(p, h.field);
    else                                 draw = f[h.key];
    var ymd = calParseYMD(draw);
    if (!ymd) return null;
    return Date.UTC(ymd.y, ymd.m, ymd.d);
  }
  var t;
  if (h.type === 'awgc' || h.type === 'gclist') {
    t = pfAwardedGcFor(p);
  } else {
    t = f[h.key];
  }
  return String(t == null ? '' : t).trim().toLowerCase();
}

function hlNameSortValue(p){
  var f = (p && p.fields) || {};
  return String((p && p.name) || f['Project Name'] || '').trim().toLowerCase();
}

// applyHlSort with mount replaced by a plain {idx, dir} state object.
function applyHlSort(state, list, highlights){
  if (state == null || state.idx == null || state.idx === '') return list;
  var idx = parseInt(state.idx, 10);
  if (isNaN(idx)) return list;
  var dir = (state.dir === 'desc') ? 'desc' : 'asc';
  var sign = (dir === 'asc') ? 1 : -1;

  var kind, getVal;
  if (idx < 0) {
    kind = 'text';
    getVal = function(p){ return hlNameSortValue(p); };
  } else {
    var h = highlights[idx];
    if (!h) return list;
    kind = hlColSortKind(h);
    if (kind == null) return list;
    getVal = function(p){ return hlSortValue('ap', p, h); };
  }

  var decorated = list.map(function(p, i){ return { p: p, v: getVal(p), i: i }; });
  decorated.sort(function(a, b){
    var av = a.v, bv = b.v;
    if (kind === 'text') {
      var ae = (av === '' || av == null), be = (bv === '' || bv == null);
      if (ae && be) return a.i - b.i;
      if (ae) return 1;
      if (be) return -1;
      var c = String(av).localeCompare(String(bv));
      if (c !== 0) return sign * c;
      return a.i - b.i;
    }
    if (av == null && bv == null) return a.i - b.i;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return sign * -1;
    if (av > bv) return sign * 1;
    return a.i - b.i;
  });
  return decorated.map(function(d){ return d.p; });
}

// ---- tiny assert harness ----------------------------------------------------
var pass = 0, fail = 0;
function eq(actual, expected, msg){
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         expected ' + e + '\n         got      ' + a); }
}
function names(list){ return list.map(function(p){ return p.name; }); }

// ---- sample rows ------------------------------------------------------------
// Each row carries a distinct name + a value for each tested column, including a
// BLANK/UNPARSEABLE case per type (the "blank" row).
var rows = [
  { name: 'Bravo',  gc: 'Kokosing',   fields: { 'Project Name': 'Bravo',  'General Contractor': 'Kokosing',   'Bid Total Value': '$460,000',  'Total LF': '1200', 'Due Date': '2026-06-24', 'Date Submitted': '05/01/2024' } },
  { name: 'alpha',  gc: 'ARCO',       fields: { 'Project Name': 'alpha',  'General Contractor': 'ARCO',       'Bid Total Value': '1250000',   'Total LF': '300',  'Due Date': '2026-01-15', 'Date Submitted': '12/31/2025' } },
  { name: 'Delta',  gc: 'Weigand',    fields: { 'Project Name': 'Delta',  'General Contractor': 'Weigand',    'Bid Total Value': '$75,000.50','Total LF': '5000', 'Due Date': '6/1/2026',   'Date Submitted': '2025-06-15' } },
  { name: 'charlie',gc: 'Turner',     fields: { 'Project Name': 'charlie','General Contractor': 'Turner',     'Bid Total Value': '',          'Total LF': '',     'Due Date': '',           'Date Submitted': 'not-a-date' } }, // BLANK / unparseable
];

// column defs mirroring index.html highlight shapes
var COL = {
  money:   { key: 'Bid Total Value', type: 'effmoney' },   // idx used as 0
  num:     { key: 'Total LF',        type: 'num' },         // idx 1
  date:    { key: 'Due Date',        type: 'date' },        // idx 2
  effdate: { key: 'Date Submitted',  type: 'effdate', field: 'dateSubmitted' }, // idx 3
  gc:      { key: 'General Contractor', type: 'awgc' },     // idx 4
  garbin:  { key: '__sentToGarbin',  type: 'garbin' },      // idx 5 (non-sortable)
};
var highlights = [COL.money, COL.num, COL.date, COL.effdate, COL.gc, COL.garbin];

console.log('\n=== precon column-sort logic self-check ===\n');

// ---- 1) classification ------------------------------------------------------
console.log('[classification]');
eq(hlColSortKind(COL.money),   'money', 'effmoney -> money');
eq(hlColSortKind(COL.num),     'money', 'num -> money');
eq(hlColSortKind(COL.date),    'date',  'date -> date');
eq(hlColSortKind(COL.effdate), 'date',  'effdate -> date');
eq(hlColSortKind(COL.gc),      'text',  'awgc -> text');
eq(hlColSortKind(COL.garbin),   null,   'garbin -> non-sortable (null)');

// ---- 2) TEXT: Project name (idx -1) ----------------------------------------
console.log('\n[text: Project name, idx -1]');
// case-insensitive: alpha, Bravo, charlie, Delta
eq(names(applyHlSort({idx:-1, dir:'asc'},  rows, highlights)), ['alpha','Bravo','charlie','Delta'], 'name ASC A->Z (case-insensitive)');
eq(names(applyHlSort({idx:-1, dir:'desc'}, rows, highlights)), ['Delta','charlie','Bravo','alpha'], 'name DESC Z->A');

// ---- 3) TEXT: GC column (idx 4) --------------------------------------------
console.log('\n[text: GC, idx 4]');
// GCs: ARCO, Kokosing, Turner, Weigand
eq(names(applyHlSort({idx:4, dir:'asc'},  rows, highlights)), ['alpha','Bravo','charlie','Delta'], 'GC ASC A->Z');
eq(names(applyHlSort({idx:4, dir:'desc'}, rows, highlights)), ['Delta','charlie','Bravo','alpha'], 'GC DESC Z->A');

// ---- 4) MONEY: Bid Total (idx 0) -------------------------------------------
console.log('\n[money: Bid Total, idx 0]');
// values: Bravo 460000, alpha 1250000, Delta 75000.5, charlie BLANK(bottom)
// desc = large->small (Brad's FIRST click): 1.25M, 460k, 75k, [blank last]
eq(names(applyHlSort({idx:0, dir:'desc'}, rows, highlights)), ['alpha','Bravo','Delta','charlie'], 'money DESC large->small, blank LAST');
// asc = small->large (second click): 75k, 460k, 1.25M, [blank last]
eq(names(applyHlSort({idx:0, dir:'asc'},  rows, highlights)), ['Delta','Bravo','alpha','charlie'], 'money ASC small->large, blank LAST');

// ---- 5) NUMERIC: Total LF (idx 1) ------------------------------------------
console.log('\n[numeric: Total LF, idx 1]');
// LF: Bravo 1200, alpha 300, Delta 5000, charlie BLANK
eq(names(applyHlSort({idx:1, dir:'desc'}, rows, highlights)), ['Delta','Bravo','alpha','charlie'], 'LF DESC large->small, blank LAST');
eq(names(applyHlSort({idx:1, dir:'asc'},  rows, highlights)), ['alpha','Bravo','Delta','charlie'], 'LF ASC small->large, blank LAST');

// ---- 6) DATE: Due Date (idx 2) ---------------------------------------------
console.log('\n[date: Due Date, idx 2]');
// dates: Bravo 2026-06-24, alpha 2026-01-15, Delta 2026-06-01, charlie BLANK
// desc = newest->oldest (Brad's FIRST click): 6/24, 6/1, 1/15, [blank last]
eq(names(applyHlSort({idx:2, dir:'desc'}, rows, highlights)), ['Bravo','Delta','alpha','charlie'], 'date DESC newest->oldest, blank LAST');
// asc = oldest->newest (second click): 1/15, 6/1, 6/24, [blank last]
eq(names(applyHlSort({idx:2, dir:'asc'},  rows, highlights)), ['alpha','Delta','Bravo','charlie'], 'date ASC oldest->newest, blank LAST');

// ---- 7) EFFDATE: Date Submitted (idx 3), unparseable-to-bottom -------------
console.log('\n[effdate: Date Submitted, idx 3]');
// submitted: Bravo 05/01/2024, alpha 12/31/2025, Delta 2025-06-15, charlie 'not-a-date'(BLOTTOM)
eq(names(applyHlSort({idx:3, dir:'desc'}, rows, highlights)), ['alpha','Delta','Bravo','charlie'], 'submitted DESC newest->oldest, unparseable LAST');
eq(names(applyHlSort({idx:3, dir:'asc'},  rows, highlights)), ['Bravo','Delta','alpha','charlie'], 'submitted ASC oldest->newest, unparseable LAST');

// ---- 8) non-sortable + no-state passthrough --------------------------------
console.log('\n[guards]');
eq(names(applyHlSort({idx:5, dir:'asc'}, rows, highlights)), ['Bravo','alpha','Delta','charlie'], 'garbin column (non-sortable) returns list unchanged');
eq(names(applyHlSort(null, rows, highlights)),               ['Bravo','alpha','Delta','charlie'], 'no sort state returns default order unchanged');
eq(names(applyHlSort({idx:99, dir:'asc'}, rows, highlights)),['Bravo','alpha','Delta','charlie'], 'stale/out-of-range index returns list unchanged');

// ---- 9) stability: equal values keep incoming order ------------------------
console.log('\n[stability]');
var tie = [
  { name: 'x1', gc: 'Same', fields: { 'General Contractor': 'Same' } },
  { name: 'x2', gc: 'Same', fields: { 'General Contractor': 'Same' } },
  { name: 'x3', gc: 'Same', fields: { 'General Contractor': 'Same' } },
];
eq(names(applyHlSort({idx:4, dir:'asc'},  tie, highlights)), ['x1','x2','x3'], 'equal GC keeps incoming order (stable) ASC');
eq(names(applyHlSort({idx:4, dir:'desc'}, tie, highlights)), ['x1','x2','x3'], 'equal GC keeps incoming order (stable) DESC');

// ---- summary ----------------------------------------------------------------
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail === 0 ? 0 : 1);
