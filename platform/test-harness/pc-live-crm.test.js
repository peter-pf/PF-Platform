// ============================================================================
// Project Contacts — ALWAYS-LIVE CRM selectors (Brad 2026-08-13)
// Proves the save-on-change behavior end-to-end in a jsdom DOM using the REAL
// functions extracted from index.html:
//   (a) changing a group's company auto-saves (POST fired: correct section+group+payload)
//   (b) checking/unchecking a contact auto-saves
//   (c) section-key routing correct + one group's save PRESERVES the other groups in
//       that section's __crm AND all other reserved keys
//   (d) field_ops sees read-only (no live pickers injected)
//   (e) fail-closed revert on error (control reverts, no fabricated save)
//   (f) NO renderProjectRecord in the save path
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
// The two delegated document 'change' listeners we need are tiny; rather than
// brittle multi-line marker extraction we assert they EXIST verbatim in index.html
// (so this harness stays honest to production) and then register them in the
// sandbox from the same source text. Verified substrings:
const SAVE_LISTENER_SIG = "pfPcSaveGroup(block, el);";
const RELOAD_LISTENER_SIG = "if (block) pfCrmLoadContacts(block, sel.value || '');";
if (html.indexOf(SAVE_LISTENER_SIG) < 0) throw new Error('save listener signature missing from index.html');
if (html.indexOf(RELOAD_LISTENER_SIG) < 0) throw new Error('reload listener signature missing from index.html');

let pass = 0, fail = 0; const fails = [];
function ok(n, c) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL: ' + n); } }

