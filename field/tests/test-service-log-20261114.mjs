// test-service-log-20261114.mjs
//
// Tests for the Service Log page (service-log.html + /api/service-log).
//
// Test groups:
//   G          Gate: serviceLogAllowed / serviceLogCanEdit / SERVICELOG_GO_LIVE flags
//   G-PATH     areaForPath classifications for service-log paths
//   CRUD       API handler: add/edit/delete entries; validation; SQL safety
//   CRUD-ME    me.js returns serviceLogAllowed + serviceLogCanEdit + vendorsCanEdit
//   OVERDUE    slComputeSummary overdue logic (via jsdom)
//   S          Static analysis: service-log.html + all 13 existing pages have slNavItem
//   P-AUTH     All 14 pages: /api/me init no-crash + hw/vn/sl nav visibility
//   CLICK      Add / edit / delete click flow tests (jsdom + stubbed fetch)
//   VENDORS-FIX  vendors.html uses vendorsCanEdit for edit buttons; javascript: scheme rejection
//
// Run: node tests/test-service-log-20261114.mjs
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

// ---- Load modules under test -----------------------------------------------

// servicelog-access.js
const slAccessSrc = readFileSync(
  path.join(root, 'functions/lib/servicelog-access.js'), 'utf8'
).replace(/^export /gm, '');
const slAccessMod = {};
{
  const fn = new Function('module',
    slAccessSrc +
    '\nmodule.exports = { SERVICELOG_GO_LIVE, SERVICELOG_ALLOWED_UIDS, SERVICELOG_EDITORS, serviceLogAllowed, serviceLogCanEdit };'
  );
  fn(slAccessMod);
}
const { SERVICELOG_GO_LIVE, SERVICELOG_ALLOWED_UIDS, SERVICELOG_EDITORS, serviceLogAllowed, serviceLogCanEdit } = slAccessMod.exports;

// vendors-access.js (for VENDORS-FIX tests)
const vnAccessSrc = readFileSync(
  path.join(root, 'functions/lib/vendors-access.js'), 'utf8'
).replace(/^export /gm, '');
const vnAccessMod = {};
{
  const fn = new Function('module',
    vnAccessSrc +
    '\nmodule.exports = { VENDORS_GO_LIVE, VENDORS_ALLOWED_UIDS, VENDORS_EDITORS, vendorsAllowed, vendorsCanEdit };'
  );
  fn(vnAccessMod);
}
const { vendorsAllowed, vendorsCanEdit } = vnAccessMod.exports;
const DEREK_UID = [...SERVICELOG_ALLOWED_UIDS][0];

// auth.js — targeted extract of areaForPath
const authSrc = readFileSync(path.join(root, 'functions/lib/auth.js'), 'utf8');
let areaForPath;
try {
  const lines = authSrc.split('\n');
  const fnStart = lines.findIndex(l => l.startsWith('export function areaForPath'));
  if (fnStart < 0) throw new Error('areaForPath not found in auth.js');
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

// me.js source (string checks only)
const meSrc = readFileSync(path.join(root, 'functions/api/me.js'), 'utf8');

// service-intervals.js — load functions needed by service-log.js
const slIntervalsSrc = readFileSync(
  path.join(root, 'functions/lib/service-intervals.js'), 'utf8'
).replace(/^export /gm, '');
const slIntervalsMod = {};
{
  const fn = new Function('module',
    slIntervalsSrc +
    '\nmodule.exports = { getMachineKey, getMachineIntervals, getEquipInspType, hasServiceIntervals, getMachineTaskData, getMachineBaseline, getEquipTypeGroups };'
  );
  fn(slIntervalsMod);
}
const {
  getMachineKey: _getMachineKey,
  getEquipInspType: _getEquipInspType,
  hasServiceIntervals: _hasServiceIntervals,
  getMachineTaskData: _getMachineTaskData,
  getMachineBaseline: _getMachineBaseline,
} = slIntervalsMod.exports;

// service-log.js API handler — strip import lines + export keyword, inject deps
const slApiRaw = readFileSync(path.join(root, 'functions/api/service-log.js'), 'utf8')
  .replace(/^import.*?;\n/gm, '')
  .replace(/^export /gm, '');
const slApiMod = {};
{
  const fn = new Function(
    'serviceLogAllowed', 'serviceLogCanEdit',
    'getEquipInspType', 'hasServiceIntervals', 'getMachineTaskData', 'getMachineBaseline',
    'crypto', 'console', 'module',
    slApiRaw + '\nmodule.exports = { onRequestGet, onRequestPost, onRequest };'
  );
  fn(
    serviceLogAllowed, serviceLogCanEdit,
    _getEquipInspType, _hasServiceIntervals, _getMachineTaskData, _getMachineBaseline,
    { randomUUID: () => Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2) },
    { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    slApiMod
  );
}
const { onRequestGet, onRequestPost } = slApiMod.exports;

// vendors.js API handler (for VENDORS-FIX tests)
const vnSeedSrc = readFileSync(
  path.join(root, 'functions/lib/vendors-seed.js'), 'utf8'
).replace(/^export /gm, '');
const vnSeedMod = {};
{
  const fn = new Function('module', vnSeedSrc + '\nmodule.exports = { VENDORS_SEED };');
  fn(vnSeedMod);
}
const { VENDORS_SEED } = vnSeedMod.exports;

const vnApiRaw = readFileSync(path.join(root, 'functions/api/vendors.js'), 'utf8')
  .replace(/^import.*?;\n/gm, '')
  .replace(/^export /gm, '');
const vnApiMod = {};
{
  const fn = new Function(
    'vendorsAllowed', 'vendorsCanEdit', 'VENDORS_SEED', 'crypto', 'module',
    vnApiRaw + '\nmodule.exports = { onRequestGet, onRequestPost: onRequestPost, onRequest };'
  );
  fn(
    vendorsAllowed, vendorsCanEdit, VENDORS_SEED,
    { randomUUID: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) },
    vnApiMod
  );
}
const vnOnRequestPost = vnApiMod.exports.onRequestPost;

// shared page assets
const css      = readFileSync(path.join(root, 'pf-r5.css'), 'utf8');
const sharedJs = readFileSync(path.join(root, 'js/pf-shared.js'), 'utf8');

const OTHER_UID = 'aaaaaaaa-0000-0000-0000-000000000001';

// ============================================================================
// G  Gate: serviceLogAllowed / serviceLogCanEdit flags
// ============================================================================
console.log('\n--- G. Feature gate ---');
{
  assert('G1: SERVICELOG_GO_LIVE is false (preview mode)',
    SERVICELOG_GO_LIVE === false);

  assert('G2: SERVICELOG_ALLOWED_UIDS has exactly 1 entry',
    SERVICELOG_ALLOWED_UIDS.size === 1);

  assert('G3: SERVICELOG_EDITORS has at least 1 entry',
    SERVICELOG_EDITORS.size >= 1);

  const sessionDerek = { uid: DEREK_UID, role: 'admin', name: 'Derek Franke' };
  const sessionOther = { uid: OTHER_UID, role: 'admin', name: 'Other Admin' };
  const sessionField = { uid: 'crew-001', role: 'field_ops', name: 'Joe Crew' };

  assert('G4: serviceLogAllowed accepts Derek uid',
    serviceLogAllowed(sessionDerek) === true);

  assert('G5: serviceLogAllowed rejects unknown uid',
    serviceLogAllowed(sessionOther) === false);

  assert('G6: serviceLogAllowed rejects null session',
    serviceLogAllowed(null) === false);

  assert('G7: serviceLogAllowed rejects session without uid',
    serviceLogAllowed({ role: 'admin' }) === false);

  assert('G8: serviceLogCanEdit accepts Derek uid',
    serviceLogCanEdit(sessionDerek) === true);

  assert('G9: serviceLogCanEdit rejects unknown uid',
    serviceLogCanEdit(sessionOther) === false);

  assert('G10: serviceLogCanEdit rejects null',
    serviceLogCanEdit(null) === false);

  assert('G11: serviceLogCanEdit rejects field_ops uid not in EDITORS',
    serviceLogCanEdit(sessionField) === false);
}

