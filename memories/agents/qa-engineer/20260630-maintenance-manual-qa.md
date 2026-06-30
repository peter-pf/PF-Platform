# QA: maintenance-manual feature (uncommitted) — 2026-06-30

VERDICT: PASS (static + runtime-import). Live KV deploy needed for end-to-end.

## Evidence
- node --check: maintenance-manual.js OK, auth.js OK.
- Unchanged files (0 diff lines): precon-manual-bid.js, doc.js, field-upload.js, maintenance-status.js.
- RBAC: `node migrations/test-rbac.mjs` => 778 passed, 0 failed (matches build claim).
- SEC-15: `node migrations/check-data-classification.mjs` => PASS (6 clean, 0 leaking).
- Runtime auth import: areaForPath('/api/maintenance-manual')='field_ops'; roleCanAccess(null,'field_ops')=false; roleCanAccess('field_ops','field_ops')=true; admin/partner/business_dev also true.
- HTML tag balance: div 337/337, select 5/5, button 27/27, table 9/9 (all 0).
- mod-maintenance <script> (lines 19625-20159) parses clean via vm.Script.
- Add form: index.html 3255-3295 (category select = exactly the 5 fixed cats). Remove control: 19874 (gated on r.manual, escaped via E()).

## GOTCHA (reusable)
Naive `<script>...</script>` regex extraction on index.html FALSE-POSITIVES on an HTML comment (line 1838) whose prose contains the word "script"/"server". Verify the SPECIFIC feature script block by line range instead of trusting the bulk extractor.

## Key-collision proof
Manual ids = 'mm_' + counter (underscore only). Daily-report itemKey = `${reportId}::${djb2(...)}`. No '::' in mm_ ids => no collision. counter monotonic (line 214/227), archived items excluded from GET (filter !it.archived), soft-removed ids never reissued (counter only ever increments).

## Server-set fields
createdBy = session.name||session.uid (line 222), createdAt = new Date().toISOString() (223) — never read from body. Confirmed.

## Out of feature scope
data/*.js + data/*.json show as modified (sync churn) — NOT named feature files; ignore for this QA.

## Needs live KV (PF_SCHEDULE) to verify at runtime
413 body cap, 400 strict-JSON, 413 MAX_MANUAL=500, 400 proto-guard on remove id, 503 when KV unbound, end-to-end add/remove round-trip + overlay join.
