// test-vendors-20261114.mjs
//
// Tests for the Vendors page (vendors.html + /api/vendors).
//
// Test groups:
//   G     Gate: vendorsAllowed / vendorsCanEdit / VENDORS_GO_LIVE flags
//   G-PATH  areaForPath classifications for vendors paths
//   CRUD  API handler: add/edit/delete sections and items; seed; SQL safety
//   CRUD10  me.js returns vendorsAllowed
//   S     Static analysis: vendors.html + all 12 existing pages have vnNavItem
//   P-AUTH  All 13 pages: /api/me init no-crash + hwNavItem + vnNavItem
//   CLICK  Add / edit / delete click flow tests (jsdom + stubbed fetch)
//
// Run: node tests/test-vendors-20261114.mjs
// Requires: jsdom (in /home/aiciv/PF-Platform/node_modules/jsdom)

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('/home/aiciv/PF-Platform/node_modules/jsdom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, cond, detail) {
  if (cond) { console.log('  PASS ' + desc); passed++; }
  else { console.error('  FAIL ' + desc + (detail ? ' :: ' + detail : '')); failed++; }
}

// Sanity: prove assert can fail (non-vacuous helpers)
assert('sanity: assert works (true)',  true);
assert('sanity: !false is true',       !false);

// ---- Load modules under test (new Function pattern, matches test-hardware-20261114) ----

// vendors-access.js
const vnAccessSrc = readFileSync(
  path.join(root, 'functions/lib/vendors-access.js'), 'utf8'
).replace(/^export /gm, '');
const vnAccessMod = {};
{
  // eslint-disable-next-line no-new-func
  const fn = new Function('module',
    vnAccessSrc +
    '\nmodule.exports = { VENDORS_GO_LIVE, VENDORS_ALLOWED_UIDS, VENDORS_EDITORS, vendorsAllowed, vendorsCanEdit };'
  );
  fn(vnAccessMod);
}
const { VENDORS_GO_LIVE, VENDORS_ALLOWED_UIDS, VENDORS_EDITORS, vendorsAllowed, vendorsCanEdit } = vnAccessMod.exports;

// vendors-seed.js
const vnSeedSrc = readFileSync(
  path.join(root, 'functions/lib/vendors-seed.js'), 'utf8'
).replace(/^export /gm, '');
const vnSeedMod = {};
{
  const fn = new Function('module', vnSeedSrc + '\nmodule.exports = { VENDORS_SEED };');
  fn(vnSeedMod);
}
const { VENDORS_SEED } = vnSeedMod.exports;

// auth.js — targeted extract of areaForPath
// strip all `export ` prefixes (covers const, function, async function)
const authSrc = readFileSync(path.join(root, 'functions/lib/auth.js'), 'utf8');
let areaForPath;
try {
  const lines = authSrc.split('\n');
  const fnStart = lines.findIndex(l => l.startsWith('export function areaForPath'));
  if (fnStart < 0) throw new Error('areaForPath not found in auth.js');
  // Start from ROLES constant (first dependency before areaForPath block)
  const rolesStart = lines.findIndex(l => l.startsWith('export const ROLES'));
  if (rolesStart < 0) throw new Error('ROLES not found');
  const relevantSrc = lines
    .slice(rolesStart)
    .join('\n')
    .replace(/^export /gm, '');
  const fn = new Function('module', relevantSrc + '\nmodule.exports = { areaForPath };');
  const m = {};
  fn(m);
  areaForPath = m.exports.areaForPath;
} catch (e) {
  console.warn('  WARN: could not load areaForPath (' + (e && e.message) + ')');
}

// me.js source (for string checks only)
const meSrc = readFileSync(path.join(root, 'functions/api/me.js'), 'utf8');

// vendors.js API handler — strip import lines + export keyword, inject deps via new Function
const vnApiRaw = readFileSync(path.join(root, 'functions/api/vendors.js'), 'utf8')
  .replace(/^import.*?;\n/gm, '')
  .replace(/^export /gm, '');
const vnApiMod = {};
{
  const fn = new Function(
    'vendorsAllowed', 'vendorsCanEdit', 'VENDORS_SEED', 'crypto', 'module',
    vnApiRaw + '\nmodule.exports = { onRequestGet, onRequestPost, onRequest };'
  );
  fn(
    vendorsAllowed, vendorsCanEdit, VENDORS_SEED,
    { randomUUID: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) },
    vnApiMod
  );
}
const { onRequestGet, onRequestPost } = vnApiMod.exports;