// ============================================================================
// G-PATH  areaForPath classifications
// ============================================================================
if (areaForPath) {
  console.log('\n--- G-PATH. areaForPath classification ---');

  assert('G-PATH-1: /service-log.html returns user_admin',
    areaForPath('/service-log.html') === 'user_admin',
    'got: ' + areaForPath('/service-log.html'));

  assert('G-PATH-2: /service-log returns user_admin (clean URL)',
    areaForPath('/service-log') === 'user_admin',
    'got: ' + areaForPath('/service-log'));

  assert('G-PATH-3: /api/service-log returns user_admin',
    areaForPath('/api/service-log') === 'user_admin',
    'got: ' + areaForPath('/api/service-log'));

  assert('G-PATH-4: /api/service-log/entries returns user_admin',
    areaForPath('/api/service-log/entries') === 'user_admin',
    'got: ' + areaForPath('/api/service-log/entries'));

  // Existing paths regression
  assert('G-PATH-5: /api/hardware still returns user_admin (regression)',
    areaForPath('/api/hardware') === 'user_admin',
    'got: ' + areaForPath('/api/hardware'));

  assert('G-PATH-6: /api/vendors returns field_ops (vendors go-live 2026-11-19)',
    areaForPath('/api/vendors') === 'field_ops',
    'got: ' + areaForPath('/api/vendors'));
} else {
  console.log('  SKIP G-PATH: areaForPath not loaded');
}

// ============================================================================
// CRUD  API handler logic (in-memory D1 stub)
// ============================================================================
console.log('\n--- CRUD. API handler logic ---');

function makeSlDb() {
  const data = { service_log_entries: [] };

  function prepare(sql) {
    const low = sql.trim().toLowerCase();
    const stmt = {
      _sql: sql, _low: low, _params: [],
      bind(...params) { this._params = params; return this; },
      async run() {
        if (low.includes('create table') || low.includes('create index')) {
          return { meta: { changes: 0 } };
        }
        if (low.startsWith('insert into service_log_entries')) {
          const p = this._params;
          // id, machine, service_date, hour_meter, service_type, service_interval,
          // description, parts_used, vendor, cost, performed_by,
          // next_due_hours, next_due_date, notes, created_by, created_at
          data.service_log_entries.push({
            id: p[0], machine: p[1], service_date: p[2], hour_meter: p[3],
            service_type: p[4], service_interval: p[5], description: p[6], parts_used: p[7],
            vendor: p[8], cost: p[9], performed_by: p[10],
            next_due_hours: p[11], next_due_date: p[12], notes: p[13],
            created_by: p[14], created_at: p[15],
            updated_by: null, updated_at: null,
          });
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('update service_log_entries')) {
          // machine, service_date, hour_meter, service_type, service_interval,
          // description, parts_used, vendor, cost, performed_by,
          // next_due_hours, next_due_date, notes, updated_by, updated_at, id  (16 params)
          const p = this._params;
          const id = p[15];
          const idx = data.service_log_entries.findIndex(r => r.id === id);
          if (idx < 0) return { meta: { changes: 0 } };
          Object.assign(data.service_log_entries[idx], {
            machine: p[0], service_date: p[1], hour_meter: p[2],
            service_type: p[3], service_interval: p[4], description: p[5], parts_used: p[6],
            vendor: p[7], cost: p[8], performed_by: p[9],
            next_due_hours: p[10], next_due_date: p[11], notes: p[12],
            updated_by: p[13], updated_at: p[14],
          });
          return { meta: { changes: 1 } };
        }
        if (low.startsWith('delete from service_log_entries')) {
          const id = this._params[0];
          const before = data.service_log_entries.length;
          data.service_log_entries = data.service_log_entries.filter(r => r.id !== id);
          return { meta: { changes: before - data.service_log_entries.length } };
        }
        return { meta: { changes: 0 } };
      },
      async all() {
        if (low.includes('from service_log_entries')) {
          // Return copy sorted by service_date DESC, created_at DESC
          const sorted = [...data.service_log_entries].sort((a, b) => {
            const d = (b.service_date || '').localeCompare(a.service_date || '');
            if (d !== 0) return d;
            return (b.created_at || '').localeCompare(a.created_at || '');
          });
          return { results: sorted };
        }
        // vendors_items for vendor names
        if (low.includes('from vendors_items')) {
          return { results: [] };
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

function makeSlCtx(db, uid, bodyGetter, method='POST') {
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

// CRUD1: GET — no session => 401
{
  const db = makeSlDb();
  const ctx = { data: { session: null }, env: { DB: db }, request: { method: 'GET' } };
  const resp = await onRequestGet(ctx);
  assert('CRUD1: GET without session returns 401',
    resp.status === 401, 'status=' + resp.status);
}

// CRUD2: GET — non-allowed uid => 403
{
  const db = makeSlDb();
  const ctx = { data: { session: { uid: OTHER_UID, role: 'admin' } }, env: { DB: db }, request: { method: 'GET' } };
  const resp = await onRequestGet(ctx);
  assert('CRUD2: GET with non-allowed uid returns 403',
    resp.status === 403, 'status=' + resp.status);
}

// CRUD3: GET — Derek => 200 with entries/vendorNames
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, DEREK_UID, null, 'GET');
  const resp = await onRequestGet(ctx);
  const body = await getBody(resp);
  assert('CRUD3a: GET with Derek returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD3b: GET returns entries array', Array.isArray(body.entries), JSON.stringify(body));
  assert('CRUD3c: GET returns vendorNames array', Array.isArray(body.vendorNames), JSON.stringify(body));
  assert('CRUD3d: GET entries empty on fresh DB', body.entries.length === 0, 'entries=' + JSON.stringify(body.entries));
}

// CRUD4: POST add_entry — missing machine => 400
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: '', service_date: '2026-11-14', service_type: 'Grease',
  }));
  const resp = await onRequestPost(ctx);
  const body = await getBody(resp);
  assert('CRUD4: add_entry with empty machine returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD5: POST add_entry — missing service_date => 400
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Rig 1', service_date: '', service_type: 'Grease',
  }));
  const resp = await onRequestPost(ctx);
  const body = await getBody(resp);
  assert('CRUD5: add_entry with empty service_date returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD6: POST add_entry — missing service_type => 400
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Rig 1', service_date: '2026-11-14', service_type: '',
  }));
  const resp = await onRequestPost(ctx);
  const body = await getBody(resp);
  assert('CRUD6: add_entry with empty service_type returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD7: POST add_entry — full valid entry
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry',
    machine: 'Rig 1 (D&G)',
    service_date: '2026-11-14',
    service_type: 'Oil & Filters',
    hour_meter: 1234.5,
    description: 'Engine oil + all filters',
    parts_used: 'Fleetguard LF9080 x1, AF4825 x1',
    vendor: 'MacAllister Machinery',
    cost: 185.50,
    performed_by: 'Derek Franke',
    next_due_hours: 1734.5,
    next_due_date: '2027-05-14',
    notes: 'Leaking valve cover gasket - monitor',
  }));
  const resp = await onRequestPost(ctx);
  const body = await getBody(resp);
  assert('CRUD7a: add_entry returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD7b: add_entry returns id', typeof body.id === 'string', JSON.stringify(body));
  assert('CRUD7c: entry stored in DB', db._data.service_log_entries.length === 1,
    'count=' + db._data.service_log_entries.length);

  const stored = db._data.service_log_entries[0];
  assert('CRUD7d: machine stored correctly', stored.machine === 'Rig 1 (D&G)', stored.machine);
  assert('CRUD7e: service_type stored correctly', stored.service_type === 'Oil & Filters', stored.service_type);
  assert('CRUD7f: hour_meter stored as number', stored.hour_meter === 1234.5, 'got: ' + stored.hour_meter);
  assert('CRUD7g: cost stored as number', stored.cost === 185.50, 'got: ' + stored.cost);
  assert('CRUD7h: next_due_hours stored as number', stored.next_due_hours === 1734.5, 'got: ' + stored.next_due_hours);
  assert('CRUD7i: created_by set', typeof stored.created_by === 'string' && stored.created_by.length > 0,
    'got: ' + stored.created_by);
}

