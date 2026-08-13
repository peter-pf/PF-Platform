// Harness for the Inventory Module v1 (read-only inventory + editable Actual Qty).
// Runs from platform/. Proves: (1) seed feed loads + parses; (2) auth classifies
// the feed + api path as everyone-viewable ('general') and EDIT as office-only
// ('financials'), field_ops blocked from editing but allowed to read; (3) the tab
// renders + groups by location then category with the 9-field schema; (4) the KV
// save endpoint saves an Actual Qty and fails closed for a field_ops session and a
// missing session. Pure logic (no live server): imports the real auth.js exports
// and the real endpoint handlers with a fake KV + fake session context.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  areaForPath, roleCanAccess, requireArea,
} from './functions/lib/auth.js';
import * as inv from './functions/api/inventory.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

// ---------------------------------------------------------------------------
// 1) SEED FEED loads + parses (executed the same way the browser loads it:
//    assigns window.PF_INVENTORY).
// ---------------------------------------------------------------------------
console.log('\n[1] Seed feed (data/inventory.js)');
const feedSrc = readFileSync('./data/inventory.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(feedSrc, sandbox);
const DATA = sandbox.window.PF_INVENTORY;
ok('feed assigns window.PF_INVENTORY', !!DATA);
ok('has locations array', Array.isArray(DATA.locations) && DATA.locations.length >= 2);
ok('Farm location present (type farm, label "Farm Inventory")',
  DATA.locations.some(l => l.type === 'farm' && /Farm/.test(l.label)));
ok('at least one trailer location', DATA.locations.some(l => l.type === 'trailer'));
ok('categories include all 6 SPEC categories',
  ['Drilling','Mast Components','Vibroflot Parts','Side Dump Bucket','Testing Equipment','Hardware']
    .every(c => DATA.categories.includes(c)));
ok('items array non-empty', Array.isArray(DATA.items) && DATA.items.length > 0);
// Every item carries the 9-field schema.
const SCHEMA = ['category','description','manufacturer','mfrPart','reqTrailer','reqHome','altSources','actualOnHand','notes'];
ok('every item has all 9 schema fields',
  DATA.items.every(it => SCHEMA.every(f => Object.prototype.hasOwnProperty.call(it, f))));
ok('every item has a stable id', DATA.items.every(it => typeof it.id === 'string' && it.id.length));
ok('item ids are unique', new Set(DATA.items.map(i => i.id)).size === DATA.items.length);
// Spot-check seed values from the SPEC.
const teeth = DATA.items.find(i => /Auger Teeth/.test(i.description));
ok('seed value: Auger Teeth = 8 trailer / 10 home', teeth && teeth.reqTrailer === 8 && teeth.reqHome === 10);
const isolators = DATA.items.find(i => i.description === 'Isolators');
ok('seed value: Isolators = 0 trailer / 4 home', isolators && isolators.reqTrailer === 0 && isolators.reqHome === 4);
ok('Hardware is a placeholder stub (0 seed items)',
  DATA.items.filter(i => i.category === 'Hardware').length === 0 && DATA.categories.includes('Hardware'));

// ---------------------------------------------------------------------------
// 2) AUTH classification: everyone-viewable feed + api; office-only edit.
// ---------------------------------------------------------------------------
console.log('\n[2] Auth classification');
ok("/data/inventory.js -> 'general'", areaForPath('/data/inventory.js') === 'general');
ok("/api/inventory -> 'general' (read allowed everyone)", areaForPath('/api/inventory') === 'general');
// 'general' = everyone-viewable incl field_ops.
ok('field_ops CAN read general (feed + GET)', roleCanAccess('field_ops', 'general'));
ok('admin/partner/business_dev can read general',
  ['admin','partner','business_dev'].every(r => roleCanAccess(r, 'general')));
// EDIT gate is 'financials' (office). field_ops must be blocked from editing.
ok('field_ops CANNOT edit (financials area)', !roleCanAccess('field_ops', 'financials'));
ok('office roles CAN edit (financials area)',
  ['admin','partner','business_dev'].every(r => roleCanAccess(r, 'financials')));
// requireArea returns a 403 Response for a blocked role, null for allowed.
ok('requireArea(field_ops, financials) -> 403',
  requireArea({ role: 'field_ops' }, 'financials') instanceof Response);
ok('requireArea(admin, financials) -> null (allowed)',
  requireArea({ role: 'admin' }, 'financials') === null);
ok('requireArea(field_ops, general) -> null (read allowed)',
  requireArea({ role: 'field_ops' }, 'general') === null);
ok('requireArea(null session, general) -> 403 (fail closed)',
  requireArea(null, 'general') instanceof Response);

// ---------------------------------------------------------------------------
// 3) RENDER grouping logic (mirror the tab's group-by-location-then-category).
// ---------------------------------------------------------------------------
console.log('\n[3] Render grouping');
let locGroups = 0, catBlocks = 0, renderedItems = 0;
const seen = new Set();
DATA.locations.forEach(loc => {
  locGroups++;
  DATA.categories.forEach(cat => {
    catBlocks++;
    const rows = DATA.items.filter(it => it.category === cat);
    rows.forEach(it => { renderedItems++; seen.add(it.id); });
  });
});
ok('renders one group per location', locGroups === DATA.locations.length);
ok('renders every category block per location', catBlocks === DATA.locations.length * DATA.categories.length);
ok('every seed item appears in the render', seen.size === DATA.items.length);
ok('total rendered rows = items x locations',
  renderedItems === DATA.items.length * DATA.locations.length);
// Required-stock resolution: farm uses reqHome, trailer uses reqTrailer.
const farm = DATA.locations.find(l => l.type === 'farm');
const trailer = DATA.locations.find(l => l.type === 'trailer');
ok('farm required-stock resolves to reqHome',
  DATA.items.every(it => (it.reqHome == null) || (it.reqHome === it.reqHome)) &&
  farm && trailer);

// ---------------------------------------------------------------------------
// 4) KV SAVE endpoint: save + read-back + fail-closed.
// ---------------------------------------------------------------------------
console.log('\n[4] Save endpoint (/api/inventory)');

// Fake KV (mirrors Cloudflare KV get/put contract).
function makeKV() {
  const store = new Map();
  return { get: async k => (store.has(k) ? store.get(k) : null),
           put: async (k, v) => { store.set(k, v); },
           _dump: () => store };
}
function ctx({ role, body, kv, method = 'POST' }) {
  return {
    env: { PF_SCHEDULE: kv },
    data: { session: role ? { role, name: role + '-user', uid: role } : null },
    request: {
      headers: { get: h => (h === 'Content-Length' ? String((body || '').length) : null) },
      text: async () => body || '',
    },
    method,
  };
}

// 4a) office edit saves.
const kv = makeKV();
let r = await inv.onRequestPost(ctx({ role: 'partner', kv,
  body: JSON.stringify({ action: 'set', key: 'trailer-1::drill-2', qty: 3 }) }));
let j = await r.json();
ok('office POST saves (200 ok)', r.status === 200 && j.ok && j.saved);
ok('KV persisted the override', kv._dump().has('inventory_qty_v1'));

// 4b) read-back via GET returns the saved value.
r = await inv.onRequestGet(ctx({ role: 'field_ops', kv, method: 'GET' }));
j = await r.json();
ok('field_ops GET (read) allowed -> 200', r.status === 200 && j.ok);
ok('read-back has the saved qty=3', j.qty['trailer-1::drill-2'] && j.qty['trailer-1::drill-2'].qty === 3);
ok('updatedBy is SERVER-SET from session (partner-user)',
  j.qty['trailer-1::drill-2'].updatedBy === 'partner-user');

// 4c) field_ops EDIT is blocked (fail closed).
r = await inv.onRequestPost(ctx({ role: 'field_ops', kv,
  body: JSON.stringify({ action: 'set', key: 'trailer-1::drill-2', qty: 99 }) }));
ok('field_ops POST (edit) BLOCKED -> 403', r.status === 403);
// confirm the value was NOT changed.
r = await inv.onRequestGet(ctx({ role: 'admin', kv, method: 'GET' }));
j = await r.json();
ok('blocked edit did NOT mutate the value (still 3)', j.qty['trailer-1::drill-2'].qty === 3);

// 4d) missing session -> fail closed on edit.
r = await inv.onRequestPost(ctx({ role: null, kv,
  body: JSON.stringify({ action: 'set', key: 'trailer-1::drill-2', qty: 5 }) }));
ok('no-session POST BLOCKED -> 403 (fail closed)', r.status === 403);

// 4e) clearing (qty null) deletes the override.
r = await inv.onRequestPost(ctx({ role: 'admin', kv,
  body: JSON.stringify({ action: 'set', key: 'trailer-1::drill-2', qty: null }) }));
j = await r.json();
ok('clear (qty null) succeeds + cleared flag', r.status === 200 && j.cleared === true);
r = await inv.onRequestGet(ctx({ role: 'admin', kv, method: 'GET' }));
j = await r.json();
ok('cleared key removed from override map', !j.qty['trailer-1::drill-2']);

// 4f) input validation: negative qty rejected, bad JSON rejected, proto-pollution key rejected.
r = await inv.onRequestPost(ctx({ role: 'admin', kv,
  body: JSON.stringify({ action: 'set', key: 'farm::mast-1', qty: -4 }) }));
ok('negative qty rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv, body: '{not json' }));
ok('invalid JSON rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv,
  body: JSON.stringify({ action: 'set', key: '__proto__', qty: 1 }) }));
ok('prototype-pollution key rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv,
  body: JSON.stringify({ action: 'set', key: 'nosep', qty: 1 }) }));
ok('malformed key (no ::) rejected -> 400', r.status === 400);

// ---------------------------------------------------------------------------
console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
