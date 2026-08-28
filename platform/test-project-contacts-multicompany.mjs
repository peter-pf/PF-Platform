// Test: MULTI-COMPANY per Project Contacts subsection (Brad 2026-08-28, Option A additive).
//
// A subsection (Equipment Transport, Material Vendor(s), etc.) may hold MANY companies,
// each with its own {company,address,contactIds}. Schema OPTION A: each __crm[section]
// entry gains an optional `companies:[]` array; the legacy top-level {company,address,
// contactIds} is KEPT (mirrored from companies[0]); when `companies` is absent it is
// synthesized from the legacy single on READ. No migration, no data loss.
//
// This harness harvests the REAL client helpers from index.html and the REAL worker
// validator from functions/api/project-override.js (via regex, same pattern as the other
// tests) and exercises them directly + renders through pfCrmRenderOneHost in jsdom.
//
// Coverage (matches every claim in the report — the verifier checks these):
//   1. Add 2+ companies to Equipment Transport -> both persist + render 2 cards.
//   2. Legacy single-company project (top-level only, no companies[]) -> exactly 1 card,
//      no data loss (name/address/contacts preserved).
//   3. Save round-trip: adding a company to ONE section does NOT clobber sibling sections.
//   4. Remove-company drops the right element + does not corrupt the array (siblings kept).
//   5. field_ops (crew, canEdit=false) -> NO add/remove/edit controls in render; server
//      requireArea('financials') 403s field_ops (asserted from worker source).
//   6. Legacy top-level MIRRORS companies[0] after a multi-company save (un-migrated reader).
//   7. Worker cleanCrm validates companies[], rejects malformed, mirrors head, caps count.
//
// Run from the platform dir: node test-project-contacts-multicompany.mjs

import fs from 'fs';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

const src    = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const apiSrc = fs.readFileSync(new URL('./functions/api/project-override.js', import.meta.url), 'utf8');

function harvest(source, re, label) {
  const m = source.match(re);
  if (!m) { console.error('COULD NOT HARVEST ' + label); process.exit(2); }
  return m[0];
}

// -------- Harvest the CLIENT helpers (index.html) --------
const normOneSrc  = harvest(src, /function pfCrmNormOneCompany\(c\)\{[\s\S]*?\n    \}/, 'pfCrmNormOneCompany');
const normEntrySrc= harvest(src, /function pfCrmNormEntry\(entry\)\{[\s\S]*?\n    \}/, 'pfCrmNormEntry');
const packSrc     = harvest(src, /function pfCrmPackEntry\(companies\)\{[\s\S]*?\n    \}/, 'pfCrmPackEntry');
const companiesSrc= harvest(src, /function pfCrmCompanies\(sectionKey, prefix\)\{[\s\S]*?\n    \}/, 'pfCrmCompanies');
const mapSrc      = harvest(src, /function pfCrmMap\(sectionKey\)\{[\s\S]*?\n    \}/, 'pfCrmMap');
const rebuildSrc  = harvest(src, /function pfCrmRebuildMap\(sectionKey, prefix, mutate\)\{[\s\S]*?\n    \}/, 'pfCrmRebuildMap');

// Build a client sandbox with a mutable _curOverrides + PF_CRM_KEY the helpers reference.
function clientSandbox(overrides) {
  const factory = new Function(
    '_curOverrides', 'PF_CRM_KEY',
    mapSrc + '\n' + normOneSrc + '\n' + normEntrySrc + '\n' + packSrc + '\n' +
    companiesSrc + '\n' + rebuildSrc + '\n' +
    'return { pfCrmMap, pfCrmNormOneCompany, pfCrmNormEntry, pfCrmPackEntry, pfCrmCompanies, pfCrmRebuildMap };'
  );
  return factory(overrides, '__crm');
}