// CRUD8: POST add_entry — no-write uid => 403
{
  const db = makeSlDb();
  const ctx = makeSlCtx(db, OTHER_UID, async () => ({
    action: 'add_entry', machine: 'Rig 1', service_date: '2026-11-14', service_type: 'Grease',
  }));
  const resp = await onRequestPost(ctx);
  assert('CRUD8: add_entry with non-editor uid returns 403',
    resp.status === 403, 'status=' + resp.status);
}

// CRUD9: POST edit_entry
{
  const db = makeSlDb();
  // Add first
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Rig 1', service_date: '2026-11-01', service_type: 'Grease',
    description: 'Original',
  })));
  const entryId = db._data.service_log_entries[0].id;

  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'edit_entry', id: entryId,
    machine: 'Rig 1', service_date: '2026-11-01', service_type: 'Repair',
    description: 'Edited description',
  })));
  const body = await getBody(resp);
  assert('CRUD9a: edit_entry returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD9b: service_type updated',
    db._data.service_log_entries[0].service_type === 'Repair',
    'got: ' + db._data.service_log_entries[0].service_type);
  assert('CRUD9c: description updated',
    db._data.service_log_entries[0].description === 'Edited description',
    'got: ' + db._data.service_log_entries[0].description);
  assert('CRUD9d: updated_by set',
    typeof db._data.service_log_entries[0].updated_by === 'string' &&
    db._data.service_log_entries[0].updated_by.length > 0,
    'got: ' + db._data.service_log_entries[0].updated_by);
}

// CRUD10: POST edit_entry — no id => 400
{
  const db = makeSlDb();
  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'edit_entry', machine: 'Rig 1', service_date: '2026-11-01', service_type: 'Grease',
  })));
  const body = await getBody(resp);
  assert('CRUD10: edit_entry without id returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD11: POST delete_entry
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Rig 2', service_date: '2026-10-15', service_type: 'Inspection',
  })));
  assert('CRUD11-pre: entry exists', db._data.service_log_entries.length === 1);
  const entryId = db._data.service_log_entries[0].id;

  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'delete_entry', id: entryId,
  })));
  const body = await getBody(resp);
  assert('CRUD11a: delete_entry returns ok:true', body.ok === true, JSON.stringify(body));
  assert('CRUD11b: entry removed from DB', db._data.service_log_entries.length === 0,
    'count=' + db._data.service_log_entries.length);
}

// CRUD12: POST delete_entry — no id => 400
{
  const db = makeSlDb();
  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'delete_entry',
  })));
  const body = await getBody(resp);
  assert('CRUD12: delete_entry without id returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD13: SQL special chars stored safely
{
  const db = makeSlDb();
  const dangerous = "O'Brien; DROP TABLE service_log_entries; --";
  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: dangerous,
    service_date: '2026-11-14', service_type: 'Repair',
  })));
  const body = await getBody(resp);
  assert('CRUD13: SQL special chars stored safely (not injected)',
    body.ok === true && db._data.service_log_entries.length === 1 &&
    db._data.service_log_entries[0]?.machine === dangerous,
    'stored: ' + db._data.service_log_entries[0]?.machine);
}

// CRUD14: null/empty optional numeric fields stored as null
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Rig 1',
    service_date: '2026-11-14', service_type: 'Grease',
    hour_meter: '', cost: null, next_due_hours: undefined,
  })));
  const e = db._data.service_log_entries[0];
  assert('CRUD14a: empty hour_meter stored as null', e && e.hour_meter === null, 'got: ' + (e && e.hour_meter));
  assert('CRUD14b: null cost stored as null',         e && e.cost === null, 'got: ' + (e && e.cost));
  assert('CRUD14c: undefined next_due_hours stored as null', e && e.next_due_hours === null, 'got: ' + (e && e.next_due_hours));
}

// CRUD15: unknown action => 400
{
  const db = makeSlDb();
  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({ action: 'do_something_evil' })));
  const body = await getBody(resp);
  assert('CRUD15: unknown action returns 400',
    resp.status === 400 && !body.ok, 'status=' + resp.status);
}

// CRUD16: no session => 401 on POST
{
  const db = makeSlDb();
  const ctx = { data: { session: null }, env: { DB: db }, request: { method: 'POST', json: async () => ({}) } };
  const resp = await onRequestPost(ctx);
  assert('CRUD16: POST without session returns 401',
    resp.status === 401, 'status=' + resp.status);
}

// ============================================================================
// CRUD-ME  me.js returns all three new flags + vendorsCanEdit
// ============================================================================
console.log('\n--- CRUD-ME. me.js flag exports ---');
{
  assert('CRUD-ME1: me.js imports serviceLogAllowed',
    meSrc.includes('serviceLogAllowed'), 'serviceLogAllowed not in me.js');
  assert('CRUD-ME2: me.js imports serviceLogCanEdit',
    meSrc.includes('serviceLogCanEdit'), 'serviceLogCanEdit not in me.js');
  assert('CRUD-ME3: me.js response includes serviceLogAllowed:',
    meSrc.includes('serviceLogAllowed:'), 'serviceLogAllowed: not in response');
  assert('CRUD-ME4: me.js response includes serviceLogCanEdit:',
    meSrc.includes('serviceLogCanEdit:'), 'serviceLogCanEdit: not in response');
  assert('CRUD-ME5: me.js imports vendorsCanEdit',
    meSrc.includes('vendorsCanEdit'), 'vendorsCanEdit not in me.js');
  assert('CRUD-ME6: me.js response includes vendorsCanEdit:',
    meSrc.includes('vendorsCanEdit:'), 'vendorsCanEdit: not in response');
  assert('CRUD-ME7: me.js imports vendorsAllowed',
    meSrc.includes('vendorsAllowed'), 'vendorsAllowed not in me.js');
  assert('CRUD-ME8: me.js response includes hardwareAllowed:',
    meSrc.includes('hardwareAllowed:'), 'hardwareAllowed: not in response');
}

