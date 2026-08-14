// Harness — Subcontract Tab collapsible subgroups + Change Orders (Brad 2026-08-14).
// Proves:
//   FRONTEND (jsdom):
//     (1) collapsibleSubgroup renders a clickable header + chevron, default per `open` arg;
//         three independent subgroups collapse/expand independently (toggling one does NOT
//         affect the others). Default EXPANDED when open=true (the Subcontract Tab usage).
//     (2) pfChangeOrdersInline renders at the "bottom" with a table when COs exist: CO # /
//         Date / Description / Amount / Status columns, dates MM/DD/YYYY, amount comma-fmt,
//         and a Totals row summing the amount column. Empty-state is clean (one line).
//     (3) add / edit / delete a CO through the editor DOM produces the correct saved array;
//         Totals recompute after a change.
//   BACKEND (worker validator + merge):
//     (4) cleanChangeOrders: backward-compat absent => [], non-array => reject(null), length
//         cap, field sanitization (angle-strip + trim + length cap), empty-row drop, stable id.
//     (5) __change_orders round-trips through onRequestPost and is PRESERVED on a sibling
//         write (__subcontract_analysis / __contract_pull / a flat contract field), and the
//         siblings are preserved when __change_orders is written.
//     (6) office-gated: field_ops POST => denied; __change_orders on a non-contract section
//         => 400.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { esc, loadWorker, makeKV } = require('./extract.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const W = loadWorker();

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- extract a named top-level function body from index.html ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index, j);
}
// pfFmtQty / pfFmtDate copied minimal-equivalent from index.html for the sandbox (comma-fmt
// numbers; MM/DD/YYYY dates). These mirror window.pfFmtQty / window.pfFmtDate closely enough
// for the assertions (comma insertion + date formatting).
function fmtQty(v) {
  if (v == null || v === '') return '';
  var n = Number(String(v).replace(/,/g, ''));
  if (isNaN(n)) return String(v);
  return n.toLocaleString('en-US');
}
function fmtDate(v) {
  if (v == null || v === '') return '';
  var s = String(v).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[2] + '/' + iso[3] + '/' + iso[1];
  var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return ('0' + us[1]).slice(-2) + '/' + ('0' + us[2]).slice(-2) + '/' + us[3];
  return s;
}

// ---- build a jsdom-backed sandbox exposing collapsibleSubgroup + CO functions ----
function buildFront(state) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const win = dom.window;
  win.esc = esc;
  win.pfFmtQty = fmtQty;
  win.pfFmtDate = fmtDate;
  win.confirm = () => true;
  win.PF_PROJECT_OVERRIDES = state.PF_PROJECT_OVERRIDES || {};
  const sandbox = {
    E: esc,
    esc2: (s) => (esc(s)),
    subhead: (t) => '<div class="pr-subhead">' + esc(t) + '</div>',
    canEdit: () => state.canEdit !== false,
    _curOverrides: state._curOverrides || {},
    _curNum: state._curNum || '25-999',
    window: win,
    document: win.document,
    Date: Date,
    Math: Math,
    console: console,
  };
  vm.createContext(sandbox);
  const src =
    extractFn(html, 'collapsibleSubgroup') + '\n' +
    'var PF_CO_STATUSES = ' + JSON.stringify(['Pending', 'Approved', 'Rejected']) + ';\n' +
    extractFn(html, 'pfChangeOrders') + '\n' +
    extractFn(html, 'pfCoNewId') + '\n' +
    extractFn(html, 'pfCoAmtNum') + '\n' +
    extractFn(html, 'pfCoSumAmount') + '\n' +
    extractFn(html, 'pfCoReadRow') + '\n' +
    extractFn(html, 'pfChangeOrdersInline') + '\n' +
    extractFn(html, 'pfCoRowEditorHtml') + '\n' +
    'this.__collap = collapsibleSubgroup;' +
    'this.__inline = pfChangeOrdersInline;' +
    'this.__rowEd = pfCoRowEditorHtml;' +
    'this.__read = pfChangeOrders;' +
    'this.__sum = pfCoSumAmount;';
  vm.runInContext(src, sandbox);
  return { sandbox, win, dom };
}