// shared test constants
const DEREK_UID = [...VENDORS_ALLOWED_UIDS][0];
const OTHER_UID = 'aaaaaaaa-0000-0000-0000-000000000001';
const css      = readFileSync(path.join(root, 'pf-r5.css'), 'utf8');
const sharedJs = readFileSync(path.join(root, 'js/pf-shared.js'), 'utf8');

// ============================================================================
// G  Gate: vendorsAllowed / vendorsCanEdit flags
// ============================================================================
console.log('\n--- G. Feature gate ---');
{
  assert('G1: VENDORS_GO_LIVE is false (preview mode)',
    VENDORS_GO_LIVE === false);

  assert('G2: VENDORS_ALLOWED_UIDS has exactly 1 entry',
    VENDORS_ALLOWED_UIDS.size === 1);

  assert('G3: VENDORS_EDITORS has at least 1 entry',
    VENDORS_EDITORS.size >= 1);

  const sessionDerek = { uid: DEREK_UID, role: 'admin', name: 'Derek Franke' };
  const sessionOther = { uid: OTHER_UID, role: 'admin', name: 'Other Admin' };
  const sessionField = { uid: 'crew-001', role: 'field_ops', name: 'Joe Crew' };

  assert('G4: vendorsAllowed accepts Derek uid',
    vendorsAllowed(sessionDerek) === true);

  assert('G5: vendorsAllowed rejects unknown uid',
    vendorsAllowed(sessionOther) === false);

  assert('G6: vendorsAllowed rejects null session',
    vendorsAllowed(null) === false);

  assert('G7: vendorsAllowed rejects session without uid',
    vendorsAllowed({ role: 'admin' }) === false);

  assert('G8: vendorsCanEdit accepts Derek uid',
    vendorsCanEdit(sessionDerek) === true);

  assert('G9: vendorsCanEdit rejects unknown uid',
    vendorsCanEdit(sessionOther) === false);

  assert('G10: vendorsCanEdit rejects null',
    vendorsCanEdit(null) === false);
}

// ============================================================================
// G-PATH  areaForPath classifications
// ============================================================================
if (areaForPath) {
  console.log('\n--- G-PATH. areaForPath classification ---');

  assert('G-PATH-1: /vendors.html returns user_admin',
    areaForPath('/vendors.html') === 'user_admin',
    'got: ' + areaForPath('/vendors.html'));

  assert('G-PATH-2: /vendors returns user_admin (clean URL)',
    areaForPath('/vendors') === 'user_admin',
    'got: ' + areaForPath('/vendors'));

  assert('G-PATH-3: /api/vendors returns user_admin',
    areaForPath('/api/vendors') === 'user_admin',
    'got: ' + areaForPath('/api/vendors'));

  assert('G-PATH-4: /api/vendors/list returns user_admin',
    areaForPath('/api/vendors/list') === 'user_admin',
    'got: ' + areaForPath('/api/vendors/list'));

  // Existing hardware paths still correct after our edit
  assert('G-PATH-5: /api/hardware still returns user_admin (regression)',
    areaForPath('/api/hardware') === 'user_admin',
    'got: ' + areaForPath('/api/hardware'));
} else {
  console.log('  SKIP G-PATH: areaForPath not loaded');
}

// ============================================================================
// CRUD  API handler logic (in-memory D1 stub)
// ============================================================================
console.log('\n--- CRUD. API handler logic ---');