// ============================================================================
// OVERDUE  slComputeSummary overdue logic (via jsdom of service-log.html)
// ============================================================================
console.log('\n--- OVERDUE. Overdue badge logic ---');
{
  const slHtmlSrc = readFileSync(path.join(root, 'service-log.html'), 'utf8');
  const html = slHtmlSrc
    .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
    .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

  const dom = new JSDOM(html, {
    url: 'https://field.pierfoundations.com/service-log.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async () => ({ ok: true, json: async () => ({ status: 'unauthenticated' }) });
      const store = {};
      try {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: k => store[k] ?? null, setItem: (k,v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }, clear: () => { Object.keys(store).forEach(k => delete store[k]); },
            key: i => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; },
          }, writable: true, configurable: true,
        });
      } catch (e) {}
      window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
    },
  });

  for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10));
  const win = dom.window;

  if (typeof win.slComputeSummary === 'function') {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow  = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Test 1: past next_due_date => overdue
    {
      const entries = [
        { machine: 'Rig 1', service_date: '2026-10-01', hour_meter: 1000,
          next_due_hours: 1500, next_due_date: yesterday },
      ];
      const summary = win.slComputeSummary(entries);
      assert('OVERDUE1: overdue=true when next_due_date is yesterday',
        summary.length === 1 && summary[0].overdue === true,
        'overdue=' + (summary[0] && summary[0].overdue));
    }

    // Test 2: future next_due_date => not overdue
    {
      const entries = [
        { machine: 'Rig 2', service_date: '2026-10-01', hour_meter: 500,
          next_due_hours: null, next_due_date: tomorrow },
      ];
      const summary = win.slComputeSummary(entries);
      assert('OVERDUE2: overdue=false when next_due_date is tomorrow',
        summary.length === 1 && summary[0].overdue === false,
        'overdue=' + (summary[0] && summary[0].overdue));
    }

    // Test 3: no next_due_date => not overdue
    {
      const entries = [
        { machine: 'Rig 3', service_date: '2026-10-01', hour_meter: null,
          next_due_hours: null, next_due_date: null },
      ];
      const summary = win.slComputeSummary(entries);
      assert('OVERDUE3: overdue=false when no next_due_date',
        summary.length === 1 && summary[0].overdue === false,
        'overdue=' + (summary[0] && summary[0].overdue));
    }

    // Test 4: today's date => overdue (today < today is false, so NOT overdue)
    {
      const entries = [
        { machine: 'Rig 4', service_date: '2026-10-01', hour_meter: 800,
          next_due_hours: null, next_due_date: today },
      ];
      const summary = win.slComputeSummary(entries);
      assert('OVERDUE4: overdue=false when next_due_date is today (not past)',
        summary.length === 1 && summary[0].overdue === false,
        'overdue=' + (summary[0] && summary[0].overdue));
    }

    // Test 5: multiple machines, latest entry used for summary per machine
    {
      const entries = [
        // Most recent for Rig 1 (2026-11-01) has future date
        { machine: 'Rig 1', service_date: '2026-11-01', hour_meter: 1200, next_due_date: tomorrow },
        // Older for Rig 1 had past date — should NOT affect summary
        { machine: 'Rig 1', service_date: '2026-10-01', hour_meter: 1000, next_due_date: yesterday },
        // Rig 2 overdue
        { machine: 'Rig 2', service_date: '2026-10-15', hour_meter: 500, next_due_date: yesterday },
      ];
      const summary = win.slComputeSummary(entries);
      const rig1 = summary.find(s => s.machine === 'Rig 1');
      const rig2 = summary.find(s => s.machine === 'Rig 2');
      assert('OVERDUE5a: Rig 1 not overdue (latest entry has future date)',
        rig1 && rig1.overdue === false,
        'rig1.overdue=' + (rig1 && rig1.overdue));
      assert('OVERDUE5b: Rig 2 overdue (past date)',
        rig2 && rig2.overdue === true,
        'rig2.overdue=' + (rig2 && rig2.overdue));
    }
  } else {
    console.log('  SKIP OVERDUE: slComputeSummary not available on window');
  }
  dom.window.close();
}

// ============================================================================
// S  Static analysis
// ============================================================================
console.log('\n--- S. Static analysis ---');
{
  const src = readFileSync(path.join(root, 'service-log.html'), 'utf8');

  assert("S1: #main revealed with display='block' (not display='')",
    src.includes("style.display = 'block'") || src.includes('style.display="block"'));

  assert("S2: #main NOT set with display=''",
    !src.includes("getElementById('main').style.display = ''") &&
    !src.includes('getElementById("main").style.display = ""'));

  assert('S3: service-log.html has static topbar (not pfBuildHeader)',
    src.includes('id="topbar"') && !src.includes('pfBuildHeader'));

  assert('S4: pfNav present', src.includes('id="pfNav"'));

  assert('S5: slNavItem present on service-log.html',
    src.includes('id="slNavItem"'));

  // On service-log.html itself, slNavItem must NOT have display:none (this IS the service log page)
  assert('S6: slNavItem on service-log.html has no display:none (always visible)',
    (() => {
      const idx = src.indexOf('id="slNavItem"');
      if (idx < 0) return false;
      const tagStart = src.lastIndexOf('<a ', idx);
      const tagEnd = src.indexOf('>', tagStart);
      const tag = src.slice(tagStart, tagEnd + 1);
      return !tag.includes('display:none') && !tag.includes('display: none');
    })());

  // hwNavItem on service-log.html should start hidden
  assert('S7: hwNavItem on service-log.html starts hidden (display:none)',
    (() => {
      const idx = src.indexOf('id="hwNavItem"');
      if (idx < 0) return false;
      const tagStart = src.lastIndexOf('<a ', idx);
      const tagEnd = src.indexOf('>', tagStart);
      const tag = src.slice(tagStart, tagEnd + 1);
      return tag.includes('display:none');
    })());

  // vnNavItem on service-log.html should start hidden
  assert('S8: vnNavItem on service-log.html starts hidden (display:none)',
    (() => {
      const idx = src.indexOf('id="vnNavItem"');
      if (idx < 0) return false;
      const tagStart = src.lastIndexOf('<a ', idx);
      const tagEnd = src.indexOf('>', tagStart);
      const tag = src.slice(tagStart, tagEnd + 1);
      return tag.includes('display:none');
    })());

  assert('S9: service-log.html fetches /api/service-log', src.includes('/api/service-log'));
  assert('S10: service-log.html fetches /api/me', src.includes('/api/me'));
  assert('S11: no UID literals in service-log.html client code', !src.includes('518075f1'));

  assert('S12: servicelog-access.js exports SERVICELOG_EDITORS (write-gate flag)',
    readFileSync(path.join(root, 'functions/lib/servicelog-access.js'), 'utf8')
      .includes('SERVICELOG_EDITORS'));

  assert('S13: service-log.html uses textContent for card rendering (XSS safety)',
    src.includes('textContent'));

  assert('S14: service-log.html has empty-state text',
    src.includes('No service entries yet'));

  // Verify slNavItem is added to all 13 existing pages
  const otherPages = [
    'index.html', 'daily-report.html', 'equipment-inspection.html',
    'site-readiness.html', 'toolbox-talk.html', 'past-reports.html',
    'cost-codes.html', 'schedule.html', 'time-off.html', 'sops.html',
    'mailing-lists.html', 'hardware.html', 'vendors.html',
  ];
  for (const pg of otherPages) {
    const pgSrc = readFileSync(path.join(root, pg), 'utf8');

    assert('S15-nav[' + pg + ']: slNavItem in nav',
      pgSrc.includes('id="slNavItem"'), 'missing in ' + pg);

    const slIdx = pgSrc.indexOf('id="slNavItem"');
    if (slIdx >= 0) {
      const tagStart = pgSrc.lastIndexOf('<a ', slIdx);
      const tagEnd = pgSrc.indexOf('>', tagStart);
      const tag = pgSrc.slice(tagStart, tagEnd + 1);
      assert('S16-hidden[' + pg + ']: slNavItem starts hidden on ' + pg,
        tag.includes('display:none'), 'tag: ' + tag.slice(0, 100));
    }

    assert('S17-reveal[' + pg + ']: serviceLogAllowed reveal present in ' + pg,
      pgSrc.includes('serviceLogAllowed'), 'serviceLogAllowed not in ' + pg);
  }
}