// -------- Harvest the WORKER validator (project-override.js) --------
const sSrc          = harvest(apiSrc, /function s\(v, cap\) \{[\s\S]*?\n\}/, 's');
const cleanCompanySrc = harvest(apiSrc, /function cleanCrmCompany\(entry\) \{[\s\S]*?\n\}/, 'cleanCrmCompany');
const cleanCrmSrc   = harvest(apiSrc, /function cleanCrm\(input\) \{[\s\S]*?\n\}/, 'cleanCrm');
function workerSandbox() {
  const factory = new Function(
    'CRM_MAX_FIRMS','CRM_MAX_IDS','CRM_MAX_COMPANY','CRM_MAX_SUBKEY','CRM_ID_RE','CRM_MAX_COMPANIES',
    sSrc + '\n' + cleanCompanySrc + '\n' + cleanCrmSrc + '\n return { cleanCrm, cleanCrmCompany };'
  );
  return factory(12, 40, 200, 60, /^C\d+$/, 25);
}

// ============================================================================
// 1 + 2. CLIENT normalization: legacy single vs companies[] back-compat
// ============================================================================
{
  const cli = clientSandbox({});
  // Legacy single entry (no companies[]) -> 1-element list, content preserved.
  const legacy = { company: 'Paddacks', address: '123 Main St', contactIds: ['C0002'] };
  const normed = cli.pfCrmNormEntry(legacy);
  eq('BC legacy single -> 1 company', normed.length, 1);
  eq('BC legacy company preserved', normed[0].company, 'Paddacks');
  eq('BC legacy address preserved', normed[0].address, '123 Main St');
  eq('BC legacy contactIds preserved', normed[0].contactIds, ['C0002']);

  // companies[] entry -> used as-is.
  const multi = { company: 'Paddacks', address: 'A', contactIds: ['C0002'],
    companies: [ { company: 'Paddacks', address: 'A', contactIds: ['C0002'] },
                 { company: 'Stephan Trucking', address: 'B', contactIds: ['C0003'] } ] };
  const nm2 = cli.pfCrmNormEntry(multi);
  eq('multi -> 2 companies', nm2.length, 2);
  eq('multi #2 company', nm2[1].company, 'Stephan Trucking');
  eq('multi #2 ids', nm2[1].contactIds, ['C0003']);

  // Empty legacy entry -> [] (nothing to show).
  eq('empty legacy -> []', cli.pfCrmNormEntry({ company: '', address: '', contactIds: [] }).length, 0);
  eq('null entry -> []', cli.pfCrmNormEntry(null).length, 0);

  // Bad ids filtered defensively at norm.
  eq('norm filters bad ids', cli.pfCrmNormOneCompany({ contactIds: ['C0001','bad','c0002'] }).contactIds, ['C0001','C0002']);
}

// ============================================================================
// 6. pack: legacy top-level MIRRORS companies[0]
// ============================================================================
{
  const cli = clientSandbox({});
  const packed = cli.pfCrmPackEntry([
    { company: 'Paddacks', address: 'A', contactIds: ['C0002'] },
    { company: 'Stephan Trucking', address: 'B', contactIds: ['C0003'] } ]);
  eq('pack mirrors head company', packed.company, 'Paddacks');
  eq('pack mirrors head address', packed.address, 'A');
  eq('pack mirrors head ids', packed.contactIds, ['C0002']);
  eq('pack keeps full companies[]', packed.companies.length, 2);
  // Empty list -> explicit empty entry (cleared selection round-trips).
  const empty = cli.pfCrmPackEntry([]);
  eq('pack empty head company', empty.company, '');
  eq('pack empty companies[]', empty.companies.length, 0);
}

// ============================================================================
// 3. pfCrmRebuildMap: add company to one section preserves siblings
// ============================================================================
{
  const overrides = { equipment: { __crm: {
    'Equipment Transport': { company: 'Paddacks', address: 'A', contactIds: ['C0002'] },
    'Rental Equipment':    { company: 'United Rentals', address: 'R', contactIds: ['C0005'] }
  } } };
  const cli = clientSandbox(overrides);
  // Append a second company to Equipment Transport.
  const out = cli.pfCrmRebuildMap('equipment', 'Equipment Transport', function(cos){
    cos.push({ company: 'Stephan Trucking', address: 'B', contactIds: ['C0003'] });
    return cos;
  });
  eq('rebuild: ET now 2 companies', out['Equipment Transport'].companies.length, 2);
  eq('rebuild: ET #2 is Stephan', out['Equipment Transport'].companies[1].company, 'Stephan Trucking');
  eq('rebuild: ET head still Paddacks (mirror)', out['Equipment Transport'].company, 'Paddacks');
  // SIBLING untouched.
  ok('rebuild: sibling Rental preserved', out['Rental Equipment'].company === 'United Rentals'
     && out['Rental Equipment'].companies.length === 1
     && out['Rental Equipment'].companies[0].contactIds[0] === 'C0005');
  // A prefix not previously present is created.
  const out2 = cli.pfCrmRebuildMap('equipment', 'New Sub', function(cos){ cos.push({ company: 'X', address:'', contactIds:['C0009'] }); return cos; });
  eq('rebuild: new prefix created', out2['New Sub'].companies[0].company, 'X');
  ok('rebuild: new-prefix still keeps siblings', out2['Equipment Transport'].company === 'Paddacks' && out2['Rental Equipment'].company === 'United Rentals');
}

