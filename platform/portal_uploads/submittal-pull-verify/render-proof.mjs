import fs from 'fs';
import { JSDOM } from 'jsdom';

// STAGE 2 "Pull from Approved Drawings" render proof (Brad 2026-08-13,
// branch submittal-summary-pull-stage2-20260813). Proves, on the LIVE renderer
// extracted from index.html:
//   (a) Submittal Summary rows + TOTAL populate from __site_elevations (pull writes these).
//   (b) __submittal_pull reconciled=true -> quiet GREEN note on the TOTAL row.
//   (c) __submittal_pull reconciled=false -> AMBER note + whole-table UNVERIFIED stamp.
//   (d) structural_found=true -> "Structural/Civil drawings: found" (green);
//       structural_found=false/null -> "pending" (grey). ffe_status=pending -> FFE note;
//       ffe_status=sourced -> green "FFE: sourced" chip (mirrors structural-found);
//       ffe_status='' -> neither chip nor note.
//   (e) office (canEdit) sees the "Pull from Approved Drawings" button; field_ops does NOT.
//   (f) status='requested' -> button disabled + "Pull requested…" state.
// Run from platform/ dir (reads index.html).

const html = fs.readFileSync('index.html', 'utf8');
const _mark = 'Renders window.PF_PROJECT_POET into #prRoot as 11 collapsible schema cards.';
const _mi = html.indexOf(_mark);
const _ss = html.indexOf('<script>', _mi) + '<script>'.length;
const _se = html.indexOf('</script>', _ss);
let block = html.slice(_ss, _se);
// Expose the renderer + the SGE inline builder + pull reader for direct assertions.
block = block.replace(/\n  \} catch\(e\) \{\n    console\.error\("Project record view failed to load:", e\);/,
  '\n    try { window.__renderInto = renderInto; window.__siteGradeElevationsInline = siteGradeElevationsInline; window.__pfSubmittalPull = pfSubmittalPull; } catch(_x){ window.__renderErr = _x.message; }\n  } catch(e) {\n    console.error("Project record view failed to load:", e);');

function makeWindow(role) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.esc = (v) => (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  w.pfFmtPhone = (v) => String(v == null ? '' : v);
  w.pfFmtDate = (v) => String(v == null ? '' : v);
  // pfFmtQty: comma-format integers (matches the live helper's visible behavior enough
  // for these assertions; non-numeric passes through).
  w.pfFmtQty = (v) => {
    if (v == null || v === '') return String(v == null ? '' : v);
    const n = Number(String(v).replace(/,/g, ''));
    if (!isFinite(n)) return String(v);
    return n.toLocaleString('en-US');
  };
  w.pfFmtMoney = (v) => String(v == null ? '' : v);
  w.pfFmtNum = (v) => String(v == null ? '' : v);
  w.PF_DATE_LABEL_RE = /\b(date|dated)\b/i;
  w.pfIsDateLabel = (label) => w.PF_DATE_LABEL_RE.test(String(label || ''));
  w.pfToDateInputValue = (v) => String(v == null ? '' : v);
  w.PF_ME = { name: 'Test ' + role, role: role };
  w.PF_COST_CODE_TEMPLATE = { groups: [{ rows: [{ cost_code: '5110' }, { cost_code: '5405' }] }] };
  w.PF_PROJECT_RECORDS = {}; w.PF_PM = {};
  w.PF_PROJECT_POET = null;
  w.PF_PROJECT_OVERRIDES = {};
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ companies: [], contacts: [] }) });
  return { dom, w };
}

let pass = 0, fail = 0; const F = [];
function ok(c, m) { if (c) { pass++; } else { fail++; F.push(m); } }

const D = {
  project_number: '26-999', project_name: 'Test Project',
  bid_log: { total_lf: 5000, total_columns: 100, engineer_firm: 'Garbin Geo' },
  contacts: { groups: { engineering: [{ company: 'Garbin', name: 'Ed' }], owner: [{ company: 'Owner LLC' }], vendors: [], pf_team: [] } },
  qaqc: { installed_columns: 88, installed_lf: 5000, design_columns: 100, design_lf: 5200, pct_columns: '-', pct_lf: '-', redrill_logs: 0, last_log_date: '' },
  links: {}
};

// Two POET-shaped areas (a subset — the totals are what matter for reconciliation).
const AREAS = [
  { id: 'a1', area: 'Grain Bins',        gradeElev: '612.5', ffe: '615.0', pierQty: '1316', totalLf: '13160', columnDiameter: '', bearingCapacity: '' },
  { id: 'a2', area: 'Fermentation Tanks', gradeElev: '',      ffe: '',      pierQty: '488',  totalLf: '3416',  columnDiameter: '', bearingCapacity: '' }
];