function makeDb() {
  const data = { vendors_sections: [], vendors_items: [] };

  function prepare(sql) {
    const low = sql.trim().toLowerCase();
    const stmt = {
      _sql: sql, _low: low, _params: [],
      bind(...params) { this._params = params; return this; },
      async run() {
        if (low.includes('create table') || low.includes('create index')) {
          return { meta: { changes: 0 } };
        }
        if (low.startsWith('insert into vendors_sections')) {
          const p = this._params;
          data.vendors_sections.push({
            id: p[0], name: p[1], sort_order: p[2],
            created_by: p[3]||'', created_at: p[4]||'',
            updated_by: null, updated_at: null,
          });
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('insert into vendors_items')) {
          const p = this._params;
          data.vendors_items.push({
            id: p[0], section_id: p[1], company: p[2], category: p[3],
            contact: p[4], phone: p[5], address: p[6], website: p[7],
            account_num: p[8], notes: p[9], sort_order: p[10],
            created_by: p[11]||'', created_at: p[12]||'',
            updated_by: null, updated_at: null,
          });
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('update vendors_sections')) {
          const p = this._params; // name, updated_by, updated_at, id
          const idx = data.vendors_sections.findIndex(r => r.id === p[3]);
          if (idx < 0) return { meta: { changes: 0 } };
          data.vendors_sections[idx].name = p[0];
          data.vendors_sections[idx].updated_by = p[1];
          data.vendors_sections[idx].updated_at = p[2];
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('update vendors_items')) {
          const p = this._params; // company, category, contact, phone, address, website, account_num, notes, updated_by, updated_at, id
          const idx = data.vendors_items.findIndex(r => r.id === p[10]);
          if (idx < 0) return { meta: { changes: 0 } };
          Object.assign(data.vendors_items[idx], {
            company: p[0], category: p[1], contact: p[2], phone: p[3],
            address: p[4], website: p[5], account_num: p[6], notes: p[7],
            updated_by: p[8], updated_at: p[9],
          });
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('delete from vendors_items where section_id')) {
          const id = this._params[0];
          data.vendors_items = data.vendors_items.filter(r => r.section_id !== id);
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('delete from vendors_sections')) {
          const id = this._params[0];
          const before = data.vendors_sections.length;
          data.vendors_sections = data.vendors_sections.filter(r => r.id !== id);
          return { meta: { changes: before - data.vendors_sections.length } };
        }
        if (low.startsWith('delete from vendors_items where id')) {
          const id = this._params[0];
          const before = data.vendors_items.length;
          data.vendors_items = data.vendors_items.filter(r => r.id !== id);
          return { meta: { changes: before - data.vendors_items.length } };
        }
        return { meta: { changes: 0 } };
      },
      async first() {
        if (low.includes('count(*) as n from vendors_sections')) {
          return { n: data.vendors_sections.length };
        }
        if (low.includes('select id from vendors_sections where id')) {
          return data.vendors_sections.find(r => r.id === this._params[0]) || null;
        }
        if (low.includes('max(sort_order) as m from vendors_sections')) {
          const ms = data.vendors_sections.map(r => r.sort_order);
          return { m: ms.length ? Math.max(...ms) : null };
        }
        if (low.includes('max(sort_order) as m from vendors_items where section_id')) {
          const sid = this._params[0];
          const ms = data.vendors_items.filter(r => r.section_id === sid).map(r => r.sort_order);
          return { m: ms.length ? Math.max(...ms) : null };
        }
        return null;
      },
      async all() {
        if (low.includes('from vendors_sections')) {
          return { results: [...data.vendors_sections] };
        }
        if (low.includes('from vendors_items')) {
          return { results: [...data.vendors_items] };
        }
        return { results: [] };
      },
    };
    return stmt;
  }

  return {
    prepare,
    async batch(stmts) {
      const results = [];
      for (const s of stmts) results.push(await s.run());
      return results;
    },
    _data: data,
  };
}

function makeCtx(db, uid, bodyGetter, method='POST') {
  const session = uid ? { uid, name: 'Derek Franke', role: 'admin' } : null;
  return {
    data: { session },
    env: { DB: db },
    request: { method, json: bodyGetter || (async () => ({})) },
  };
}

async function getBody(resp) {
  return JSON.parse(await resp.text());
}

// CRUD1: add_section
{
  const db = makeDb();
  const ctx = makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Local (Fort Wayne)' }));
  const resp = await onRequestPost(ctx);
  const body = await getBody(resp);
  assert('CRUD1a: add_section returns ok:true',   body.ok === true, JSON.stringify(body));
  assert('CRUD1b: add_section returns section.id', typeof body.section?.id === 'string', JSON.stringify(body));
  assert('CRUD1c: add_section stores section in DB',
    db._data.vendors_sections.length === 1,
    'count=' + db._data.vendors_sections.length);
  assert('CRUD1d: section name correct',
    db._data.vendors_sections[0]?.name === 'Local (Fort Wayne)');
}

// CRUD2: edit_section
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Old Name' })));
  const secId = db._data.vendors_sections[0].id;
  const resp2 = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'edit_section', id: secId, name: 'Regional' })));
  const body2 = await getBody(resp2);
  assert('CRUD2a: edit_section returns ok:true', body2.ok === true, JSON.stringify(body2));
  assert('CRUD2b: section name updated',
    db._data.vendors_sections[0]?.name === 'Regional',
    'got: ' + db._data.vendors_sections[0]?.name);
}

