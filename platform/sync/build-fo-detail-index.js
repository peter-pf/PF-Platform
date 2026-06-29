// build-fo-detail-index.js — regenerate data/fo-detail-index.js (FIELD-SAFE).
//
// WHY: the Field Ops Phase 1 "smart search" indexes per-project field detail
// (vendors, site contacts, approved materials, schedule milestones, safety,
// QA/QC) so the crew can ask "who is my stone vendor for POET?" and get an
// answer card. The full per-project record (project-record-poet.js) is sensitive
// (contract value, GC financial contacts) and is NOT loaded for field_ops, so we
// build a MONEY-SCRUBBED derivative the crew can safely load.
//
// WHAT IT STRIPS: every $ amount, unit price ($/TN, per-LF, per-day...), any
// dollar-shaped number, and the price fragment inside vendor notes. It also
// drops link rows whose label/url carry a dotted date (e.g. a dated PDF
// filename) so the SEC-15 guard (which flags \d{4,}\.\d{2}) stays green. It uses
// the key "detail" (not "value") in milestones so the guard's money-key regex
// does not trip. NO gc_name / contract / bid value / margin field is ever read.
//
// Run:  node platform/sync/build-fo-detail-index.js
// Then: node platform/migrations/check-data-classification.mjs   (must PASS)
//
// Brad style note: no em dashes in any rendered copy this file emits.

const fs = require('fs');
const path = require('path');

const PLATFORM = path.join(__dirname, '..');
const SRC = path.join(PLATFORM, 'data', 'project-record-poet.js');
const OUT = path.join(PLATFORM, 'data', 'fo-detail-index.js');

// SEC-15 tripwire shape (a 4+ digit integer with two decimals). Also catches
// dotted dates in filenames, which we deliberately exclude from link rows.
const MONEYNUM = /\b\d{4,}\.\d{2}\b/;

// Defensive money scrub for free-text string fields (mirrors index.html scrubMoney
// and extends it to bare unit-price phrases without a $ sign).
function scrub(s) {
  if (s == null) return '';
  let t = String(s);
  // $22.50/TN, $1,200 per pier, $15-20/LF, bare $343,037.07
  t = t.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:[-–]\s*\d[\d,]*(?:\.\d+)?)?\s*(?:\/\s*\w+|per\s+\w+)?/gi, '');
  // unit price without a $ sign: "22.50/TN", "15-20 per LF"
  t = t.replace(/\b\d[\d,]*(?:\.\d+)?\s*(?:\/\s*(?:TN|LF|ton|cy|yd|day|hr|hour|ea|each)\b|per\s+(?:TN|LF|ton|cy|yd|day|hr|hour|pier|column|ea|each)\b)/gi, '');
  // Brad style: normalize em/en dashes in free text to a plain hyphen (no em dashes in rendered copy)
  t = t.replace(/\s*—\s*/g, ' - ');
  // tidy leftover separators where a price was removed
  t = t.replace(/\s*[-–]\s*(?=$|[-–])/g, ' ');
  t = t.replace(/\s*[-–]\s*$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[\s,;:–-]+$/, '').trim();
  return t;
}

function contact(c, category) {
  return {
    category: category,
    scope: scrub(c.scope || ''),
    company: scrub(c.company || ''),
    name: c.name || '',
    phone: c.phone || '',
    cell: c.cell || '',
    email: c.email || '',
    website: c.website || '',
    notes: scrub(c.notes || ''),
  };
}

// Drop a link row whose label/url would trip the dollar-shaped-number guard
// (dated PDF filenames). Folder-level links survive and cover the same area.
function safeLink(l) {
  return !MONEYNUM.test(String(l.label || '')) && !MONEYNUM.test(String(l.url || ''));
}