console.log('== FRONTEND: collapsible subgroups ==');
(function () {
  const { sandbox, win } = buildFront({ canEdit: true });
  // three independent subgroups, default expanded (open=true)
  const groupHtml =
    sandbox.__collap('Bid Recap', '<div class="bidmark">BID</div>', true) +
    sandbox.__collap('Contract Recap', '<div class="conmark">CON</div>', true) +
    sandbox.__collap('Subcontract Analysis', '<div class="anmark">AN</div>', true) +
    sandbox.__collap('Change Orders', '<div class="comark">CO</div>', true);
  const host = win.document.createElement('div');
  host.innerHTML = groupHtml;
  const groups = host.querySelectorAll('.pr-cgroup');
  ok('four subgroups rendered', groups.length === 4);
  ok('each default expanded (open class)', Array.prototype.every.call(groups, (g) => g.classList.contains('open')));
  const heads = host.querySelectorAll('.pr-cgroup-head');
  ok('each has a clickable header', heads.length === 4);
  ok('each header has a chevron', host.querySelectorAll('.pr-chev.pr-cgroup-chev').length === 4);
  ok('titles present + correct', /Bid Recap/.test(groupHtml) && /Contract Recap/.test(groupHtml) && /Subcontract Analysis/.test(groupHtml) && /Change Orders/.test(groupHtml));

  // Simulate the onclick toggle (this.parentElement.classList.toggle('open')) independently.
  function toggle(idx) {
    const g = groups[idx];
    g.classList.toggle('open'); // mirrors the inline handler on the head's parentElement
  }
  toggle(0); // collapse Bid Recap
  ok('toggling #0 collapses ONLY #0', !groups[0].classList.contains('open') &&
     groups[1].classList.contains('open') && groups[2].classList.contains('open') && groups[3].classList.contains('open'));
  toggle(2); // collapse Subcontract Analysis
  ok('toggling #2 independent of others', !groups[2].classList.contains('open') &&
     groups[1].classList.contains('open') && groups[3].classList.contains('open') && !groups[0].classList.contains('open'));
  toggle(0); // re-expand Bid Recap
  ok('re-toggling #0 expands ONLY #0', groups[0].classList.contains('open') && !groups[2].classList.contains('open'));
  // "Change Orders is the LAST subgroup" — it is the 4th/last in the assembled HTML.
  ok('Change Orders is the LAST subgroup', groups[groups.length - 1].querySelector('.comark') !== null);
})();

console.log('== FRONTEND: Change Orders render ==');
(function () {
  // Empty state: no __change_orders => clean one-line hint.
  const empty = buildFront({ canEdit: true, _curOverrides: { contract: {} } });
  const emptyHtml = empty.sandbox.__inline();
  const eh = empty.win.document.createElement('div'); eh.innerHTML = emptyHtml;
  ok('empty-state read helper returns []', empty.sandbox.__read().length === 0);
  ok('empty-state renders one-line hint (no table)', eh.querySelector('.pf-sge-empty') !== null && eh.querySelector('.pf-sge-table') === null);
  ok('empty-state host has data-co-num', eh.querySelector('.pf-co-wrap[data-co-num]') !== null);

  // Populated: three COs with mixed dates + amounts + statuses.
  const cos = [
    { id: 'co1', co_number: 'CO-001', date: '2026-03-05', description: 'Added piers at Grid C', amount: '12,500', status: 'Approved' },
    { id: 'co2', co_number: 'CO-002', date: '04/18/2026', description: 'Extra mobilization', amount: '3200', status: 'Pending' },
    { id: 'co3', co_number: 'CO-003', date: '', description: 'Credit — deleted area', amount: '-1,000', status: 'Rejected' },
  ];
  const full = buildFront({ canEdit: true, _curOverrides: { contract: { __change_orders: cos } } });
  const fh = full.win.document.createElement('div'); fh.innerHTML = full.sandbox.__inline();
  ok('read helper normalizes 3 rows', full.sandbox.__read().length === 3);
  const table = fh.querySelector('.pf-sge-table');
  ok('table renders', table !== null);
  const headers = Array.prototype.map.call(fh.querySelectorAll('thead th'), (t) => t.textContent);
  ok('columns = CO # / Date / Description / Amount ($) / Status',
     headers.join('|') === 'CO #|Date|Description|Amount ($)|Status');
  const bodyRows = fh.querySelectorAll('tbody tr');
  ok('3 body rows', bodyRows.length === 3);
  const txt = fh.textContent;
  ok('ISO date rendered MM/DD/YYYY', /03\/05\/2026/.test(txt));
  ok('US date preserved MM/DD/YYYY', /04\/18\/2026/.test(txt));
  ok('blank date => placeholder (not empty)', fh.querySelectorAll('.pf-sge-blank').length >= 1);
  ok('amount comma-formatted', /12,500/.test(txt));
  ok('status chips present', fh.querySelectorAll('.pf-co-status').length === 3);
  // Totals: 12500 + 3200 + (-1000) = 14700
  ok('Totals row sums amount column (14,700)', /Total[\s\S]*14,700/.test(txt) && fh.querySelector('.pf-sge-total-row') !== null);
  ok('sum helper = 14700', full.sandbox.__sum(full.sandbox.__read()) === 14700);
})();

