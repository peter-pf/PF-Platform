// Source-assertion harness for the ALWAYS-LIVE Submittal Design frontend (index.html).
// Verifies the DOM/render CONTRACT that the round-trip harness can't (no headless browser):
//   - prereqs render live controls for office + read-only for field_ops (no Edit button)
//   - pfPrqLiveSave posts __submittal_prereqs and refreshes IN PLACE (no renderProjectRecord)
//   - the old Edit/Save/Cancel editor is gone
//   - cycles (A) field-change path saves in place (Start Revision still an explicit action)
// Run from platform/:  node test/harness-submittal-prereqs-source.mjs

import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
// Extract a function body by a start marker up to a rough end (next top-level marker).
function between(startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  if (s < 0) return '';
  const e = html.indexOf(endMarker, s + startMarker.length);
  return e < 0 ? html.slice(s) : html.slice(s, e);
}

console.log('=== Source-assertion harness: Submittal Design ALWAYS-LIVE ===\n');

// ---- (B) prereqs: the read/live block ----
const blk = between('function submittalPrereqsBlock(sdi){', 'function submittalWorkflowBlock');
ok(blk.length > 0, 'found submittalPrereqsBlock');
// Office live controls save-on-change.
ok(/pfPrqLiveSave\(this\)/.test(blk), '(office) in-cell controls wire onchange -> pfPrqLiveSave');
ok(/pf-prq-live-name/.test(blk) && /pf-prq-live-email/.test(blk) && /pf-prq-live-date/.test(blk), '(office) live name/email/date inputs present');
ok(/pf-prq-live-rf-sub/.test(blk) && /pf-prq-live-rf-stk/.test(blk), '(office) live required-for checkboxes present');
ok(/pfPrqOnPartyLive\(this\)/.test(blk), '(office) name typeahead wired to pfPrqOnPartyLive');
// NO Edit button anywhere in the block.
ok(!/pfPrereqEdit/.test(blk) && !/Edit checklist/.test(blk), 'NO "Edit checklist" button in the block');
// field_ops path: read-only cells (disabled rf-box + value spans), gated by `edit`.
ok(/var edit = canEdit\(\);/.test(blk), 'block computes edit = canEdit()');
ok(/pf-prq-rf-box" disabled/.test(blk), 'field_ops read-only path renders disabled checkbox spans');
ok(/if \(edit\)/.test(blk) && /} else {/.test(blk), 'block branches office (live) vs field_ops (read-only)');

// ---- pfPrqLiveSave handler ----
const save = between('window.pfPrqLiveSave = function(el){', 'function pfPrqSeedLivePrev');
ok(save.length > 0, 'found pfPrqLiveSave');
ok(/if \(!canEdit\(\)\) return;/.test(save), 'pfPrqLiveSave office-gated (canEdit)');
ok(/__submittal_prereqs: \{ items: items \}/.test(save), 'pfPrqLiveSave posts __submittal_prereqs.items');
ok(/section: 'engineering'/.test(save), 'pfPrqLiveSave targets engineering section');
ok(/pfPrqRefreshInPlace\(wrap, num\)/.test(save), 'pfPrqLiveSave refreshes IN PLACE');
ok(!/renderProjectRecord/.test(save), 'pfPrqLiveSave does NOT call renderProjectRecord (no page bounce)');
ok(/r\.body\.ok !== true \|\| r\.body\.saved !== true/.test(save), 'pfPrqLiveSave fail-closed check (ok+saved)');
ok(/revert\(\);/.test(save), 'pfPrqLiveSave reverts control on failure');
ok(/Object\.keys\(data\)\.forEach/.test(save), 'pfPrqLiveSave read-merge-writes the stored items map (preserves siblings)');
ok(/pfPrqEmailValid\(email\)/.test(save), 'pfPrqLiveSave validates a changed email before saving');

// ---- read-merge-write preserves ONLY-changed field: harvests all 4 controls of the row ----
ok(/pf-prq-live-name/.test(save) && /pf-prq-live-email/.test(save) && /pf-prq-live-date/.test(save) && /pf-prq-live-rf-sub/.test(save) && /pf-prq-live-rf-stk/.test(save),
   'pfPrqLiveSave harvests the full row (name/email/cid/date/rf) so the row stays consistent');

// ---- in-place refresh helper: no renderProjectRecord ----
const refresh = between('function pfPrqRefreshInPlace(wrap, num){', 'function pfPrqSendReminder(');
ok(refresh.length > 0, 'found pfPrqRefreshInPlace');
ok(!/renderProjectRecord/.test(refresh), 'pfPrqRefreshInPlace never calls renderProjectRecord');
ok(/pf-prq-status/.test(refresh) && /received/.test(refresh), 'pfPrqRefreshInPlace recomputes the status line/count');

// ---- old editor functions REMOVED ----
ok(!/window\.pfPrereqEdit\s*=/.test(html), 'pfPrereqEdit removed');
ok(!/window\.pfPrereqSave\s*=/.test(html), 'pfPrereqSave removed');
ok(!/window\.pfPrereqCancel\s*=/.test(html), 'pfPrereqCancel removed');
ok(!/window\.pfPrqOnPartyInput\s*=/.test(html), 'old pfPrqOnPartyInput removed (replaced by pfPrqOnPartyLive)');

// ---- reminder flow preserved ----
ok(/window\.pfPrereqRemind\s*=/.test(html), 'per-row Send Reminder preserved');
ok(/window\.pfPrereqRemindAll\s*=/.test(html), 'Remind-all preserved');

// ---- (A) cycles: field-change saves in place + Start Revision is an explicit button ----
const swfField = between('window.pfSwfFieldChange = function(el){', 'window.pfSwfResetShopDue');
ok(swfField.length > 0, 'found pfSwfFieldChange');
ok(/pfSwfPersist\(wrap, num, arr, activeRev, null,.*, wrap\);/.test(swfField.replace(/\n/g, ' ')), 'pfSwfFieldChange persists with in-place wrap (no full re-render on a field edit)');
const swfBlock = between('function submittalWorkflowBlock(dsf){', 'function pfSwfCycleReadHtml');
ok(/pf-swf-startrev/.test(swfBlock) && /pfSwfStartRev/.test(swfBlock), 'Start Revision remains an explicit button (create action)');
ok(!/pf-swf-edit"/.test(swfBlock) && !/pfSwfEdit\(/.test(swfBlock), 'cycles per-field Edit button removed (always-live)');
ok(/onchange="event.stopPropagation\(\);window.pfSwfFieldChange/.test(html), 'cycle date/status controls are always-live save-on-change');

// ---- render hook seeds live-prev baselines ----
ok(/pfPrqSeedLivePrev\(root\)/.test(html), 'render hydrate hook seeds pfPrqSeedLivePrev(root)');
ok(/pfPrqSeedLivePrev\(newWrap\)/.test(html), 'post-contacts re-render re-seeds pfPrqSeedLivePrev(newWrap)');

console.log('=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
