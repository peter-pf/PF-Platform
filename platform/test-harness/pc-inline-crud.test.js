// ============================================================================
// Project Contacts — INLINE CRUD  (Brad 2026-08-13 REWORK)
// Proves, end-to-end in a jsdom DOM using the REAL functions extracted verbatim
// from index.html, that:
//   (a) editing a contact FIELD saves + updates the shared DIRECTORY record
//       (/api/contacts update) -> reusable everywhere
//   (b) "+ Add contact" mints a directory contact AND assigns it to the project group
//   (c) Remove (×) unassigns from THIS project group only (drops the id from __crm),
//       and does NOT hard-delete the directory record
//   (d) shared-directory reuse: a field edited via the directory record shows updated
//       when the SAME contact renders on ANOTHER project's group
//   (e) NO Edit buttons rendered in Project Contacts (no pr-crow-editbtn); the cells
//       are contenteditable save-on-change
//   (f) field_ops is read-only (no contenteditable cells, no add/remove controls)
//   (g) fail-closed revert (server + network error -> cell reverts, no cache change)
//   (h) NO renderProjectRecord in any save/add/remove path (in-place refresh only)
//   (i) reserved keys preserved: an add/remove/company-rename resends the section's
//       FULL __crm map (every sibling group) and never touches other reserved keys
// ============================================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- extract a top-level `function NAME(...) {...}` by brace-matching -------
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}
// ---- extract a `window.NAME = function(...) {...};` assignment --------------
function extractWinFn(src, name) {
  const startRe = new RegExp('window\\.' + name + '\\s*=\\s*function\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('window fn not found: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  // include the trailing ';'
  let end = j;
  if (src[end] === ';') end++;
  return src.slice(m.index, end);
}

// Assert the production render EMITS contenteditable cells + NO edit button, and the
// mount hook is called after render. These verbatim substrings keep the harness honest.
const CELL_SIG = "class=\"pr-crow-' + cls + ' pr-pc-inline\" contenteditable=\"true\"";
const NO_EDITBTN = html.indexOf("pfCrmEditContactRow(this)\">&#9998; Edit") ; // must NOT be emitted in render
const MOUNT_HOOK = "if (typeof pfPcMountInline === 'function') pfPcMountInline(root);";
if (html.indexOf(CELL_SIG) < 0) throw new Error('inline cell signature missing from index.html');
if (html.indexOf(MOUNT_HOOK) < 0) throw new Error('pfPcMountInline hook missing from render');

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- build a jsdom sandbox with the real functions wired in ----------------
function build(opts) {
  opts = opts || {};
  const role = opts.role || 'admin';
  const overrides = opts.overrides || {};
  const directory = opts.directory || [];
  const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', { runScripts: 'outside-only' });
  const win = dom.window;
  const doc = win.document;
  const captured = { posts: [], renderProjectRecordCalls: 0, crmRenderCardsCalls: 0 };

  // fetch mock: routes /api/contacts (add/update) and /api/project-override.
  win.fetch = function (url, init) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    captured.posts.push({ url, body });
    // allow a test to force an error response
    if (typeof opts.respond === 'function') {
      const forced = opts.respond(url, body);
      if (forced) return forced.__network
        ? Promise.reject(new Error('network'))
        : Promise.resolve({ ok: forced.httpOk !== false, status: forced.status || 200, json: () => Promise.resolve(forced.json) });
    }
    if (String(url).indexOf('/api/contacts') === 0) {
      if (body.action === 'update') {
        const c = body.contact;
        const saved = Object.assign({}, c, { name: ((c.firstName||'')+' '+(c.lastName||'')).trim() });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, saved: true, action: 'update', contact: saved }) });
      }
      if (body.action === 'add') {
        const c = body.contact;
        const id = 'C' + String(9000 + captured.posts.filter(p => p.body.action === 'add').length).padStart(4, '0');
        const saved = Object.assign({}, c, { contactId: id, name: ((c.firstName||'')+' '+(c.lastName||'')).trim() });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, saved: true, action: 'add', contact: saved }) });
      }
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ status: 'error' }) });
    }
    if (String(url).indexOf('/api/project-override') === 0) {
      // mimic server Object.assign(existing, fields) at section level
      const out = JSON.parse(JSON.stringify(overrides));
      const sk = body.section;
      out[sk] = Object.assign({}, out[sk] || {}, body.fields || {});
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, saved: true, sections: out }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };

  const g = win;
  g.esc2 = function (v) { return v == null ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
  g.window.esc = g.esc2;
  g.PF_CRM_KEY = '__crm';
  g.PF_CRM_SECTION_TRADE = { 'Geotechnical':'Geotechnical Engineer','Civil':'Civil Engineer','Structural':'Structural Engineer','Ground Improvement':'Ground Improvement Engineer' };
  g.PF_CRM_GENERAL_TRADE = { 'Owner':'Owner','GC':'GC' };
  g.PF_CRM_NEWGROUP_TRADE = {
    pfTeam:{'PF Project Team':'PF Team'}, safety:{'Safety Consultant':'Safety Consultant'},
    siteReadiness:{'Staking & Layout':'Staking & Layout'},
    equipment:{'Equipment Transport':'Equipment Transport','Rental Equipment':'Rental Equipment'},
    material:{'Material Vendor(s)':'Material Vendor','Fuel Delivery':'Fuel Delivery'}
  };
  g._curNum = opts.num || '99-999';
  g._curOverrides = JSON.parse(JSON.stringify(overrides));
  g.window.PF_ME = { role };
  g.window.PF_PROJECT_OVERRIDES = {};
  g.canEdit = function () { return role === 'admin' || role === 'partner' || role === 'business_dev'; };
  g.pfCrmMap = function (sectionKey) {
    var sk = sectionKey || 'design_professionals';
    var sec = g._curOverrides && g._curOverrides[sk];
    var crm = sec && sec[g.PF_CRM_KEY];
    return (crm && typeof crm === 'object' && !Array.isArray(crm)) ? crm : {};
  };
  g.pfFmtPhone = function (p) { return p || ''; };
  g.pfSplitContactName = function (n) {
    var parts = String(n).trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length-1] };
  };
  // Directory cache (PF_CONTACTS) + pfLoadContacts resolve from the same array.
  g.PF_CONTACTS = JSON.parse(JSON.stringify(directory));
  g._pfContactsPromise = null;
  g.pfLoadContacts = function () { return Promise.resolve(g.PF_CONTACTS); };
  // instrument renderProjectRecord to prove it's never called
  g.renderProjectRecord = function () { captured.renderProjectRecordCalls++; };
  g.window.renderProjectRecord = g.renderProjectRecord;

  // ---- load the REAL functions ----
  const src = [
    'var _pfPcInlineBound = false;',   // module-scoped guard referenced by pfPcMountInline
    extractFn(html, 'pfCrmRenderCards'),
    'window.pfCrmRenderCards = pfCrmRenderCards;',
    extractFn(html, 'pfPcDirRecord'),
    extractFn(html, 'pfPcAdoptDirRow'),
    extractFn(html, 'pfPcSay'),
    extractFn(html, 'pfPcInlineFieldSave'),
    extractFn(html, 'pfPcInlineCompanySave'),
    extractFn(html, 'pfPcMountInline'),
    extractFn(html, 'pfPcGroupTradeSafe'),
    extractWinFn(html, 'pfPcAddContact'),
    extractWinFn(html, 'pfPcAddContactCancel'),
    extractWinFn(html, 'pfPcAddContactSave'),
    extractWinFn(html, 'pfCrmRemoveContactRow'),
    extractWinFn(html, 'pfCrmRemoveContactCancel'),
    extractWinFn(html, 'pfCrmRemoveContactConfirm'),
  ].join('\n\n');
  win.eval(src);
  // count in-place refreshes AFTER real fn is defined (wrap it)
  const realRender = win.pfCrmRenderCards;
  win.pfCrmRenderCards = function (r) { captured.crmRenderCardsCalls++; return realRender(r); };
  win.window.pfCrmRenderCards = win.pfCrmRenderCards;

  return { win, doc, captured, g };
}