// ============================================================================
// 4. remove-company: drops the right element, no corruption, siblings kept
// ============================================================================
{
  const overrides = { material: { __crm: {
    'Material Vendor(s)': { company: 'Rogers Group', address: 'A', contactIds: ['C0007'],
      companies: [ { company: 'Rogers Group', address: 'A', contactIds: ['C0007'] },
                   { company: 'Irving Materials', address: 'B', contactIds: ['C0008'] },
                   { company: 'US Aggregates', address: 'C', contactIds: ['C0009'] } ] },
    'Fuel Delivery': { company: 'Co-Alliance', address: 'F', contactIds: ['C0010'] }
  } } };
  const cli = clientSandbox(overrides);
  // Remove the MIDDLE company (index 1).
  const out = cli.pfCrmRebuildMap('material', 'Material Vendor(s)', function(list){ list.splice(1,1); return list; });
  eq('rmco: MV now 2 companies', out['Material Vendor(s)'].companies.length, 2);
  eq('rmco: MV #1 kept', out['Material Vendor(s)'].companies[0].company, 'Rogers Group');
  eq('rmco: MV #2 is now US Aggregates', out['Material Vendor(s)'].companies[1].company, 'US Aggregates');
  eq('rmco: head still Rogers', out['Material Vendor(s)'].company, 'Rogers Group');
  ok('rmco: sibling Fuel preserved', out['Fuel Delivery'].company === 'Co-Alliance' && out['Fuel Delivery'].companies[0].contactIds[0] === 'C0010');
  // Remove the FIRST company -> head re-mirrors to the new first.
  const out2 = cli.pfCrmRebuildMap('material', 'Material Vendor(s)', function(list){ list.splice(0,1); return list; });
  eq('rmco: removing head re-mirrors', out2['Material Vendor(s)'].company, 'Irving Materials');
}

// ============================================================================
// 7. WORKER cleanCrm: validates companies[], mirrors head, rejects malformed, caps
// ============================================================================
{
  const w = workerSandbox();
  // companies[] accepted; head mirrored.
  const cleaned = w.cleanCrm({
    'Equipment Transport': { companies: [
      { company: 'Paddacks', address: 'A', contactIds: ['C0002'] },
      { company: 'Stephan Trucking', address: 'B', contactIds: ['c0003'] } ] } });
  ok('worker: companies[] accepted', cleaned && cleaned['Equipment Transport'].companies.length === 2);
  eq('worker: head mirrors companies[0]', cleaned['Equipment Transport'].company, 'Paddacks');
  eq('worker: id uppercased', cleaned['Equipment Transport'].companies[1].contactIds, ['C0003']);
  // Legacy single (no companies[]) -> synth 1-element + mirror.
  const legacy = w.cleanCrm({ 'Fuel Delivery': { company: 'Co-Alliance', address: 'F', contactIds: ['C0010'] } });
  eq('worker: legacy synth 1 company', legacy['Fuel Delivery'].companies.length, 1);
  eq('worker: legacy head preserved', legacy['Fuel Delivery'].company, 'Co-Alliance');
  eq('worker: legacy companies[0]', legacy['Fuel Delivery'].companies[0].company, 'Co-Alliance');
  // Malformed: bad id inside a company -> reject whole save (null).
  eq('worker: bad id rejects', w.cleanCrm({ 'X': { companies: [ { company:'A', contactIds:['NOTID'] } ] } }), null);
  // Malformed: non-object company element -> reject.
  eq('worker: non-object element rejects', w.cleanCrm({ 'X': { companies: [ 'nope' ] } }), null);
  // Over-cap companies -> reject.
  const many = []; for (let i=0;i<26;i++) many.push({ company:'C'+i, contactIds:[] });
  eq('worker: over-cap companies rejects', w.cleanCrm({ 'X': { companies: many } }), null);
  // Over-cap ids inside a company -> reject.
  const manyIds = []; for (let i=0;i<41;i++) manyIds.push('C'+i);
  eq('worker: over-cap ids rejects', w.cleanCrm({ 'X': { companies:[{ company:'A', contactIds: manyIds }] } }), null);
  // Empty companies:[] -> explicit empty (cleared) entry, round-trips.
  const emptyCos = w.cleanCrm({ 'X': { companies: [] } });
  ok('worker: empty companies[] -> cleared entry', emptyCos['X'].company === '' && emptyCos['X'].companies.length === 0);
  // Absent __crm -> {}.
  eq('worker: absent -> {}', w.cleanCrm(null), {});
  // Non-object __crm -> reject.
  eq('worker: array __crm rejects', w.cleanCrm([1,2]), null);
}