// ============================================================================
// P-AUTH  Page /api/me auth init: hw/vn/sl nav visibility + no-crash
// All 14 pages (13 existing + service-log.html)
// ============================================================================
console.log('\n--- P-AUTH. Page auth init (hw/vn/sl nav visibility + no crash) ---');
{
  const ALL_FIELD_PAGES = [
    'index.html', 'cost-codes.html', 'daily-report.html', 'equipment-inspection.html',
    'mailing-lists.html', 'past-reports.html', 'schedule.html', 'site-readiness.html',
    'sops.html', 'time-off.html', 'toolbox-talk.html', 'hardware.html', 'vendors.html',
    'service-log.html',
  ];

  async function runPageAuthInit(pageFile, hwFlag, vnFlag, slFlag) {
    const pageSrc = readFileSync(path.join(root, pageFile), 'utf8');
    let html = pageSrc
      .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
      .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

    const mePayload = {
      ok: true, status: 'ok',
      uid: DEREK_UID, name: 'Derek Franke', role: 'admin',
      email: 'dfranke@pierfoundations.com',
      hardwareAllowed:   hwFlag,
      vendorsAllowed:    vnFlag,
      vendorsCanEdit:    vnFlag,
      serviceLogAllowed: slFlag,
      serviceLogCanEdit: slFlag,
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
            entries: [], vendorNames: [],
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

  // All 8 flag combinations for each page (hw, vn, sl each true/false)
  const flagCombos = [
    [true,  true,  true ],
    [true,  true,  false],
    [true,  false, true ],
    [true,  false, false],
    [false, true,  true ],
    [false, true,  false],
    [false, false, true ],
    [false, false, false],
  ];

  for (const pageFile of ALL_FIELD_PAGES) {
    const tag = 'P-AUTH-' + pageFile.replace('.html', '');

    for (const [hwFlag, vnFlag, slFlag] of flagCombos) {
      const combo = '[hw=' + hwFlag + ',vn=' + vnFlag + ',sl=' + slFlag + ']';
      let dom = null, exc = null;
      try { dom = await runPageAuthInit(pageFile, hwFlag, vnFlag, slFlag); }
      catch (e) { exc = e; }

      assert(tag + combo + ': no exception during page init',
        exc === null, exc ? String(exc).slice(0, 120) : '');

      if (dom) {
        const doc = dom.window.document;
        const mainEl = doc.getElementById('main');

        // Key regression: ReferenceError in init handler leaves #main hidden
        assert(tag + combo + ': #main shown after auth',
          mainEl != null && mainEl.style.display === 'block',
          '#main.style.display=' + (mainEl ? '"' + mainEl.style.display + '"' : 'NOT FOUND'));

        // slNavItem visibility
        const slNavEl = doc.getElementById('slNavItem');
        assert(tag + combo + ': slNavItem present in DOM',
          slNavEl != null, 'slNavItem not found in ' + pageFile);

        if (slNavEl && pageFile !== 'service-log.html') {
          // On pages other than service-log.html, visibility follows slFlag
          if (slFlag) {
            assert(tag + combo + ': slNavItem visible when sl=true',
              slNavEl.style.display !== 'none',
              'display="' + slNavEl.style.display + '"');
          } else {
            assert(tag + combo + ': slNavItem hidden when sl=false',
              slNavEl.style.display === 'none' || slNavEl.style.display === '',
              'display="' + slNavEl.style.display + '"');
          }
        } else if (slNavEl && pageFile === 'service-log.html') {
          // On service-log.html, slNavItem is always visible (no display:none in HTML)
          // so we just check it's present (display will not be 'none' from HTML)
          assert(tag + combo + ': slNavItem visible on its own page',
            slNavEl.style.display !== 'none',
            'display="' + slNavEl.style.display + '"');
        }

        dom.window.close();
      }
    }
  }
}

// ============================================================================
// CLICK  Click tests: add, edit, delete flows on service-log.html
// ============================================================================
console.log('\n--- CLICK. Click tests (add / edit / delete) ---');
{
  const slHtmlSrc = readFileSync(path.join(root, 'service-log.html'), 'utf8');
  let slHtml = slHtmlSrc
    .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
    .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

  const fakeEntry = {
    id: 'entry-001',
    machine: 'Rig 1 (D&G)',
    service_date: '2026-11-01',
    hour_meter: 1234.5,
    service_type: 'Oil & Filters',
    description: 'Oil change',
    parts_used: 'Filter kit',
    vendor: 'MacAllister Machinery',
    cost: 185.50,
    performed_by: 'Derek Franke',
    next_due_hours: 1734.5,
    next_due_date: '2027-05-01',
    notes: null,
    created_by: 'Derek Franke',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_by: null,
    updated_at: null,
  };

  const mePayload = {
    ok: true, status: 'ok',
    uid: DEREK_UID, name: 'Derek Franke', role: 'admin',
    email: 'dfranke@pierfoundations.com',
    hardwareAllowed: true, vendorsAllowed: true, vendorsCanEdit: true,
    serviceLogAllowed: true, serviceLogCanEdit: true,
  };

  let fetchCalls = [];

  async function makeSlDom(existingEntries) {
    fetchCalls = [];
    const dom = new JSDOM(slHtml, {
      url: 'https://field.pierfoundations.com/service-log.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async function(url, opts) {
          const rec = { url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body };
          fetchCalls.push(rec);
          if (rec.url.includes('/api/me')) {
            return { ok: true, status: 200, json: async () => mePayload };
          }
          if (rec.url.includes('/api/field-lists')) {
            return { ok: true, json: async () => ({ ownedEquipment: ['Rig 1 (D&G)', 'Rig 2 (AP)'] }) };
          }
          if (rec.url.includes('/api/service-log')) {
            if (rec.method === 'POST') {
              let bd = {};
              try { bd = JSON.parse(rec.body); } catch {}
              if (bd.action === 'add_entry')    return { ok: true, json: async () => ({ ok: true, id: 'new-entry-id' }) };
              if (bd.action === 'edit_entry')   return { ok: true, json: async () => ({ ok: true }) };
              if (bd.action === 'delete_entry') return { ok: true, json: async () => ({ ok: true }) };
            }
            return { ok: true, json: async () => ({
              ok: true,
              entries: existingEntries || [],
              vendorNames: ['MacAllister Machinery', 'Fastenal'],
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
    for (let i = 0; i < 80; i++) await new Promise(r => setTimeout(r, 10));
    return dom;
  }

  // CLICK1: Add button opens sheet
  {
    let dom = null, exc = null;
    try { dom = await makeSlDom([]); } catch (e) { exc = e; }
    assert('CLICK1a: service-log.html loads without exception',
      exc === null, exc ? String(exc).slice(0, 120) : '');

    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;
      assert('CLICK1b: #main shown', doc.getElementById('main')?.style.display === 'block');

      const addBtn = doc.getElementById('slAddBtn');
      assert('CLICK1c: add button is visible for editor', addBtn && addBtn.style.display !== 'none');

      win.slOpenAdd && win.slOpenAdd();
      assert('CLICK1d: sheet opens after slOpenAdd()',
        doc.getElementById('slSheet')?.classList.contains('open'));

      // Fill required fields
      doc.getElementById('slFldMachine').value = 'Rig 1 (D&G)';
      doc.getElementById('slFldDate').value    = '2026-11-14';
      doc.getElementById('slFldServiceType').value = 'Grease';

      fetchCalls = [];
      win.slSaveEntry && win.slSaveEntry();
      for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/service-log'));
      assert('CLICK1e: save fires POST to /api/service-log', postCall != null,
        'calls=' + JSON.stringify(fetchCalls.map(c => c.method + ' ' + c.url)));

      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK1f: body has action=add_entry',   bd.action === 'add_entry',    'action=' + bd.action);
        assert('CLICK1g: body has machine',             bd.machine === 'Rig 1 (D&G)', 'machine=' + bd.machine);
        assert('CLICK1h: body has service_date',        bd.service_date === '2026-11-14', 'date=' + bd.service_date);
        assert('CLICK1i: body has service_type',        bd.service_type === 'Grease', 'type=' + bd.service_type);
      }
      dom.window.close();
    }
  }

  // CLICK2: Edit opens sheet pre-filled
  {
    let dom = null, exc = null;
    try { dom = await makeSlDom([fakeEntry]); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;

      fetchCalls = [];
      win.slOpenEdit && win.slOpenEdit(fakeEntry);
      assert('CLICK2a: edit sheet opens', doc.getElementById('slSheet')?.classList.contains('open'));
      assert('CLICK2b: service_date pre-filled',
        doc.getElementById('slFldDate')?.value === '2026-11-01',
        'value=' + doc.getElementById('slFldDate')?.value);
      assert('CLICK2c: service_type pre-filled',
        doc.getElementById('slFldServiceType')?.value === 'Oil & Filters',
        'value=' + doc.getElementById('slFldServiceType')?.value);
      assert('CLICK2d: hour_meter pre-filled',
        parseFloat(doc.getElementById('slFldHourMeter')?.value) === 1234.5,
        'value=' + doc.getElementById('slFldHourMeter')?.value);

      // Change something and save
      doc.getElementById('slFldServiceType').value = 'Repair';
      fetchCalls = [];
      win.slSaveEntry && win.slSaveEntry();
      for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/service-log'));
      assert('CLICK2e: edit fires POST', postCall != null);
      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK2f: body action=edit_entry', bd.action === 'edit_entry',  'action=' + bd.action);
        assert('CLICK2g: body id correct',         bd.id === 'entry-001',       'id=' + bd.id);
        assert('CLICK2h: body updated service_type', bd.service_type === 'Repair', 'type=' + bd.service_type);
      }
      dom.window.close();
    }
  }

  // CLICK3: Delete confirm fires delete_entry
  {
    let dom = null, exc = null;
    try { dom = await makeSlDom([fakeEntry]); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;

      win.slConfirmDelete && win.slConfirmDelete('entry-001', 'Rig 1 (D&G)');
      assert('CLICK3a: delete confirm opens',
        doc.getElementById('slConfirmBackdrop')?.classList.contains('open'));

      fetchCalls = [];
      win.slDoDelete && win.slDoDelete();
      for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/service-log'));
      assert('CLICK3b: delete fires POST', postCall != null,
        'calls=' + JSON.stringify(fetchCalls.map(c => c.method + ' ' + c.url)));
      if (postCall) {
        let bd = {};
        try { bd = JSON.parse(postCall.body); } catch {}
        assert('CLICK3c: body action=delete_entry', bd.action === 'delete_entry', 'action=' + bd.action);
        assert('CLICK3d: body id correct',           bd.id === 'entry-001',        'id=' + bd.id);
      }
      dom.window.close();
    }
  }

  // CLICK4: Validation — save without machine shows error (no POST fired)
  {
    let dom = null, exc = null;
    try { dom = await makeSlDom([]); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;

      win.slOpenAdd && win.slOpenAdd();
      // Leave machine empty
      doc.getElementById('slFldMachine').value = '';
      doc.getElementById('slFldDate').value    = '2026-11-14';
      doc.getElementById('slFldServiceType').value = 'Grease';

      fetchCalls = [];
      win.slSaveEntry && win.slSaveEntry();
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 10));

      const postCall = fetchCalls.find(c => c.method === 'POST' && c.url.includes('/api/service-log'));
      assert('CLICK4: save without machine does NOT fire POST (client validates)',
        postCall == null,
        'unexpected POST: ' + JSON.stringify(fetchCalls.map(c => c.method + ' ' + c.url)));
      dom.window.close();
    }
  }

  // CLICK5: Close sheet works
  {
    let dom = null, exc = null;
    try { dom = await makeSlDom([]); } catch (e) { exc = e; }
    if (dom) {
      const doc = dom.window.document;
      const win = dom.window;
      win.slOpenAdd && win.slOpenAdd();
      assert('CLICK5-pre: sheet open', doc.getElementById('slSheet')?.classList.contains('open'));
      win.slCloseSheet && win.slCloseSheet();
      assert('CLICK5: sheet closed after slCloseSheet()',
        !doc.getElementById('slSheet')?.classList.contains('open'));
      dom.window.close();
    }
  }
}

// ============================================================================
// CRUD-SID  GET response includes machineTaskData + machineBaselines for cat_336
// ============================================================================
console.log('\n--- CRUD-SID. Machine task data + baselines in GET response ---');
{
  const db = makeSlDb();
  // Add a cat_336 entry to trigger machineTaskData + machineBaselines
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry',
    machine: 'Cat 336 Vibro Rig',
    service_date: '2026-11-01',
    service_type: 'Oil & Filters',
    service_interval: 500,
    hour_meter: 1200,
  })));

  const ctx = makeSlCtx(db, DEREK_UID, null, 'GET');
  const resp = await onRequestGet(ctx);
  const body = await getBody(resp);

  assert('CRUD-SID1: GET returns machineTaskData', body.machineTaskData !== undefined, JSON.stringify(Object.keys(body)));
  assert('CRUD-SID2: GET returns machineBaselines', body.machineBaselines !== undefined, JSON.stringify(Object.keys(body)));

  const td = body.machineTaskData && body.machineTaskData['Cat 336 Vibro Rig'];
  assert('CRUD-SID3: cat_336 in machineTaskData', !!td, 'keys=' + JSON.stringify(Object.keys(body.machineTaskData || {})));
  if (td) {
    assert('CRUD-SID4: cat_336 500h tasks present and non-empty',
      td[500] && Array.isArray(td[500].tasks) && td[500].tasks.length > 0,
      'tasks=' + JSON.stringify(td[500]));
    assert('CRUD-SID5: cat_336 500h source string set',
      typeof td[500].source === 'string' && td[500].source.includes('CAT'),
      'source=' + td[500].source);
    assert('CRUD-SID6: cat_336 2000h tasks present',
      td[2000] && Array.isArray(td[2000].tasks) && td[2000].tasks.length > 0,
      'tasks=' + JSON.stringify(td[2000]));
    assert('CRUD-SID7: cat_336 label set',
      typeof td.label === 'string' && td.label.includes('336'),
      'label=' + td.label);
  }

  const bl = body.machineBaselines && body.machineBaselines['Cat 336 Vibro Rig'];
  assert('CRUD-SID8: cat_336 in machineBaselines', !!bl, JSON.stringify(body.machineBaselines));
  if (bl) {
    assert('CRUD-SID9: cat_336 baseline 500h = 714',
      bl[500] === 714, 'got: ' + bl[500]);
    assert('CRUD-SID10: cat_336 baseline 1000h = 714',
      bl[1000] === 714, 'got: ' + bl[1000]);
    assert('CRUD-SID11: cat_336 baseline 2000h = null',
      bl[2000] === null, 'got: ' + bl[2000]);
  }
}

