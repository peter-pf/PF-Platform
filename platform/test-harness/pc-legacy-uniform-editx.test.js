// ============================================================================
// Project Contacts — LEGACY-SEED groups get the UNIFORM Edit/✕ format (Brad 2026-08-13)
// ----------------------------------------------------------------------------
// THE GAP THIS PROVES (screenshot-confirmed): the earlier "apply to ALL groups"
// change only reached groups that render via pfCrmRenderCards from a __crm
// selection (Safety Consultant / Material Vendor). The UPPER Project Contacts
// groups — Project Owner, General Contractor, the four Design Professionals firms
// (Geotechnical / Civil / Structural / Ground Improvement), and PF Project Team —
// render their contacts from fixed synced `.pr-field` SEED data and, on a real
// project, have NO __crm selection. So pfCrmRenderCards bailed and those groups
// showed the STATIC horizContactBlock table with NO [✎ Edit] / red [✕] / company
// edit. Brad could not edit them. THAT is the exact gap.
//
// THE FIX (proven here): every legacy host now carries `data-legacy-seed` (its seed
// contacts) + `data-legacy-company`. pfCrmRenderCards / pfCrmRenderOneHost render
// those SEED contacts in the SAME uniform .pr-crow card format — [✎ Edit] + red [✕]
// + editable company + "+ Add contact" — with each row marked data-crm-legacy="1".
//   - Edit on a legacy row LAZILY MIGRATES that one contact into the shared directory
//     (POST /api/contacts add — dedupe-guarded server-side => idempotent) + assigns it
//     to the group's __crm, then opens the standard directory editor. No bulk write.
//   - ✕ on a legacy row BLANKS that contact's seed labels via a plain project-override
//     (empty override wins => the row drops), NEVER destroying the synced source.
//   - A partially-migrated group shows BOTH its migrated directory rows AND its
//     remaining legacy rows (merge + dedupe) — no contact ever disappears.
//   - field_ops = read-only: no Edit/✕/Add/company-edit; static rows still show.
//   - fail-closed: a failed migrate keeps the legacy seed intact + surfaces an error.
//
// This harness loads the REAL functions extracted verbatim from index.html and drives
// them in a jsdom DOM. It is INDEPENDENT of pc-inline-crud (which covers the __crm
// path); here every assertion targets the LEGACY path Brad hit.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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
  let end = j; if (src[end] === ';') end++;
  return src.slice(m.index, end);
}

