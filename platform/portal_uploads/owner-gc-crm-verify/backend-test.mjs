// Backend unit tests for the Owner/GC CRM cascading selector extension.
//   1. project-override.js now accepts a __crm object under `general` (Owner/GC),
//      validates it identically to design_professionals, merges it beside the flat
//      Owner/GC string fields, and round-trips it (mock KV).
//   2. A __crm on `general` with a bad contactId (not ^C\d+$) => 400, store unchanged.
//   3. A __crm on a DISALLOWED section (e.g. contract) => 400.
//   4. design_professionals __crm STILL works (no regression).
//   5. contacts.js ?trade=Owner / ?trade=GC company + contact projections filter by
//      the exact Category strings and never leak other categories.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/owner-gc-crm-verify/backend-test.mjs
import * as override from '../../functions/api/project-override.js';
import * as contacts from '../../functions/api/contacts.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + name); } }

function makeKV() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    _m: m,
  };
}
function req(bodyObj, extraHeaders = {}) {
  const body = JSON.stringify(bodyObj);
  return {
    url: 'https://x/api/x',
    headers: { get: (h) => (h.toLowerCase() === 'content-length' ? String(body.length) : (extraHeaders[h] || null)) },
    text: async () => body,
  };
}
const office = { role: 'partner', name: 'Tester' };

// =====================================================================
// 1. general __crm (Owner + GC) round-trip
// =====================================================================
console.log('== general __crm (Owner + GC) ==');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const r1 = await override.onRequestPost({
    request: req({ num: '26-OWN', section: 'general', fields: {
      'Owner': 'Westhoff Development',
      'General Contractor': 'Weigand Construction',
      '__crm': {
        'Owner': { company: 'Westhoff Development', contactIds: ['C0009', 'C0014'] },
        'GC': { company: 'Weigand Construction', contactIds: ['C0007', 'C0008'] }
      }
    } }),
    env, data: { session: office },
  });
  const b1 = await r1.json();
  ok('general __crm POST ok', r1.status === 200 && b1.ok === true && b1.saved === true);
  const g = b1.sections && b1.sections.general;
  ok('flat Owner string field coexists', g && g['Owner'] === 'Westhoff Development');
  ok('flat GC string field coexists', g && g['General Contractor'] === 'Weigand Construction');
  ok('__crm stored under general', g && g.__crm && typeof g.__crm === 'object');
  ok('__crm.Owner company + ids', g && g.__crm.Owner &&
    g.__crm.Owner.company === 'Westhoff Development' &&
    g.__crm.Owner.contactIds.length === 2 &&
    g.__crm.Owner.contactIds[0] === 'C0009' && g.__crm.Owner.contactIds[1] === 'C0014');
  ok('__crm.GC company + ids', g && g.__crm.GC &&
    g.__crm.GC.company === 'Weigand Construction' &&
    g.__crm.GC.contactIds[0] === 'C0007' && g.__crm.GC.contactIds[1] === 'C0008');

  // A subsequent NORMAL field save (no __crm in body) preserves the __crm.
  const r2 = await override.onRequestPost({
    request: req({ num: '26-OWN', section: 'general', fields: { 'County': 'Allen' } }),
    env, data: { session: office },
  });
  const b2 = await r2.json();
  ok('normal general field save ok', r2.status === 200 && b2.ok === true);
  ok('__crm preserved across a non-__crm save', b2.sections.general.__crm &&
    b2.sections.general.__crm.Owner.contactIds.length === 2 &&
    b2.sections.general.__crm.GC.contactIds.length === 2);
  ok('new plain field merged', b2.sections.general['County'] === 'Allen');

  // A whole-object replace (empty {}) clears the selection = deliberate clear.
  const r3 = await override.onRequestPost({
    request: req({ num: '26-OWN', section: 'general', fields: { '__crm': {} } }),
    env, data: { session: office },
  });
  const b3 = await r3.json();
  ok('empty __crm clears selection', r3.status === 200 &&
    b3.sections.general.__crm && Object.keys(b3.sections.general.__crm).length === 0);
  ok('flat fields survive the clear', b3.sections.general['Owner'] === 'Westhoff Development' &&
    b3.sections.general['County'] === 'Allen');
}