// CRUD3: add_item with valid company
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Local (Fort Wayne)' })));
  const secId = db._data.vendors_sections[0].id;
  const resp2 = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'add_item', section_id: secId,
    company: 'Fort Wayne Supply', category: 'Aggregate', phone: '260-555-0100',
  })));
  const body2 = await getBody(resp2);
  assert('CRUD3a: add_item returns ok:true', body2.ok === true, JSON.stringify(body2));
  assert('CRUD3b: add_item returns item.id', typeof body2.item?.id === 'string', JSON.stringify(body2));
  assert('CRUD3c: item stored in DB', db._data.vendors_items.length === 1);
  assert('CRUD3d: item company correct',
    db._data.vendors_items[0]?.company === 'Fort Wayne Supply');
}

// CRUD4: add_item rejects empty company
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Local' })));
  const secId = db._data.vendors_sections[0].id;
  const resp = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'add_item', section_id: secId, company: '', category: 'Steel',
  })));
  const body = await getBody(resp);
  assert('CRUD4: empty company returns 400',
    resp.status === 400 && !body.ok,
    'status=' + resp.status + ' ok=' + body.ok);
}

// CRUD5: edit_item
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Local' })));
  const secId = db._data.vendors_sections[0].id;
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'add_item', section_id: secId, company: 'ABC Inc', notes: 'original',
  })));
  const itemId = db._data.vendors_items[0].id;
  const resp = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'edit_item', id: itemId, company: 'ABC Inc Updated', notes: 'edited',
  })));
  const body = await getBody(resp);
  assert('CRUD5a: edit_item returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD5b: company updated',
    db._data.vendors_items[0]?.company === 'ABC Inc Updated');
  assert('CRUD5c: notes updated',
    db._data.vendors_items[0]?.notes === 'edited');
}

// CRUD6: delete_item
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Local' })));
  const secId = db._data.vendors_sections[0].id;
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'add_item', section_id: secId, company: 'ToDelete',
  })));
  assert('CRUD6-pre: item exists', db._data.vendors_items.length === 1);
  const itemId = db._data.vendors_items[0].id;
  const resp = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'delete_item', id: itemId,
  })));
  const body = await getBody(resp);
  assert('CRUD6a: delete_item returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD6b: item removed', db._data.vendors_items.length === 0);
}

// CRUD7: delete_section cascades to items
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'ToDelete' })));
  const secId = db._data.vendors_sections[0].id;
  for (const co of ['Item A', 'Item B']) {
    await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
      action: 'add_item', section_id: secId, company: co,
    })));
  }
  assert('CRUD7-pre: 2 items', db._data.vendors_items.length === 2);
  const resp = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'delete_section', id: secId,
  })));
  const body = await getBody(resp);
  assert('CRUD7a: delete_section ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD7b: section removed', db._data.vendors_sections.length === 0);
  assert('CRUD7c: items cascaded', db._data.vendors_items.length === 0);
}

// CRUD8: SQL parameterization (special chars stored safely)
{
  const db = makeDb();
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Test' })));
  const secId = db._data.vendors_sections[0].id;
  const dangerous = "O'Brien & Sons; DROP TABLE vendors_items; --";
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({
    action: 'add_item', section_id: secId, company: dangerous,
  })));
  assert('CRUD8: SQL special chars stored safely (not injected)',
    db._data.vendors_items.length === 1 &&
    db._data.vendors_items[0]?.company === dangerous,
    'stored: ' + db._data.vendors_items[0]?.company);
}

// CRUD9: seed only when empty; not re-seeded after edits
{
  const db = makeDb();
  // First call: table empty
  const r1 = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'seed' })));
  const b1 = await getBody(r1);
  assert('CRUD9a: seed on empty returns ok:true', b1.ok === true, JSON.stringify(b1));
  // The seed created 1 section ("Local (Fort Wayne)") + 7 items; add one more
  await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'add_section', name: 'Manual' })));
  assert('CRUD9b-pre: Derek can add section after seed (now 2 total)',
    db._data.vendors_sections.length === 2,
    'got ' + db._data.vendors_sections.length);
  // Second seed call: not empty → skipped
  const r3 = await onRequestPost(makeCtx(db, DEREK_UID, async () => ({ action: 'seed' })));
  const b3 = await getBody(r3);
  assert('CRUD9b: seed skipped when not empty',
    b3.ok === true && b3.seeded === false, JSON.stringify(b3));
  assert('CRUD9c: section count unchanged after skipped re-seed', db._data.vendors_sections.length === 2);
}