// ---- source-level guards: the legacy hosts MUST carry the seed attrs, and the
// render MUST emit the uniform Edit/✕ for legacy rows too. ----
if (html.indexOf('function pfLegacySeedAttrs') < 0) throw new Error('pfLegacySeedAttrs helper missing (index.html)');
if (html.indexOf('function pfCrmDecodeLegacySeed') < 0) throw new Error('pfCrmDecodeLegacySeed helper missing (index.html)');
if (html.indexOf('function pfCrmRenderOneHost') < 0) throw new Error('pfCrmRenderOneHost helper missing (index.html)');
if (html.indexOf('function pfCrmMigrateLegacyRow') < 0) throw new Error('pfCrmMigrateLegacyRow helper missing (index.html)');
// Every legacy host emitter must feed the seed in.
['pfLegacySeedAttrs(_firmCompany, firmHoriz)',
 'pfLegacySeedAttrs(_ownerCompany, ownerHoriz)',
 'pfLegacySeedAttrs(_gcNameForSeed, gcHoriz)',
 "pfLegacySeedAttrs('Pier Foundations', pfHoriz)"
].forEach(function(sig){ if (html.indexOf(sig) < 0) throw new Error('legacy host missing seed wiring: ' + sig); });

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- sandbox with the real functions wired (mirrors pc-inline-crud/build) ----
function build(opts) {
  opts = opts || {};
  const role = opts.role || 'admin';
  const overrides = opts.overrides || {};
  const directory = opts.directory || [];
  const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', { runScripts: 'outside-only' });
  const win = dom.window; const doc = win.document;
  const captured = { posts: [], renderProjectRecordCalls: 0, crmRenderCardsCalls: 0 };

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
      if (body.action === 'add') {
        const c = body.contact;
        const id = 'C' + String(9000 + captured.posts.filter(p => p.body.action === 'add').length).padStart(4, '0');
        const saved = Object.assign({}, c, { contactId: id, name: ((c.firstName||'')+' '+(c.lastName||'')).trim() });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, saved: true, action: 'add', contact: saved }) });
      }
      if (body.action === 'update') {
        const c = body.contact;
        const saved = Object.assign({}, c, { name: ((c.firstName||'')+' '+(c.lastName||'')).trim() });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, saved: true, action: 'update', contact: saved }) });
      }
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ status: 'error' }) });
    }
    if (String(url).indexOf('/api/project-override') === 0) {
      // Simulate the backend merge into the current override object so the client's
      // adopted state reflects the write.
      const out = JSON.parse(JSON.stringify(win._curOverrides || {}));
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
  g.PF_CRM_NEWGROUP_TRADE = { pfTeam:{'PF Project Team':'PF Team'} };
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
  g.renderProjectRecord = function () { captured.renderProjectRecordCalls++; };
  g.window.renderProjectRecord = g.renderProjectRecord;

  const src = [
    extractFn(html, 'pfCrmDecodeLegacySeed'),
    extractFn(html, 'pfCrmRenderOneHost'),
    extractFn(html, 'pfCrmRenderCards'),
    'window.pfCrmRenderCards = pfCrmRenderCards;',
    extractFn(html, 'pfPcGroupTradeSafe'),
    extractFn(html, 'pfCrmMigrateLegacyRow'),
    extractFn(html, 'pfCrmHostCompanyTrade'),
    extractFn(html, 'pfPcDirRecord'),
    extractFn(html, 'pfPcAdoptDirRow'),
    extractWinFn(html, 'pfCrmEditContactRow'),
    extractWinFn(html, 'pfCrmCancelContactRow'),
    extractWinFn(html, 'pfCrmSaveContactRow'),
    extractWinFn(html, 'pfCrmRemoveContactRow'),
    extractWinFn(html, 'pfCrmRemoveContactCancel'),
    extractWinFn(html, 'pfCrmRemoveContactConfirm'),
    // Add-button placement (Brad 2026-08-14): the per-group "+ Add contact" handler + its
    // cancel, so the harness can prove the header-row placement + the form opens below.
    extractWinFn(html, 'pfPcAddContact'),
    extractWinFn(html, 'pfPcAddContactCancel'),
  ].join('\n\n');
  win.eval(src);
  return { win, doc, captured, g };
}

// A LEGACY host: no __crm selection, seed contacts carried on data-legacy-seed.
// `contacts` are {name,title,office,cell,email,notes,labels,labelSection} objects
// (exactly the shape the horiz builders emit).
function makeLegacyHost(doc, prefix, key, roleTag, company, contacts) {
  const host = doc.createElement('div');
  host.className = 'pr-crm-cards';
  host.setAttribute('data-crm-cards', prefix);
  host.setAttribute('data-crm-cards-key', key);
  host.setAttribute('data-role-tag', roleTag);
  host.setAttribute('data-legacy-seed', JSON.stringify(contacts || []));
  host.setAttribute('data-legacy-company', company || '');
  doc.getElementById('root').appendChild(host);
  return host;
}

const wait = () => new Promise(r => setTimeout(r, 0));

// Seed rows with the exact label schemes the real emitters use.
function ownerSeed(n) { return { name:'Nathan Westhoff', title:'Owner Rep', office:'2603334444', cell:'', email:'nathan@owner.com', notes:'',
  labelSection:'general', labels:{ name:'Owner Contact '+n+' - Contact Name', title:'Owner Contact '+n+' - Title', office:'Owner Contact '+n+' - Office Phone', cell:'Owner Contact '+n+' - Cell Phone', email:'Owner Contact '+n+' - Email', notes:'Owner Contact '+n+' - Notes' } }; }
function gcPmSeed() { return { name:'Sam Build', title:'Project Manager', office:'2605556666', cell:'', email:'sam@gc.com', notes:'',
  labelSection:'general', labels:{ name:'GC Project Manager - Name', title:'', office:'GC Project Manager - Office Phone', cell:'GC Project Manager - Cell Phone', email:'GC Project Manager - Email', notes:'GC Project Manager - Notes' } }; }
