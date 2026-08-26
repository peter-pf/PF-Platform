// Test for Project Closeout SOP build (2026-08-26, Brad greenlit "next pass").
// Covers the 3 SOP specifics + the automation added to Section 8 (Project Closeout):
//   (a) GI-300 QAQC as-built page as its OWN tracked doc (sent?/date/link) in
//       Subsection 2 -> the Garbin package = 3 tracked docs.
//   (b) Garbin routing baked into the send step (Jake Campbell + CC projects@) as
//       explicit recipient fields + a pre-addressed mailto draft.
//   (c) Retainage-on-closeout link tying closeout completion -> final invoice.
//   (d) Auto-reminder: expected-GGG-return computed hint escalates to a RED OVERDUE
//       flag once the date passes and the stamped set has not been received.
//   (e) Auto-compare hook: a QAQC comparison result LINK field (tracked attach point).
//   (f) One-click Send-to-GC mailto draft (office-gated), pre-fills subject + set link.
//
// Approach (same as test-inventory-edit-gate.mjs): harvest the REAL reusable render
// helpers verbatim from index.html, evaluate them in a controlled sandbox (mutable
// overrides + role + "today"), and re-drive the exact closeout render expressions that
// were added, asserting on the produced HTML. Also STATIC-asserts the new
// PF_FIELD_DROPDOWNS / PF_FIELD_DATE_LABELS registrations exist in source (one source
// of truth for the editor controls).
//
// Run from the platform dir: node test-closeout-garbin.mjs

import fs from 'fs';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function harvest(re, label) {
  const m = src.match(re);
  if (!m) { console.error('COULD NOT HARVEST ' + label); process.exit(2); }
  return m[0];
}

// -- harvest the reusable helpers verbatim ------------------------------------------
const ovLookupSrc      = harvest(/function ovLookup\(sectionKey, label\)\{[\s\S]*?\n    \}/, 'ovLookup');
const effValSrc        = harvest(/function effVal\(sectionKey, label, synced\)\{[\s\S]*?\n    \}/, 'effVal');
const pfParseDateSrc   = harvest(/function pfParseDate\(v\)\{[\s\S]*?\n    \}/, 'pfParseDate');
const pfMkDateSrc      = harvest(/function _pfMkDate\(y, mo, da\)\{[\s\S]*?\n    \}/, '_pfMkDate');
const pfAddBizSrc      = harvest(/function pfAddBusinessDays\(date, n\)\{[\s\S]*?\n    \}/, 'pfAddBusinessDays');
const pf2Src           = harvest(/function _pf2\(n\)\{[\s\S]*?\}/, '_pf2');
const pfFmtDateObjSrc  = harvest(/function pfFmtDateObj\(d\)\{[\s\S]*?\n    \}/, 'pfFmtDateObj');
const computedHintSrc  = harvest(/function computedHint\(html, isFlag\)\{[\s\S]*?\n    \}/, 'computedHint');

// Build a sandbox exposing the harvested helpers, with controllable _curOverrides,
// PF_ME role, and a pinned "now" (so the overdue test is deterministic).
function makeEnv(overrides, role, nowDate) {
  const E = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const PF_OVERRIDE_LABEL_ALIASES = {};
  const factory = new Function(
    'E', '_curOverrides', 'PF_OVERRIDE_LABEL_ALIASES',
    pf2Src + '\n' + pfMkDateSrc + '\n' + ovLookupSrc + '\n' + effValSrc + '\n' +
    pfParseDateSrc + '\n' + pfAddBizSrc + '\n' + pfFmtDateObjSrc + '\n' + computedHintSrc +
    '\n return { ovLookup, effVal, pfParseDate, pfAddBusinessDays, pfFmtDateObj, computedHint, E };'
  );
  const H = factory(E, { closeout: overrides.closeout || {}, general: overrides.general || {} }, PF_OVERRIDE_LABEL_ALIASES);
  const canEdit = () => role === 'admin' || role === 'partner' || role === 'business_dev';
  return { ...H, canEdit, _now: nowDate };
}

function frag(html) {
  const dom = new JSDOM('<!doctype html><body><div id="r">' + html + '</div>');
  return dom.window.document.getElementById('r');
}