// =====================================================================
// 2. general __crm with a malformed contactId => 400, store unchanged
// =====================================================================
console.log('== general __crm malformed id => 400 ==');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const r = await override.onRequestPost({
    request: req({ num: '26-BAD', section: 'general', fields: {
      '__crm': { 'Owner': { company: 'X', contactIds: ['NOPE'] } }
    } }),
    env, data: { session: office },
  });
  ok('malformed general __crm => 400', r.status === 400);
  ok('nothing written on malformed', kv._m.size === 0);
}

// =====================================================================
// 3. __crm on a disallowed section => 400
// =====================================================================
console.log('== __crm on contract (disallowed) => 400 ==');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const r = await override.onRequestPost({
    request: req({ num: '26-CON', section: 'contract', fields: {
      '__crm': { 'Owner': { company: 'X', contactIds: ['C0001'] } }
    } }),
    env, data: { session: office },
  });
  ok('__crm on contract => 400', r.status === 400);
  ok('nothing written for disallowed section', kv._m.size === 0);
}

// =====================================================================
// 4. design_professionals __crm STILL works (no regression)
// =====================================================================
console.log('== design_professionals __crm no-regression ==');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const r = await override.onRequestPost({
    request: req({ num: '26-DP', section: 'design_professionals', fields: {
      '__crm': { 'Geotechnical': { company: 'Acme Geo', contactIds: ['C0003'] } }
    } }),
    env, data: { session: office },
  });
  const b = await r.json();
  ok('DP __crm still ok', r.status === 200 && b.ok === true &&
    b.sections.design_professionals.__crm.Geotechnical.contactIds[0] === 'C0003');
}

