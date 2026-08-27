// Client-render test for the 2026-08-27 fixes (CHANGE F + photo-upload discoverability):
//   1) PHOTO UPLOAD DISCOVERABILITY: an office user (canEdit) who EXPANDS an item's
//      detail pane must see the Upload control WITHOUT entering edit mode. The 8/26
//      edit-gating hid it behind editMode, which is why Derek reported "does not work".
//      field_ops (crew) must still see NO upload control (office-only).
//   2) PHONE DISPLAY FORMAT: a 10-digit / leading-1 phone renders as (XXX) XXX-XXXX in
//      the read-only view, the tel: href uses raw digits, and non-standard values are
//      left as-entered.
//
// Strategy: extract the exact helper source (imageSlotHTML gate + fmtUsPhone + telHref)
// from index.html and evaluate it with a minimal E()/window.esc stub, then assert on the
// produced HTML. No browser needed; this pins the rendered markup the fix depends on.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n)); };

function grab(re, label) {
  const m = src.match(re);
  if (!m) { throw new Error('could not extract ' + label + ' from index.html'); }
  return m[0];
}

// Minimal escape stub matching window.esc semantics enough for these assertions.
function E(v) { return String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ---- extract helpers ----
const fmtUsPhoneSrc = grab(/function fmtUsPhone\(v\) \{[\s\S]*?\n  \}/, 'fmtUsPhone');
const telHrefSrc    = grab(/function telHref\(v\) \{[\s\S]*?\n  \}/, 'telHref');
const imageSlotSrc  = grab(/function imageSlotHTML\(item, slot, label\) \{[\s\S]*?\n    return h;\n  \}/, 'imageSlotHTML');
const isHttpSrc     = grab(/function isHttpUrl\(v\) \{[\s\S]*?\n  \}/, 'isHttpUrl');
const isEmailSrc    = grab(/function isEmail\(v\) \{[\s\S]*?\n  \}/, 'isEmail');
const detailFieldSrc= grab(/function detailField\(label, field, item, kind\) \{[\s\S]*?\n    return h;\n  \}/, 'detailField');

// canEdit/editMode/hasImage are closure vars in the real code; provide them per-scenario.
function build(scope) {
  // scope = { canEdit, editMode, hasImage }
  const code = `
    ${fmtUsPhoneSrc}
    ${telHrefSrc}
    ${isHttpSrc}
    ${isEmailSrc}
    var canEdit = ${scope.canEdit};
    var editMode = ${scope.editMode};
    function hasImage(){ return ${scope.hasImage ? 'true' : 'false'}; }
    function imgSrc(id, slot){ return '/api/inventory?img=' + id + '&slot=' + slot; }
    ${imageSlotSrc}
    ${detailFieldSrc}
    return { imageSlotHTML: imageSlotHTML, detailField: detailField, fmtUsPhone: fmtUsPhone, telHref: telHref };
  `;
  return new Function('E', code)(E);
}

// ---- 1) PHOTO UPLOAD DISCOVERABILITY ----
const item = { id: 'drill-1' };

// office, pane open, NOT in edit mode -> Upload control MUST be present (the fix)
let h = build({ canEdit: true, editMode: false, hasImage: false }).imageSlotHTML(item, 'partPhoto', 'Part Photo');
ok('office (no editMode) shows Upload control', /inv-img-file/.test(h) && />Upload</.test(h));
ok('office (no editMode) shows the upload label wrapper', /inv-img-ctrls/.test(h));

// office, pane open, WITH existing image -> Replace + Remove present without editMode
h = build({ canEdit: true, editMode: false, hasImage: true }).imageSlotHTML(item, 'partPhoto', 'Part Photo');
ok('office w/ image shows Replace', />Replace</.test(h));
ok('office w/ image shows Remove', /inv-img-rm/.test(h));

// field_ops (crew) -> NO upload control at all (office-only)
h = build({ canEdit: false, editMode: false, hasImage: false }).imageSlotHTML(item, 'partPhoto', 'Part Photo');
ok('crew sees NO upload control', !/inv-img-file/.test(h) && !/inv-img-ctrls/.test(h));
ok('crew still sees the empty-photo affordance', /No photo yet/.test(h));

// ---- 2) PHONE DISPLAY FORMAT (read-only view => canEdit but not editMode uses the view branch) ----
const view = build({ canEdit: true, editMode: false, hasImage: false });
function telCell(v) { return view.detailField('Contact Phone', 'orderContactPhone', { id: 'x', orderContactPhone: v }, 'tel'); }

let c = telCell('2605551234');
ok('10-digit displays (260) 555-1234', c.indexOf('(260) 555-1234') >= 0);
ok('10-digit href uses raw digits', c.indexOf('href="tel:2605551234"') >= 0);

c = telCell('12605551234');
ok('leading-1 displays (260) 555-1234', c.indexOf('(260) 555-1234') >= 0);
ok('leading-1 href keeps raw digits', c.indexOf('href="tel:12605551234"') >= 0);

c = telCell('260-555-1234');
ok('dashed input displays formatted', c.indexOf('(260) 555-1234') >= 0);

c = telCell('555-1234'); // incomplete -> left as entered
ok('incomplete phone shown as-entered (not mangled)', c.indexOf('555-1234') >= 0 && c.indexOf('(') < 0);

console.log('\n' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