// ---- build a jsdom sandbox with the real functions wired in ----------------
function build(opts) {
  opts = opts || {};
  const role = opts.role || 'admin';
  const overrides = opts.overrides || {};
  const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', { runScripts: 'outside-only' });
  const win = dom.window;
  const doc = win.document;

  // ---- captured side effects ----
  const captured = { posts: [], renderProjectRecordCalls: 0, crmRenderCardsCalls: 0 };

  // ---- fetch mock: /api/project-override -> opts.saveResp (default success) ----
  win.fetch = function (url, init) {
    const body = JSON.parse(init.body);
    captured.posts.push({ url, body });
    const resp = (typeof opts.saveResp === 'function') ? opts.saveResp(body) : opts.saveResp;
    const r = resp || { httpOk: true, json: { ok: true, saved: true, sections: mergeSections(overrides, body) } };
    return Promise.resolve({
      ok: r.httpOk !== false,
      status: r.status || (r.httpOk === false ? 500 : 200),
      json: () => Promise.resolve(r.json)
    });
  };

  // Simulate the server's Object.assign(existing, fields) section merge so the
  // returned sections reflect production behavior (used to assert merge-preserve).
  function mergeSections(base, reqBody) {
    const out = JSON.parse(JSON.stringify(base || {}));
    const sk = reqBody.section;
    out[sk] = Object.assign({}, out[sk] || {}, reqBody.fields || {});
    return out;
  }

  // Sandbox globals the extracted functions reference.
  const g = win;
  g.esc2 = function (v) { return v == null ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
  g.PF_CRM_KEY = '__crm';
  g.PF_CRM_SECTION_TRADE = { 'Geotechnical':'Geotechnical Engineer','Civil':'Civil Engineer','Structural':'Structural Engineer','Ground Improvement':'Ground Improvement Engineer' };
  g.PF_CRM_GENERAL_TRADE = { 'Owner':'Owner','GC':'GC' };
  g.PF_CRM_NEWGROUP_TRADE = {
    pfTeam:{'PF Project Team':'PF Team'}, safety:{'Safety Consultant':'Safety Consultant'},
    siteReadiness:{'Staking & Layout':'Staking & Layout'},
    equipment:{'Equipment Transport':'Equipment Transport','Rental Equipment':'Rental Equipment'},
    material:{'Material Vendor(s)':'Material Vendor','Fuel Delivery':'Fuel Delivery'}
  };
  g._curNum = '99-999';
  g._curOverrides = JSON.parse(JSON.stringify(overrides));
  g.window = win;
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
  // directory: two companies per trade, each with contacts C0001/C0002.
  g.pfCrmFetchCompanies = function (trade) { return Promise.resolve([
    { company: 'Acme ' + trade, contactCount: 2 }, { company: 'Beta ' + trade, contactCount: 2 }
  ]); };
  g.pfCrmFetchContacts = function (company, trade) { return Promise.resolve([
    { contactId: 'C0001', name: 'Alice', title: 'PE', email: 'a@x.com' },
    { contactId: 'C0002', name: 'Bob', title: 'PM', email: 'b@x.com' }
  ]); };
  g.pfLoadContacts = function () { return Promise.resolve([
    { contactId: 'C0001', name: 'Alice' }, { contactId: 'C0002', name: 'Bob' }
  ]); };
  // instrumented no-ops
  g.pfCrmRenderCards = function () { captured.crmRenderCardsCalls++; };
  g.window.pfCrmRenderCards = g.pfCrmRenderCards;
  g.renderProjectRecord = function () { captured.renderProjectRecordCalls++; };
  g.window.renderProjectRecord = g.renderProjectRecord;

  // ---- pull the REAL functions from index.html ----
  const src = html;
  const fnNames = ['pfCrmSelectorBlock','pfCrmHydrate','pfCrmLoadContacts','pfCollectCrm',
                   'pfPcGroupTrade','pfPcInjectLiveSelectors','pfPcHydrateLiveSelectors','pfPcSaveGroup'];
  let code = '';
  fnNames.forEach(function (n) { code += '\n' + extractFn(src, n) + '\n'; });
  // Register the two delegated change listeners verbatim (same bodies as index.html;
  // presence of the exact call signatures is asserted at module load above).
  code += "\n"
    + "document.addEventListener('change', function(ev){\n"
    + "  var sel = ev.target;\n"
    + "  if (sel && sel.classList && sel.classList.contains('pr-crm-company')) {\n"
    + "    var block = sel.closest('.pr-crm');\n"
    + "    if (block) pfCrmLoadContacts(block, sel.value || '');\n"
    + "  }\n"
    + "});\n"
    + "document.addEventListener('change', function(ev){\n"
    + "  var el = ev.target;\n"
    + "  if (!el || !el.classList) return;\n"
    + "  var isCompany = el.classList.contains('pr-crm-company');\n"
    + "  var isCb = el.classList.contains('pr-crm-cb');\n"
    + "  if (!isCompany && !isCb) return;\n"
    + "  var wrap = el.closest ? el.closest('[data-pf-pc-picker]') : null;\n"
    + "  if (!wrap) return;\n"
    + "  var block = el.closest('.pr-crm');\n"
    + "  if (!block) return;\n"
    + "  pfPcSaveGroup(block, el);\n"
    + "});\n";

  // expose selected fns for direct test calls
  code += '\nwindow.__pf = { pfPcInjectLiveSelectors: pfPcInjectLiveSelectors, pfPcHydrateLiveSelectors: pfPcHydrateLiveSelectors, pfPcSaveGroup: pfPcSaveGroup, pfCrmLoadContacts: pfCrmLoadContacts };\n';

  win.eval(code);

  return { dom, win, doc, captured };
}

function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// Build a Project Contacts card DOM with N group read-hosts, then let the code
// inject the live pickers + hydrate them.
function buildPc(win, doc, groups) {
  const root = doc.getElementById('root');
  root.innerHTML = '<div class="pr-card pr-pc-section"><div class="pr-card-body">'
    + groups.map(function (grp) {
        return '<div class="pr-nested-card-wrap"><div class="pr-card" data-pr-section="' + grp.key + '"><div class="pr-card-body">'
          + '<div class="pr-crm-cards" data-crm-cards="' + grp.name + '" data-crm-cards-key="' + grp.key + '" data-role-tag="' + grp.name + '"></div>'
          + '</div></div></div>';
      }).join('')
    + '</div></div>';
  win.__pf.pfPcInjectLiveSelectors(root);
  win.__pf.pfPcHydrateLiveSelectors(root);
  return root;
}

(async () => {
  console.log('\n==== Project Contacts always-live CRM (save-on-change) ====');

  // ---------------------------------------------------------------------------
  // (d) field_ops sees read-only — NO pickers injected
  // ---------------------------------------------------------------------------
  {
    const { win, doc } = build({ role: 'field_ops' });
    const root = buildPc(win, doc, [{ key: 'general', name: 'Owner' }, { key: 'general', name: 'GC' }]);
    const pickers = root.querySelectorAll('[data-pf-pc-picker]');
    ok('(d) field_ops: NO live pickers injected', pickers.length === 0);
    ok('(d) field_ops: read cards host still present', root.querySelectorAll('.pr-crm-cards').length === 2);
  }

  // office user: pickers injected for each group
  {
    const { win, doc } = build({ role: 'admin' });
    const root = buildPc(win, doc, [{ key: 'general', name: 'Owner' }, { key: 'general', name: 'GC' }]);
    await tick(); await tick();
    const pickers = root.querySelectorAll('[data-pf-pc-picker]');
    ok('office: one live picker per group injected', pickers.length === 2);
    const keys = Array.prototype.map.call(pickers, function (p) { return p.getAttribute('data-pf-pc-picker'); });
    ok('office: pickers tagged by group name (Owner+GC)', keys.indexOf('Owner') >= 0 && keys.indexOf('GC') >= 0);
    // idempotency: re-inject does not duplicate
    win.__pf.pfPcInjectLiveSelectors(root);
    ok('office: injection idempotent (no dup pickers)', root.querySelectorAll('[data-pf-pc-picker]').length === 2);
  }

  // ---------------------------------------------------------------------------
  // (a) company change auto-saves, correct section+group+payload
  // (c) merge-preserve: saving GC preserves Owner + a reserved key in the section
  // (f) no renderProjectRecord in save path
  // ---------------------------------------------------------------------------
  {
    const overrides = { general: {
      __crm: { Owner: { company: 'AcmeOwner', contactIds: ['C0001'] } },
      __contract_pull: { some: 'reserved' },      // sibling reserved key (must survive)
      'Owner': 'Acme Inc'                          // flat string field (must survive)
    } };
    const { win, doc, captured } = build({ role: 'admin', overrides });
    const root = buildPc(win, doc, [{ key: 'general', name: 'Owner' }, { key: 'general', name: 'GC' }]);
    await tick(); await tick(); await tick();
    // Change the GC group's company dropdown -> should auto-save.
    const gcPicker = root.querySelector('[data-pf-pc-picker="GC"]');
    const gcSel = gcPicker.querySelector('.pr-crm-company');
    gcSel.value = 'Beta GC';
    gcSel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();

    ok('(a) company change fired exactly one POST', captured.posts.length === 1);
    const p = captured.posts[0] && captured.posts[0].body;
    ok('(a) POST url is /api/project-override', captured.posts[0].url.indexOf('/api/project-override') >= 0);
    ok('(a) POST section = general (routed from crmKey)', p && p.section === 'general');
    ok('(a) POST num = 99-999', p && p.num === '99-999');
    const crm = p && p.fields && p.fields.__crm;
    ok('(a) POST payload set GC = Beta GC', crm && crm.GC && crm.GC.company === 'Beta GC');
    // switching to a NEW company starts empty contact selection
    ok('(a) new company -> empty contactIds', crm && crm.GC && Array.isArray(crm.GC.contactIds) && crm.GC.contactIds.length === 0);
    // (c) merge-preserve inside __crm: Owner group untouched
    ok('(c) __crm merge preserves sibling group Owner', crm && crm.Owner && crm.Owner.company === 'AcmeOwner' && crm.Owner.contactIds[0] === 'C0001');
    // (c) other reserved keys / flat fields are NOT in the fields payload (server Object.assign
    //     keeps them because we only send __crm) — assert we did NOT send them:
    ok('(c) payload does NOT touch __contract_pull', p.fields.__contract_pull === undefined);
    ok('(c) payload does NOT touch flat Owner field', p.fields.Owner === undefined);
    // and the server-simulated returned sections keep them:
    ok('(c) returned sections keep __contract_pull', win.window.PF_PROJECT_OVERRIDES['99-999'].sections.general.__contract_pull.some === 'reserved');
    ok('(c) returned sections keep flat Owner field', win.window.PF_PROJECT_OVERRIDES['99-999'].sections.general.Owner === 'Acme Inc');
    // (f) no renderProjectRecord; read cards re-rendered instead
    ok('(f) renderProjectRecord NOT called in save path', captured.renderProjectRecordCalls === 0);
    ok('(f) pfCrmRenderCards called to refresh read cards', captured.crmRenderCardsCalls >= 1);
  }

  // ---------------------------------------------------------------------------
  // (b) checkbox change auto-saves (check + uncheck)
  // ---------------------------------------------------------------------------
  {
    const overrides = { design_professionals: {
      __crm: {
        Geotechnical: { company: 'Acme Geotechnical Engineer', contactIds: ['C0001'] },
        Structural:   { company: 'Beta Structural Engineer', contactIds: ['C0002'] }
      }
    } };
    const { win, doc, captured } = build({ role: 'admin', overrides });
    const root = buildPc(win, doc, [
      { key: 'design_professionals', name: 'Geotechnical' },
      { key: 'design_professionals', name: 'Structural' }
    ]);
    await tick(); await tick(); await tick();
    // Geotechnical picker: company pre-selected -> its contacts loaded + C0001 checked.
    const geo = root.querySelector('[data-pf-pc-picker="Geotechnical"]');
    const cbs = geo.querySelectorAll('.pr-crm-cb');
    ok('(b) geotech contacts hydrated (2 checkboxes)', cbs.length === 2);
    const c1 = geo.querySelector('.pr-crm-cb[value="C0001"]');
    const c2 = geo.querySelector('.pr-crm-cb[value="C0002"]');
    ok('(b) saved contact C0001 pre-checked', !!(c1 && c1.checked));
    // CHECK C0002 -> auto-save
    c2.checked = true;
    c2.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();
    ok('(b) checkbox change fired a POST', captured.posts.length === 1);
    let crm = captured.posts[0].body.fields.__crm;
    ok('(b) POST section = design_professionals', captured.posts[0].body.section === 'design_professionals');
    ok('(b) Geotechnical now has C0001+C0002', crm.Geotechnical && crm.Geotechnical.contactIds.indexOf('C0001') >= 0 && crm.Geotechnical.contactIds.indexOf('C0002') >= 0);
    ok('(b/c) sibling Structural preserved in same-section __crm', crm.Structural && crm.Structural.company === 'Beta Structural Engineer' && crm.Structural.contactIds[0] === 'C0002');
    // adopt server truth then UNCHECK C0001 -> auto-save reflects removal
    win._curOverrides = win.window.PF_PROJECT_OVERRIDES['99-999'].sections;
    c1.checked = false;
    c1.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();
    ok('(b) uncheck fired a 2nd POST', captured.posts.length === 2);
    crm = captured.posts[1].body.fields.__crm;
    ok('(b) uncheck removed C0001 (only C0002 left)', crm.Geotechnical.contactIds.indexOf('C0001') < 0 && crm.Geotechnical.contactIds.indexOf('C0002') >= 0);
  }

  // ---------------------------------------------------------------------------
  // (c) section-key routing across DIFFERENT sections (equipment: 2 groups)
  // ---------------------------------------------------------------------------
  {
    const overrides = { equipment: {
      __crm: {
        'Equipment Transport': { company: 'Hauler', contactIds: ['C0001'] },
        'Rental Equipment':    { company: 'Renter', contactIds: ['C0002'] }
      },
      __site_elevations: { grade: 100 }   // reserved sibling must survive
    } };
    const { win, doc, captured } = build({ role: 'admin', overrides });
    const root = buildPc(win, doc, [
      { key: 'equipment', name: 'Equipment Transport' },
      { key: 'equipment', name: 'Rental Equipment' }
    ]);
    await tick(); await tick(); await tick();
    const rental = root.querySelector('[data-pf-pc-picker="Rental Equipment"]');
    const sel = rental.querySelector('.pr-crm-company');
    sel.value = 'Beta Rental Equipment';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();
    const p = captured.posts[0].body;
    ok('(c) equipment routing: section = equipment', p.section === 'equipment');
    ok('(c) Rental Equipment updated', p.fields.__crm['Rental Equipment'].company === 'Beta Rental Equipment');
    ok('(c) sibling Equipment Transport preserved', p.fields.__crm['Equipment Transport'].company === 'Hauler');
    ok('(c) payload did NOT include __site_elevations', p.fields.__site_elevations === undefined);
    ok('(c) returned sections still have __site_elevations', win.window.PF_PROJECT_OVERRIDES['99-999'].sections.equipment.__site_elevations.grade === 100);
  }

  // ---------------------------------------------------------------------------
  // (e) FAIL CLOSED: server returns non-{ok,saved} -> control reverts, no store update
  // ---------------------------------------------------------------------------
  {
    const overrides = { safety: { __crm: { 'Safety Consultant': { company: 'OldSafety', contactIds: [] } } } };
    const { win, doc, captured } = build({
      role: 'admin', overrides,
      saveResp: { httpOk: true, status: 200, json: { ok: false, message: 'nope' } }  // fail
    });
    const root = buildPc(win, doc, [{ key: 'safety', name: 'Safety Consultant' }]);
    await tick(); await tick(); await tick();
    const picker = root.querySelector('[data-pf-pc-picker="Safety Consultant"]');
    const sel = picker.querySelector('.pr-crm-company');
    // baseline: data-crm-selected reflects OldSafety
    const baseline = sel.getAttribute('data-crm-selected');
    sel.value = 'Beta Safety Consultant';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();
    ok('(e) POST attempted', captured.posts.length === 1);
    ok('(e) fail-closed: company dropdown reverted to baseline', sel.value === (baseline || ''));
    ok('(e) fail-closed: store NOT updated', win.window.PF_PROJECT_OVERRIDES['99-999'] === undefined);
    ok('(e) fail-closed: no renderProjectRecord', captured.renderProjectRecordCalls === 0);
    const msg = picker.querySelector('.pf-pc-msg');
    ok('(e) fail-closed: inline error shown', !!(msg && msg.style.display !== 'none' && /nope/.test(msg.textContent)));
  }

  // ---------------------------------------------------------------------------
  // (e2) FAIL CLOSED on network error -> revert + honest message
  // ---------------------------------------------------------------------------
  {
    const overrides = { material: { __crm: { 'Fuel Delivery': { company: 'OldFuel', contactIds: [] } } } };
    const { win, doc, captured } = build({ role: 'admin', overrides });
    win.fetch = function () { captured.posts.push({ net: 'err' }); return Promise.reject(new Error('down')); };
    const root = buildPc(win, doc, [{ key: 'material', name: 'Fuel Delivery' }]);
    await tick(); await tick(); await tick();
    const picker = root.querySelector('[data-pf-pc-picker="Fuel Delivery"]');
    const sel = picker.querySelector('.pr-crm-company');
    const baseline = sel.getAttribute('data-crm-selected');
    sel.value = 'Beta Fuel Delivery';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(); await tick(); await tick();
    ok('(e2) network fail: reverted to baseline', sel.value === (baseline || ''));
    const msg = picker.querySelector('.pf-pc-msg');
    ok('(e2) network fail: honest error shown', !!(msg && /could not reach the server/i.test(msg.textContent)));
  }

  console.log('\nPASS: ' + pass + '  FAIL: ' + fail);
  if (fail) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(function (e) { console.error(e); process.exit(1); });