// CRUD10: me.js returns vendorsAllowed
{
  assert('CRUD10a: me.js imports vendorsAllowed',
    meSrc.includes('vendorsAllowed'), 'vendorsAllowed not in me.js');
  assert('CRUD10b: me.js response includes vendorsAllowed:',
    meSrc.includes('vendorsAllowed:'), 'vendorsAllowed: not in me.js response');
}

// CRUD11: vendors-seed.js content — real data, not placeholder
{
  const EXPECTED_COMPANIES = [
    'Geiger Machine',
    'H & S Fabrication, LLC',
    'Fastenal',
    'Applied Industrial Technologies',
    'Carter Welding Repair & Supplies Inc',
    'MacAllister Machinery (Fort Wayne Parts)',
    'Cummins Sales and Service (Fort Wayne Branch)',
  ];

  assert('CRUD11a: seed has exactly 7 entries',
    VENDORS_SEED.length === 7, 'got ' + VENDORS_SEED.length);

  assert('CRUD11b: seed companies match expected list (file order)',
    EXPECTED_COMPANIES.every((co, i) => VENDORS_SEED[i]?.company === co),
    JSON.stringify(VENDORS_SEED.map(v => v.company)));

  assert('CRUD11c: no placeholder / test data in seed',
    VENDORS_SEED.every(v =>
      !/example|sample|test|lorem/i.test(v.company || '') &&
      !/example|sample|test|lorem/i.test(v.notes || '')
    ), 'found placeholder in: ' + JSON.stringify(VENDORS_SEED.map(v => v.company)));

  assert('CRUD11d: all seed entries have section_name "Local (Fort Wayne)"',
    VENDORS_SEED.every(v => v.section_name === 'Local (Fort Wayne)'));

  assert('CRUD11e: all seed entries have a phone number',
    VENDORS_SEED.every(v => typeof v.phone === 'string' && v.phone.length > 5),
    'missing phone: ' + JSON.stringify(VENDORS_SEED.filter(v => !v.phone).map(v => v.company)));

  assert('CRUD11f: no dollar totals / invoice numbers / SharePoint IDs in seed notes',
    VENDORS_SEED.every(v => {
      const n = (v.notes || '');
      // no $ amounts, no SharePoint item IDs (016ISVH...), no "Inv \d+"
      return !n.includes('$') && !/016[A-Z0-9]{30,}/i.test(n) && !/\bInv\s+\d+/i.test(n);
    }), 'internal data leaked to seed notes');
}