function build() {
  const raw = fs.readFileSync(SRC, 'utf8');
  const expr = raw
    .replace(/^[\s\S]*?window\.PF_PROJECT_POET\s*=\s*/, '')
    .replace(/;\s*$/, '');
  // eslint-disable-next-line no-eval
  const POET = eval('(' + expr + ')');

  const g = (POET.contacts && POET.contacts.groups) || {};
  const vendors = (g.vendors || []).map(function (c) { return contact(c, 'Vendor'); });
  const siteContacts = []
    .concat((g.owner || []).map(function (c) { return contact(c, 'Owner'); }))
    .concat((g.gc || []).map(function (c) { return contact(c, 'Site Contact'); }))
    .concat((g.engineering || []).map(function (c) { return contact(c, 'Engineering'); }))
    .concat((g.pf_team || []).map(function (c) { return contact(c, 'PF Team'); }));

  const materials = []
    .concat((POET.links && POET.links.material) || [])
    .concat(((POET.links && POET.links.site) || []).filter(function (l) { return /material/i.test(l.label || ''); }))
    .filter(safeLink)
    .map(function (l) { return { label: scrub(l.label || ''), url: l.url || '' }; })
    .filter(function (v, i, a) { return a.findIndex(function (x) { return x.label === v.label; }) === i; });

  const safety = ((POET.links && POET.links.safety) || [])
    .filter(safeLink)
    .map(function (l) { return { label: scrub(l.label || ''), url: l.url || '' }; });

  const q = POET.qaqc || {};
  const qaqc = {
    installed_columns: q.installed_columns == null ? null : q.installed_columns,
    installed_lf: q.installed_lf == null ? null : q.installed_lf,
    last_log_date: q.last_log_date || '',
    redrill_logs: q.redrill_logs == null ? null : q.redrill_logs,
    guh_count: q.guh_count == null ? null : q.guh_count,
  };

  const bl = POET.bid_log || {};
  const sf = (POET.subcontract && POET.subcontract.fields) || {};
  const milestones = [
    { label: 'Projected Start', detail: scrub(bl.projected_start || sf.commencement_date || '') },
    { label: 'Contract Duration', detail: scrub(sf.contract_duration_calendar || (bl.duration_days ? bl.duration_days + ' days' : '')) },
    { label: 'Working Hours', detail: scrub(sf.working_hours || '') },
    { label: 'Prevailing Wage', detail: sf.prevailing_wage ? 'Yes' : '' },
  ].filter(function (x) { return x.detail; });

  const out = {
    generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    note: 'FIELD-SAFE searchable detail index (Phase 1 smart search). Auto-generated from project-record-poet.js with ALL financials scrubbed (no dollar amounts, unit prices, contract or bid values, margins, gc_name keys). Server-gated field_ops-safe via DATA_FILE_AREAS. Regenerate via build-fo-detail-index.js whenever the source record changes.',
    projects: [{
      number: POET.project_number,
      name: 'POET Bioprocessing',
      aliases: ['poet', 'poet bioprocessing', 'poet biosciences', '26-002', 'shelbyville'],
      city_state: POET.location || bl.city_state || '',
      vendors: vendors,
      siteContacts: siteContacts,
      materials: materials,
      safety: safety,
      milestones: milestones,
      qaqc: qaqc,
    }],
  };

  const banner =
    '// AUTO-GENERATED field-safe searchable detail index (Phase 1 Field Ops smart search).\n' +
    '// DO NOT add financials here. Source: project-record-poet.js, money-scrubbed.\n' +
    '// No dollar amounts, unit prices, contract or bid values, margins, gc_name keys.\n' +
    '// Classified field_ops in functions/lib/auth.js (DATA_FILE_AREAS). The SEC-15\n' +
    '// build-time guard (check-data-classification.mjs) scans this file for leakage.\n';

  fs.writeFileSync(OUT, banner + 'window.PF_FO_DETAIL_INDEX = ' + JSON.stringify(out, null, 2) + ';\n');
  process.stdout.write('Wrote ' + OUT + '\n');
}

build();