// A host element wired exactly like the render emits (data-crm-cards / -key).
function makeHost(doc, prefix, key, roleTag) {
  const host = doc.createElement('div');
  host.className = 'pr-crm-cards';
  host.setAttribute('data-crm-cards', prefix);
  host.setAttribute('data-crm-cards-key', key);
  if (roleTag) host.setAttribute('data-role-tag', roleTag);
  doc.getElementById('root').appendChild(host);
  return host;
}

const wait = () => new Promise(r => setTimeout(r, 0));

// ===========================================================================
(async function run() {
  console.log('\n==== Project Contacts INLINE CRUD (save-on-change, shared directory) ====\n');

  const DIR = [
    { contactId:'C0001', firstName:'Alice', lastName:'Ng', name:'Alice Ng', title:'PE', company:'Acme Structural', category:'Structural Engineer', officePhone:'2601111111', cellPhone:'2602222222', email:'alice@acme.com', notes:'lead' },
    { contactId:'C0002', firstName:'Bob', lastName:'Lee', name:'Bob Lee', title:'PM', company:'Acme Structural', category:'Structural Engineer', officePhone:'', cellPhone:'', email:'bob@acme.com', notes:'' },
  ];
  const OVERRIDES = {
    design_professionals: {
      __crm: {
        'Structural': { company:'Acme Structural', contactIds:['C0001','C0002'] },
        'Geotechnical': { company:'Geo Co', contactIds:['C0003'] }   // sibling group (preserve)
      },
      '__submittal_pull': { some:'reserved' },
      '__site_elevations': [1,2,3],
      'Flat Field': 'keepme'
    }
  };

  // ---- (e) render: NO Edit button, cells are contenteditable ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc);
    await wait(); await wait();
    const editBtns = doc.querySelectorAll('.pr-crow-editbtn');
    ok('(e) no Edit buttons rendered in Project Contacts', editBtns.length === 0);
    const cells = host.querySelectorAll('.pr-pc-inline[contenteditable="true"]');
    ok('(e) contenteditable inline cells rendered (>=6 for one contact)', cells.length >= 6);
    const addBtn = host.querySelector('.pr-pc-addbtn');
    ok('(b-pre) "+ Add contact" button rendered per group', !!addBtn);
    const rmBtn = host.querySelector('.pr-crow-rmbtn');
    ok('(c-pre) Remove (×) button rendered per row', !!rmBtn);
    const coEdit = host.querySelector('.pr-pc-company-edit[contenteditable="true"]');
    ok('(e) company name is inline-editable', !!coEdit);
  }

  // ---- (f) field_ops read-only: no editable cells / controls ----
  {
    const { win, doc } = build({ overrides: OVERRIDES, directory: DIR, role: 'field_ops' });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc);
    await wait(); await wait();
    ok('(f) field_ops: no contenteditable cells', host.querySelectorAll('.pr-pc-inline').length === 0);
    ok('(f) field_ops: no add button', !host.querySelector('.pr-pc-addbtn'));
    ok('(f) field_ops: no remove button', !host.querySelector('.pr-crow-rmbtn'));
    ok('(f) field_ops: still shows read rows', host.querySelectorAll('.pr-crow').length >= 2);
  }

  // ---- (a) edit a field -> /api/contacts update (directory), in-place refresh, no bounce ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfPcMountInline(doc);
    win.pfCrmRenderCards(doc);
    await wait(); await wait();
    const titleCell = host.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    ok('(a) title cell present + resolves C0001', titleCell && titleCell.getAttribute('data-crm-cid') === 'C0001');
    titleCell.textContent = 'Senior PE';
    win.pfPcInlineFieldSave(titleCell);
    await wait(); await wait(); await wait();
    const upd = captured.posts.find(p => String(p.url).indexOf('/api/contacts') === 0 && p.body.action === 'update');
    ok('(a) POST /api/contacts action:update fired', !!upd);
    ok('(a) update targets C0001', upd && upd.body.contact.contactId === 'C0001');
    ok('(a) update sets new title', upd && upd.body.contact.title === 'Senior PE');
    ok('(a) update carries through email (not blanked)', upd && upd.body.contact.email === 'alice@acme.com');
    ok('(a) directory cache updated (reusable)', win.PF_CONTACTS.find(c => c.contactId === 'C0001').title === 'Senior PE');
    ok('(a) no renderProjectRecord bounce', captured.renderProjectRecordCalls === 0);
    ok('(a) in-place refresh happened', captured.crmRenderCardsCalls >= 2);
  }

  // ---- (a/g) no-op when unchanged; fail-closed revert on server error ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const emailCell = host.querySelector('.pr-crow .pr-crow-email.pr-pc-inline');
    // unchanged -> no POST
    win.pfPcInlineFieldSave(emailCell);
    await wait();
    ok('(a) unchanged field triggers no POST', !captured.posts.some(p => p.body.action === 'update'));
  }
  {
    const { win, doc, captured } = build({
      overrides: OVERRIDES, directory: DIR,
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'update')
        ? { httpOk: false, status: 500, json: { status:'error', message:'boom' } } : null
    });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const cell = host.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    const prev = cell.getAttribute('data-pf-prev');
    cell.textContent = 'Changed But Fails';
    win.pfPcInlineFieldSave(cell);
    await wait(); await wait(); await wait();
    ok('(g) server error reverts the cell text', cell.textContent === prev);
    ok('(g) server error: directory cache unchanged', win.PF_CONTACTS.find(c=>c.contactId==='C0001').title === 'PE');
  }
  {
    const { win, doc } = build({
      overrides: OVERRIDES, directory: DIR,
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'update') ? { __network: true } : null
    });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const cell = host.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    const prev = cell.getAttribute('data-pf-prev');
    cell.textContent = 'Network Dies';
    win.pfPcInlineFieldSave(cell);
    await wait(); await wait(); await wait();
    ok('(g) network error reverts the cell text', cell.textContent === prev);
  }

  // ---- (b/i) Add contact -> directory add + assign to project group; preserves siblings ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const addBtn = host.querySelector('.pr-pc-addbtn');
    win.pfPcAddContact(addBtn);
    const form = host.querySelector('.pr-crm-addform');
    ok('(b) add form opens', !!form);
    form.querySelector('[data-af="name"]').value = 'Carol Fox';
    form.querySelector('[data-af="email"]').value = 'carol@acme.com';
    const save = form.querySelector('.pr-save-btn');
    win.pfPcAddContactSave(save);
    await wait(); await wait(); await wait(); await wait();
    const addPost = captured.posts.find(p => p.body.action === 'add');
    ok('(b) POST /api/contacts action:add fired', !!addPost);
    ok('(b) new contact tagged with group trade (Category)', addPost && addPost.body.contact.category === 'Structural Engineer');
    ok('(b) new contact carries group company', addPost && addPost.body.contact.company === 'Acme Structural');
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(b) project-override POST fired to assign new id', !!ovPost);
    const crm = ovPost.body.fields.__crm;
    ok('(b) new id appended to Structural group', crm.Structural.contactIds.length === 3 && crm.Structural.contactIds[2].startsWith('C9'));
    ok('(i) sibling group Geotechnical preserved', crm.Geotechnical && crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(i) add uses correct section key', ovPost.body.section === 'design_professionals');
    ok('(h) add: no renderProjectRecord bounce', captured.renderProjectRecordCalls === 0);
  }

  // ---- (c/i) Remove (×) -> unassign from project group only; directory intact; in-place ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const rmBtn = host.querySelector('.pr-crow .pr-crow-rmbtn');  // first row = C0001
    win.pfCrmRemoveContactRow(rmBtn);
    const confirm = host.querySelector('.pr-crow-rmconfirm .pr-rm-yes');
    ok('(c) remove confirm bar appears', !!confirm);
    win.pfCrmRemoveContactConfirm(confirm);
    await wait(); await wait(); await wait();
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(c) remove POSTs project-override (not /api/contacts delete)', !!ovPost && !captured.posts.some(p => p.body.action === 'delete'));
    const crm = ovPost.body.fields.__crm;
    ok('(c) C0001 dropped from Structural group', crm.Structural.contactIds.indexOf('C0001') === -1);
    ok('(c) C0002 kept in Structural group', crm.Structural.contactIds.indexOf('C0002') !== -1);
    ok('(c) directory record NOT hard-deleted (still in cache)', !!win.PF_CONTACTS.find(c => c.contactId === 'C0001'));
    ok('(i) sibling Geotechnical preserved on remove', crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(h) remove: no renderProjectRecord bounce', captured.renderProjectRecordCalls === 0);
    ok('(h) remove: in-place refresh happened', captured.crmRenderCardsCalls >= 2);
  }

  // ---- (d) shared-directory reuse: edit reflects on ANOTHER project's group ----
  {
    // project A edits C0001's title via the directory record; project B (separate build,
    // same directory record shape) renders C0001 and shows the updated title.
    const { win, doc } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const cell = host.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    cell.textContent = 'Principal PE';
    win.pfPcInlineFieldSave(cell);
    await wait(); await wait(); await wait();
    const updatedRecord = win.PF_CONTACTS.find(c => c.contactId === 'C0001');
    ok('(d) directory record now Principal PE', updatedRecord.title === 'Principal PE');

    // Project B: a DIFFERENT project/override, but the SAME shared directory record.
    const OVERRIDES_B = { general: { __crm: { 'GC': { company:'Acme Structural', contactIds:['C0001'] } } } };
    const { win: winB, doc: docB } = build({ overrides: OVERRIDES_B, directory: [updatedRecord], num: '88-888' });
    const hostB = makeHost(docB, 'GC', 'general', 'General Contractor');
    winB.pfCrmRenderCards(docB); await wait(); await wait();
    const titleB = hostB.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    ok('(d) same contact on another project shows updated title', titleB && titleB.textContent === 'Principal PE');
  }

  // ---- (i) company rename resends FULL __crm + preserves reserved keys; updates directory ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const co = host.querySelector('.pr-pc-company-edit');
    co.textContent = 'Acme Structural Engineers LLC';
    win.pfPcInlineCompanySave(co);
    await wait(); await wait(); await wait(); await wait();
    const dirUpdates = captured.posts.filter(p => String(p.url).indexOf('/api/contacts')===0 && p.body.action==='update');
    ok('(i) company rename updates every directory contact in group (2)', dirUpdates.length === 2);
    ok('(i) directory contacts got new company', dirUpdates.every(u => u.body.contact.company === 'Acme Structural Engineers LLC'));
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(i) company rename repoints __crm[Structural].company', ovPost && ovPost.body.fields.__crm.Structural.company === 'Acme Structural Engineers LLC');
    ok('(i) company rename preserves sibling group', ovPost && ovPost.body.fields.__crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(i) company rename keeps Structural contactIds', ovPost && ovPost.body.fields.__crm.Structural.contactIds.length === 2);
    ok('(h) company rename: no renderProjectRecord bounce', captured.renderProjectRecordCalls === 0);
  }

  // ---- listener wiring: focusout on an inline cell triggers a save ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfPcMountInline(doc);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const cell = host.querySelector('.pr-crow .pr-crow-title.pr-pc-inline');
    cell.textContent = 'Via Blur';
    const ev = new win.Event('focusout', { bubbles: true });
    cell.dispatchEvent(ev);
    await wait(); await wait(); await wait();
    ok('(wiring) focusout on inline cell fires an update POST', captured.posts.some(p => p.body.action === 'update' && p.body.contact.title === 'Via Blur'));
  }

  console.log('\nPASS: ' + pass + '  FAIL: ' + fail + '\n');
  if (fails.length) { console.log('Failures:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