function sgeWrapFrom(root) {
  return root.querySelector('.pf-sge-wrap');
}

// ---------- SCENARIO 1: reconciled=true, structural found, office ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s1): ' + e.message); process.exit(2); }
  ok(typeof w.__renderInto === 'function', 's1: renderInto exposed err=' + (w.__renderErr || ''));
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: {
    __site_elevations: AREAS,
    __submittal_pull: {
      source_pdf: { name: '26-129 POET AP Design R3 ESealed.pdf', revision: 'R3', date: '2026-07-23' },
      pulled_at: '2026-08-13T00:00:00Z', requested_at: '', status: 'pulled',
      reconciled: true,
      extracted_total: { piers: '1804', lf: '16576' },
      pier_schedule_total: { piers: '1804', lf: '16576' },
      delta: { piers: '0', lf: '0' },
      structural_found: true, ffe_status: 'pending', notes: ['vision-read from GI-3xx']
    }
  } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s1): ' + e.message); }
  const sge = sgeWrapFrom(root);
  ok(!!sge, 's1: Submittal Summary block present');

  // (a) rows populate from areas[]
  const bodyRows = sge.querySelectorAll('tbody .pf-sge-row');
  ok(bodyRows.length === 2, 's1(a): 2 area rows rendered (got ' + bodyRows.length + ')');
  ok(/Grain Bins/.test(sge.textContent) && /Fermentation Tanks/.test(sge.textContent), 's1(a): area names rendered');
  ok(/1,316/.test(sge.textContent) && /13,160/.test(sge.textContent), 's1(a): per-area Pier Qty/LF rendered (comma)');

  // TOTAL row sums 1316+488=1804 ; 13160+3416=16576
  const totalRow = sge.querySelector('.pf-sge-total-row');
  ok(!!totalRow && /1,804/.test(totalRow.textContent) && /16,576/.test(totalRow.textContent), 's1(a): TOTAL row sums correct');

  // (a2) header text: "Column Diameter (in)" (Brad 2026-08-13, branch
  // submittal-summary-wrap-20260813). The (in) suffix is now on the header, not the row data.
  const ths = Array.prototype.map.call(sge.querySelectorAll('thead th'), function(t){ return t.textContent.trim(); });
  ok(ths.indexOf('Column Diameter (in)') !== -1, 's1(a2): header reads "Column Diameter (in)" (got: ' + ths.join(' | ') + ')');
  ok(ths.indexOf('Column Diameter') === -1, 's1(a2): bare "Column Diameter" header replaced');

  // (b) reconciled=true -> green note
  const recon = sge.querySelector('.pf-sge-recon');
  ok(!!recon && recon.classList.contains('pf-sge-recon-ok'), 's1(b): reconciliation note is GREEN (recon-ok)');
  ok(recon && /Reconciled to pier schedule/i.test(recon.textContent), 's1(b): green note text present');
  ok(recon && /1,804 piers/.test(recon.textContent) && /16,576 LF/.test(recon.textContent), 's1(b): green note cites schedule totals');

  // (c-neg) no UNVERIFIED stamp when reconciled
  ok(!sge.querySelector('.pf-sge-unverified'), 's1(c): NO Unverified stamp when reconciled');

  // (d) structural found + FFE pending
  const src = sge.querySelector('.pf-sge-srcline');
  ok(!!src, 's1(d): source-indicator line present');
  const strucFound = sge.querySelector('.pf-sge-src-found');
  ok(!!strucFound && /found/i.test(strucFound.textContent), 's1(d): "Structural/Civil drawings: found" (green)');
  ok(/FFE pending structural\/civil drawings/i.test(sge.textContent), 's1(d): FFE-pending note shown');

  // provenance line
  ok(/26-129 POET AP Design R3 ESealed\.pdf/.test(sge.textContent), 's1: source PDF provenance rendered');
  ok(/R3/.test(sge.textContent) && /2026-07-23/.test(sge.textContent), 's1: source rev/date rendered');

  // (e) office sees the Pull button, enabled
  const pullBtn = sge.querySelector('.pf-sge-pull-btn');
  ok(!!pullBtn, 's1(e): Pull button present (office)');
  ok(pullBtn && !pullBtn.disabled && /Pull from Approved Drawings/.test(pullBtn.textContent), 's1(e): Pull button enabled + labeled');
  ok(pullBtn && /pfSgePullFromDrawings/.test(pullBtn.getAttribute('onclick') || ''), 's1(e): Pull button wired to handler');
}

