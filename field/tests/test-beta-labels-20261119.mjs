// test-beta-labels-20261119.mjs
// Verifies that Derek-only tab labels end with " (Beta)" in nav and in
// their page-specific topbar / <title>, and that general tabs (Daily Report,
// Safety Analysis) are NOT marked Beta.
//
// Gates checked:
//   Hardware   — HARDWARE_GO_LIVE=false + HARDWARE_ALLOWED_UIDS (Derek UID only)
//   Vendors    — VENDORS_GO_LIVE=true (go-live; Beta label removed)
//   Service Log— SERVICELOG_GO_LIVE=false + SERVICELOG_ALLOWED_UIDS (Derek UID only)
//
// Run: node field/tests/test-beta-labels-20261119.mjs  (from PF-Platform root)
//   or: node tests/test-beta-labels-20261119.mjs       (from field/ directory)

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, cond, detail) {
  if (cond) {
    console.log('  PASS ' + desc);
    passed++;
  } else {
    console.error('  FAIL ' + desc + (detail ? ' :: ' + detail : ''));
    failed++;
  }
}

// HTML files that contain the shared nav (every portal page)
const NAV_PAGES = [
  'index.html',
  'daily-report.html',
  'equipment-inspection.html',
  'site-readiness.html',
  'toolbox-talk.html',
  'past-reports.html',
  'cost-codes.html',
  'schedule.html',
  'time-off.html',
  'sops.html',
  'mailing-lists.html',
  'hardware.html',
  'vendors.html',
  'service-log.html',
];

// Derek-only pages with their own topbar title / <title>.
// beta: true  = still in preview; nav + title carry " (Beta)"
// beta: false = go-live; nav label and title are plain (no Beta suffix)
const DEREK_PAGES = [
  { file: 'hardware.html',     label: 'Hardware',    beta: true,  titleExpect: 'Hardware (Beta) | PF Field Portal' },
  { file: 'vendors.html',      label: 'Vendors',     beta: false, titleExpect: 'Vendors | PF Field Portal' },
  { file: 'service-log.html',  label: 'Service Log', beta: true,  titleExpect: 'Service Log (Beta) | PF Field Portal' },
];

// General tabs that must NOT carry (Beta)
const GENERAL_NAV_LABELS = [
  'Daily Report',
  'Safety Analysis',
  'Home',
  'Equip. Inspect.',
  'Site Readiness',
  'Past Reports',
  'Cost Codes',
  'Schedule',
  'Time Off',
  'SOPs',
];

// ============================================================================
// 1. Nav label checks — every page in the portal
// ============================================================================
console.log('\n--- 1. Nav (Beta) labels for still-preview tabs; Vendors go-live (no Beta) ---');

for (const file of NAV_PAGES) {
  const src = readFileSync(path.join(root, file), 'utf8');

  assert(
    `${file}: nav has Hardware (Beta)`,
    src.includes('<span>Hardware (Beta)</span>'),
    'Hardware nav span missing (Beta)'
  );
  // Vendors is go-live: nav label must be plain "Vendors" (no Beta suffix)
  assert(
    `${file}: nav has Vendors (go-live, no Beta)`,
    src.includes('<span>Vendors</span>'),
    'Vendors nav span missing plain label'
  );
  assert(
    `${file}: nav has Service Log (Beta)`,
    src.includes('<span>Service Log (Beta)</span>'),
    'Service Log nav span missing (Beta)'
  );
}

// ============================================================================
// 2. Nav span correctness — no stale Beta on Vendors; Hardware/SL still have it
// ============================================================================
console.log('\n--- 2. No stale Beta on Vendors nav; Hardware and Service Log keep (Beta) ---');

for (const file of NAV_PAGES) {
  const src = readFileSync(path.join(root, file), 'utf8');

  assert(
    `${file}: no bare <span>Hardware</span>`,
    !src.includes('<span>Hardware</span>'),
    'found bare Hardware nav span without (Beta)'
  );
  // Vendors is go-live: "Vendors (Beta)" must be absent
  assert(
    `${file}: no <span>Vendors (Beta)</span> (Vendors is go-live)`,
    !src.includes('<span>Vendors (Beta)</span>'),
    'found stale Vendors (Beta) nav span after go-live'
  );
  assert(
    `${file}: no bare <span>Service Log</span>`,
    !src.includes('<span>Service Log</span>'),
    'found bare Service Log nav span without (Beta)'
  );
}