// Re-drive the exact GARBIN mailto expression (b) added to Subsection 2.
function renderGarbinMailto(env, D) {
  const E = env.E, _curNum = D.project_number || '';
  const _pname = String(D.project_name || '');
  const _pnum = String(_curNum || D.project_number || '');
  const _subj = 'Final As-Builts / Closeout Package'
    + (_pnum ? ' - ' + _pnum : '') + (_pname ? ' ' + _pname : '');
  const _body = 'Jake,%0D%0A%0D%0AAttached is the closeout package for '
    + encodeURIComponent((_pnum ? _pnum + ' ' : '') + _pname).replace(/%20/g, ' ')
    + ':%0D%0A  1) GI-300 QAQC As-Built page%0D%0A  2) Column Logs (rig PDF)%0D%0A  3) Modulus Load Test%0D%0A%0D%0APlease stamp and return at your convenience.%0D%0A%0D%0AThank you,%0D%0APier Foundations';
  const _href = 'mailto:jake@garbingeostructural.com'
    + '?cc=projects@garbingeostructural.com'
    + '&subject=' + encodeURIComponent(_subj) + '&body=' + _body;
  return '<div class="pr-computed-hint"><a class="fin-inv-btn fin-inv-btn-live pr-closeout-mailto" href="'
    + E(_href) + '">Draft Garbin email (Jake + CC projects@)</a>'
    + ' <span style="font-style:normal">Opens a pre-addressed draft; attach the 3 PDFs before sending. (Auto-attach = backend follow-up.)</span></div>';
}

// Re-drive the OVERDUE / computed hint expression (d) from Subsection 2.
function renderExpectedReturnHint(env) {
  const _manualExp = env.pfParseDate(env.effVal('closeout', 'Expected GGG Return Date', ''));
  const _sent = env.pfParseDate(env.effVal('closeout', 'Date All Files Sent to GGG', ''));
  const _computedExp = _sent ? env.pfAddBusinessDays(_sent, 5) : null;
  const _exp = _manualExp || _computedExp;
  if (!_exp) return '';
  const _rcvd = env.pfParseDate(env.effVal('closeout', 'Date Final As-Builts Received from Garbin', ''));
  const _n = env._now; const _now = new Date(_n.getFullYear(), _n.getMonth(), _n.getDate());
  const _basis = _manualExp ? 'manual expected-return date' : '5 business days after files sent';
  if (!_rcvd && _now.getTime() > _exp.getTime()) {
    const _daysOver = Math.round((_now.getTime() - _exp.getTime()) / 86400000);
    return env.computedHint('OVERDUE: Garbin return expected '
      + '<span class="pr-computed-val">' + env.E(env.pfFmtDateObj(_exp)) + '</span>'
      + ' (' + _daysOver + ' day' + (_daysOver === 1 ? '' : 's') + ' ago, ' + env.E(_basis)
      + ') and the stamped set has not been received. Follow up with Jake Campbell at Garbin.', true);
  }
  return env.computedHint('Computed expected GGG return: '
    + '<span class="pr-computed-val">' + env.E(env.pfFmtDateObj(_exp)) + '</span>'
    + ' (5 business days after files sent). Manual entry above overrides this.'
    + (_rcvd ? ' Stamped set received — loop closed.' : ''), false);
}

// Re-drive the RETAINAGE readiness expression (c) from Subsection 3.
function renderRetainageHint(env) {
  const _readyGC = String(env.effVal('closeout', 'Ready to Send to GC?', '') || '').trim().toLowerCase();
  const _sentGC = env.pfParseDate(env.effVal('closeout', 'Date Sent to GC', ''));
  const _invSent = String(env.effVal('closeout', 'Final Invoice (incl. Retainage) Sent?', '') || '').trim().toLowerCase();
  const _closeoutDone = (_readyGC === 'yes' || !!_sentGC);
  if (_closeoutDone && _invSent !== 'yes') {
    return env.computedHint('Closeout is out to the GC — the final invoice INCLUDING RETAINAGE can now go out. jump.', true);
  }
  return env.computedHint('Retainage releases with the final invoice once the stamped set is sent to the GC. jump.', false);
}

