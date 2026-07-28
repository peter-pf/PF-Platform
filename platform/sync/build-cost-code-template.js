// build-cost-code-template.js
// Derive the STANDARD cost-code template (window.PF_COST_CODE_TEMPLATE) from the
// POET Budget vs Actual code list (window.PF_BUDGET_ACTUAL_POET). Brad confirmed
// 2026-07-28 that the ~69 POET cost codes ARE the standard set for every job.
//
// The template preserves the POET group order, row order, cost_code, description,
// vendor, notes, and is_subtotal markers, but ZEROES all money (budget/actual/
// variance). Per-project saved budgets (KV via /api/project-budget) merge on top
// at render time. No money is fabricated.
//
// Run: node sync/build-cost-code-template.js   (from platform/)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'data', 'budget-actual-poet.js'));
const d = global.window.PF_BUDGET_ACTUAL_POET;
if (!d || !Array.isArray(d.groups)) {
  console.error('POET budget data not found / malformed'); process.exit(1);
}

const groups = d.groups.map(g => ({
  title: g.title,
  rows: (g.rows || []).map(r => ({
    cost_code: r.cost_code || '',
    description: r.description || '',
    vendor: r.vendor || '',
    notes: r.notes || '',
    is_subtotal: !!r.is_subtotal,
    budget: 0,
    actual: 0,
    variance: 0,
  })),
}));

const out = {
  version: 1,
  label: 'Standard Cost Code Template',
  note: 'Derived from the POET (26-002) Budget vs Actual code list — the STANDARD ~69 cost codes for every job (Brad confirmed 2026-07-28). Money ZEROED; per-project budgets merge on top at render.',
  source: 'data/budget-actual-poet.js (window.PF_BUDGET_ACTUAL_POET)',
  groups,
};

let total = 0, codes = 0, subs = 0;
groups.forEach(g => g.rows.forEach(r => { total++; if (r.cost_code) codes++; if (r.is_subtotal) subs++; }));

const banner =
  '// AUTO-DERIVED from data/budget-actual-poet.js — the STANDARD cost-code template.\n' +
  '// Money is ZEROED; a per-project saved budget (KV via /api/project-budget) merges on top.\n' +
  '// Groups + row order + cost_code + description + vendor + is_subtotal preserved so\n' +
  '// category subtotals and the grand total compute correctly per project.\n' +
  '// Regenerate: node sync/build-cost-code-template.js (reads POET codes, zeroes money).\n';

fs.writeFileSync(path.join(ROOT, 'data', 'cost-code-template.js'),
  banner + 'window.PF_COST_CODE_TEMPLATE = ' + JSON.stringify(out, null, 2) + ';\n');

console.log('WROTE data/cost-code-template.js');
console.log('groups:', groups.length, '| total rows:', total, '| cost_code rows:', codes, '| subtotal rows:', subs);