// =====================================================================
// 5. contacts.js ?trade=Owner / ?trade=GC projections
// =====================================================================
console.log('== contacts.js trade=Owner / trade=GC ==');
{
  // Mock a Graph-backed KV cache so the handler serves our fixture directly.
  const fixtureRows = [
    // header handled internally; we feed the flat cache the handler reads.
  ];
  // The GET handler reads a KV cache key. Simpler: build env with a KV that returns
  // a warm cache JSON in the shape contacts.js expects. Inspect its cache key.
  // We drive the projection functions via a synthetic contacts list through the
  // public GET by pre-seeding the cache. Cache key + shape verified from source.
  const list = [
    { contactId: 'C0009', firstName: 'Nathan', lastName: 'Westhoff', name: 'Nathan Westhoff', title: 'Owner', company: 'Westhoff Development', category: 'Owner', officePhone: '', cellPhone: '2604131111', email: 'nw@x.com', companyAddress: '1 A St', companyWebsite: 'wd.com' },
    { contactId: 'C0014', firstName: 'Larry', lastName: 'Blanchard', name: 'Larry Blanchard', title: 'Partner', company: 'Westhoff Development', category: 'Owner', officePhone: '', cellPhone: '2604132222', email: 'lb@x.com', companyAddress: '', companyWebsite: '' },
    { contactId: 'C0007', firstName: 'Tanner', lastName: 'Schweer', name: 'Tanner Schweer', title: 'PM', company: 'Weigand Construction', category: 'GC', officePhone: '2604133333', cellPhone: '', email: 'ts@x.com', companyAddress: '2 B St', companyWebsite: 'weigand.com' },
    { contactId: 'C0008', firstName: 'Jacob', lastName: 'Lincoln', name: 'Jacob Lincoln', title: 'Super', company: 'Weigand Construction', category: 'GC', officePhone: '', cellPhone: '2604134444', email: 'jl@x.com', companyAddress: '', companyWebsite: '' },
    { contactId: 'C0003', firstName: 'Amy', lastName: 'Geo', name: 'Amy Geo', title: 'PE', company: 'Acme Geo', category: 'Geotechnical Engineer', officePhone: '', cellPhone: '', email: 'ag@x.com', companyAddress: '', companyWebsite: '' }
  ];
  // Discover the cache key contacts.js reads.
  const src = (await import('node:fs')).readFileSync(new URL('../../functions/api/contacts.js', import.meta.url), 'utf8');
  const keyMatch = src.match(/contacts_cache[_a-zA-Z0-9]*/);
  const cacheKey = keyMatch ? keyMatch[0] : 'contacts_cache_v1';
  const kv = makeKV();
  // The handler wraps the cache in an envelope; try the common { contacts, ts } shape,
  // falling back to a bare array — assert whichever the handler accepts.
  await kv.put(cacheKey, JSON.stringify({ contacts: list, cachedAt: Date.now(), source: 'test' }));
  const env = { PF_SCHEDULE: kv };

  async function getTrade(qs) {
    const r = await contacts.onRequestGet({
      request: { url: 'https://x/api/contacts?' + qs },
      env, data: { session: office },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }

  const ownerCos = await getTrade('trade=' + encodeURIComponent('Owner'));
  const gcCos = await getTrade('trade=' + encodeURIComponent('GC'));
  // The projection may live under .companies or be the array itself; normalize.
  const asArr = (b) => Array.isArray(b) ? b : (b && (b.companies || b.contacts || b.items)) || [];
  const oco = asArr(ownerCos.body);
  const gco = asArr(gcCos.body);
  const ownerHasWesthoff = oco.some(c => (c.company || '') === 'Westhoff Development');
  const ownerNoGc = !oco.some(c => (c.company || '') === 'Weigand Construction');
  const gcHasWeigand = gco.some(c => (c.company || '') === 'Weigand Construction');
  const gcNoOwner = !gco.some(c => (c.company || '') === 'Westhoff Development');
  ok('trade=Owner returns Owner-category company', ownerCos.status === 200 && ownerHasWesthoff);
  ok('trade=Owner excludes GC company', ownerNoGc);
  ok('trade=GC returns GC-category company', gcCos.status === 200 && gcHasWeigand);
  ok('trade=GC excludes Owner company', gcNoOwner);

  const ownerContacts = await getTrade('company=' + encodeURIComponent('Westhoff Development') + '&trade=' + encodeURIComponent('Owner'));
  const oc = asArr(ownerContacts.body);
  ok('Owner company contacts = C0009 + C0014',
    ownerContacts.status === 200 &&
    oc.some(c => c.contactId === 'C0009') && oc.some(c => c.contactId === 'C0014') &&
    !oc.some(c => c.contactId === 'C0007'));
  const gcContacts = await getTrade('company=' + encodeURIComponent('Weigand Construction') + '&trade=' + encodeURIComponent('GC'));
  const gc = asArr(gcContacts.body);
  ok('GC company contacts = C0007 + C0008',
    gcContacts.status === 200 &&
    gc.some(c => c.contactId === 'C0007') && gc.some(c => c.contactId === 'C0008') &&
    !gc.some(c => c.contactId === 'C0009'));
}

// =====================================================================
// 6. Project Contacts (Brad 2026-08-11): the new dedicated contact groups save
//    __crm under EXISTING keys safety / siteReadiness / equipment / material.
//    Those keys must now accept a __crm body (CRM_ALLOWED_SECTIONS extended); a
//    still-disallowed key (contract) must keep rejecting __crm with 400.
// =====================================================================
console.log('\n== Project Contacts new CRM keys (safety/siteReadiness/equipment/material) ==');
for (const key of ['safety', 'siteReadiness', 'equipment', 'material']) {
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };
  const r = await override.onRequestPost({
    request: req({ num: '26-PC', section: key, fields: {
      '__crm': { 'Grp': { company: 'Acme Co', contactIds: ['C0100'] } }
    } }),
    env, data: { session: office },
  });
  const b = await r.json();
  ok(key + ' accepts __crm (200 saved)', r.status === 200 && b.ok === true && b.saved === true);
  const sec = b.sections && b.sections[key];
  ok(key + ' __crm stored', sec && sec.__crm && sec.__crm.Grp &&
    sec.__crm.Grp.company === 'Acme Co' && sec.__crm.Grp.contactIds[0] === 'C0100');
}
{
  // contract is NOT in CRM_ALLOWED_SECTIONS -> __crm body must 400.
  const kv = makeKV();
  const r = await override.onRequestPost({
    request: req({ num: '26-PC', section: 'contract', fields: {
      '__crm': { 'Grp': { company: 'Acme Co', contactIds: ['C0100'] } }
    } }),
    env: { PF_SCHEDULE: kv }, data: { session: office },
  });
  ok('contract still rejects __crm (400)', r.status === 400);
}

console.log('\n== RESULT ==  pass=' + pass + '  fail=' + fail);
process.exit(fail ? 1 : 0);