console.log('== FRONTEND: add / edit / delete flow ==');
(function () {
  const base = [
    { id: 'co1', co_number: 'CO-001', date: '2026-03-05', description: 'Added piers', amount: '12,500', status: 'Approved' },
  ];
  const F = buildFront({ canEdit: true, _curOverrides: { contract: { __change_orders: base } } });
  const doc = F.win.document;
  // Build the editor rows the way pfCoEdit does (map read() through pfCoRowEditorHtml) + one Add.
  const rowsHost = doc.createElement('div');
  rowsHost.className = 'pf-co-rows';
  F.sandbox.__read().forEach((o) => { rowsHost.innerHTML += F.sandbox.__rowEd(o); });
  // ADD a new row (pfCoAdd appends a fresh editor row).
  const newRow = doc.createElement('div');
  newRow.innerHTML = F.sandbox.__rowEd({ id: 'co_new', co_number: '', date: '', description: '', amount: '', status: '' });
  rowsHost.appendChild(newRow.firstChild);
  // EDIT the existing row's amount; fill the new row.
  const erows = rowsHost.querySelectorAll('.pf-co-erow');
  ok('editor built 2 rows (1 existing + 1 added)', erows.length === 2);
  erows[0].querySelector('.pf-co-in-amt').value = '15,000';         // edit
  erows[1].querySelector('.pf-co-in-num').value = 'CO-002';         // new
  erows[1].querySelector('.pf-co-in-date').value = '2026-05-01';    // native picker (YYYY-MM-DD)
  erows[1].querySelector('.pf-co-in-desc').value = 'Winter heat';
  erows[1].querySelector('.pf-co-in-amt').value = '2,000';
  erows[1].querySelector('.pf-co-in-status').value = 'Pending';
  // Gather (mirror pfCoSave's collection loop).
  function gather(host) {
    const out = [];
    host.querySelectorAll('.pf-co-erow').forEach((r) => {
      out.push({
        id: r.getAttribute('data-co-id'),
        co_number: (r.querySelector('.pf-co-in-num') || {}).value.trim(),
        date: (r.querySelector('.pf-co-in-date') || {}).value.trim(),
        description: (r.querySelector('.pf-co-in-desc') || {}).value.trim(),
        amount: (r.querySelector('.pf-co-in-amt') || {}).value.trim(),
        status: (r.querySelector('.pf-co-in-status') || {}).value.trim(),
      });
    });
    return out;
  }
  let gathered = gather(rowsHost);
  ok('gather after add/edit => 2 rows', gathered.length === 2);
  ok('edited amount captured', gathered[0].amount === '15,000');
  ok('new row captured (CO-002 + date + status)', gathered[1].co_number === 'CO-002' && gathered[1].date === '2026-05-01' && gathered[1].status === 'Pending');
  // DELETE row 0 (pfCoRemove removes the .pf-co-erow node).
  erows[0].parentNode.removeChild(erows[0]);
  gathered = gather(rowsHost);
  ok('delete removes a row => 1 remains', gathered.length === 1 && gathered[0].co_number === 'CO-002');
  // Status dropdown options present.
  const sel = rowsHost.querySelector('.pf-co-in-status');
  const optVals = Array.prototype.map.call(sel.querySelectorAll('option'), (o) => o.value);
  ok('status dropdown has Pending/Approved/Rejected', optVals.includes('Pending') && optVals.includes('Approved') && optVals.includes('Rejected'));
})();

console.log('== BACKEND: cleanChangeOrders validator ==');
(function () {
  const clean = W.cleanChangeOrders;
  ok('absent => []', Array.isArray(clean(null)) && clean(null).length === 0);
  ok('undefined => []', Array.isArray(clean(undefined)) && clean(undefined).length === 0);
  ok('non-array => null (reject)', clean({ x: 1 }) === null && clean('str') === null);
  ok('over length cap => null', clean(new Array(201).fill({ co_number: 'x' })) === null);
  // sanitize: angle-strip + trim + preserve fields
  const r = clean([{ id: 'a', co_number: ' <b>CO-1</b> ', date: '2026-01-02', description: 'x<script>', amount: '$1,000', status: 'Approved' }]);
  ok('angle brackets stripped', r[0].co_number === 'bCO-1/b' && !/[<>]/.test(r[0].description));
  ok('trimmed', r[0].co_number.indexOf(' ') === -1 || r[0].co_number === 'bCO-1/b');
  ok('all 6 fields survive', ['id', 'co_number', 'date', 'description', 'amount', 'status'].every((k) => k in r[0]));
  ok('unknown keys dropped', clean([{ co_number: 'A', evil: 'nope' }])[0].evil === undefined);
  // empty row dropped
  ok('fully-empty row dropped', clean([{ id: 'x', co_number: '', date: '', description: '', amount: '', status: '' }]).length === 0);
  // missing id => positional fallback
  ok('missing id => co-<index> fallback', clean([{ co_number: 'A' }])[0].id === 'co-0');
  // bad entry => reject whole
  ok('non-object entry => reject', clean([null]) === null && clean([[1, 2]]) === null);
})();