// ============================================================================
// 3. Derek-only pages: topbar tb-title and <title> match expected state
// ============================================================================
console.log('\n--- 3. Derek-only pages: topbar tb-title and <title> ---');

for (const { file, label, beta, titleExpect } of DEREK_PAGES) {
  const src = readFileSync(path.join(root, file), 'utf8');

  if (beta) {
    assert(
      `${file}: tb-title contains "${label} (Beta)"`,
      src.includes(`<span class="tb-title">${label} (Beta)</span>`),
      `tb-title span not updated to ${label} (Beta)`
    );
  } else {
    // go-live: tb-title must be plain label, no (Beta)
    assert(
      `${file}: tb-title is plain "${label}" (go-live, no Beta)`,
      src.includes(`<span class="tb-title">${label}</span>`) &&
        !src.includes(`<span class="tb-title">${label} (Beta)</span>`),
      `tb-title should be "${label}" without (Beta)`
    );
  }
  assert(
    `${file}: <title> is "${titleExpect}"`,
    src.includes(`<title>${titleExpect}</title>`),
    `<title> tag not updated; expected "${titleExpect}"`
  );
}

// ============================================================================
// 4. General tabs must NOT carry (Beta) in any portal page
// ============================================================================
console.log('\n--- 4. General tabs do NOT carry (Beta) ---');

// Pick two representative pages (index + daily-report)
const REP_PAGES = ['index.html', 'daily-report.html', 'hardware.html'];

for (const file of REP_PAGES) {
  const src = readFileSync(path.join(root, file), 'utf8');

  for (const label of GENERAL_NAV_LABELS) {
    assert(
      `${file}: "${label}" nav span has no (Beta) suffix`,
      !src.includes(`<span>${label} (Beta)</span>`),
      `found unexpected (Beta) on general tab "${label}"`
    );
  }
}

// ============================================================================
// 5. Spot-check: Mailing Lists (shown to all 3 owners) is not marked Beta
// ============================================================================
console.log('\n--- 5. Mailing Lists (owner-visible, not Derek-only) has no (Beta) ---');

for (const file of NAV_PAGES) {
  const src = readFileSync(path.join(root, file), 'utf8');
  assert(
    `${file}: Mailing Lists has no (Beta)`,
    !src.includes('<span>Mailing Lists (Beta)</span>'),
    'found unexpected (Beta) on Mailing Lists'
  );
}

// ============================================================================
// 6. Access-control lib files carry correct gate constants
// ============================================================================
console.log('\n--- 6. Access-control lib files carry correct gate constants ---');

{
  const hw = readFileSync(path.join(root, 'functions/lib/hardware-access.js'), 'utf8');
  assert('hardware-access.js: HARDWARE_GO_LIVE = false', hw.includes('HARDWARE_GO_LIVE = false'));
  assert('hardware-access.js: Derek UID present', hw.includes('518075f1-ec9f-413b-bdd9-8924c4b62959'));

  const vn = readFileSync(path.join(root, 'functions/lib/vendors-access.js'), 'utf8');
  assert('vendors-access.js: VENDORS_GO_LIVE = true (go-live)', vn.includes('VENDORS_GO_LIVE = true'));
  assert('vendors-access.js: Derek UID present in VENDORS_EDITORS', vn.includes('518075f1-ec9f-413b-bdd9-8924c4b62959'));

  const sl = readFileSync(path.join(root, 'functions/lib/servicelog-access.js'), 'utf8');
  assert('servicelog-access.js: SERVICELOG_GO_LIVE = false', sl.includes('SERVICELOG_GO_LIVE = false'));
  assert('servicelog-access.js: Derek UID present', sl.includes('518075f1-ec9f-413b-bdd9-8924c4b62959'));
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