// ---------- SCENARIO 2: reconciled=false -> amber + UNVERIFIED ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s2): ' + e.message); process.exit(2); }
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: {
    __site_elevations: AREAS,
    __submittal_pull: {
      source_pdf: { name: 'set.pdf', revision: 'R1', date: '2026-01-01' },
      pulled_at: '2026-08-13T00:00:00Z', requested_at: '', status: 'pulled',
      reconciled: false,
      extracted_total: { piers: '1804', lf: '16576' },
      pier_schedule_total: { piers: '1900', lf: '17000' },
      delta: { piers: '96', lf: '424' },
      structural_found: false, ffe_status: '', notes: []
    }
  } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s2): ' + e.message); }
  const sge = sgeWrapFrom(root);
  ok(!!sge, 's2: block present');

  // rows still show
  ok(sge.querySelectorAll('tbody .pf-sge-row').length === 2, 's2: rows STILL render despite mismatch');

  // amber note
  const recon = sge.querySelector('.pf-sge-recon');
  ok(!!recon && recon.classList.contains('pf-sge-recon-bad'), 's2(c): reconciliation note is AMBER (recon-bad)');
  ok(recon && /Does NOT match pier schedule/i.test(recon.textContent), 's2(c): mismatch wording present');
  ok(recon && /Extracted 1,804\/16,576/.test(recon.textContent), 's2(c): extracted totals cited');
  ok(recon && /schedule 1,900\/17,000/.test(recon.textContent), 's2(c): schedule totals cited');
  ok(recon && /off by 96 piers \/ 424 LF/.test(recon.textContent), 's2(c): deltas cited');
  ok(recon && /review, not verified/i.test(recon.textContent), 's2(c): "review, not verified" present');

  // UNVERIFIED stamp on the title
  const stamp = sge.querySelector('.pf-sge-unverified');
  ok(!!stamp && /unverified/i.test(stamp.textContent), 's2(c): UNVERIFIED stamp on table title');

  // structural_found=false -> pending (grey), NOT found
  ok(!sge.querySelector('.pf-sge-src-found'), 's2(d): NOT "found" when structural_found=false');
  const pend = sge.querySelector('.pf-sge-src-pending');
  ok(!!pend && /pending/i.test(pend.textContent), 's2(d): "pending" shown when structural_found=false');
  // ffe_status '' -> neither the FFE-pending note NOR a "FFE: sourced" chip
  ok(!/FFE pending/i.test(sge.textContent), 's2(d): no FFE note when ffe_status is empty');
  ok(!/FFE:/.test(sge.textContent), 's2(d): no "FFE: sourced" chip when ffe_status is empty');
}

// ---------- SCENARIO 6: ffe_status='sourced' -> green "FFE: sourced" chip ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s6): ' + e.message); process.exit(2); }
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: {
    __site_elevations: AREAS,
    __submittal_pull: {
      source_pdf: { name: 'set.pdf', revision: 'R3', date: '2026-07-23' },
      pulled_at: '2026-08-13T00:00:00Z', requested_at: '', status: 'pulled',
      reconciled: true, extracted_total: { piers: '1804', lf: '16576' },
      pier_schedule_total: { piers: '1804', lf: '16576' }, delta: { piers: '0', lf: '0' },
      structural_found: true, ffe_status: 'sourced', notes: []
    }
  } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s6): ' + e.message); }
  const sge = sgeWrapFrom(root);
  ok(!!sge, 's6: block present');
  const src = sge.querySelector('.pf-sge-srcline');
  ok(!!src, 's6(d): source-indicator line present');
  // TWO green found-chips on the row: structural + FFE (both use pf-sge-src-found)
  const founds = src.querySelectorAll('.pf-sge-src-found');
  ok(founds.length === 2, 's6(d): 2 green found chips on the srcline (structural + FFE), got ' + founds.length);
  // The FFE chip: green, dotted, labeled "FFE: sourced"
  const ffeChip = Array.prototype.filter.call(src.querySelectorAll('.pf-sge-src-found'), function(el){ return /FFE:/.test(el.textContent); })[0];
  ok(!!ffeChip, 's6(d): green "FFE:" chip present (pf-sge-src-found)');
  ok(ffeChip && ffeChip.classList.contains('pf-sge-src-found'), 's6(d): FFE chip reuses pf-sge-src-found (green + bold)');
  ok(ffeChip && !!ffeChip.querySelector('.pf-sge-src-dot'), 's6(d): FFE chip has the green pf-sge-src-dot');
  ok(ffeChip && /FFE:\s*sourced/i.test(ffeChip.textContent), 's6(d): FFE chip reads "FFE: sourced"');
  // structural chip still present + independent
  ok(!!Array.prototype.filter.call(src.querySelectorAll('.pf-sge-src-found'), function(el){ return /Structural\/Civil/.test(el.textContent); })[0],
     's6(d): structural-found chip still present + unchanged');
  // no pending FFE note when sourced
  ok(!/FFE pending/i.test(sge.textContent), 's6(d): NO FFE-pending note when ffe_status=sourced');
  // structural chip renders BEFORE the FFE chip on the row (order check)
  ok(/Structural\/Civil/.test(founds[0].textContent) && /FFE:/.test(founds[1].textContent),
     's6(d): structural chip first, FFE chip second on the row');
}