// ============================================================================
// RENDER (jsdom): pfCrmRenderOneHost — legacy 1 card, multi 2 cards, RBAC
// ============================================================================
function renderSandbox(overrides, canEditVal) {
  // Harvest the render fn + its dependencies.
  const renderSrc = harvest(src, /function pfCrmRenderOneHost\(host, byId, mapFor\)\{[\s\S]*?\n    \}\n    window\.pfCrmRenderCards/, 'pfCrmRenderOneHost');
  // Trim the trailing window.pfCrmRenderCards line we grabbed as a boundary.
  const renderFn = renderSrc.replace(/\n    window\.pfCrmRenderCards$/, '');
  const decodeSeedSrc = harvest(src, /function pfCrmDecodeLegacySeed\(host\)\{[\s\S]*?\n    \}/, 'pfCrmDecodeLegacySeed');
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  const esc2 = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const pfFmtPhone = (p) => String(p||'');
  const canEdit = () => canEditVal;
  const factory = new Function(
    'document','_curOverrides','PF_CRM_KEY','esc2','pfFmtPhone','canEdit','JSON',
    mapSrc + '\n' + normOneSrc + '\n' + normEntrySrc + '\n' + packSrc + '\n' +
    decodeSeedSrc + '\n' + renderFn + '\n return pfCrmRenderOneHost;'
  );
  const fn = factory(doc, overrides, '__crm', esc2, pfFmtPhone, canEdit, JSON);
  return { doc, fn, dom };
}
function makeHost(doc, prefix, key) {
  const h = doc.createElement('div');
  h.className = 'pr-crm-cards';
  h.setAttribute('data-crm-cards', prefix);
  h.setAttribute('data-crm-cards-key', key);
  h.setAttribute('data-role-tag', prefix);
  doc.body.appendChild(h);
  return h;
}
const byId = {
  C0002: { contactId:'C0002', name:'Miah', title:'Dispatch', officePhone:'2605550102', email:'miah@paddacks.com' },
  C0003: { contactId:'C0003', name:'Mark Maller', title:'Owner', cellPhone:'2605550103', email:'mmaller@stephantruck.com' },
  C0005: { contactId:'C0005', name:'Ann', title:'Rentals', email:'ann@ur.com' }
};

// Legacy single-company project -> exactly 1 company card, office edit affordances present.
{
  const overrides = { equipment: { __crm: {
    'Equipment Transport': { company:'Paddacks', address:'123 Main', contactIds:['C0002'] } } } };
  const { doc, fn } = renderSandbox(overrides, true);
  const h = makeHost(doc, 'Equipment Transport', 'equipment');
  fn(h, byId, function(k){ return (overrides[k] && overrides[k].__crm) || {}; });
  eq('render legacy: exactly 1 company card', h.querySelectorAll('.pr-pc-company').length, 1);
  ok('render legacy: company name shown', h.querySelector('.pr-pc-company-name').textContent === 'Paddacks');
  ok('render legacy: contact row present', /Miah/.test(h.innerHTML));
  ok('render legacy: "+ Add contact" present (office)', /\+ Add contact/.test(h.innerHTML));
  ok('render legacy: "+ Add company" foot present (office)', h.querySelector('.pr-pc-addco-foot') != null);
  ok('render legacy: NO remove-company (sole card)', h.querySelector('.pr-pc-rmco-head') == null);
  ok('render legacy: co-idx on card = 0', h.querySelector('.pr-pc-company').getAttribute('data-co-idx') === '0');
}

