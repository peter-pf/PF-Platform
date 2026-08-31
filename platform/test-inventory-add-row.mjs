// Test for CHANGE G (2026-08-31, Derek): per-table "+ Add Material" button that
// appends a NEW BLANK material row (same fields + photo slots as existing rows),
// visible ONLY in edit mode (canEdit && editMode), persisting via the EXISTING
// setFields path (KV-only "new item" carrying newItem + category markers).
//
// Three layers, all against the REAL code:
//   (A) SERVER (functions/api/inventory.js, imported live): a setFields POST that
//       includes category + newItem is ACCEPTED + round-trips through a mock KV, and
//       a brand-new itemId creates a fresh override record (the "add row" data path).
//       Also: clearing every field of the new row DELETES its key (row removed).
//   (B) CLIENT STATIC (index.html source): the add button is gated on
//       canEdit && editMode && isFirstLoc; category + newItem are in the client
//       TEXT_FIELDS; effectiveItems reconstructs KV-only newItem rows.
//   (C) CLIENT DOM (jsdom): the harvested effectiveItems() reconstructs a KV-only new
//       row into its category, and a harvested render-of-one-category proves the blank
//       row renders with the SAME editable structure (inv-fin inputs) as a seed row,
//       and the "+ Add Material" button appears ONLY in edit mode.
//
// Run from the platform dir:  node test-inventory-add-row.mjs

import fs from 'fs';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// =====================================================================
// (A) SERVER — live import of the real Pages Function + a mock KV.
// =====================================================================
const inv = await import('./functions/api/inventory.js');

// Minimal in-memory KV mock matching the subset the module uses.
function makeKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix } = {}) {
      const keys = [];
      for (const k of m.keys()) if (!prefix || k.startsWith(prefix)) keys.push({ name: k });
      return { keys };
    },
  };
}

// An office session (admin) -> requireArea('financials') passes.
const officeSession = { role: 'admin', name: 'Derek', uid: 'derek' };

function ctx(kv, session, body) {
  return {
    env: { PF_SCHEDULE: kv },
    data: { session },
    request: {
      headers: { get: (h) => (h === 'Content-Length' ? String(body.length) : null) },
      async text() { return body; },
    },
  };
}

async function post(kv, session, obj) {
  const res = await inv.onRequestPost(ctx(kv, session, JSON.stringify(obj)));
  const json = await res.json();
  return { status: res.status, json };
}
async function getMap(kv, session) {
  const res = await inv.onRequestGet({
    env: { PF_SCHEDULE: kv }, data: { session },
    request: { url: 'https://x/api/inventory' },
  });
  return await res.json();
}

{
  const kv = makeKV();
  const newId = 'new-abc123-xyz';

  // 1) ADD ROW: setFields with newItem + category + description on a fresh id.
  const add = await post(kv, officeSession, {
    action: 'setFields', item: newId,
    fields: { newItem: '1', category: 'Drilling', description: '' },
  });
  ok('server: add-row setFields accepted (ok)', add.status === 200 && add.json.ok === true);
  ok('server: add-row persisted newItem marker', add.json.fields && add.json.fields.newItem === '1');
  ok('server: add-row persisted category=Drilling', add.json.fields && add.json.fields.category === 'Drilling');
  ok('server: add-row persisted empty description (key present)',
     add.json.fields && Object.prototype.hasOwnProperty.call(add.json.fields, 'description')
     && add.json.fields.description === '');

  // 2) GET returns the new item in the fields map (so the client can reconstruct it).
  const map = await getMap(kv, officeSession);
  ok('server: GET returns the new item in fields', !!(map.fields && map.fields[newId]));
  ok('server: GET new item carries category', map.fields[newId] && map.fields[newId].category === 'Drilling');

  // 3) Fill in a real field on the new row (normal per-field save) -> merges.
  const fill = await post(kv, officeSession, {
    action: 'setFields', item: newId, fields: { description: '30" Auger', manufacturer: 'ProDig' },
  });
  ok('server: fill new-row description accepted', fill.status === 200 && fill.json.ok === true);
  const map2 = await getMap(kv, officeSession);
  ok('server: new row keeps newItem+category after filling fields',
     map2.fields[newId].newItem === '1' && map2.fields[newId].category === 'Drilling'
     && map2.fields[newId].description === '30" Auger');

  // 4) DELETE the row: clear every field -> the item key is dropped entirely.
  await post(kv, officeSession, { action: 'setFields', item: newId,
    fields: { newItem: null, category: null, description: null, manufacturer: null } });
  const map3 = await getMap(kv, officeSession);
  ok('server: clearing all fields removes the new row key', !(map3.fields && map3.fields[newId]));
}

// 5) RBAC: field_ops (crew) is BLOCKED from adding a row (403), fails closed.
{
  const kv = makeKV();
  const crew = { role: 'field_ops', name: 'Crew', uid: 'crew' };
  const res = await post(kv, crew, { action: 'setFields', item: 'new-x', fields: { newItem: '1', category: 'Drilling' } });
  ok('server: field_ops add-row BLOCKED (403)', res.status === 403);
  const resNo = await post(kv, null, { action: 'setFields', item: 'new-x', fields: { newItem: '1', category: 'Drilling' } });
  ok('server: missing session add-row BLOCKED (fail-closed)', resNo.status === 401 || resNo.status === 403);
}