// ============================================================================
// S  Static analysis
// ============================================================================
console.log('\n--- S. Static analysis ---');
{
  const src = readFileSync(path.join(root, 'vendors.html'), 'utf8');

  assert("S1: #main revealed with display='block' (not display='')",
    src.includes("style.display = 'block'") || src.includes('style.display="block"'));

  assert("S2: #main NOT set with display=''",
    !src.includes("getElementById('main').style.display = ''") &&
    !src.includes('getElementById("main").style.display = ""'));

  assert('S3: vendors.html has static topbar (not pfBuildHeader)',
    src.includes('id="topbar"') && !src.includes('pfBuildHeader'));

  assert('S4: pfNav present', src.includes('id="pfNav"'));

  assert('S5: vnNavItem present on vendors.html',
    src.includes('id="vnNavItem"'));

  // On vendors.html itself, vnNavItem must NOT have display:none (this IS the vendors page)
  assert('S6: vnNavItem on vendors.html has no display:none (always visible)',
    (() => {
      const idx = src.indexOf('id="vnNavItem"');
      if (idx < 0) return false;
      const tagStart = src.lastIndexOf('<a ', idx);
      const tagEnd = src.indexOf('>', tagStart);
      const tag = src.slice(tagStart, tagEnd + 1);
      return !tag.includes('display:none') && !tag.includes('display: none');
    })());

  // hwNavItem on vendors.html should start hidden (vendors is NOT the hardware page)
  assert('S7: hwNavItem on vendors.html starts hidden (display:none)',
    (() => {
      const idx = src.indexOf('id="hwNavItem"');
      if (idx < 0) return false;
      const tagStart = src.lastIndexOf('<a ', idx);
      const tagEnd = src.indexOf('>', tagStart);
      const tag = src.slice(tagStart, tagEnd + 1);
      return tag.includes('display:none');
    })());

  assert('S8: vendors.html fetches /api/vendors', src.includes('/api/vendors'));
  assert('S9: vendors.html fetches /api/me', src.includes('/api/me'));
  assert('S10: no UID literals in vendors.html client code', !src.includes('518075f1'));

  assert('S11: vendors-access.js exports VENDORS_EDITORS (write-gate flag)',
    readFileSync(path.join(root, 'functions/lib/vendors-access.js'), 'utf8')
      .includes('VENDORS_EDITORS'));

  assert('S12: vendors.html uses textContent for card rendering (XSS safety)',
    src.includes('textContent'));

  // Verify vnNavItem is added to all 12 existing pages
  const otherPages = [
    'index.html', 'daily-report.html', 'equipment-inspection.html',
    'site-readiness.html', 'toolbox-talk.html', 'past-reports.html',
    'cost-codes.html', 'schedule.html', 'time-off.html', 'sops.html',
    'mailing-lists.html', 'hardware.html',
  ];
  for (const pg of otherPages) {
    const pgSrc = readFileSync(path.join(root, pg), 'utf8');
    assert('S13-nav[' + pg + ']: vnNavItem in nav',
      pgSrc.includes('id="vnNavItem"'), 'missing in ' + pg);

    const vnIdx = pgSrc.indexOf('id="vnNavItem"');
    if (vnIdx >= 0) {
      const tagStart = pgSrc.lastIndexOf('<a ', vnIdx);
      const tagEnd = pgSrc.indexOf('>', tagStart);
      const tag = pgSrc.slice(tagStart, tagEnd + 1);
      assert('S14-hidden[' + pg + ']: vnNavItem starts hidden on ' + pg,
        tag.includes('display:none'), 'tag: ' + tag.slice(0, 100));
    }

    assert('S15-reveal[' + pg + ']: vendorsAllowed reveal present in ' + pg,
      pgSrc.includes('vendorsAllowed'), 'vendorsAllowed not in ' + pg);
  }
}

// ============================================================================
// P-AUTH  Page /api/me auth init: hwNavItem + vnNavItem visibility + no-crash
// ============================================================================
console.log('\n--- P-AUTH. Page auth init (hwNavItem + vnNavItem visibility + no crash) ---');
{
  const ALL_FIELD_PAGES = [
    'index.html', 'cost-codes.html', 'daily-report.html', 'equipment-inspection.html',
    'mailing-lists.html', 'past-reports.html', 'schedule.html', 'site-readiness.html',
    'sops.html', 'time-off.html', 'toolbox-talk.html', 'hardware.html', 'vendors.html',
  ];

  async function runPageAuthInit(pageFile, hwFlag, vnFlag) {
    const pageSrc = readFileSync(path.join(root, pageFile), 'utf8');
    let html = pageSrc
      .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
      .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

    const mePayload = {
      ok: true, status: 'ok',
      uid: DEREK_UID, name: 'Derek Franke', role: 'admin',
      email: 'dfranke@pierfoundations.com',
      hardwareAllowed: hwFlag,
      vendorsAllowed:  vnFlag,
    };

    const dom = new JSDOM(html, {
      url: 'https://field.pierfoundations.com/' + pageFile,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async function(url) {
          if (String(url).includes('/api/me')) {
            return { ok: true, status: 200, json: async () => mePayload };
          }
          return { ok: true, status: 200, json: async () => ({
            ok: true, status: 'ok', diagrams: [], absences: [], items: [],
            users: [], projects: [], records: [], lists: {}, sections: [],
          })};
        };
        const store = {};
        try {
          Object.defineProperty(window, 'localStorage', {
            value: {
              getItem: k => store[k] ?? null,
              setItem: (k,v) => { store[k] = String(v); },
              removeItem: k => { delete store[k]; },
              clear: () => { Object.keys(store).forEach(k => delete store[k]); },
              key: i => Object.keys(store)[i] ?? null,
              get length() { return Object.keys(store).length; },
            }, writable: true, configurable: true,
          });
        } catch (e) {}
        window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
      },
    });

    for (let i = 0; i < 50; i++) await new Promise(r => setTimeout(r, 10));
    return dom;
  }

  for (const pageFile of ALL_FIELD_PAGES) {
    const tag = 'P-AUTH-' + pageFile.replace('.html', '');

    // --- both flags true ---
    {
      let dom = null, exc = null;
      try { dom = await runPageAuthInit(pageFile, true, true); }
      catch (e) { exc = e; }

      assert(tag + '[vn=true]: no exception during page init',
        exc === null, exc ? String(exc).slice(0, 120) : '');

      if (dom) {
        const doc = dom.window.document;
        const mainEl  = doc.getElementById('main');
        const vnNavEl = doc.getElementById('vnNavItem');

        // KEY REGRESSION CHECK: ReferenceError in init handler leaves #main hidden
        assert(tag + '[vn=true]: #main shown after auth',
          mainEl != null && mainEl.style.display === 'block',
          '#main.style.display=' + (mainEl ? '"' + mainEl.style.display + '"' : 'NOT FOUND'));

        assert(tag + '[vn=true]: vnNavItem present in DOM',
          vnNavEl != null, 'vnNavItem not found in ' + pageFile);

        if (vnNavEl) {
          assert(tag + '[vn=true]: vnNavItem visible (display not "none")',
            vnNavEl.style.display !== 'none',
            'display="' + vnNavEl.style.display + '"');
        }
        dom.window.close();
      }
    }

    // --- both flags false (skip vendors.html — vnNavItem always visible there) ---
    if (pageFile !== 'vendors.html') {
      let dom = null, exc = null;
      try { dom = await runPageAuthInit(pageFile, false, false); }
      catch (e) { exc = e; }

      assert(tag + '[vn=false]: no exception during page init',
        exc === null, exc ? String(exc).slice(0, 120) : '');

      if (dom) {
        const doc = dom.window.document;
        const vnNavEl = doc.getElementById('vnNavItem');
        assert(tag + '[vn=false]: vnNavItem stays hidden',
          vnNavEl != null && vnNavEl.style.display === 'none',
          'display="' + (vnNavEl ? vnNavEl.style.display : 'NOT FOUND') + '"');
        dom.window.close();
      }
    }
  }
}

