// Backend unit tests for the DP-editable-backfeed feature.
//   1. project-override.js accepts the new `design_professionals` section key
//      (and still rejects unknown keys, still round-trips via a mock KV).
//   2. contacts.js POST duplicate-guard: an `add` that matches an existing row by
//      email OR by name+company is re-routed to an in-place UPDATE (no new C#### row);
//      a distinct contact still ADDs; category/company are written through.
//   3. field_ops is blocked on both endpoints; 423 lock handled on the dedupe path.
//
// Run: OMP_NUM_THREADS=1 node portal_uploads/dp-editable-verify/backend-test.mjs
import * as override from '../../functions/api/project-override.js';
import * as contacts from '../../functions/api/contacts.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + name); } }

// ---- tiny in-memory KV ----
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
const fieldOps = { role: 'field_ops', name: 'Crew' };

// =====================================================================
// 1. project-override: new design_professionals key
// =====================================================================
console.log('== project-override: design_professionals key ==');
{
  const kv = makeKV();
  const env = { PF_SCHEDULE: kv };

  // POST a DP override
  const r1 = await override.onRequestPost({
    request: req({ num: '26-999', section: 'design_professionals',
      fields: { 'Geotechnical - Company': 'Acme Geo', 'Geotechnical - Contact 1 - Contact Name': 'Jane Doe' } }),
    env, data: { session: office },
  });
  const b1 = await r1.json();
  ok('DP override POST ok', r1.status === 200 && b1.ok === true && b1.saved === true);
  ok('DP override stored under design_professionals',
    b1.sections && b1.sections.design_professionals &&
    b1.sections.design_professionals['Geotechnical - Company'] === 'Acme Geo');

  // GET round-trips
  const rg = await override.onRequestGet({
    request: { url: 'https://x/api/project-override?num=26-999' },
    env, data: { session: office },
  });
  const bg = await rg.json();
  ok('DP override GET round-trips',
    bg.ok === true && bg.sections.design_professionals &&
    bg.sections.design_professionals['Geotechnical - Contact 1 - Contact Name'] === 'Jane Doe');

  // Does NOT collide with engineering key (separate bucket)
  const r2 = await override.onRequestPost({
    request: req({ num: '26-999', section: 'engineering', fields: { 'Prelim Design Fee': '$5,000' } }),
    env, data: { session: office },
  });
  const b2 = await r2.json();
  ok('engineering key independent of design_professionals',
    b2.sections.engineering['Prelim Design Fee'] === '$5,000' &&
    b2.sections.design_professionals['Geotechnical - Company'] === 'Acme Geo');

  // unknown key still rejected
  const r3 = await override.onRequestPost({
    request: req({ num: '26-999', section: 'design_pros_typo', fields: { a: 'b' } }),
    env, data: { session: office },
  });
  ok('unknown section still 400', r3.status === 400);

  // field_ops blocked
  const r4 = await override.onRequestPost({
    request: req({ num: '26-999', section: 'design_professionals', fields: { a: 'b' } }),
    env, data: { session: fieldOps },
  });
  ok('field_ops blocked on DP override POST', r4.status === 403);
}

// =====================================================================
// 2. contacts: duplicate-guard + category/company write-through
// =====================================================================
console.log('== contacts: duplicate-guard + category ==');

// Sheet fixture: header + 2 existing rows.
//  C0001 Jane Doe / Acme Geo / jane@acme.com   (Geotechnical Engineer)
//  C0002 Bob Civil / CivilCo / (no email)      (Civil Engineer)
const HEADER = ['Contact ID','First Name','Last Name','Title','Company','Category',
  'Office Phone','Cell Phone','Email','Company Address','Company Website','Notes','Active','Date Added','Last Updated'];
function sheetText() {
  return [
    HEADER,
    ['C0001','Jane','Doe','PE','Acme Geo','Geotechnical Engineer','','','jane@acme.com','','','','Yes','01/01/2026','01/01/2026'],
    ['C0002','Bob','Civil','PE','CivilCo','Civil Engineer','','','','','','','Yes','01/01/2026','01/01/2026'],
  ];
}

// Mock global fetch: token endpoint, workbook usedRange read, workbook range PATCH.
function installFetch(opts = {}) {
  const writes = [];
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.includes('/oauth2/v2.0/token')) {
      return { ok: true, json: async () => ({ access_token: 'TOK', expires_in: 3600 }) };
    }
    if (url.includes('usedRange')) {
      if (opts.readLocked) return { ok: false, status: 423, text: async () => 'resourceLocked' };
      return { ok: true, json: async () => ({ address: 'Contacts!A1:O3', rowCount: 3, columnCount: 15, text: sheetText() }) };
    }
    if (init && init.method === 'PATCH') {
      writes.push({ url, body: JSON.parse(init.body) });
      if (opts.writeLocked) return { ok: false, status: 423, text: async () => 'resourceLocked' };
      return { ok: true, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => 'nope' };
  };
  return writes;
}
const graphEnv = {
  PF_SCHEDULE: makeKV(),
  AZURE_CLIENT_ID: 'id', AZURE_CLIENT_SECRET: 'sec', AZURE_TENANT_ID: 'ten', SP_DRIVE_ID: 'drive',
};
function addrRow(writes) {
  // extract the sheet row number from the PATCH address in the URL
  const m = /A(\d+)%3AO\d+/.exec(writes[0].url) || /A(\d+):O\d+/.exec(decodeURIComponent(writes[0].url));
  return m ? parseInt(m[1], 10) : null;
}