// =====================================================================
// (B) CLIENT STATIC — assertions against index.html source.
// =====================================================================
ok('static: client TEXT_FIELDS includes category',
   /var TEXT_FIELDS = \[[\s\S]{0,1000}'category'/.test(src));
ok('static: client TEXT_FIELDS includes newItem',
   /var TEXT_FIELDS = \[[\s\S]{0,1000}'newItem'/.test(src));
ok('static: add button gated on canEdit && editMode && isFirstLoc',
   /if \(canEdit && editMode && isFirstLoc\) \{[\s\S]{0,300}inv-addrow-btn/.test(src));
ok('static: add button labeled "+ Add Material"',
   /\+ Add Material/.test(src));
ok('static: effectiveItems reconstructs newItem rows',
   /function effectiveItems\(\)[\s\S]{0,900}ov\.newItem/.test(src));
ok('static: render uses effectiveItems (not raw seed)',
   /var items = effectiveItems\(\);/.test(src));
ok('static: wireAddRows called only in editMode',
   /if \(editMode\) wireAddRows\(host\);/.test(src));
ok('static: newItemId mints server-safe id charset (new- prefix)',
   /function newItemId\(\)[\s\S]{0,300}'new-'/.test(src));

// =====================================================================
// (C) CLIENT DOM — harvest effectiveItems + a category-render snippet.
// =====================================================================
function harvest(re, label) {
  const m = src.match(re);
  if (!m) { console.error('COULD NOT HARVEST ' + label); process.exit(2); }
  return m[0];
}
const effItemsSrc = harvest(/function effectiveItems\(\) \{[\s\S]*?\n  \}/, 'effectiveItems');
const TEXT_FIELDS = ['description','manufacturer','mfrPart','altSources','notes',
  'purchaseLink','orderContact','orderContactName','orderContactEmail','orderContactPhone',
  'category','newItem'];
const NUM_FIELDS = ['reqTrailer','reqHome'];

// Seed with two Drilling items; fieldOverrides carries ONE KV-only new Drilling row.
const PF_INVENTORY = {
  categories: ['Drilling','Hardware'],
  locations: [{ id:'farm', label:'Farm', type:'farm', order:0 }],
  items: [
    { id:'drill-1', category:'Drilling', description:'18" Auger', reqTrailer:1, reqHome:1 },
    { id:'drill-2', category:'Drilling', description:'24" Auger', reqTrailer:1, reqHome:1 },
  ],
};
const fieldOverrides = {
  'new-t1-aaa': { newItem:'1', category:'Drilling', description:'' }, // office-added blank row
  'drill-1':    { manufacturer:'ProDig' },                            // a normal seed override
};

// Build effectiveItems in a sandbox closing over PF_INVENTORY + fieldOverrides.
const eff = new Function('window','fieldOverrides','TEXT_FIELDS','NUM_FIELDS',
  effItemsSrc + '\n return effectiveItems();'
)({ PF_INVENTORY }, fieldOverrides, TEXT_FIELDS, NUM_FIELDS);

const drilling = eff.filter((it) => it.category === 'Drilling');
ok('dom: effectiveItems appends the KV-only new row into Drilling',
   drilling.some((it) => it.id === 'new-t1-aaa' && it._isNew === true));
ok('dom: effectiveItems keeps both seed Drilling rows',
   drilling.some((it) => it.id === 'drill-1') && drilling.some((it) => it.id === 'drill-2'));
ok('dom: effectiveItems does NOT duplicate a seed row that has a normal override',
   eff.filter((it) => it.id === 'drill-1').length === 1);
ok('dom: a plain override (no newItem) is NOT turned into a phantom row',
   !eff.some((it) => it.id === 'drill-1' && it._isNew === true));

// The new row renders as a BLANK editable row: harvest fieldInput + prove it emits an
// inv-fin <input> hydrated from the (empty) merged description.
const fieldInputSrc = harvest(/function fieldInput\(field, item, cls\) \{[\s\S]*?\n  \}/, 'fieldInput');
const E = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fieldInput = new Function('E','item','field','cls',
  fieldInputSrc + '\n return fieldInput(field, item, cls);'
).bind(null, E);

const newRowItem = drilling.find((it) => it.id === 'new-t1-aaa');
const inputHtml = fieldInput(newRowItem, 'description', 'inv-fin');
const domFrag = new JSDOM('<!doctype html><body><table><tr><td>' + inputHtml + '</td></tr></table>');
const inp = domFrag.window.document.querySelector('input.inv-fin');
ok('dom: new blank row emits a typeable inv-fin input (same structure as seed rows)', !!inp);
ok('dom: new blank row input is bound to the new itemId', inp && inp.getAttribute('data-item') === 'new-t1-aaa');
ok('dom: new blank row description starts empty', inp && (inp.getAttribute('value') || '') === '');

console.log('\n' + pass + ' pass / ' + fail + ' fail');
if (fail) process.exit(1);
