# QA: Field Ops Smart Search Phase 1 (PF Platform)

Date: 2026-06-29 | Verdict: PASS (read-only review, no edits/deploy)

## What was reviewed
Uncommitted change adding a "smart Answers" search to the Field Ops module
(mod-fo-projects in platform/index.html). New field-safe index
data/fo-detail-index.js (window.PF_FO_DETAIL_INDEX), built by
sync/build-fo-detail-index.js. Classified field_ops in functions/lib/auth.js.

## Evidence
- RBAC: `node migrations/test-rbac.mjs` -> 778 passed, 0 failed, exit 0. CONFIRMED.
- SEC-15: `node migrations/check-data-classification.mjs` -> 6 field-safe scanned,
  0 leaking, exit 0. CONFIRMED. Guard strips comments then scans for money keys,
  literal $, and dollar-shaped numbers (\d{4,}\.\d{2}).
- JS validity: node --check passes on both new files. index.html unchanged in
  syntax-error count vs HEAD (43 blocks, 1 pre-existing regex-artifact "error" in
  both original and modified -> NOT introduced by change).
- No $ in data/fo-detail-index.js payload (only in descriptive comments saying
  financials were scrubbed). installed_lf 11260.8 has 1 decimal -> not flagged.

## Behavior traces (extracted logic, ran in node)
- "who is my stone vendor for POET?" -> 1 card: Rush County Stone / Carleigh /
  7656292211 / Mike.Malinoff@jrjnet.com, no $. PASS
- "fuel" -> Jackson Oil / Avin Kazmierzak. PASS
- "26-002" and "POET" -> Answers empty (alias-only), LIST filters to POET. PASS
- "" -> full list, no Answers. PASS
- "stone vendor" (no project) -> stone vendor across field-safe projects. PASS

## Key design notes (reusable)
- foResolveProjects consumes alias tokens into `used` so "for POET" doesn't keyword-
  match the project's own company/website. Smart.
- hasIntent suppresses keyword fallback for focused vendor questions.
- All output escaped via E(). scrubMoney() redacts $ from free-text notes.
- Regression: all 4 index.html hunks inside FO ranges (1932, 15146-15441). No other
  module touched. auth.js diff = single field_ops classification line.

## Gotcha for future QA
Naive <script> regex extraction reports 1 false "syntax error" in block #1 of
index.html (HTML string mis-split). It exists in HEAD too. Use git-diff-of-error-
count, not raw count, to judge regressions in this single-file SPA.
