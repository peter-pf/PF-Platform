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
// 5) CHANGE A -- READABILITY: the dark-blue location header band uses LIGHT text.
//    Assert the #mod-inventory CSS: .inv-loc-h has a dark-blue background (#1E2A38)
//    AND a light (#fff) text color; the location "type" pill + collapse chevron on
//    that band are also light. Body rows stay dark-on-white (unchanged).
// ---------------------------------------------------------------------------
console.log('\n[5] CHANGE A readability (dark-blue header, light text)');
const html = readFileSync('./index.html', 'utf8');
// Isolate the inventory <style> block region for the header band rule.
function cssRule(selector) {
  // crude: find "selector {" ... "}" within the #mod-inventory styles.
  const idx = html.indexOf(selector + ' {');
  if (idx < 0) return '';
  const close = html.indexOf('}', idx);
  return html.slice(idx, close + 1);
}
const locH = cssRule('#mod-inventory .inv-loc-h');
ok('.inv-loc-h background is dark-blue (#1E2A38)', /background:\s*#1E2A38/i.test(locH));
ok('.inv-loc-h text color is light (#fff / #ffffff)', /color:\s*#(?:fff|ffffff)\b/i.test(locH));
// The type pill on the dark band uses translucent WHITE (rgba(255,255,255,...)).
const locType = cssRule('#mod-inventory .inv-loc-type');
ok('.inv-loc-type text is light (rgba white) on the dark band',
  /color:\s*rgba\(255,\s*255,\s*255/i.test(locType));
// The collapse chevron on the dark band is light too.
const locToggle = cssRule('#mod-inventory .inv-loc-toggle');
ok('.inv-loc-toggle chevron is light (rgba white)',
  /color:\s*rgba\(255,\s*255,\s*255/i.test(locToggle));
// Body cells remain DARK-on-white (regression guard from the earlier contrast fix).
const tdRule = cssRule('#mod-inventory .inv-tbl td');
ok('body table cells stay dark text (var(--text-1) not white)',
  /color:\s*var\(--text-1/i.test(tdRule) && !/color:\s*#fff/i.test(tdRule));

// ---------------------------------------------------------------------------
// 6) CHANGE B -- FULL-ROW EDIT persistence (action:'setFields').
//    Office can set/clear per-item field overrides; field_ops + no-session blocked;
//    only allowlisted fields honored; validation on numeric Req; GET returns fields.
// ---------------------------------------------------------------------------
console.log('\n[6] CHANGE B full-row edit (setFields overlay)');
const kv2 = makeKV();

// 6a) office sets several text fields on an item.
r = await inv.onRequestPost(ctx({ role: 'partner', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2',
    fields: { description: '18" Auger (corrected)', manufacturer: 'ProDig Inc', mfrPart: 'PD-18' } }) }));
j = await r.json();
ok('office setFields saves (200 ok)', r.status === 200 && j.ok && j.saved);
ok('response echoes the corrected fields',
  j.fields && j.fields.description === '18" Auger (corrected)' && j.fields.manufacturer === 'ProDig Inc');

// 6b) GET returns the field overrides for merge.
r = await inv.onRequestGet(ctx({ role: 'field_ops', kv: kv2, method: 'GET' }));
j = await r.json();
ok('GET returns a fields override map', j.ok && j.fields && typeof j.fields === 'object');
ok('field override present + correct (drill-2 description)',
  j.fields['drill-2'] && j.fields['drill-2'].description === '18" Auger (corrected)');
ok('updatedBy is SERVER-SET (partner-user)', j.fields['drill-2'].updatedBy === 'partner-user');

// 6c) numeric Req field: valid whole number stored; negative + non-integer rejected.
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2', fields: { reqHome: 12 } }) }));
j = await r.json();
ok('numeric reqHome=12 saved', r.status === 200 && j.fields.reqHome === 12);
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2', fields: { reqHome: -3 } }) }));
ok('negative Req rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2', fields: { reqTrailer: 2.5 } }) }));
ok('non-integer Req rejected -> 400', r.status === 400);

// 6d) allowlist: unknown fields ignored (no error), never persisted.
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2',
    fields: { category: 'HACKED', id: 'evil', notes: 'ok note' } }) }));
j = await r.json();
ok('unknown fields (category/id) ignored, allowlisted note saved',
  r.status === 200 && j.fields.notes === 'ok note'
  && !('category' in j.fields) && !('id' in j.fields));
r = await inv.onRequestGet(ctx({ role: 'admin', kv: kv2, method: 'GET' }));
j = await r.json();
ok('server never persisted a non-allowlisted field',
  !('category' in j.fields['drill-2']) && !('id' in j.fields['drill-2']));

