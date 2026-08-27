// Test for CHANGE E (2026-08-27, Derek): three order-contact PERSON fields added to
// the inventory item detail pane, directly UNDER "Company to Call to Order":
//   orderContactName / orderContactEmail / orderContactPhone
//
// Asserts, by harvesting the REAL render helpers from index.html + static source checks:
//   - View mode (office, editMode OFF): email renders as a mailto: <a>, phone as a
//     tel: <a>, name as plain read-only value; all empty => em-dash placeholder.
//   - Edit mode ON (canEdit && editMode): all three render as typeable <input>, value
//     hydrated, with the right native input type (email/tel/text).
//   - Field crew (canEdit FALSE): NO inputs even if editMode true (view only).
//   - The three fields are wired in detailPaneHTML directly under orderContact.
//   - The three fields are in the client TEXT_FIELDS allowlist (mergedItem hydrates them).
//   - The three fields are in the server TEXT_FIELDS allowlist (functions/api/inventory.js).
//
// Run from the platform dir: node test-inventory-order-contact.mjs

import fs from 'fs';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

const src    = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const apiSrc = fs.readFileSync(new URL('./functions/api/inventory.js', import.meta.url), 'utf8');

function harvest(re, label) {
  const m = src.match(re);
  if (!m) { console.error('COULD NOT HARVEST ' + label); process.exit(2); }
  return m[0];
}
const detailFieldSrc = harvest(/function detailField\(label, field, item, kind\) \{[\s\S]*?\n  \}/, 'detailField');
const isHttpUrlSrc   = harvest(/function isHttpUrl\(v\) \{[\s\S]*?\n  \}/, 'isHttpUrl');
const isEmailSrc     = harvest(/function isEmail\(v\) \{[\s\S]*?\n  \}/, 'isEmail');
const telHrefSrc     = harvest(/function telHref\(v\) \{[\s\S]*?\n  \}/, 'telHref');

function makeDetailField(canEdit, editMode) {
  const E = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const factory = new Function(
    'E', 'canEdit', 'editMode',
    isHttpUrlSrc + '\n' + isEmailSrc + '\n' + telHrefSrc + '\n' + detailFieldSrc +
    '\n return detailField;'
  );
  return factory(E, canEdit, editMode);
}
function frag(html) {
  const dom = new JSDOM('<!doctype html><body><div id="r">' + html + '</div>');
  return dom.window.document.getElementById('r');
}

const item = { id: 'drill-1', description: 'Drill',
  orderContact: 'Acme Supply', orderContactName: 'Jane Doe',
  orderContactEmail: 'jane@acme.com', orderContactPhone: '(260) 555-0100' };
const blank = { id: 'drill-2', orderContactName: '', orderContactEmail: '', orderContactPhone: '' };

// === 1) VIEW MODE (office, editMode OFF): mailto + tel links, plain name ============
{
  const df = makeDetailField(true, false);
  const name  = frag(df('Contact Name',  'orderContactName',  item, 'text'));
  const email = frag(df('Contact Email', 'orderContactEmail', item, 'email'));
  const phone = frag(df('Contact Phone', 'orderContactPhone', item, 'tel'));
  ok('view: name is read-only value (no input)', name.querySelectorAll('input').length === 0
     && /Jane Doe/.test(name.textContent));
  const ea = email.querySelector('a.inv-df-link');
  ok('view: email is a mailto: link', !!ea && ea.getAttribute('href') === 'mailto:jane@acme.com');
  const pa = phone.querySelector('a.inv-df-link');
  ok('view: phone is a tel: link (digits only)', !!pa && pa.getAttribute('href') === 'tel:2605550100');
  ok('view: no inputs anywhere in view mode',
     email.querySelectorAll('input').length === 0 && phone.querySelectorAll('input').length === 0);
}

// === 2) BLANK values render em-dash, NOT a broken link =============================
{
  const df = makeDetailField(true, false);
  const email = frag(df('Contact Email', 'orderContactEmail', blank, 'email'));
  const phone = frag(df('Contact Phone', 'orderContactPhone', blank, 'tel'));
  ok('view blank: email shows em-dash, no link', !email.querySelector('a') && /—/.test(email.textContent));
  ok('view blank: phone shows em-dash, no link', !phone.querySelector('a') && /—/.test(phone.textContent));
}