function dpSeed(prefix, n) { const p = prefix + ' - Contact ' + n + ' - '; return { name:'Ed Garbin', title:'PE', office:'2607778888', cell:'', email:'ed@garbin.com', notes:'sealed',
  labelSection:'design_professionals', labels:{ name:p+'Contact Name', title:p+'Title', office:p+'Office Phone', cell:p+'Cell Phone', email:p+'Email', notes:p+'Notes' } }; }
function pfTeamSeed(role) { return { name:'Jonathan Reinking', title:role, office:'2609990000', cell:'', email:'jreinking@pierfoundations.com', notes:'',
  labelSection:'pfTeam', labels:{ name:role+' - Contact Name', title:role+' - Title', office:role+' - Office Phone', cell:role+' - Cell Phone', email:role+' - Email', notes:role+' - Notes' } }; }

(async function run() {
  console.log('\n==== Project Contacts — LEGACY-SEED groups get uniform Edit/✕ ====\n');

  // The exact groups Brad could not edit + the two that already worked (for parity).
  const GROUPS = [
    { pfx:'Owner',                       key:'general',              tag:'Project Owner',                 company:'Westhoff Development', seed:[ownerSeed(1)] },
    { pfx:'GC',                          key:'general',              tag:'General Contractor',            company:'BuildCo',             seed:[gcPmSeed()] },
    { pfx:'Geotechnical',                key:'design_professionals', tag:'Geotechnical Engineer',         company:'Garbin Eng',          seed:[dpSeed('Geotechnical',1)] },
    { pfx:'Civil',                       key:'design_professionals', tag:'Civil Engineer',                company:'Civil Co',            seed:[dpSeed('Civil',1)] },
    { pfx:'Structural',                  key:'design_professionals', tag:'Structural Engineer',           company:'Struct Co',           seed:[dpSeed('Structural',1)] },
    { pfx:'Ground Improvement',          key:'design_professionals', tag:'Ground Improvement Engineering',company:'Garbin GI',           seed:[dpSeed('Ground Improvement',1)] },
    { pfx:'PF Project Team',             key:'pfTeam',               tag:'PF Project Team',               company:'Pier Foundations',    seed:[pfTeamSeed('Project Manager')] },
  ];

  // ---- (every-group) EACH legacy group renders the uniform .pr-crow + Edit/✕/company/Add ----
  for (const grp of GROUPS) {
    const { win, doc } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, grp.pfx, grp.key, grp.tag, grp.company, grp.seed);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const rows = host.querySelectorAll('.pr-crow:not(.pr-crow-head)');
    ok('(' + grp.tag + ') renders a .pr-crow contact row from legacy seed', rows.length === grp.seed.length && rows.length >= 1);
    ok('(' + grp.tag + ') row has [✎ Edit] button', !!host.querySelector('.pr-crow-editbtn') && /Edit/.test(host.querySelector('.pr-crow-editbtn').textContent) && host.querySelector('.pr-crow-editbtn').textContent.indexOf('✎') !== -1);
    ok('(' + grp.tag + ') row has red [✕] button', !!host.querySelector('.pr-crow-rmbtn') && host.querySelector('.pr-crow-rmbtn').textContent.indexOf('✕') !== -1);
    ok('(' + grp.tag + ') company name is inline-editable', !!host.querySelector('.pr-pc-company-edit[contenteditable="true"]') && host.querySelector('.pr-pc-company-name').textContent === grp.company);
    ok('(' + grp.tag + ') "+ Add contact" present', !!host.querySelector('.pr-pc-addbtn'));
    ok('(' + grp.tag + ') header row + action column present', !!host.querySelector('.pr-crow-head .pr-crow-act'));
    ok('(' + grp.tag + ') row marked data-crm-legacy="1"', rows[0].getAttribute('data-crm-legacy') === '1');
    ok('(' + grp.tag + ') seed name/title/phone/email display', rows[0].querySelector('.pr-crow-name').textContent === grp.seed[0].name && /tel:/.test(rows[0].querySelector('.pr-crow-off').innerHTML) && /mailto:/.test(rows[0].querySelector('.pr-crow-email').innerHTML));
  }

  // ---- (edit-migrate) Edit on a legacy row mints a directory contact + assigns __crm ----
  {
    const { win, doc, captured } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, 'Structural', 'design_professionals', 'Structural Engineer', 'Struct Co', [dpSeed('Structural',1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const editBtn = host.querySelector('.pr-crow-editbtn');
    win.pfCrmEditContactRow(editBtn);
    await wait(); await wait(); await wait();
    const addPost = captured.posts.find(p => String(p.url).indexOf('/api/contacts') === 0 && p.body.action === 'add');
    ok('(edit-migrate) Edit mints the seed contact into the directory (/api/contacts add)', !!addPost);
    ok('(edit-migrate) minted contact carries the seed fields', addPost && addPost.body.contact.email === 'ed@garbin.com' && addPost.body.contact.company === 'Struct Co' && addPost.body.contact.category === 'Structural Engineer');
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0 && p.body.fields && p.body.fields.__crm);
    ok('(edit-migrate) new id assigned to this group __crm', ovPost && ovPost.body.fields.__crm.Structural && ovPost.body.fields.__crm.Structural.contactIds.length === 1);
    ok('(edit-migrate) __crm assign is on the right section', ovPost && ovPost.body.section === 'design_professionals');
  }

  // ---- (edit-migrate-idempotent-preserve) migrating one contact PRESERVES sibling __crm groups ----
  {
    const OV = { general: { __crm: { 'GC': { company:'BuildCo', contactIds:['C0001'] } } } };
    const DIR = [{ contactId:'C0001', firstName:'Sam', lastName:'Build', name:'Sam Build', title:'PM', company:'BuildCo', category:'GC', email:'sam@gc.com' }];
    const { win, doc, captured } = build({ role:'admin', overrides:OV, directory:DIR });
    // Owner legacy host under the SAME `general` key that already has a GC selection.
    const host = makeLegacyHost(doc, 'Owner', 'general', 'Project Owner', 'Westhoff Development', [ownerSeed(1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow-editbtn'));
    await wait(); await wait(); await wait();
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0 && p.body.fields && p.body.fields.__crm);
    ok('(preserve) migrating Owner keeps the sibling GC selection', ovPost && ovPost.body.fields.__crm.GC && ovPost.body.fields.__crm.GC.contactIds.indexOf('C0001') !== -1);
    ok('(preserve) Owner gets its own new id', ovPost && ovPost.body.fields.__crm.Owner && ovPost.body.fields.__crm.Owner.contactIds.length === 1);
  }

  // ---- (merge) a partially-migrated group shows BOTH the directory row AND remaining legacy rows ----
  {
    const OV = { general: { __crm: { 'Owner': { company:'Westhoff Development', contactIds:['C0001'] } } } };
    const DIR = [{ contactId:'C0001', firstName:'Nathan', lastName:'Westhoff', name:'Nathan Westhoff', title:'Owner Rep', company:'Westhoff Development', category:'Owner', email:'nathan@owner.com' }];
    const { win, doc } = build({ role:'admin', overrides:OV, directory:DIR });
    // Seed carries the migrated Nathan (same email -> deduped) PLUS a second not-yet-migrated contact.
    const seed2 = ownerSeed(2); seed2.name = 'Dana Owner'; seed2.email = 'dana@owner.com';
    const host = makeLegacyHost(doc, 'Owner', 'general', 'Project Owner', 'Westhoff Development', [ownerSeed(1), seed2]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const rows = host.querySelectorAll('.pr-crow:not(.pr-crow-head)');
    ok('(merge) shows two rows: migrated + remaining legacy', rows.length === 2);
    const dirRow = Array.from(rows).find(r => r.getAttribute('data-crm-cid') === 'C0001');
    const legRow = Array.from(rows).find(r => r.getAttribute('data-crm-legacy') === '1');
    ok('(merge) migrated Nathan is a real directory row (has cid, real Edit)', !!dirRow && !!dirRow.querySelector('.pr-crow-editbtn[data-crm-cid="C0001"]'));
    ok('(merge) Dana still shows as a legacy row (migrate-on-Edit)', !!legRow && legRow.querySelector('.pr-crow-name').textContent === 'Dana Owner');
    ok('(merge) Nathan is NOT double-listed (deduped by email)', Array.from(rows).filter(r => r.querySelector('.pr-crow-name').textContent === 'Nathan Westhoff').length === 1);
  }

  // ---- (del) red ✕ on a legacy row blanks its seed labels (plain override), source intact ----
  {
    const { win, doc, captured } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, 'Owner', 'general', 'Project Owner', 'Westhoff Development', [ownerSeed(1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmRemoveContactRow(host.querySelector('.pr-crow-rmbtn'));
    await wait();
    const yes = host.querySelector('.pr-rm-yes');
    ok('(del) confirm bar appears for a legacy row', !!yes);
    win.pfCrmRemoveContactConfirm(yes);
    await wait(); await wait();
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0);
    ok('(del) ✕ writes a project-override (not a __crm edit)', !!ovPost && !ovPost.body.fields.__crm);
    ok('(del) ✕ blanks the seed labels (empty-string overrides)', ovPost && ovPost.body.fields['Owner Contact 1 - Contact Name'] === '' && ovPost.body.fields['Owner Contact 1 - Email'] === '');
    ok('(del) ✕ targets the legacy label section (general)', ovPost && ovPost.body.section === 'general');
    // NO /api/contacts delete/update ever happened (directory source untouched).
    ok('(del) ✕ never touches the contact directory', !captured.posts.some(p => String(p.url).indexOf('/api/contacts') === 0));
  }

  // ---- (ro) field_ops = read-only: no Edit/✕/Add/company-edit, static rows still render ----
  {
    const { win, doc } = build({ role:'field_ops', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, 'GC', 'general', 'General Contractor', 'BuildCo', [gcPmSeed()]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    ok('(ro) legacy contact still renders (static row)', host.querySelectorAll('.pr-crow:not(.pr-crow-head)').length === 1);
    ok('(ro) NO Edit button', host.querySelectorAll('.pr-crow-editbtn').length === 0);
    ok('(ro) NO red ✕ button', host.querySelectorAll('.pr-crow-rmbtn').length === 0);
    ok('(ro) NO "+ Add contact"', host.querySelectorAll('.pr-pc-addbtn').length === 0);
    ok('(ro) company name NOT contenteditable', host.querySelectorAll('.pr-pc-company-edit[contenteditable="true"]').length === 0 && !!host.querySelector('.pr-pc-company-name'));
  }

  // ---- (fail) migrate fails (server error) -> legacy seed intact, error surfaced ----
  {
    let alerted = '';
    const { win, doc, captured } = build({ role:'admin', overrides:{}, directory:[],
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'add')
        ? { httpOk:false, status:502, json:{ status:'error', message:'boom' } } : null });
    win.alert = function(m){ alerted = String(m || ''); };
    const host = makeLegacyHost(doc, 'Structural', 'design_professionals', 'Structural Engineer', 'Struct Co', [dpSeed('Structural',1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const row = host.querySelector('.pr-crow[data-crm-legacy="1"]');
    win.pfCrmEditContactRow(host.querySelector('.pr-crow-editbtn'));
    await wait(); await wait(); await wait();
    ok('(fail) failed mint surfaces an error', /boom|Could not add/.test(alerted));
    ok('(fail) NO __crm assign happened on failure', !captured.posts.some(p => String(p.url).indexOf('/api/project-override') === 0));
    ok('(fail) legacy row still present (seed intact)', !!host.querySelector('.pr-crow[data-crm-legacy="1"]'));
    ok('(fail) row editing-lock released for retry', row.getAttribute('data-crm-editing') !== '1');
  }

  // ---- (fail-net) migrate network error -> intact + surfaced ----
  {
    let alerted = '';
    const { win, doc, captured } = build({ role:'admin', overrides:{}, directory:[],
      respond: (url, body) => (String(url).indexOf('/api/contacts') === 0 && body.action === 'add') ? { __network:true } : null });
    win.alert = function(m){ alerted = String(m || ''); };
    const host = makeLegacyHost(doc, 'Structural', 'design_professionals', 'Structural Engineer', 'Struct Co', [dpSeed('Structural',1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow-editbtn'));
    await wait(); await wait(); await wait();
    ok('(fail-net) network error surfaces + seed intact', /reach the server|NOT added/.test(alerted) && !!host.querySelector('.pr-crow[data-crm-legacy="1"]') && !captured.posts.some(p => String(p.url).indexOf('/api/project-override') === 0));
  }

  // =====================================================================================
  // BRAD 2026-08-14 — (A) FULL UNIFORMITY ON LOAD + (B) ADD BUTTON IN THE COMPANY HEADER
  // =====================================================================================
  // Build a host WITH its sibling legacy static .pr-pc-horiz-block (exactly as the real
  // emitters do: horizContactBlock(...) + crmHost) so we can prove the card render both
  // (a) supersedes the legacy layout and (b) leaves ZERO visible legacy-layout nodes.
  function makeLegacyHostWithBlock(doc, prefix, key, roleTag, company, contacts) {
    // Sibling legacy static block (its own visible company + horizontal table).
    const block = doc.createElement('div');
    block.className = 'pr-pc-horiz-block';
    const live = (contacts || []).filter(c => c && (c.name || c.title || c.office || c.cell || c.email || c.notes));
    block.innerHTML =
        '<div class="pr-role-tag">' + roleTag + '</div>'
      + '<div class="pr-pc-company"><div class="pr-pc-company-name">' + company + '</div>'
      +   (live.length ? '<div class="pr-crow-table"><div class="pr-crow pr-crow-head"></div>'
            + live.map(c => '<div class="pr-crow"><span class="pr-crow-name">' + c.name + '</span></div>').join('')
            + '</div>' : '')
      + '</div>';
    doc.getElementById('root').appendChild(block);
    const host = makeLegacyHost(doc, prefix, key, roleTag, company, contacts);
    return { block, host };
  }

  // ---- (A: full-uniform-on-load) EVERY group renders card-format immediately, 0 legacy nodes ----
  for (const grp of GROUPS) {
    const { win, doc } = build({ role:'admin', overrides:{}, directory:[] });
    const { block, host } = makeLegacyHostWithBlock(doc, grp.pfx, grp.key, grp.tag, grp.company, grp.seed);
    // FIRST synchronous pass only (no await): the seed-only host must already be uniform.
    win.pfCrmRenderCards(doc);
    ok('(A/' + grp.tag + ') card format present SYNCHRONOUSLY (no await) on load',
       !!host.querySelector('.pr-crow-table') && host.querySelectorAll('.pr-crow:not(.pr-crow-head)').length === grp.seed.length);
    ok('(A/' + grp.tag + ') sibling legacy .pr-pc-horiz-block is SUPERSEDED on load',
       block.classList.contains('pr-pc-horiz-superseded'));
    // The visible legacy company/table live under .pr-pc-company / .pr-role-tag, both hidden
    // by the supersede CSS => zero VISIBLE legacy-layout contact nodes remain.
    ok('(A/' + grp.tag + ') 0 legacy-layout nodes remain visible (superseded hides company+table)',
       block.classList.contains('pr-pc-horiz-superseded'));
    // And after the async directory settles it is STILL uniform (idempotent, no regress).
    await wait(); await wait();
    ok('(A/' + grp.tag + ') still uniform card format after async settle',
       !!host.querySelector('.pr-crow-table') && block.classList.contains('pr-pc-horiz-superseded'));
  }

  // ---- (A: fetch-fail) directory fetch rejects -> seed-only group STILL uniform on load ----
  {
    const { win, doc } = build({ role:'admin', overrides:{}, directory:[] });
    win.pfLoadContacts = function(){ return Promise.reject(new Error('offline')); };
    const { block, host } = makeLegacyHostWithBlock(doc, 'Geotechnical', 'design_professionals', 'Geotechnical Engineer', 'Garbin Eng', [dpSeed('Geotechnical',1)]);
    win.pfCrmRenderCards(doc);
    ok('(A/fetch-fail) seed group renders uniform even when directory fetch will reject',
       !!host.querySelector('.pr-crow-table') && block.classList.contains('pr-pc-horiz-superseded'));
    await wait(); await wait();
    ok('(A/fetch-fail) still uniform after the rejected fetch (no revert to legacy)',
       block.classList.contains('pr-pc-horiz-superseded') && host.querySelectorAll('.pr-crow:not(.pr-crow-head)').length === 1);
  }

  // ---- (B: add-in-header) "+ Add contact" sits in the company header row, above Edit/✕ ----
  for (const grp of GROUPS) {
    const { win, doc } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, grp.pfx, grp.key, grp.tag, grp.company, grp.seed);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const head = host.querySelector('.pr-pc-company-head');
    ok('(B/' + grp.tag + ') company header row (.pr-pc-company-head) exists', !!head);
    ok('(B/' + grp.tag + ') "+ Add contact" lives INSIDE the header row', !!head && !!head.querySelector('.pr-pc-addbtn'));
    ok('(B/' + grp.tag + ') company name is in the SAME header row as Add', !!head && !!head.querySelector('.pr-pc-company-name'));
    // "above Edit/✕": the header row is a preceding sibling of the .pr-crow table whose rows
    // carry the per-contact Edit/✕. Prove DOM order: header comes before the table.
    const wrap = host.querySelector('.pr-pc-company');
    const kids = Array.from(wrap.children);
    const headIdx = kids.indexOf(head);
    const tableIdx = kids.indexOf(wrap.querySelector('.pr-crow-table'));
    ok('(B/' + grp.tag + ') header row (with Add) is ABOVE the contact table (with Edit/✕)',
       headIdx > -1 && tableIdx > -1 && headIdx < tableIdx);
    // The Add button must NOT be below the list any more (no addbtn outside the header).
    const addBtns = host.querySelectorAll('.pr-pc-addbtn');
    ok('(B/' + grp.tag + ') the ONLY Add button is the header one (none left below the list)',
       addBtns.length === 1 && head.contains(addBtns[0]));
    // Edit + ✕ still present per contact on this group.
    ok('(B/' + grp.tag + ') per-contact [✎ Edit] + red [✕] still present', !!host.querySelector('.pr-crow-editbtn') && !!host.querySelector('.pr-crow-rmbtn'));
  }

  // ---- (B: add-form-below) opening the header Add button opens its form BELOW the table ----
  {
    const { win, doc } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, 'Structural', 'design_professionals', 'Structural Engineer', 'Struct Co', [dpSeed('Structural',1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const addBtn = host.querySelector('.pr-pc-addbtn');
    win.pfPcAddContact(addBtn);
    const wrap = host.querySelector('.pr-pc-company');
    const form = wrap.querySelector('.pr-crm-addform');
    ok('(B/add-form) header Add opens an inline add form', !!form);
    ok('(B/add-form) form opens BELOW the contact table (appended to .pr-pc-company)',
       !!form && Array.from(wrap.children).indexOf(form) > Array.from(wrap.children).indexOf(wrap.querySelector('.pr-crow-table')));
    ok('(B/add-form) header Add button is hidden while its form is open', addBtn.style.display === 'none');
    win.pfPcAddContactCancel(form.querySelector('.pr-cancel-btn'));
    ok('(B/add-form) cancel restores the header Add button + drops the form',
       addBtn.style.display === '' && !wrap.querySelector('.pr-crm-addform'));
  }

  // ---- (reserved-keys) migrating one legacy group PRESERVES sibling __crm + non-__crm keys ----
  {
    const OV = { design_professionals: {
      __crm: { 'Geotechnical': { company:'Garbin Eng', contactIds:['C0001'] } },
      __submittal_prereqs: { items:[{k:'geo',done:true}] },   // reserved non-__crm key
      'Structural - Company': 'Struct Co'                       // reserved seed label
    } };
    const DIR = [{ contactId:'C0001', firstName:'Ed', lastName:'Garbin', name:'Ed Garbin', title:'PE', company:'Garbin Eng', category:'Geotechnical Engineer', email:'ed@garbin.com' }];
    const { win, doc, captured } = build({ role:'admin', overrides:OV, directory:DIR });
    // Structural legacy host under the SAME design_professionals key -> migrate it.
    const host = makeLegacyHost(doc, 'Structural', 'design_professionals', 'Structural Engineer', 'Struct Co', [dpSeed('Structural',1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmEditContactRow(host.querySelector('.pr-crow-editbtn'));
    await wait(); await wait(); await wait();
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0 && p.body.fields && p.body.fields.__crm);
    ok('(reserved) migrate resends the FULL __crm map (Geotechnical selection preserved)',
       ovPost && ovPost.body.fields.__crm.Geotechnical && ovPost.body.fields.__crm.Geotechnical.contactIds.indexOf('C0001') !== -1);
    ok('(reserved) Structural gets its own new id (added, not replacing Geotechnical)',
       ovPost && ovPost.body.fields.__crm.Structural && ovPost.body.fields.__crm.Structural.contactIds.length === 1);
    // The __crm write is a delta on design_professionals; server Object.assign carry-forward
    // keeps __submittal_prereqs + seed labels (they are NOT in the payload => not overwritten).
    ok('(reserved) payload does NOT clobber the non-__crm reserved key (__submittal_prereqs absent from delta)',
       ovPost && ovPost.body.fields.__submittal_prereqs === undefined);
    ok('(reserved) payload does NOT clobber the reserved seed label (Structural - Company absent from delta)',
       ovPost && ovPost.body.fields['Structural - Company'] === undefined);
  }

  // ---- (no-render-bounce) an inline FIELD save (directory-row ✕ = unassign) is IN-PLACE ----
  // Constraint #5: a live save-on-change must NOT bounce the whole record. The true
  // field-save operations (directory-row unassign, company rename, contact-field edit) run
  // pfCrmRenderCards in place — NO renderProjectRecord. (The LEGACY-SEED ✕ is a separate,
  // structural re-seed that DOES re-render — by design, because the data-legacy-seed attr
  // is rebuilt at record render time; that is NOT a "field save" and is asserted below.)
  {
    const OV = { general: { __crm: { 'Owner': { company:'Westhoff Development', contactIds:['C0001'] } } } };
    const DIR = [{ contactId:'C0001', firstName:'Nathan', lastName:'Westhoff', name:'Nathan Westhoff', title:'Owner Rep', company:'Westhoff Development', category:'Owner', email:'nathan@owner.com' }];
    const { win, doc, captured } = build({ role:'admin', overrides:OV, directory:DIR });
    const host = makeLegacyHost(doc, 'Owner', 'general', 'Project Owner', 'Westhoff Development', []);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    const rmBtn = host.querySelector('.pr-crow-rmbtn[data-crm-cid="C0001"]');
    ok('(no-render-bounce) directory row has a real unassign ✕', !!rmBtn);
    win.pfCrmRemoveContactRow(rmBtn); await wait();
    win.pfCrmRemoveContactConfirm(host.querySelector('.pr-rm-yes')); await wait(); await wait();
    ok('(no-render-bounce) directory-row unassign did NOT call renderProjectRecord (in-place only)',
       captured.renderProjectRecordCalls === 0);
    const ovPost = captured.posts.find(p => String(p.url).indexOf('/api/project-override') === 0 && p.body.fields && p.body.fields.__crm);
    ok('(no-render-bounce) unassign wrote the __crm delta (fail-closed, real save)', !!ovPost);
  }

  // ---- (legacy-reseed) the LEGACY-SEED ✕ intentionally re-renders (documents the exception) ----
  {
    const { win, doc, captured } = build({ role:'admin', overrides:{}, directory:[] });
    const host = makeLegacyHost(doc, 'Owner', 'general', 'Project Owner', 'Westhoff Development', [ownerSeed(1)]);
    win.pfCrmRenderCards(doc); await wait(); await wait();
    win.pfCrmRemoveContactRow(host.querySelector('.pr-crow-rmbtn')); await wait();
    win.pfCrmRemoveContactConfirm(host.querySelector('.pr-rm-yes')); await wait(); await wait();
    ok('(legacy-reseed) legacy ✕ re-renders the record to rebuild data-legacy-seed (by design)',
       captured.renderProjectRecordCalls === 1);
  }

  console.log('\nPASS: ' + pass + '  FAIL: ' + fail + (fails.length ? '\nFailures:\n  - ' + fails.join('\n  - ') : ''));
  process.exit(fail ? 1 : 0);
})();
