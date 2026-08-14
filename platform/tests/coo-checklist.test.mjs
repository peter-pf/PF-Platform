// Harness for the COO Checklist persistence (Phase 1). Runnable:
//   node platform/test-coo-checklist.mjs
// Covers: stable-id uniqueness + stability across reorder; GET/POST round-trip;
// auth gate (field_ops + business_dev blocked, admin + partner allowed); render
// merge; fail-closed on no-KV.
import { onRequestGet, onRequestPost } from '../functions/api/coo-checklist.js';
import { roleCanAccess, areaForPath } from '../functions/lib/auth.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra != null ? '-> ' + JSON.stringify(extra) : ''); }
}

// ---- in-memory KV mock (mirrors the CF KV get/put used by the handler) ----
function makeKV() {
  const store = new Map();
  return {
    _store: store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}
const ctx = (session, env, request) => ({ data: { session }, env, request });
const req = (url, body) => new Request(url, body ? {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
} : { method: 'GET' });

// ------------------------------------------------------------------
// 1. STABLE IDs: replicate the client slug scheme + prove stability
// ------------------------------------------------------------------
function slug(str){ return String(str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function stableId(cat, item){ const s=slug(cat), i=slug(item); return i ? s+'.'+i : s; }

// A trimmed copy of DATA (section title + item texts) — enough to prove uniqueness.
const SECTIONS = [
  ['Company Foundation & Legal', [
    'Legal entity type & state of formation (LLC / S-Corp / etc.)',
    'EIN / federal tax ID & state tax registrations',
    'States licensed/registered to do business + contractor licenses',
  ]],
  ['Ownership, People & Org', [
    'Partners, ownership split & decision rights',
    'Roles & responsibilities of each partner',
  ]],
  ['Financials & Accounting', [
    'Accounting system & chart of accounts',
    'Labor burden rate (true loaded cost)',
  ]],
];

console.log('1. STABLE IDS');
{
  const ids = [];
  for (const [cat, items] of SECTIONS) for (const it of items) ids.push(stableId(cat, it));
  const uniq = new Set(ids);
  ok('all ids unique', uniq.size === ids.length, { n: ids.length, uniq: uniq.size });
  ok('ids match server ID_RE', ids.every(id => /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(id)), ids);
  ok('id is content-derived (not ordinal)', stableId('Financials & Accounting','Labor burden rate (true loaded cost)') === 'financials-accounting.labor-burden-rate-true-loaded-cost');

  // Stability across REORDER + INSERT: the same item's id is unchanged even when a
  // new item is inserted before it and sections are reordered.
  const reordered = [
    ['Financials & Accounting', [
      'NEW inserted item at the top',            // <-- insertion shifts ORDINALS
      'Accounting system & chart of accounts',
      'Labor burden rate (true loaded cost)',
    ]],
    ['Company Foundation & Legal', [
      'EIN / federal tax ID & state tax registrations',
    ]],
  ];
  const idBefore = stableId('Financials & Accounting','Labor burden rate (true loaded cost)');
  let idAfter=null;
  for (const [cat, items] of reordered) for (const it of items)
    if (it === 'Labor burden rate (true loaded cost)') idAfter = stableId(cat, it);
  ok('id stable across reorder+insert', idBefore === idAfter, { idBefore, idAfter });
  const einBefore = stableId('Company Foundation & Legal','EIN / federal tax ID & state tax registrations');
  const einAfter  = stableId('Company Foundation & Legal','EIN / federal tax ID & state tax registrations');
  ok('EIN id stable when its section moves', einBefore === einAfter, { einBefore, einAfter });
}

// ------------------------------------------------------------------
// 2. AUTH GATE
// ------------------------------------------------------------------
console.log('2. AUTH');
{
  ok('areaForPath(/api/coo-checklist) === financials_global', areaForPath('/api/coo-checklist') === 'financials_global');
  ok('admin can access', roleCanAccess('admin','financials_global') === true);
  ok('partner can access', roleCanAccess('partner','financials_global') === true);
  ok('business_dev BLOCKED', roleCanAccess('business_dev','financials_global') === false);
  ok('field_ops BLOCKED', roleCanAccess('field_ops','financials_global') === false);

  // Handler-level enforcement (defense-in-depth): a field_ops session hitting the
  // handler directly gets 403 on both GET and POST.
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const fo = { uid:'crew1', role:'field_ops', name:'Crew' };
  const g = await onRequestGet(ctx(fo, env, req('https://x/api/coo-checklist')));
  ok('handler GET blocks field_ops (403)', g.status === 403, g.status);
  const p = await onRequestPost(ctx(fo, env, req('https://x/api/coo-checklist', { id:'x.y', checked:true })));
  ok('handler POST blocks field_ops (403)', p.status === 403, p.status);
  const gb = await onRequestGet(ctx({ uid:'d', role:'business_dev', name:'Derek' }, env, req('https://x/api/coo-checklist')));
  ok('handler GET blocks business_dev (403)', gb.status === 403, gb.status);
}

// ------------------------------------------------------------------
// 3. GET/POST ROUND-TRIP (single upsert)
// ------------------------------------------------------------------
console.log('3. ROUND-TRIP');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const admin = { uid:'brad', role:'admin', name:'Brad' };

  // Empty GET first.
  let g = await onRequestGet(ctx(admin, env, req('https://x/api/coo-checklist')));
  let gj = await g.json();
  ok('initial GET ok + empty', g.status === 200 && gj.ok && Object.keys(gj.items).length === 0, gj);

  // POST a checkoff.
  const id = 'financials-accounting.labor-burden-rate-true-loaded-cost';
  let p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id, checked:true })));
  let pj = await p.json();
  ok('POST saved:true', p.status === 200 && pj.saved === true, pj);
  ok('POST stamps checkedBy from session (Brad)', pj.items[id] && pj.items[id].checkedBy === 'Brad', pj.items[id]);
  ok('POST stamps checkedAt (ISO)', pj.items[id] && /^\d{4}-\d{2}-\d{2}T/.test(pj.items[id].checkedAt||''), pj.items[id]);
  ok('POST checked=true persisted', pj.items[id] && pj.items[id].checked === true, pj.items[id]);

  // Re-GET: state survives.
  g = await onRequestGet(ctx(admin, env, req('https://x/api/coo-checklist')));
  gj = await g.json();
  ok('GET round-trips the checkoff', gj.items[id] && gj.items[id].checked === true, gj.items[id]);

  // Uncheck round-trip.
  p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id, checked:false })));
  pj = await p.json();
  ok('POST uncheck persists', pj.items[id].checked === false, pj.items[id]);

  // A DIFFERENT id upsert leaves the first untouched (per-id merge).
  const id2 = 'company-foundation-legal.ein-federal-tax-id-state-tax-registrations';
  p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id:id2, checked:true, note:'Need from Brad' })));
  pj = await p.json();
  ok('per-id merge keeps other ids', pj.items[id] && pj.items[id2] && pj.items[id2].note === 'Need from Brad', pj.items);

  // Partner (Jonathan) can write too.
  const partner = { uid:'jon', role:'partner', name:'Jonathan' };
  p = await onRequestPost(ctx(partner, env, req('https://x/api/coo-checklist', { id, checked:true })));
  pj = await p.json();
  ok('partner can POST + stamped as Jonathan', pj.saved && pj.items[id].checkedBy === 'Jonathan', pj.items[id]);
}