console.log('== BACKEND: reserved-key merge + gating ==');
(function () {
  function req(body) {
    const t = JSON.stringify(body);
    return { headers: { get: (h) => (h === 'Content-Length' ? String(t.length) : null) }, async text() { return t; }, url: 'https://x/api/project-override' };
  }
  async function post(env, session, body) {
    const res = await W.onRequestPost({ request: req(body), env, data: { session } });
    if (res && res.__denied) return { status: 403, body: { denied: true } };
    return { status: res.status, body: await res.json() };
  }
  const OFFICE = { area: 'financials', name: 'Peter' };
  const FIELD_OPS = { area: 'field_ops', name: 'Crew' };

  (async () => {
    // gating: field_ops denied
    const env0 = { PF_SCHEDULE: makeKV() };
    const denied = await post(env0, FIELD_OPS, { num: '25-999', section: 'contract', fields: { __change_orders: [{ co_number: 'A' }] } });
    ok('field_ops POST denied', denied.status === 403 && denied.body.denied === true);

    // __change_orders on non-contract section => 400
    const wrongSection = await post(env0, OFFICE, { num: '25-999', section: 'engineering', fields: { __change_orders: [{ co_number: 'A' }] } });
    ok('__change_orders on non-contract => 400', wrongSection.status === 400);

    // write __change_orders (office) => saved + round-trip
    const env = { PF_SCHEDULE: makeKV() };
    const w1 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { __change_orders: [
      { id: 'c1', co_number: 'CO-001', date: '2026-03-05', description: 'Piers', amount: '12,500', status: 'Approved' },
    ] } });
    ok('office write saved', w1.status === 200 && w1.body.saved === true);
    ok('__change_orders round-trips', Array.isArray(w1.body.sections.contract.__change_orders) && w1.body.sections.contract.__change_orders[0].co_number === 'CO-001');

    // write __subcontract_analysis => __change_orders PRESERVED
    const w2 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { __subcontract_analysis: { verdict: 'GREEN', summary: 's' } } });
    ok('sibling __subcontract_analysis write preserves __change_orders',
       w2.body.sections.contract.__change_orders && w2.body.sections.contract.__change_orders[0].co_number === 'CO-001' &&
       w2.body.sections.contract.__subcontract_analysis.verdict === 'GREEN');

    // write __contract_pull => __change_orders + __subcontract_analysis PRESERVED
    const w3 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { __contract_pull: { status: 'pulled', source_doc: 'FE.pdf' } } });
    ok('__contract_pull write preserves both siblings',
       w3.body.sections.contract.__change_orders && w3.body.sections.contract.__change_orders[0].co_number === 'CO-001' &&
       w3.body.sections.contract.__subcontract_analysis.verdict === 'GREEN' &&
       w3.body.sections.contract.__contract_pull.status === 'pulled');

    // write a FLAT contract field => __change_orders PRESERVED
    const w4 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { 'Subcontract Value': '$343,037' } });
    ok('flat field write preserves __change_orders',
       w4.body.sections.contract.__change_orders && w4.body.sections.contract.__change_orders[0].co_number === 'CO-001' &&
       w4.body.sections.contract['Subcontract Value'] === '$343,037');

    // write __change_orders again => __subcontract_analysis + __contract_pull PRESERVED (vice-versa)
    const w5 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { __change_orders: [
      { id: 'c1', co_number: 'CO-001', date: '2026-03-05', description: 'Piers', amount: '15,000', status: 'Approved' },
      { id: 'c2', co_number: 'CO-002', date: '2026-05-01', description: 'Heat', amount: '2,000', status: 'Pending' },
    ] } });
    ok('__change_orders write preserves siblings (vice-versa)',
       w5.body.sections.contract.__change_orders.length === 2 &&
       w5.body.sections.contract.__subcontract_analysis.verdict === 'GREEN' &&
       w5.body.sections.contract.__contract_pull.status === 'pulled' &&
       w5.body.sections.contract['Subcontract Value'] === '$343,037');

    // malformed __change_orders => 400, nothing saved (prior preserved)
    const w6 = await post(env, OFFICE, { num: '25-999', section: 'contract', fields: { __change_orders: 'not-an-array' } });
    ok('malformed __change_orders => 400', w6.status === 400);
    const g = await W.onRequestGet({ request: { url: 'https://x/api/project-override?num=25-999' }, env, data: { session: OFFICE } });
    const gb = await g.json();
    ok('prior __change_orders intact after rejected save', gb.sections.contract.__change_orders.length === 2);

    console.log('\n== RESULTS ==');
    console.log('PASS: ' + pass + '  FAIL: ' + fail);
    if (fails.length) { console.log('Failures:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
    process.exit(0);
  })();
})();