// (a) duplicate by EMAIL -> update existing C0001, NO new row
{
  const writes = installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: {
      firstName: 'Jane', lastName: 'Doe', title: 'Senior PE', company: 'Acme Geo',
      category: 'Geotechnical Engineer', email: 'jane@acme.com', officePhone: '260-555-1000' } }),
    env: graphEnv, data: { session: office },
  });
  const b = await r.json();
  ok('email dup -> saved as update', b.ok === true && b.action === 'update' && b.deduped === true);
  ok('email dup -> patched existing C0001', b.contact && b.contact.contactId === 'C0001');
  ok('email dup -> one write only', writes.length === 1);
  ok('email dup -> targets C0001 row (row 2)', addrRow(writes) === 2);
  ok('email dup -> id preserved in written row', writes[0].body.values[0][0] === 'C0001');
  ok('email dup -> title refreshed', writes[0].body.values[0][3] === 'Senior PE');
}

// (b) duplicate by NAME+COMPANY (no email on either) -> update existing C0002
{
  const writes = installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: {
      firstName: 'Bob', lastName: 'Civil', title: 'Principal', company: 'CivilCo',
      category: 'Civil Engineer' } }),
    env: graphEnv, data: { session: office },
  });
  const b = await r.json();
  ok('name+company dup -> update', b.ok === true && b.action === 'update' && b.deduped === true);
  ok('name+company dup -> patched C0002', b.contact && b.contact.contactId === 'C0002');
  ok('name+company dup -> targets row 3', addrRow(writes) === 3);
}

// (c) DISTINCT contact -> ADD a fresh C0003 with category/company written through
{
  const writes = installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: {
      firstName: 'Sam', lastName: 'Struct', title: 'PE', company: 'StructCo',
      category: 'Structural Engineer', email: 'sam@struct.com', companyWebsite: 'structco.com' } }),
    env: graphEnv, data: { session: office },
  });
  const b = await r.json();
  ok('distinct -> add', b.ok === true && b.action === 'add' && !b.deduped);
  ok('distinct -> minted C0003', b.contact && b.contact.contactId === 'C0003');
  ok('distinct -> appended at row 4', addrRow(writes) === 4);
  ok('distinct -> category written (col F)', writes[0].body.values[0][5] === 'Structural Engineer');
  ok('distinct -> company written (col E)', writes[0].body.values[0][4] === 'StructCo');
  ok('distinct -> website written (col K)', writes[0].body.values[0][10] === 'structco.com');
  ok('distinct -> Active=Yes (col M)', writes[0].body.values[0][12] === 'Yes');
}

// (d) same-name DIFFERENT company -> NOT a dup (adds)
{
  const writes = installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: {
      firstName: 'Jane', lastName: 'Doe', company: 'OtherFirm' } }),
    env: graphEnv, data: { session: office },
  });
  const b = await r.json();
  ok('same name diff company -> add (not dup)', b.action === 'add' && b.contact.contactId === 'C0003');
}

// (e) bare name, NO company -> never over-matches (adds)
{
  const writes = installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: { firstName: 'Jane', lastName: 'Doe' } }),
    env: graphEnv, data: { session: office },
  });
  const b = await r.json();
  ok('bare name no company -> add (no over-match)', b.action === 'add');
}

// (f) 423 lock on read -> clean 423, nothing written
{
  installFetch({ readLocked: true });
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: { firstName: 'X', lastName: 'Y', company: 'Z' } }),
    env: graphEnv, data: { session: office },
  });
  ok('423 read lock -> 423', r.status === 423);
}

// (g) 423 lock on the dedupe UPDATE write -> clean 423
{
  installFetch({ writeLocked: true });
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: { firstName: 'Jane', lastName: 'Doe', company: 'Acme Geo', email: 'jane@acme.com' } }),
    env: graphEnv, data: { session: office },
  });
  ok('423 dedupe-write lock -> 423', r.status === 423);
}

// (h) field_ops blocked on contacts POST
{
  installFetch();
  const r = await contacts.onRequestPost({
    request: req({ action: 'add', contact: { firstName: 'A', lastName: 'B', company: 'C' } }),
    env: graphEnv, data: { session: fieldOps },
  });
  ok('field_ops blocked on contacts POST', r.status === 403);
}

console.log('\n================================================');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