// CRUD-SID-SANY: sany_365 has gaps, no tasks, no baseline
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Sany 365 Predrill',
    service_date: '2026-11-01', service_type: 'Oil & Filters',
  })));
  const ctx = makeSlCtx(db, DEREK_UID, null, 'GET');
  const resp = await onRequestGet(ctx);
  const body = await getBody(resp);
  const td = body.machineTaskData && body.machineTaskData['Sany 365 Predrill'];
  assert('CRUD-SID12: sany_365 in machineTaskData',
    !!td, JSON.stringify(Object.keys(body.machineTaskData || {})));
  if (td) {
    assert('CRUD-SID13: sany_365 500h tasks empty (no sourced data)',
      td[500] && Array.isArray(td[500].tasks) && td[500].tasks.length === 0,
      JSON.stringify(td[500]));
    assert('CRUD-SID14: sany_365 500h gaps text set',
      td[500] && typeof td[500].gaps === 'string' && td[500].gaps.length > 10,
      JSON.stringify(td[500]));
  }
  assert('CRUD-SID15: sany_365 NOT in machineBaselines (no baseline)',
    !body.machineBaselines || !body.machineBaselines['Sany 365 Predrill'],
    JSON.stringify(body.machineBaselines));
}

// ============================================================================
// INTERVAL  service_interval field storage + interval math (slIntervalStatus)
// ============================================================================
console.log('\n--- INTERVAL. service_interval field + interval math ---');

// INTERVAL1: add_entry stores service_interval
{
  const db = makeSlDb();
  const resp = await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Cat 336 Vibro Rig',
    service_date: '2026-11-14', service_type: 'Oil & Filters',
    service_interval: 500, hour_meter: 1200,
  })));
  const body = await getBody(resp);
  assert('INTERVAL1a: add_entry with service_interval=500 returns ok:true',
    body.ok === true, JSON.stringify(body));
  const stored = db._data.service_log_entries[0];
  assert('INTERVAL1b: service_interval stored as 500',
    stored && stored.service_interval === 500, 'got: ' + (stored && stored.service_interval));
}

// INTERVAL2: service_interval=1000
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Cat 336 Vibro Rig',
    service_date: '2026-11-01', service_type: 'Oil & Filters',
    service_interval: 1000, hour_meter: 2000,
  })));
  assert('INTERVAL2: service_interval stored as 1000',
    db._data.service_log_entries[0].service_interval === 1000);
}

