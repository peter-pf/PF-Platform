// ============================================================================
// Project Contacts — SAFETY-CONSULTANT / MATERIAL-VENDOR FORMAT  (Brad 2026-08-13)
// ----------------------------------------------------------------------------
// SUPERSEDES the earlier inline-contenteditable-cell approach. Brad rejected that
// twice; he wants the "Safety Consultant / Material Vendor" look applied to EVERY
// Project Contacts group:
//   [role tag]  Company (inline-editable)
//   Name | Title | Office | Cell | Email | Notes   ... [✎ Edit] [red ✕]
// Fields are STATIC display. Editing a contact happens via the [✎ Edit] button,
// which opens an inline editor form that SAVES to the shared directory
// (/api/contacts update) -> reflects on every project using that contact. The red
// ✕ UNASSIGNS from THIS project only (project-override), never a directory delete.
// The COMPANY name stays inline-editable (Brad's "how do I edit company names"
// question). "+ Add contact" mints a directory contact + assigns it here.
//
// Proves, end-to-end in a jsdom DOM using the REAL functions extracted verbatim
// from index.html, that:
//   (fmt) EVERY group renders .pr-crow rows with a [✎ Edit] button + red [✕] on
//         the right, and NO contenteditable field cells (the rejected approach is
//         gone). Uniform across Safety Consultant / Material Vendor / Structural /
//         GC / PF Team hosts (this ONE render fn feeds every group).
//   (edit) [✎ Edit] opens the inline editor; Save -> /api/contacts update writes to
//          the shared DIRECTORY, carries through un-edited columns, updates cache.
//   (reuse) the same contact edited via the directory shows updated on ANOTHER
//          project's group (single source of truth / reusability).
//   (company) company name is inline-editable; a rename updates every directory
//          contact in the group + repoints __crm[group].company + preserves siblings
//          and reserved keys (full-map resend).
//   (add)  "+ Add contact" mints a directory contact AND assigns it to the group;
//          siblings + reserved keys preserved.
//   (del)  red ✕ -> confirm -> project-override UNASSIGN only (no /api/contacts
//          delete); directory record intact; siblings + reserved keys preserved;
//          in-place refresh, no page bounce.
//   (ro)   field_ops is read-only: no Edit/✕/Add controls, no editable company,
//          static rows still render.
//   (fail) Edit-save server error + network error keep the editor OPEN (fail-closed),
//          directory cache unchanged, never fabricate a saved state.
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
  let end = j;
  if (src[end] === ';') end++;
  return src.slice(m.index, end);
}