// === 3) EDIT MODE ON: typeable inputs with correct native types + hydrated values ===
{
  const df = makeDetailField(true, true);
  const name  = frag(df('Contact Name',  'orderContactName',  item, 'text'));
  const email = frag(df('Contact Email', 'orderContactEmail', item, 'email'));
  const phone = frag(df('Contact Phone', 'orderContactPhone', item, 'tel'));
  const ni = name.querySelector('input.inv-detail-fin');
  const ei = email.querySelector('input.inv-detail-fin');
  const pi = phone.querySelector('input.inv-detail-fin');
  ok('edit: name input type=text hydrated',  !!ni && ni.type === 'text'  && ni.value === 'Jane Doe');
  ok('edit: email input type=email hydrated', !!ei && ei.type === 'email' && ei.value === 'jane@acme.com');
  ok('edit: phone input type=tel hydrated',   !!pi && pi.type === 'tel'   && pi.value === '(260) 555-0100');
  ok('edit: inputs carry data-field for save', ei.getAttribute('data-field') === 'orderContactEmail'
     && pi.getAttribute('data-field') === 'orderContactPhone');
  ok('edit: no mailto/tel <a> rendered in edit mode',
     !email.querySelector('a') && !phone.querySelector('a'));
}

// === 4) FIELD CREW (canEdit FALSE): view only even if editMode true =================
{
  const df = makeDetailField(false, true);
  const email = frag(df('Contact Email', 'orderContactEmail', item, 'email'));
  ok('crew: no input even with editMode true', email.querySelectorAll('input').length === 0);
  ok('crew: still gets the mailto link (read affordance)',
     !!email.querySelector('a[href="mailto:jane@acme.com"]'));
}

// === 5) STATIC: wired in detailPaneHTML directly under orderContact =================
{
  const pane = src.match(/detailField\('Company to Call to Order', 'orderContact'[\s\S]{0,800}?detailField\('Alt Sources'/);
  ok('static: order-contact block harvested', !!pane);
  if (pane) {
    const b = pane[0];
    ok('static: Contact Name wired under orderContact',  /detailField\('Contact Name', 'orderContactName', ov, 'text'\)/.test(b));
    ok('static: Contact Email wired (email kind)',       /detailField\('Contact Email', 'orderContactEmail', ov, 'email'\)/.test(b));
    ok('static: Contact Phone wired (tel kind)',         /detailField\('Contact Phone', 'orderContactPhone', ov, 'tel'\)/.test(b));
    // order: name before email before phone, all between orderContact and Alt Sources.
    ok('static: correct order name->email->phone',
       b.indexOf('orderContactName') < b.indexOf('orderContactEmail')
       && b.indexOf('orderContactEmail') < b.indexOf('orderContactPhone'));
  }
}

// === 6) STATIC: both allowlists include the three new fields ========================
{
  const clientTF = src.match(/var TEXT_FIELDS = \[[\s\S]*?\];/)[0];
  ['orderContactName', 'orderContactEmail', 'orderContactPhone'].forEach(function (f) {
    ok('client TEXT_FIELDS includes ' + f, clientTF.indexOf("'" + f + "'") !== -1);
  });
  const serverTF = apiSrc.match(/const TEXT_FIELDS = \[[\s\S]*?\];/)[0];
  ['orderContactName', 'orderContactEmail', 'orderContactPhone'].forEach(function (f) {
    ok('server TEXT_FIELDS includes ' + f, serverTF.indexOf("'" + f + "'") !== -1);
  });
}

// === 7) STATIC: edit-gating unchanged — the three fields share the (canEdit && editMode) gate
{
  ok('static: detailField still gated (canEdit && editMode)',
     /if \(canEdit && editMode\) \{[\s\S]{0,900}inv-detail-fin/.test(src));
}

console.log('\n' + pass + ' pass / ' + fail + ' fail');
if (fail) process.exit(1);