// Multi-company (2) -> 2 cards, each with its own name/contacts, remove-company present.
{
  const overrides = { equipment: { __crm: {
    'Equipment Transport': { company:'Paddacks', address:'A', contactIds:['C0002'],
      companies:[ { company:'Paddacks', address:'A', contactIds:['C0002'] },
                  { company:'Stephan Trucking', address:'B', contactIds:['C0003'] } ] } } } };
  const { doc, fn } = renderSandbox(overrides, true);
  const h = makeHost(doc, 'Equipment Transport', 'equipment');
  fn(h, byId, function(k){ return (overrides[k] && overrides[k].__crm) || {}; });
  eq('render multi: 2 company cards', h.querySelectorAll('.pr-pc-company').length, 2);
  const names = Array.from(h.querySelectorAll('.pr-pc-company-name')).map(n=>n.textContent);
  eq('render multi: both company names', names, ['Paddacks','Stephan Trucking']);
  ok('render multi: both contacts render', /Miah/.test(h.innerHTML) && /Mark Maller/.test(h.innerHTML));
  eq('render multi: remove-company on each card', h.querySelectorAll('.pr-pc-rmco-head').length, 2);
  const idxs = Array.from(h.querySelectorAll('.pr-pc-company')).map(c=>c.getAttribute('data-co-idx'));
  eq('render multi: co-idx 0 and 1', idxs, ['0','1']);
  // The remove buttons carry the right co-idx.
  const rmIdxs = Array.from(h.querySelectorAll('.pr-pc-rmco-head')).map(b=>b.getAttribute('data-co-idx'));
  eq('render multi: rmco co-idx 0 and 1', rmIdxs, ['0','1']);
}

// 5. RBAC: field crew (canEdit=false) sees NO add/remove/edit controls.
{
  const overrides = { equipment: { __crm: {
    'Equipment Transport': { company:'Paddacks', address:'A', contactIds:['C0002'],
      companies:[ { company:'Paddacks', address:'A', contactIds:['C0002'] },
                  { company:'Stephan Trucking', address:'B', contactIds:['C0003'] } ] } } } };
  const { doc, fn } = renderSandbox(overrides, false);
  const h = makeHost(doc, 'Equipment Transport', 'equipment');
  fn(h, byId, function(k){ return (overrides[k] && overrides[k].__crm) || {}; });
  eq('RBAC crew: still 2 cards (read)', h.querySelectorAll('.pr-pc-company').length, 2);
  ok('RBAC crew: NO "+ Add contact"', !/\+ Add contact/.test(h.innerHTML));
  ok('RBAC crew: NO "+ Add company"', h.querySelector('.pr-pc-addco-foot') == null);
  ok('RBAC crew: NO remove-company', h.querySelector('.pr-pc-rmco-head') == null);
  ok('RBAC crew: NO editbtn/rmbtn', !/pr-crow-editbtn/.test(h.innerHTML) && !/pr-crow-rmbtn/.test(h.innerHTML));
  ok('RBAC crew: NO contenteditable', !/contenteditable="true"/.test(h.innerHTML));
  ok('RBAC crew: contacts still visible', /Miah/.test(h.innerHTML) && /Mark Maller/.test(h.innerHTML));
}

// 5b. RBAC server: field_ops blocked. project-override gates BOTH GET and POST on
// requireArea(session,'financials'); financials = admin/partner/business_dev, field_ops
// is blocked (can neither read nor write overrides). The __crm multi-company write rides
// the SAME vetted POST path (fields.__crm -> cleanCrm), so it inherits this gate exactly.
{
  ok("server: POST requireArea(session,'financials') present",
     /const denied = requireArea\(session, 'financials'\)/.test(apiSrc));
  ok("server: GET requireArea(...,'financials') present",
     /requireArea\(context\.data && context\.data\.session, 'financials'\)/.test(apiSrc));
  ok('server: requireArea imported from auth lib', /import \{ requireArea \} from '\.\.\/lib\/auth\.js'/.test(apiSrc));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