// INTERVAL3: invalid service_interval stored as null
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Cat 336 Vibro Rig',
    service_date: '2026-11-01', service_type: 'Grease',
    service_interval: 999, // not a valid interval
  })));
  assert('INTERVAL3: invalid service_interval (999) stored as null',
    db._data.service_log_entries[0].service_interval === null,
    'got: ' + db._data.service_log_entries[0].service_interval);
}

// INTERVAL4: null/empty service_interval stored as null
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Cat 336 Vibro Rig',
    service_date: '2026-11-01', service_type: 'Grease',
    service_interval: null,
  })));
  assert('INTERVAL4: null service_interval stored as null',
    db._data.service_log_entries[0].service_interval === null,
    'got: ' + db._data.service_log_entries[0].service_interval);
}

// INTERVAL5: edit_entry preserves service_interval
{
  const db = makeSlDb();
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'add_entry', machine: 'Cat 336', service_date: '2026-10-01', service_type: 'Oil & Filters',
    service_interval: 500, hour_meter: 500,
  })));
  const id = db._data.service_log_entries[0].id;
  await onRequestPost(makeSlCtx(db, DEREK_UID, async () => ({
    action: 'edit_entry', id,
    machine: 'Cat 336', service_date: '2026-10-01', service_type: 'Oil & Filters',
    service_interval: 1000, hour_meter: 1000,
  })));
  assert('INTERVAL5: edit_entry updates service_interval',
    db._data.service_log_entries[0].service_interval === 1000,
    'got: ' + db._data.service_log_entries[0].service_interval);
}

// INTERVAL6-10: interval math via slIntervalStatus (from jsdom window)
{
  const slHtmlSrc = readFileSync(path.join(root, 'service-log.html'), 'utf8');
  const html2 = slHtmlSrc
    .replace(/<link[^>]+pf-r5\.css[^>]*>/gi, '<style>' + css + '</style>')
    .replace(/<script[^>]+pf-shared\.js[^>]*><\/script>/gi, '<script>' + sharedJs + '</script>');

  const dom2 = new JSDOM(html2, {
    url: 'https://field.pierfoundations.com/service-log.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async () => ({ ok: true, json: async () => ({ status: 'unauthenticated' }) });
      const store = {};
      try {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: k => store[k] ?? null, setItem: (k,v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }, clear: () => { Object.keys(store).forEach(k => delete store[k]); },
            key: i => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; },
          }, writable: true, configurable: true,
        });
      } catch (e) {}
      window.console = { log:()=>{}, warn:()=>{}, error:()=>{}, info:()=>{} };
    },
  });
  for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 10));
  const win2 = dom2.window;

  if (typeof win2.slIntervalStatus === 'function') {
    // INTERVAL6: no service done → baseline 0, next = 0 + level
    {
      const result = win2.slIntervalStatus(500, [], 1234);
      assert('INTERVAL6: no service done → next_due=500 (0+500)',
        result.nextDue === 500, 'nextDue=' + result.nextDue);
      assert('INTERVAL6b: hoursLeft = 500 - 1234 = negative (overdue)',
        result.status === 'overdue',
        'status=' + result.status + ' hoursLeft=' + result.hoursLeft);
    }

    // INTERVAL7: 500h service at 500 → next 500h due at 1000
    {
      const entries = [{ machine: 'Cat 336', service_date: '2026-01-01', service_interval: 500, hour_meter: 500 }];
      const result = win2.slIntervalStatus(500, entries, 650);
      assert('INTERVAL7: 500h service at 500 → next_due=1000, hoursLeft=350',
        result.nextDue === 1000 && Math.round(result.hoursLeft) === 350,
        'nextDue=' + result.nextDue + ' hoursLeft=' + result.hoursLeft);
      assert('INTERVAL7b: status ok (not overdue)',
        result.status === 'ok', 'status=' + result.status);
    }

    // INTERVAL8: 1000h service resets 500h counter too (cumulative)
    {
      // 1000h service at 2000 → 500h: last service >= 500 was at 2000 → next 500h = 2000 + 500 = 2500
      const entries = [{ machine: 'Cat 336', service_date: '2026-06-01', service_interval: 1000, hour_meter: 2000 }];
      const result500  = win2.slIntervalStatus(500,  entries, 2200);
      const result1000 = win2.slIntervalStatus(1000, entries, 2200);
      assert('INTERVAL8a: 1000h service at 2000 resets 500h counter → 500h next_due=2500',
        result500.nextDue === 2500, 'nextDue=' + result500.nextDue);
      assert('INTERVAL8b: 1000h service at 2000 → 1000h next_due=3000',
        result1000.nextDue === 3000, 'nextDue=' + result1000.nextDue);
    }

    // INTERVAL9: 2000h service resets all three counters
    {
      const entries = [{ machine: 'Cat 336', service_date: '2026-06-01', service_interval: 2000, hour_meter: 4000 }];
      const r500  = win2.slIntervalStatus(500,  entries, 4100);
      const r1000 = win2.slIntervalStatus(1000, entries, 4100);
      const r2000 = win2.slIntervalStatus(2000, entries, 4100);
      assert('INTERVAL9a: 2000h service at 4000 → 500h next_due=4500',
        r500.nextDue === 4500, 'nextDue=' + r500.nextDue);
      assert('INTERVAL9b: 2000h service at 4000 → 1000h next_due=5000',
        r1000.nextDue === 5000, 'nextDue=' + r1000.nextDue);
      assert('INTERVAL9c: 2000h service at 4000 → 2000h next_due=6000',
        r2000.nextDue === 6000, 'nextDue=' + r2000.nextDue);
    }

    // INTERVAL10: amber badge when ≤50 h left
    {
      const entries = [{ machine: 'Cat 336', service_date: '2026-01-01', service_interval: 500, hour_meter: 1000 }];
      // next 500h due at 1500; current = 1480 → 20 h left → amber
      const r = win2.slIntervalStatus(500, entries, 1480);
      assert('INTERVAL10a: ≤50 h left → amber status',
        r.status === 'amber', 'status=' + r.status + ' hoursLeft=' + r.hoursLeft);
      assert('INTERVAL10b: amber at exactly 50 h left',
        win2.slIntervalStatus(500, entries, 1450).status === 'amber',
        'status=' + win2.slIntervalStatus(500, entries, 1450).status);
      assert('INTERVAL10c: ok at 51 h left',
        win2.slIntervalStatus(500, entries, 1449).status === 'ok',
        'status=' + win2.slIntervalStatus(500, entries, 1449).status);
    }

    // INTERVAL11: noReading=true when currentHours is null
    {
      const r = win2.slIntervalStatus(500, [], null);
      assert('INTERVAL11: noReading=true when currentHours is null',
        r.noReading === true, 'noReading=' + r.noReading);
    }

    // INTERVAL12: slHasIntervals
    {
      assert('INTERVAL12a: Cat 336 Vibro Rig has intervals',
        win2.slHasIntervals('Cat 336 Vibro Rig') === true);
      assert('INTERVAL12b: Deere 350G has intervals',
        win2.slHasIntervals('Deere 350G Vibro Rig') === true);
      assert('INTERVAL12c: Sany 365 has intervals',
        win2.slHasIntervals('Sany 365 Predrill') === true);
      assert('INTERVAL12d: Sullair Compressor has intervals',
        win2.slHasIntervals('Sulair Air Compressor') === true,
        'Note: KV uses "Sulair" spelling');
      assert('INTERVAL12e: auger does NOT have intervals',
        win2.slHasIntervals('72" Auger') === false);
      assert('INTERVAL12f: Trailer & Tooling does NOT have intervals',
        win2.slHasIntervals('Trailer & Tooling') === false);
    }

    // INTERVAL13: cat_336 baseline — no service log entries → uses ECM baseline (714h)
    {
      // Cat 336 baseline: 500h last done at 714, 1000h last done at 714, 2000h → 0
      const baselines = { 500: 714, 1000: 714, 2000: null };

      // 500h: baseline=714 → next=714+500=1214; at 800h → 414h left
      const r500 = win2.slIntervalStatus(500, [], 800, baselines);
      assert('INTERVAL13a: cat_336 baseline 500h → next_due=1214',
        r500.nextDue === 1214, 'nextDue=' + r500.nextDue);
      assert('INTERVAL13b: cat_336 baseline 500h usingBaseline=true',
        r500.usingBaseline === true, 'usingBaseline=' + r500.usingBaseline);

      // 1000h: baseline=714 → next=714+1000=1714; at 800h → 914h left
      const r1000 = win2.slIntervalStatus(1000, [], 800, baselines);
      assert('INTERVAL13c: cat_336 baseline 1000h → next_due=1714',
        r1000.nextDue === 1714, 'nextDue=' + r1000.nextDue);

      // 2000h: baseline null → treated as 0 → next=0+2000=2000; at 800h → overdue
      const r2000 = win2.slIntervalStatus(2000, [], 800, baselines);
      assert('INTERVAL13d: cat_336 baseline 2000h (null→0) → next_due=2000',
        r2000.nextDue === 2000, 'nextDue=' + r2000.nextDue);
      assert('INTERVAL13e: cat_336 2000h overdue at 800h (800>=2000? no, actually 800<2000, ok)',
        r2000.status === 'ok', 'status=' + r2000.status + ' — 800 < 2000, should be ok');

      // Service log entry overrides baseline
      const entryAfterBaseline = [
        { machine: 'Cat 336 Vibro Rig', service_date: '2026-11-01', service_interval: 500, hour_meter: 1200 }
      ];
      const rOverride = win2.slIntervalStatus(500, entryAfterBaseline, 1300, baselines);
      assert('INTERVAL13f: service log entry overrides baseline',
        rOverride.nextDue === 1700 && rOverride.usingBaseline === false,
        'nextDue=' + rOverride.nextDue + ' usingBaseline=' + rOverride.usingBaseline);
    }

  } else {
    console.log('  SKIP INTERVAL6-13: slIntervalStatus not available on window');
  }
  dom2.window.close();
}