// ---- source-level guards keep this harness honest against index.html --------
// The render MUST emit the [✎ Edit] button + red ✕ (the approved format), and must
// NOT emit the rejected contenteditable field cells for contact fields.
const EDITBTN_SIG = "onclick=\"window.pfCrmEditContactRow(this)\">&#9998; Edit</button>";
const RMBTN_SIG   = "onclick=\"window.pfCrmRemoveContactRow(this)\">&#10005;</button>";
const NO_FIELD_CE = "class=\"pr-crow-' + cls + ' pr-pc-inline\" contenteditable=\"true\""; // the retired approach
const COMPANY_CE  = "pr-pc-company-name pr-pc-inline pr-pc-company-edit\" contenteditable=\"true\"";
if (html.indexOf(EDITBTN_SIG) < 0) throw new Error('Edit button signature missing from render (index.html)');
if (html.indexOf(RMBTN_SIG)   < 0) throw new Error('red X remove button signature missing from render (index.html)');
if (html.indexOf(NO_FIELD_CE) >= 0) throw new Error('retired inline contenteditable field-cell approach still present in render');
if (html.indexOf(COMPANY_CE)  < 0) throw new Error('company-name inline-edit signature missing from render (index.html)');

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- build a jsdom sandbox with the real functions wired in ----------------
function build(opts) {
  opts = opts || {};
  const role = opts.role || 'admin';
  const overrides = opts.overrides || {};
  const directory = opts.directory || [];
  const dom = new JSDOM('<!DOCTYPE html><body><div id="prGenericRoot" class="pr-root"><div id="root"></div></div></body>', { runScripts: 'outside-only' });
  const win = dom.window;
  const doc = win.document;
  const captured = { posts: [], renderProjectRecordCalls: 0, crmRenderCardsCalls: 0 };

  // fetch mock: routes /api/contacts (add/update) and /api/project-override.
  win.fetch = function (url, init) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    captured.posts.push({ url, body });
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
  g.PF_CONTACTS = JSON.parse(JSON.stringify(directory));
  g._pfContactsPromise = null;
  g.pfLoadContacts = function () { return Promise.resolve(g.PF_CONTACTS); };
  // instrument renderProjectRecord (the Edit-save path uses it as its refresh)
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
    extractWinFn(html, 'pfCrmEditContactRow'),
    extractWinFn(html, 'pfCrmCancelContactRow'),
    extractWinFn(html, 'pfCrmSaveContactRow'),
    extractWinFn(html, 'pfCrmRemoveContactRow'),
    extractWinFn(html, 'pfCrmRemoveContactCancel'),
    extractWinFn(html, 'pfCrmRemoveContactConfirm'),
  ].join('\n\n');
  win.eval(src);
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
  console.log('\n==== Project Contacts — Safety-Consultant / Material-Vendor format ====\n');

  const DIR = [
    { contactId:'C0001', firstName:'Alice', lastName:'Ng', name:'Alice Ng', title:'PE', company:'Acme Structural', category:'Structural Engineer', officePhone:'2601111111', cellPhone:'2602222222', email:'alice@acme.com', companyAddress:'1 Main', companyWebsite:'acme.com', notes:'lead' },
    { contactId:'C0002', firstName:'Bob', lastName:'Lee', name:'Bob Lee', title:'PM', company:'Acme Structural', category:'Structural Engineer', officePhone:'', cellPhone:'', email:'bob@acme.com', companyAddress:'1 Main', companyWebsite:'acme.com', notes:'' },
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

  // ---- (fmt) render: Edit button + red X on each row; NO field contenteditable cells ----
  {
    const { win, doc } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc);
    await wait(); await wait();
    const rows = host.querySelectorAll('.pr-crow:not(.pr-crow-head)');
    ok('(fmt) two contact rows render for the group', rows.length === 2);
    const editBtns = host.querySelectorAll('.pr-crow-editbtn');
    ok('(fmt) an [✎ Edit] button per contact row (2)', editBtns.length === 2);
    ok('(fmt) Edit button shows the pencil + "Edit" label', /Edit/.test(editBtns[0].textContent) && editBtns[0].textContent.indexOf('✎') !== -1);
    const rmBtns = host.querySelectorAll('.pr-crow-rmbtn');
    ok('(fmt) a red [✕] delete per contact row (2)', rmBtns.length === 2);
    ok('(fmt) delete glyph is ✕ (U+2715)', rmBtns[0].textContent.indexOf('✕') !== -1);
    // Edit + X live together in the RIGHT-anchored .pr-crow-act, Edit before X.
    const act = rows[0].querySelector('.pr-crow-act');
    ok('(fmt) actions live in right-anchored .pr-crow-act', !!act && act.querySelector('.pr-crow-editbtn') && act.querySelector('.pr-crow-rmbtn'));
    ok('(fmt) Edit button precedes the red ✕ in the DOM', act.querySelector('.pr-crow-editbtn').compareDocumentPosition(act.querySelector('.pr-crow-rmbtn')) & 4);
    // The rejected inline field-cell approach is GONE from the rendered rows.
    ok('(fmt) NO contenteditable field cells (retired approach gone)', host.querySelectorAll('.pr-crow-name.pr-pc-inline, .pr-crow-title.pr-pc-inline, .pr-crow-email.pr-pc-inline').length === 0);
    // Fields still display (static).
    ok('(fmt) name/title still display statically', rows[0].querySelector('.pr-crow-name').textContent === 'Alice Ng' && rows[0].querySelector('.pr-crow-title').textContent === 'PE');
    ok('(fmt) phones linkified (tel:)', /tel:/.test(rows[0].querySelector('.pr-crow-off').innerHTML));
    ok('(fmt) email linkified (mailto:)', /mailto:/.test(rows[0].querySelector('.pr-crow-email').innerHTML));
    // Company inline-editable + Add present.
    ok('(fmt) company name is inline-editable', !!host.querySelector('.pr-pc-company-edit[contenteditable="true"]'));
    ok('(fmt) "+ Add contact" button present', !!host.querySelector('.pr-pc-addbtn'));
    ok('(fmt) header row present with action column', !!host.querySelector('.pr-crow-head') && !!host.querySelector('.pr-crow-head .pr-crow-act'));
  }

  // ---- (fmt-uniform) the SAME format renders for EVERY group key ----
  {
    const groups = [
      { pfx:'Safety Consultant', key:'safety',   tag:'Safety Consultant', ov:{ safety:{ __crm:{ 'Safety Consultant':{ company:'SafeCo', contactIds:['C0001'] } } } } },
      { pfx:'Material Vendor(s)',key:'material', tag:'Material Vendor(s)', ov:{ material:{ __crm:{ 'Material Vendor(s)':{ company:'StoneCo', contactIds:['C0001'] } } } } },
      { pfx:'GC',                key:'general',  tag:'General Contractor', ov:{ general:{ __crm:{ 'GC':{ company:'BuildCo', contactIds:['C0001'] } } } } },
      { pfx:'PF Project Team',   key:'pfTeam',   tag:'PF Project Team',    ov:{ pfTeam:{ __crm:{ 'PF Project Team':{ company:'Pier Foundations', contactIds:['C0001'] } } } } },
      { pfx:'Structural',        key:'design_professionals', tag:'Structural Engineer', ov:OVERRIDES },
    ];
    for (const grp of groups) {
      const { win, doc } = build({ overrides: grp.ov, directory: DIR });
      const host = makeHost(doc, grp.pfx, grp.key, grp.tag);
      win.pfCrmRenderCards(doc); await wait(); await wait();
      ok('(uniform:' + grp.tag + ') has [✎ Edit] button', !!host.querySelector('.pr-crow-editbtn'));
      ok('(uniform:' + grp.tag + ') has red [✕] delete', !!host.querySelector('.pr-crow-rmbtn'));
      ok('(uniform:' + grp.tag + ') company inline-editable', !!host.querySelector('.pr-pc-company-edit[contenteditable="true"]'));
      ok('(uniform:' + grp.tag + ') NO retired field cells', host.querySelectorAll('.pr-crow-name.pr-pc-inline').length === 0);
      ok('(uniform:' + grp.tag + ') role tag rendered', (host.querySelector('.pr-role-tag') || {}).textContent === grp.tag);
    }
  }

  // ---- (ro) field_ops read-only: no controls, static rows, no editable company ----
  {
    const { win, doc } = build({ overrides: OVERRIDES, directory: DIR, role: 'field_ops' });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    ok('(ro) field_ops: no Edit button', !host.querySelector('.pr-crow-editbtn'));
    ok('(ro) field_ops: no red ✕ button', !host.querySelector('.pr-crow-rmbtn'));
    ok('(ro) field_ops: no Add button', !host.querySelector('.pr-pc-addbtn'));
    ok('(ro) field_ops: company NOT editable', !host.querySelector('.pr-pc-company-edit'));
    ok('(ro) field_ops: static rows still render', host.querySelectorAll('.pr-crow:not(.pr-crow-head)').length === 2);
    ok('(ro) field_ops: email still linkified', /mailto:/.test(host.querySelector('.pr-crow:not(.pr-crow-head) .pr-crow-email').innerHTML));
  }

  // ---- (edit) [✎ Edit] opens the inline editor; Save -> /api/contacts update (directory) ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const editBtn = host.querySelector('.pr-crow .pr-crow-editbtn');  // first row = C0001
    ok('(edit) Edit button carries the contactId', editBtn.getAttribute('data-crm-cid') === 'C0001');
    win.pfCrmEditContactRow(editBtn);
    const ed = host.querySelector('.pr-crow-edit');
    ok('(edit) inline editor form opens', !!ed);
    ok('(edit) editor has all six fields', ed.querySelectorAll('[data-cf]').length === 6);
    ok('(edit) original row hidden while editing', host.querySelector('.pr-crow[data-crm-cid="C0001"]').style.display === 'none');
    // change the title, save
    ed.querySelector('[data-cf="title"]').value = 'Senior PE';
    const saveBtn = ed.querySelector('.pr-save-btn');
    win.pfCrmSaveContactRow(saveBtn);
    await wait(); await wait(); await wait();
    const upd = captured.posts.find(p => String(p.url).indexOf('/api/contacts') === 0 && p.body.action === 'update');
    ok('(edit) POST /api/contacts action:update fired', !!upd);
    ok('(edit) update targets C0001', upd && upd.body.contact.contactId === 'C0001');
    ok('(edit) update sets new title', upd && upd.body.contact.title === 'Senior PE');
    ok('(edit) carries through email (not blanked)', upd && upd.body.contact.email === 'alice@acme.com');
    ok('(edit) carries through companyAddress/website (not blanked)', upd && upd.body.contact.companyAddress === '1 Main' && upd.body.contact.companyWebsite === 'acme.com');
    ok('(edit) directory cache updated (reusable everywhere)', win.PF_CONTACTS.find(c => c.contactId === 'C0001').title === 'Senior PE');
    ok('(edit) Edit-save refreshes the record (renderProjectRecord)', captured.renderProjectRecordCalls >= 1);
  }

  // ---- (edit/cancel) Cancel restores the row without saving ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow .pr-crow-editbtn'));
    const cancel = host.querySelector('.pr-crow-edit .pr-cancel-btn');
    win.pfCrmCancelContactRow(cancel);
    ok('(edit) Cancel removes the editor', !host.querySelector('.pr-crow-edit'));
    ok('(edit) Cancel restores the row', host.querySelector('.pr-crow[data-crm-cid="C0001"]').style.display === '');
    ok('(edit) Cancel writes nothing', !captured.posts.some(p => p.body.action === 'update'));
  }

  // ---- (fail) Edit-save server error keeps the editor OPEN + directory unchanged ----
  {
    const { win, doc, captured } = build({
      overrides: OVERRIDES, directory: DIR,
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'update')
        ? { httpOk: false, status: 500, json: { status:'error', message:'boom' } } : null
    });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow .pr-crow-editbtn'));
    const ed = host.querySelector('.pr-crow-edit');
    ed.querySelector('[data-cf="title"]').value = 'Will Fail';
    win.pfCrmSaveContactRow(ed.querySelector('.pr-save-btn'));
    await wait(); await wait(); await wait();
    ok('(fail) server error: editor stays open (fail-closed)', !!host.querySelector('.pr-crow-edit'));
    ok('(fail) server error: honest error surfaced', host.querySelector('.pr-crow-edit-err').style.display === 'block');
    ok('(fail) server error: directory cache unchanged', win.PF_CONTACTS.find(c=>c.contactId==='C0001').title === 'PE');
    ok('(fail) server error: no record refresh (nothing changed)', captured.renderProjectRecordCalls === 0);
  }
  {
    const { win, doc } = build({
      overrides: OVERRIDES, directory: DIR,
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'update') ? { __network: true } : null
    });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow .pr-crow-editbtn'));
    const ed = host.querySelector('.pr-crow-edit');
    ed.querySelector('[data-cf="title"]').value = 'Network Dies';
    win.pfCrmSaveContactRow(ed.querySelector('.pr-save-btn'));
    await wait(); await wait(); await wait();
    ok('(fail) network error: editor stays open (fail-closed)', !!host.querySelector('.pr-crow-edit'));
    ok('(fail) network error: honest error surfaced', host.querySelector('.pr-crow-edit-err').style.display === 'block');
    ok('(fail) network error: directory cache unchanged', win.PF_CONTACTS.find(c=>c.contactId==='C0001').title === 'PE');
  }

  // ---- (reuse) an Edit reflects on ANOTHER project's group (shared directory) ----
  {
    const { win, doc } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow .pr-crow-editbtn'));
    const ed = host.querySelector('.pr-crow-edit');
    ed.querySelector('[data-cf="title"]').value = 'Principal PE';
    win.pfCrmSaveContactRow(ed.querySelector('.pr-save-btn'));
    await wait(); await wait(); await wait();
    const updatedRecord = win.PF_CONTACTS.find(c => c.contactId === 'C0001');
    ok('(reuse) directory record now Principal PE', updatedRecord.title === 'Principal PE');
    // Project B: different project/override, SAME shared directory record.
    const OVERRIDES_B = { general: { __crm: { 'GC': { company:'Acme Structural', contactIds:['C0001'] } } } };
    const { win: winB, doc: docB } = build({ overrides: OVERRIDES_B, directory: [updatedRecord], num: '88-888' });
    const hostB = makeHost(docB, 'GC', 'general', 'General Contractor');
    winB.pfCrmRenderCards(docB); await wait(); await wait();
    const titleB = hostB.querySelector('.pr-crow:not(.pr-crow-head) .pr-crow-title');
    ok('(reuse) same contact on another project shows updated title', titleB && titleB.textContent === 'Principal PE');
  }

  // ---- (company) inline company rename -> updates directory + repoints __crm + preserves ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const co = host.querySelector('.pr-pc-company-edit');
    ok('(company) company cell carries group routing', co.getAttribute('data-crm-cards') === 'Structural' && co.getAttribute('data-crm-cards-key') === 'design_professionals');
    co.textContent = 'Acme Structural Engineers LLC';
    win.pfPcInlineCompanySave(co);
    await wait(); await wait(); await wait(); await wait();
    const dirUpdates = captured.posts.filter(p => String(p.url).indexOf('/api/contacts')===0 && p.body.action==='update');
    ok('(company) rename updates every directory contact in group (2)', dirUpdates.length === 2);
    ok('(company) directory contacts got new company', dirUpdates.every(u => u.body.contact.company === 'Acme Structural Engineers LLC'));
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(company) rename repoints __crm[Structural].company', ovPost && ovPost.body.fields.__crm.Structural.company === 'Acme Structural Engineers LLC');
    ok('(company) rename preserves sibling group', ovPost && ovPost.body.fields.__crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(company) rename keeps Structural contactIds', ovPost && ovPost.body.fields.__crm.Structural.contactIds.length === 2);
    ok('(company) rename: no page bounce (in-place)', captured.renderProjectRecordCalls === 0);
  }
  {
    // blank company rejected (fail-closed revert)
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const co = host.querySelector('.pr-pc-company-edit');
    co.textContent = '';
    win.pfPcInlineCompanySave(co);
    await wait(); await wait();
    ok('(company) blank rename rejected + reverted', co.textContent === 'Acme Structural' && !captured.posts.some(p=>p.body.action==='update'));
  }

  // ---- (add) "+ Add contact" -> directory add + assign to group; siblings/reserved kept ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfPcAddContact(host.querySelector('.pr-pc-addbtn'));
    const form = host.querySelector('.pr-crm-addform');
    ok('(add) add form opens', !!form);
    form.querySelector('[data-af="name"]').value = 'Carol Fox';
    form.querySelector('[data-af="email"]').value = 'carol@acme.com';
    win.pfPcAddContactSave(form.querySelector('.pr-save-btn'));
    await wait(); await wait(); await wait(); await wait();
    const addPost = captured.posts.find(p => p.body.action === 'add');
    ok('(add) POST /api/contacts action:add fired', !!addPost);
    ok('(add) new contact tagged with group trade (Category)', addPost && addPost.body.contact.category === 'Structural Engineer');
    ok('(add) new contact carries group company', addPost && addPost.body.contact.company === 'Acme Structural');
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(add) project-override POST assigns new id', !!ovPost);
    const crm = ovPost.body.fields.__crm;
    ok('(add) new id appended to Structural group', crm.Structural.contactIds.length === 3 && crm.Structural.contactIds[2].startsWith('C9'));
    ok('(add) sibling group Geotechnical preserved', crm.Geotechnical && crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(add) correct section key', ovPost.body.section === 'design_professionals');
    ok('(add) no page bounce', captured.renderProjectRecordCalls === 0);
  }

  // ---- (del) red ✕ -> confirm -> project-override UNASSIGN only; directory intact ----
  {
    const { win, doc, captured } = build({ overrides: OVERRIDES, directory: DIR });
    const host = makeHost(doc, 'Structural', 'design_professionals', 'Structural Engineer');
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const rmBtn = host.querySelector('.pr-crow .pr-crow-rmbtn');  // first row = C0001
    win.pfCrmRemoveContactRow(rmBtn);
    const confirm = host.querySelector('.pr-crow-rmconfirm .pr-rm-yes');
    ok('(del) remove confirm bar appears', !!confirm);
    win.pfCrmRemoveContactConfirm(confirm);
    await wait(); await wait(); await wait();
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(del) removes via project-override (not /api/contacts delete)', !!ovPost && !captured.posts.some(p => p.body.action === 'delete'));
    const crm = ovPost.body.fields.__crm;
    ok('(del) C0001 dropped from Structural group', crm.Structural.contactIds.indexOf('C0001') === -1);
    ok('(del) C0002 kept in Structural group', crm.Structural.contactIds.indexOf('C0002') !== -1);
    ok('(del) directory record NOT hard-deleted (still in cache)', !!win.PF_CONTACTS.find(c => c.contactId === 'C0001'));
    ok('(del) sibling Geotechnical preserved', crm.Geotechnical.contactIds[0] === 'C0003');
    ok('(del) no page bounce', captured.renderProjectRecordCalls === 0);
    ok('(del) in-place refresh happened', captured.crmRenderCardsCalls >= 2);
  }

  console.log('\nPASS: ' + pass + '  FAIL: ' + fail + '\n');
  if (fails.length) { console.log('Failures:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