// 6e) field_ops CANNOT edit fields (fail closed).
r = await inv.onRequestPost(ctx({ role: 'field_ops', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2', fields: { description: 'crew edit' } }) }));
ok('field_ops setFields BLOCKED -> 403', r.status === 403);
r = await inv.onRequestGet(ctx({ role: 'admin', kv: kv2, method: 'GET' }));
j = await r.json();
ok('blocked crew edit did NOT mutate the field',
  j.fields['drill-2'].description === '18" Auger (corrected)');

// 6f) no-session CANNOT edit fields (fail closed).
r = await inv.onRequestPost(ctx({ role: null, kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2', fields: { description: 'anon' } }) }));
ok('no-session setFields BLOCKED -> 403 (fail closed)', r.status === 403);

// 6g) clearing all overridden fields removes the item key entirely.
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-2',
    fields: { description: '', manufacturer: '', mfrPart: '', notes: '', reqHome: '' } }) }));
j = await r.json();
ok('clearing every field succeeds', r.status === 200 && j.ok);
r = await inv.onRequestGet(ctx({ role: 'admin', kv: kv2, method: 'GET' }));
j = await r.json();
ok('item with no remaining overrides removed from fields map', !j.fields['drill-2']);

// 6h) qty + fields coexist in the SAME store (qty overlay not broken by fields).
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'set', key: 'farm::drill-1', qty: 5 }) }));
ok('qty save still works alongside fields', r.status === 200);
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-1', fields: { notes: 'coexist' } }) }));
ok('fields save still works alongside qty', r.status === 200);
r = await inv.onRequestGet(ctx({ role: 'admin', kv: kv2, method: 'GET' }));
j = await r.json();
ok('both qty AND fields persisted together',
  j.qty['farm::drill-1'] && j.qty['farm::drill-1'].qty === 5
  && j.fields['drill-1'] && j.fields['drill-1'].notes === 'coexist');

// 6i) bad action + proto-pollution item + missing fields obj rejected.
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'bogus', item: 'drill-1', fields: { notes: 'x' } }) }));
ok('unknown action rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: '__proto__', fields: { notes: 'x' } }) }));
ok('proto-pollution item id rejected -> 400', r.status === 400);
r = await inv.onRequestPost(ctx({ role: 'admin', kv: kv2,
  body: JSON.stringify({ action: 'setFields', item: 'drill-1', fields: {} }) }));
ok('empty/no editable fields rejected -> 400', r.status === 400);

// ---------------------------------------------------------------------------
// 7) CHANGE B (UI) -- the office-only Edit toggle + field inputs exist in markup.
//    Assert the module JS wires an Edit button (office gate) + renders inv-fin
//    inputs in edit mode, guarded so a non-office role can never enter edit mode.
// ---------------------------------------------------------------------------
console.log('\n[7] CHANGE B UI wiring (Edit toggle, office-gated)');
ok('module renders an office Edit button (invEditBtn)', /id="invEditBtn"/.test(html));
ok('Edit button gated behind canEdit (office only)',
  /if \(canEdit\) \{[\s\S]{0,200}invEditBtn/.test(html) || /canEdit[\s\S]{0,120}invEditBtn/.test(html));
ok('non-office role forced out of edit mode',
  /if \(!canEdit\) editMode = false/.test(html));
ok('edit mode renders per-item field inputs (inv-fin) with data-field',
  /class="inv-fin/.test(html) && /data-field="/.test(html) && /function fieldInput\(/.test(html));
ok('field edits POST action:setFields', /action['"]?:\s*['"]setFields['"]/.test(html)
  || /'setFields'/.test(html));
ok('field save wiring only runs for office (wireFieldEdits under canEdit)',
  /if \(canEdit\)[\s\S]{0,400}wireFieldEdits/.test(html));

// ---------------------------------------------------------------------------
// 8) CHANGE C -- COLLAPSIBLE per-location sections (independent accordion).
//    Assert the markup + CSS + JS: each location has a toggle header + a body that
//    is hidden when the location is NOT .inv-open; toggles are per-location; default
//    state is EXPANDED (first render adds inv-open unless collapsed[loc.id]).
// ---------------------------------------------------------------------------
console.log('\n[8] CHANGE C per-location collapse');
ok('each location wraps its categories in a collapsible body (.inv-loc-body)',
  /class="inv-loc-body"/.test(html));
ok('collapsed body hidden via CSS (:not(.inv-open) .inv-loc-body { display:none })',
  /\.inv-loc:not\(\.inv-open\)\s*\.inv-loc-body\s*\{\s*display:\s*none/.test(html));
ok('per-location toggle header carries data-loc-toggle', /data-loc-toggle="/.test(html));
ok('toggle keyed PER location (collapsed[locId], independent state)',
  /collapsed\[locId\]/.test(html));
ok('default state EXPANDED (isOpen = !collapsed[loc.id] -> inv-open)',
  /var isOpen = !collapsed\[loc\.id\]/.test(html)
  && /\(isOpen \? ' inv-open' : ''\)/.test(html));
ok('collapse toggle is wired for ALL roles (view-only can collapse too)',
  /wireLocToggles\(host\);/.test(html) && !/if \(canEdit\)[\s\S]{0,60}wireLocToggles/.test(html));
ok('keyboard accessible (Enter/Space toggles the header)',
  /e\.key === 'Enter'/.test(html) && /toggle\(\)/.test(html));

// Simulate the per-location collapse STATE machine (mirror the client toggle logic).
(function () {
  const collapsedState = {}; // { locId: true } => collapsed
  const locs = DATA.locations.map(l => l.id);
  function isOpen(id) { return !collapsedState[id]; }
  // default: all expanded.
  ok('default: every location expanded', locs.every(isOpen));
  // collapse ONLY the farm.
  collapsedState['farm'] = true;
  ok('collapsing Farm hides Farm only', !isOpen('farm') && isOpen('trailer-1'));
  // collapse trailer too; farm independent.
  collapsedState['trailer-1'] = true;
  ok('each location collapses independently', !isOpen('farm') && !isOpen('trailer-1'));
  // re-open farm.
  delete collapsedState['farm'];
  ok('re-opening Farm leaves Trailer collapsed', isOpen('farm') && !isOpen('trailer-1'));
})();

// ---------------------------------------------------------------------------
console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