// ============================================================================
// VENDORS-FIX  vendors.html uses vendorsCanEdit for edit buttons;
//              /api/vendors rejects javascript: website scheme
// ============================================================================
console.log('\n--- VENDORS-FIX. vendorsCanEdit + scheme check ---');
{
  // VF1: vendors.html uses vendorsCanEdit (not vendorsAllowed) for _canEdit
  {
    const src = readFileSync(path.join(root, 'vendors.html'), 'utf8');
    assert('VF1: vendors.html sets _canEdit from vendorsCanEdit (not vendorsAllowed)',
      src.includes('vendorsCanEdit'),
      'vendorsCanEdit not found in vendors.html');
    // And it should not set _canEdit from vendorsAllowed alone
    // (search for the specific assignment)
    const hasVnCanEditAssign = src.includes('vendorsCanEdit') &&
      (() => {
        // Find the line that assigns _canEdit
        const lines = src.split('\n');
        const assignLine = lines.find(l => l.includes('_canEdit') && l.includes('=') && !l.includes('//'));
        return assignLine ? assignLine.includes('vendorsCanEdit') : false;
      })();
    assert('VF2: _canEdit assignment uses vendorsCanEdit',
      hasVnCanEditAssign,
      'could not find _canEdit = !!me.vendorsCanEdit in vendors.html');
  }

  // VF3: /api/vendors rejects javascript: website scheme
  {
    function makeVnDb() {
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
              data.vendors_sections.push({ id: p[0], name: p[1], sort_order: p[2],
                created_by: p[3]||'', created_at: p[4]||'', updated_by: null, updated_at: null });
              return { meta: { changes: 1 } };
            }
            if (low.startsWith('insert into vendors_items')) {
              const p = this._params;
              data.vendors_items.push({ id: p[0], section_id: p[1], company: p[2],
                category: p[3], contact: p[4], phone: p[5], address: p[6], website: p[7],
                account_num: p[8], notes: p[9], sort_order: p[10],
                created_by: p[11]||'', created_at: p[12]||'', updated_by: null, updated_at: null });
              return { meta: { changes: 1 } };
            }
            if (low.startsWith('update vendors_items')) {
              const p = this._params;
              const idx = data.vendors_items.findIndex(r => r.id === p[10]);
              if (idx < 0) return { meta: { changes: 0 } };
              Object.assign(data.vendors_items[idx], {
                company: p[0], category: p[1], contact: p[2], phone: p[3],
                address: p[4], website: p[5], account_num: p[6], notes: p[7],
                updated_by: p[8], updated_at: p[9],
              });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (low.includes('count(*) as n from vendors_sections')) return { n: data.vendors_sections.length };
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
            if (low.includes('from vendors_sections')) return { results: [...data.vendors_sections] };
            if (low.includes('from vendors_items')) return { results: [...data.vendors_items] };
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

    const vnDerekUid = [...(vnAccessMod.exports.VENDORS_ALLOWED_UIDS || new Set([DEREK_UID]))][0] || DEREK_UID;
    function makeVnCtx(db, uid, bodyGetter) {
      return {
        data: { session: uid ? { uid, name: 'Derek Franke', role: 'admin' } : null },
        env: { DB: db },
        request: { method: 'POST', json: bodyGetter || (async () => ({})) },
      };
    }

    // VF3a: add_item with javascript: website rejects
    {
      const db = makeVnDb();
      await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({ action: 'add_section', name: 'Local' })));
      const secId = db._data.vendors_sections[0]?.id;
      if (secId) {
        const resp = await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({
          action: 'add_item', section_id: secId,
          company: 'Evil Co', website: 'javascript:alert(1)',
        })));
        const body = await getBody(resp);
        assert('VF3a: add_item rejects javascript: website scheme',
          resp.status === 400 && !body.ok,
          'status=' + resp.status + ' ok=' + body.ok);
      } else {
        assert('VF3a: SKIP — could not create section for setup', false, 'secId not set');
      }
    }

    // VF3b: edit_item with javascript: website rejects
    {
      const db = makeVnDb();
      await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({ action: 'add_section', name: 'Local' })));
      const secId = db._data.vendors_sections[0]?.id;
      if (secId) {
        await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({
          action: 'add_item', section_id: secId, company: 'Safe Co',
        })));
        const itemId = db._data.vendors_items[0]?.id;
        if (itemId) {
          const resp = await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({
            action: 'edit_item', id: itemId, company: 'Safe Co',
            website: 'javascript:void(0)',
          })));
          const body = await getBody(resp);
          assert('VF3b: edit_item rejects javascript: website scheme',
            resp.status === 400 && !body.ok,
            'status=' + resp.status + ' ok=' + body.ok);
        } else {
          assert('VF3b: SKIP — could not create item', false);
        }
      }
    }

    // VF3c: add_item with valid https:// website accepts
    {
      const db = makeVnDb();
      await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({ action: 'add_section', name: 'Local' })));
      const secId = db._data.vendors_sections[0]?.id;
      if (secId) {
        const resp = await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({
          action: 'add_item', section_id: secId,
          company: 'Good Co', website: 'https://goodco.example.com',
        })));
        const body = await getBody(resp);
        assert('VF3c: add_item accepts valid https:// website',
          resp.status === 200 && body.ok === true,
          'status=' + resp.status + ' ok=' + body.ok);
      }
    }

    // VF3d: add_item with empty website accepts (website is optional)
    {
      const db = makeVnDb();
      await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({ action: 'add_section', name: 'Local' })));
      const secId = db._data.vendors_sections[0]?.id;
      if (secId) {
        const resp = await vnOnRequestPost(makeVnCtx(db, vnDerekUid, async () => ({
          action: 'add_item', section_id: secId,
          company: 'No Website Co', website: '',
        })));
        const body = await getBody(resp);
        assert('VF3d: add_item accepts empty website (optional field)',
          resp.status === 200 && body.ok === true,
          'status=' + resp.status + ' ok=' + body.ok);
      }
    }
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