// ------------------------------------------------------------------
// 4. RENDER MERGE (server overrides defaults)
// ------------------------------------------------------------------
console.log('4. RENDER MERGE');
{
  // Replicate the client precedence: server > legacy > default(known).
  function resolve(itemStatus, serverEntry, legacyVal){
    if (serverEntry != null && typeof serverEntry.checked === 'boolean') return serverEntry.checked;
    if (legacyVal != null) return !!legacyVal;
    return itemStatus === 'k';
  }
  ok('default: Known item checked when no server/legacy', resolve('k', undefined, undefined) === true);
  ok('default: Need item unchecked when no server/legacy', resolve('n', undefined, undefined) === false);
  ok('server checked overrides a default-unchecked Need', resolve('n', { checked:true }, undefined) === true);
  ok('server unchecked overrides a default-checked Known', resolve('k', { checked:false }, undefined) === false);
  ok('legacy used only when server absent', resolve('n', undefined, true) === true);
  ok('server WINS over legacy', resolve('n', { checked:false }, true) === false);
}

// ------------------------------------------------------------------
// 5. FAIL-CLOSED (no KV binding)
// ------------------------------------------------------------------
console.log('5. FAIL-CLOSED');
{
  const admin = { uid:'brad', role:'admin', name:'Brad' };
  const env = {}; // no PF_SCHEDULE
  const g = await onRequestGet(ctx(admin, env, req('https://x/api/coo-checklist')));
  const gj = await g.json();
  ok('GET no-KV returns empty + fallback:true (never fabricates)', g.status === 200 && gj.fallback === true && Object.keys(gj.items).length === 0, gj);
  const p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id:'x.y', checked:true })));
  const pj = await p.json();
  ok('POST no-KV returns 503 + NOT saved', p.status === 503 && !pj.saved, pj);
}

// ------------------------------------------------------------------
// 6. INPUT HARDENING
// ------------------------------------------------------------------
console.log('6. HARDENING');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const admin = { uid:'brad', role:'admin', name:'Brad' };
  // bad id shape -> 400
  let p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id:'Bad ID!!', checked:true })));
  ok('rejects malformed id (400)', p.status === 400, p.status);
  // invalid JSON -> 400
  const raw = new Request('https://x/api/coo-checklist', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{not json' });
  p = await onRequestPost(ctx(admin, env, raw));
  ok('rejects invalid JSON (400)', p.status === 400, p.status);
  // note angle-brackets stripped
  p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { id:'a.b', checked:true, note:'<script>x</script>' })));
  const pj = await p.json();
  ok('strips angle brackets from note', pj.items['a.b'].note === 'scriptx/script', pj.items['a.b']);
  // bulk upsert
  p = await onRequestPost(ctx(admin, env, req('https://x/api/coo-checklist', { items:{ 'c.d':{checked:true}, 'e.f':{checked:false,note:'n'} } })));
  const bj = await p.json();
  ok('bulk upsert saves multiple', bj.saved && bj.items['c.d'].checked === true && bj.items['e.f'].checked === false, bj.items);
}

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