// ---------- SCENARIO 3: status='requested' -> disabled + requested state ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s3): ' + e.message); process.exit(2); }
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: {
    __site_elevations: [],
    __submittal_pull: {
      source_pdf: { name: '', revision: '', date: '' },
      pulled_at: '', requested_at: '2026-08-13T01:00:00Z', status: 'requested',
      reconciled: null, extracted_total: { piers: '', lf: '' },
      pier_schedule_total: { piers: '', lf: '' }, delta: { piers: '', lf: '' },
      structural_found: null, ffe_status: '', notes: []
    }
  } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s3): ' + e.message); }
  const sge = sgeWrapFrom(root);
  const pullBtn = sge && sge.querySelector('.pf-sge-pull-btn');
  ok(!!pullBtn && pullBtn.disabled, 's3(f): Pull button DISABLED while a request is pending');
  ok(pullBtn && /Pull requested/i.test(pullBtn.textContent), 's3(f): button relabeled "Pull requested…"');
  ok(/Peter is extracting/i.test(sge.textContent), 's3(f): "Peter is extracting" pending note shown');
  // structural_found null -> pending (never claim found)
  ok(!sge.querySelector('.pf-sge-src-found') && !!sge.querySelector('.pf-sge-src-pending'), 's3(d): null structural -> pending (not found)');
  // no recon note when reconciled=null
  ok(!sge.querySelector('.pf-sge-recon'), 's3: no reconciliation note when reconciled=null');
}

// ---------- SCENARIO 4: no pull at all -> plain table, no pull chrome ----------
{
  const { w } = makeWindow('admin');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s4): ' + e.message); process.exit(2); }
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: { __site_elevations: AREAS } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s4): ' + e.message); }
  const sge = sgeWrapFrom(root);
  ok(!!sge, 's4: block present with rows, no pull');
  ok(sge.querySelectorAll('tbody .pf-sge-row').length === 2, 's4: rows render (manual entry path unaffected)');
  ok(!sge.querySelector('.pf-sge-recon'), 's4: NO reconciliation note (no pull)');
  ok(!sge.querySelector('.pf-sge-unverified'), 's4: NO Unverified stamp (no pull)');
  ok(!sge.querySelector('.pf-sge-srcline'), 's4: NO source indicator (no pull)');
  // but office still gets the Pull button (to initiate a first pull)
  ok(!!sge.querySelector('.pf-sge-pull-btn'), 's4: Pull button STILL present (office can initiate)');
}

// ---------- SCENARIO 5: field_ops -> NO pull button, NO edit ----------
{
  const { w } = makeWindow('field_ops');
  try { w.eval(block); } catch (e) { console.log('EVAL ERROR (s5): ' + e.message); process.exit(2); }
  w.PF_PROJECT_OVERRIDES = { '26-999': { sections: { engineering: {
    __site_elevations: AREAS,
    __submittal_pull: {
      source_pdf: { name: 'set.pdf', revision: 'R3', date: '2026-07-23' },
      pulled_at: '2026-08-13T00:00:00Z', requested_at: '', status: 'pulled',
      reconciled: true, extracted_total: { piers: '1804', lf: '16576' },
      pier_schedule_total: { piers: '1804', lf: '16576' }, delta: { piers: '0', lf: '0' },
      structural_found: true, ffe_status: 'pending', notes: []
    }
  } } } };
  const root = w.document.getElementById('root');
  try { w.__renderInto(D, root); } catch (e) { console.log('RENDER ERROR (s5): ' + e.message); }
  const sge = sgeWrapFrom(root);
  ok(!!sge, 's5: block present for field_ops (read-only)');
  ok(!sge.querySelector('.pf-sge-pull-btn'), 's5: NO Pull button for field_ops');
  ok(!sge.querySelector('.pf-sge-edit'), 's5: NO Edit button for field_ops');
  // but they STILL see the reconciliation status + rows (read-only visibility)
  ok(!!sge.querySelector('.pf-sge-recon-ok'), 's5: field_ops still SEES the green reconciliation note');
  ok(sge.querySelectorAll('tbody .pf-sge-row').length === 2, 's5: field_ops sees the rows');
}

console.log('\n=== RESULT: ' + pass + ' pass / ' + fail + ' fail ===');
if (fail) { console.log('FAILURES:\n - ' + F.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