// ============================================================================
// CLICK  Click tests: add, edit, delete flows
// ============================================================================
console.log('\n--- CLICK. Click tests (add / edit / delete) ---');
{
  const pageSrc = readFileSync(path.join(root, 'vendors.html'), 'utf8');
  let html = pageSrc
    .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
    .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

  const fakeSection = { id: 'sec-001', name: 'Local (Fort Wayne)', sort_order: 0 };
  const fakeItem = {
    id: 'item-001', section_id: 'sec-001', company: 'Test Supply Co',
    category: 'Aggregate', contact: 'Jane', phone: '260-555-0100',
    address: '123 Main St', website: 'https://test.com',
    account_num: 'PF-001', notes: 'test notes',
    sort_order: 0, updated_by: null, updated_at: null,
  };

  const mePayload = {
    ok: true, status: 'ok',
    uid: DEREK_UID, name: 'Derek Franke', role: 'admin',
    email: 'dfranke@pierfoundations.com',
    hardwareAllowed: true, vendorsAllowed: true,
  };

  let fetchCalls = [];

  async function makeVendorsDom() {
    fetchCalls = [];
    const dom = new JSDOM(html, {
      url: 'https://field.pierfoundations.com/vendors.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async function(url, opts) {
          const rec = { url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body };
          fetchCalls.push(rec);
          if (rec.url.includes('/api/me')) {
            return { ok: true, status: 200, json: async () => mePayload };
          }
          if (rec.url.includes('/api/vendors')) {
            if (rec.method === 'POST') {
              let bd = {};
              try { bd = JSON.parse(rec.body); } catch {}
              if (bd.action === 'seed')      return { ok: true, json: async () => ({ ok:true, seeded:false }) };
              if (bd.action === 'add_item')  return { ok: true, json: async () => ({ ok:true, item:{...fakeItem,id:'item-new',company:bd.company} }) };
              if (bd.action === 'edit_item') return { ok: true, json: async () => ({ ok:true }) };
              if (bd.action === 'delete_item') return { ok: true, json: async () => ({ ok:true }) };
            }
            return { ok: true, json: async () => ({
              ok: true, sections: [fakeSection], items: { 'sec-001': [fakeItem] },
            })};
          }
          return { ok: true, json: async () => ({}) };
        };
        const store = {};
        try {
          Object.defineProperty(window, 'localStorage', {
            value: {
              getItem: k => store[k] ?? null,
              setItem: (k,v) => { store[k] = String(v); },
              removeItem: k => { delete store[k]; },
              clear: () => { Object.keys(store).forEach(k => delete store[k]); },
              key: i => Object.keys(store)[i] ?? null,
              get length() { return Object.keys(store).length; },
            }, writable: true, configurable: true,
          });
        } catch (e) {}
        window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
      },
    });
    for (let i = 0; i < 60; i++) await new Promise(r => setTimeout(r, 10));
    return dom;
  }

  // CLICK1: Add vendor button → save fires POST with correct body
  {
    let dom = null, exc = null;
    try { dom = await makeVendorsDom(); } catch (e) { exc = e; }
    assert('CLICK1a: vendors.html loads without exception',
      exc === null, exc ? String(exc).slice(0, 120) : '');

    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;
      assert('CLICK1b: #main shown', doc.getElementById('main')?.style.display === 'block');

      fetchCalls = [];
      win.vnOpenAdd && win.vnOpenAdd();
      assert('CLICK1c: sheet opened', doc.getElementById('vnSheet')?.classList.contains('open'));

      doc.getElementById('vnFldCompany').value  = 'New Vendor LLC';
      doc.getElementById('vnFldCategory').value = 'Hardware';
      doc.getElementById('vnFldPhone').value    = '260-999-0000';

      fetchCalls = [];
      win.vnSaveItem && win.vnSaveItem();
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/vendors'));
      assert('CLICK1d: save fires one POST to /api/vendors', postCall != null,
        'calls=' + JSON.stringify(fetchCalls.map(c => c.method + ' ' + c.url)));

      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK1e: body has action=add_item',    bd.action === 'add_item',      'action=' + bd.action);
        assert('CLICK1f: body has company',            bd.company === 'New Vendor LLC', 'company=' + bd.company);
        assert('CLICK1g: body has category',           bd.category === 'Hardware',    'category=' + bd.category);
        assert('CLICK1h: body has section_id',         typeof bd.section_id === 'string', 'section_id=' + bd.section_id);
      }
      dom.window.close();
    }
  }

  // CLICK2: Edit opens sheet pre-filled; save calls edit_item
  {
    let dom = null, exc = null;
    try { dom = await makeVendorsDom(); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;

      fetchCalls = [];
      win.vnOpenEdit && win.vnOpenEdit({
        id: 'item-001', company: 'Test Supply Co', category: 'Aggregate',
        contact: 'Jane', phone: '260-555-0100', address: '123 Main St',
        website: 'https://test.com', account_num: 'PF-001', notes: 'test',
      });

      assert('CLICK2a: edit sheet opened', doc.getElementById('vnSheet')?.classList.contains('open'));
      assert('CLICK2b: company pre-filled',
        doc.getElementById('vnFldCompany')?.value === 'Test Supply Co',
        'value=' + doc.getElementById('vnFldCompany')?.value);

      doc.getElementById('vnFldCompany').value = 'Test Supply Co Updated';
      fetchCalls = [];
      win.vnSaveItem && win.vnSaveItem();
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/vendors'));
      assert('CLICK2c: edit fires POST', postCall != null);
      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK2d: body action=edit_item',  bd.action === 'edit_item',   'action=' + bd.action);
        assert('CLICK2e: body id correct',         bd.id === 'item-001',       'id=' + bd.id);
        assert('CLICK2f: body updated company',    bd.company === 'Test Supply Co Updated', 'company=' + bd.company);
      }
      dom.window.close();
    }
  }

  // CLICK3: Delete confirm fires delete_item
  {
    let dom = null, exc = null;
    try { dom = await makeVendorsDom(); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;

      win.vnConfirmDelete && win.vnConfirmDelete('item', 'item-001', 'Test Supply Co');
      assert('CLICK3a: delete confirm opened',
        doc.getElementById('vnConfirmBackdrop')?.classList.contains('open'));

      fetchCalls = [];
      win.vnDoDelete && win.vnDoDelete();
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/vendors'));
      assert('CLICK3b: delete fires POST', postCall != null,
        'calls=' + JSON.stringify(fetchCalls.map(c => c.method + ' ' + c.url)));
      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK3c: body action=delete_item', bd.action === 'delete_item', 'action=' + bd.action);
        assert('CLICK3d: body id correct',         bd.id === 'item-001',        'id=' + bd.id);
      }
      dom.window.close();
    }
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