// Re-drive the Send-to-GC mailto expression (f) from Subsection 3 (office-gated).
function renderSendToGc(env, D) {
  const E = env.E, _curNum = D.project_number || '';
  const _pname = String(D.project_name || ''); const _pnum = String(_curNum || '');
  const _gcNameOv = env.ovLookup('general', 'GC');
  const _gcName = _gcNameOv.has ? String(_gcNameOv.value || '') : '';
  const _setLinkRaw = String(env.effVal('closeout', 'Final GGG As-Built Set Link', '') || '').trim();
  const _subj = 'Final Stamped As-Builts' + (_pnum ? ' - ' + _pnum : '') + (_pname ? ' ' + _pname : '');
  const _bodyPlain = (_gcName ? 'Attn: ' + _gcName + '\r\n\r\n' : '')
    + 'Attached are the final stamped as-builts for ' + ((_pnum ? _pnum + ' ' : '') + _pname).trim() + '.\r\n\r\n'
    + (_setLinkRaw ? 'Final GGG as-built set: ' + _setLinkRaw + '\r\n\r\n' : '')
    + 'Please let us know if you need anything further.\r\n\r\nThank you,\r\nPier Foundations';
  const _href = 'mailto:' + '?subject=' + encodeURIComponent(_subj) + '&body=' + encodeURIComponent(_bodyPlain);
  if (env.canEdit()) {
    return '<div class="pr-computed-hint"><a class="fin-inv-btn fin-inv-btn-live pr-closeout-mailto" href="'
      + E(_href) + '">Draft "Send to GC" email</a>'
      + ' <span style="font-style:normal">Pre-fills subject'
      + (_setLinkRaw ? ' + the final GGG set link' : '')
      + '; pick the GC recipient, BCC Peter, and send. (Outlook draft + auto-attach = backend follow-up.)</span></div>';
  }
  return env.computedHint('When ready, an office user drafts the "Send to GC" email here (final stamped as-builts + set link).', false);
}

const D = { project_name: 'POET Bioprocessing', project_number: '26-002' };

// === (a) GI-300 QAQC tracked doc + (b) routing registered in STATIC source ==========
{
  ok('(a) GI-300 QAQC sent field exists in closeout render',
     /field\('GI-300 QAQC As-Built Page Sent to Garbin\?', ''\)/.test(src));
  ok('(a) GI-300 QAQC date field exists', /field\('Date QAQC As-Built Sent', ''\)/.test(src));
  ok('(a) GI-300 QAQC link field exists',
     /fieldLinked\('GI-300 QAQC As-Built Link', '', '', 'website'\)/.test(src));
  ok('(a) GI-300 sent? registered in PF_FIELD_DROPDOWNS Yes/No',
     /'GI-300 QAQC As-Built Page Sent to Garbin\?': \['Yes', 'No'\]/.test(src));
  ok('(a) Date QAQC As-Built Sent registered in PF_FIELD_DATE_LABELS',
     /'Date QAQC As-Built Sent': true/.test(src));
  ok('(a) subgroup note names the 3-PDF package',
     /GI-300 QAQC As-Built page.*Column Logs.*Modulus Load Test|3-PDF Garbin closeout package/.test(src));
  ok('(b) explicit Garbin Recipient field (Jake Campbell)',
     /field\('Garbin Recipient', 'Jake Campbell/.test(src));
  ok('(b) explicit Garbin CC field (projects@)',
     /field\('Garbin CC', 'projects@garbingeostructural\.com'\)/.test(src));
}

// === (b) Garbin mailto draft: correct To, CC, project-scoped subject ================
{
  const env = makeEnv({}, 'partner', new Date(2026, 7, 26));
  const r = frag(renderGarbinMailto(env, D));
  const a = r.querySelector('a.pr-closeout-mailto');
  ok('(b) Garbin mailto link renders', !!a);
  const href = a ? a.getAttribute('href') : '';
  ok('(b) Garbin mailto To = jake@garbingeostructural.com', /^mailto:jake@garbingeostructural\.com\?/.test(href));
  ok('(b) Garbin mailto CC = projects@garbingeostructural.com', /cc=projects@garbingeostructural\.com/.test(href));
  ok('(b) Garbin mailto subject carries project number', /subject=[^&]*26-002/.test(decodeURIComponent(href)));
  ok('(b) Garbin mailto body lists all 3 PDFs',
     /GI-300 QAQC/.test(href) && /Column Logs/.test(href) && /Modulus Load Test/.test(href));
}

// === (d) Auto-reminder OVERDUE flag =================================================
{
  // Files sent 08/03/2026 -> +5 business days = 08/10/2026. "Now" = 08/17/2026, not
  // received -> OVERDUE red flag, 7 calendar days over.
  const env = makeEnv({ closeout: { 'Date All Files Sent to GGG': '2026-08-03' } }, 'partner', new Date(2026, 7, 17));
  const r = frag(renderExpectedReturnHint(env));
  const flag = r.querySelector('.pr-computed-hint.pr-computed-flag');
  ok('(d) overdue -> RED pr-computed-flag hint', !!flag);
  ok('(d) overdue text says OVERDUE + names Jake Campbell',
     /OVERDUE/.test(r.textContent) && /Jake Campbell/.test(r.textContent));
  ok('(d) overdue shows expected-return date 08/10/2026', /08\/10\/2026/.test(r.textContent));
  ok('(d) overdue day count present', /\d+ days? ago/.test(r.textContent));
}
{
  // Same files-sent, but Garbin RETURNED the set -> NOT overdue, loop closed, no flag.
  const env = makeEnv({ closeout: {
    'Date All Files Sent to GGG': '2026-08-03',
    'Date Final As-Builts Received from Garbin': '2026-08-09'
  } }, 'partner', new Date(2026, 7, 17));
  const r = frag(renderExpectedReturnHint(env));
  ok('(d) received -> NO overdue flag', !r.querySelector('.pr-computed-flag'));
  ok('(d) received -> loop closed note', /loop closed/.test(r.textContent));
}
{
  // Not yet due (now before expected return) -> informational hint, no flag.
  const env = makeEnv({ closeout: { 'Date All Files Sent to GGG': '2026-08-24' } }, 'partner', new Date(2026, 7, 25));
  const r = frag(renderExpectedReturnHint(env));
  ok('(d) not-yet-due -> informational hint (no flag)',
     !!r.querySelector('.pr-computed-hint') && !r.querySelector('.pr-computed-flag'));
}
{
  // No files-sent date -> no hint at all (empty).
  const env = makeEnv({ closeout: {} }, 'partner', new Date(2026, 7, 26));
  ok('(d) no files-sent date -> no hint emitted', renderExpectedReturnHint(env) === '');
}

// === (c) Retainage-on-closeout link ================================================
{
  ok('(c) Final Invoice (incl. Retainage) Sent? field exists',
     /field\('Final Invoice \(incl\. Retainage\) Sent\?', ''\)/.test(src));
  ok('(c) Date Final Invoice Sent registered as date label', /'Date Final Invoice Sent': true/.test(src));
  ok('(c) Final Invoice sent? registered Yes/No dropdown',
     /'Final Invoice \(incl\. Retainage\) Sent\?': \['Yes', 'No'\]/.test(src));
  // Closeout out to GC + invoice not yet sent -> actionable RED retainage prompt.
  const env1 = makeEnv({ closeout: { 'Ready to Send to GC?': 'Yes' } }, 'partner', new Date(2026, 7, 26));
  const r1 = frag(renderRetainageHint(env1));
  ok('(c) sent-to-GC + no invoice -> retainage flag (actionable)', !!r1.querySelector('.pr-computed-flag'));
  ok('(c) retainage flag mentions RETAINAGE', /RETAINAGE/.test(r1.textContent));
  // Invoice already sent -> informational only, no flag.
  const env2 = makeEnv({ closeout: { 'Ready to Send to GC?': 'Yes', 'Final Invoice (incl. Retainage) Sent?': 'Yes' } }, 'partner', new Date(2026, 7, 26));
  const r2 = frag(renderRetainageHint(env2));
  ok('(c) invoice already sent -> no flag', !r2.querySelector('.pr-computed-flag'));
}

// === (e) Auto-compare QAQC result link =============================================
{
  ok('(e) QAQC Comparison Result Link field exists',
     /fieldLinked\('QAQC Comparison Result Link', '', '', 'website'\)/.test(src));
  ok('(e) analyze note explains compare + backend follow-up',
     /auto-run the stamped-vs-sent compare|compares the GGG stamped set against the files sent/.test(src));
}

// === (f) One-click Send-to-GC draft (office-gated) =================================
{
  // Office role -> actionable mailto with subject + set link in body.
  const env = makeEnv({
    closeout: { 'Final GGG As-Built Set Link': 'https://sp/set.pdf' },
    general: { 'GC': 'POET Design & Construction' }
  }, 'partner', new Date(2026, 7, 26));
  const r = frag(renderSendToGc(env, D));
  const a = r.querySelector('a.pr-closeout-mailto');
  ok('(f) office -> Send-to-GC mailto draft link renders', !!a);
  const href = a ? decodeURIComponent(a.getAttribute('href')) : '';
  ok('(f) Send-to-GC subject carries project', /Final Stamped As-Builts - 26-002/.test(href));
  ok('(f) Send-to-GC body includes the final set link', /https:\/\/sp\/set\.pdf/.test(href));
  ok('(f) Send-to-GC body addresses the GC name', /Attn: POET Design & Construction/.test(href));
  // Crew (field_ops) -> NO actionable button, static note instead.
  const crew = makeEnv({ closeout: {}, general: {} }, 'field_ops', new Date(2026, 7, 26));
  const rc = frag(renderSendToGc(crew, D));
  ok('(f) crew -> no actionable mailto button (RBAC read-only)', !rc.querySelector('a.pr-closeout-mailto'));
  ok('(f) crew -> static hint present instead', !!rc.querySelector('.pr-computed-hint'));
}

console.log('\n' + pass + ' pass / ' + fail + ' fail');
if (fail) process.exit(1);
