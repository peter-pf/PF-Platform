---
🌐: "Web Development"
🎯: "Field-facing Projects view (Field Operations -> Projects) with NO financial data"
⏰: "2026-06-17"
🔍: "Vanilla JS renderer over existing window.PF_AWARDED/PF_PROGRESS/PF_PROJECT_POET; reused .pr-* + .pf-table CSS; client-side list->detail; window.esc escaping"
💡: "Financial leak can come from NON-financial data (vendor contact notes carried '$22.50/TN' price-per-unit). Allow-listing schema fields is not enough — must also scrub free-text (notes) for $ amounts and price-per-unit phrases."
📈: "fo-projects module live in working tree; 25/25 inline scripts node --check pass; orphan check ZERO; financial-leak check NONE; projects (Active Projects Summary) untouched"
rubric_score: 4
---

# Field-Facing Projects View (fo-projects)

## What I Built
- Re-pointed Field Operations -> Projects nav from `projects` (financial Active Projects Summary) to a NEW `fo-projects` module. Left `projects` module + its Project Management nav link untouched.
- Registered `fo-projects` in moduleTitles ("Projects — Field") and added `<div id="mod-fo-projects">` + `#foProjRoot`.
- New renderer script "FIELD-FACING PROJECTS VIEW": list view (PF_AWARDED rows + PF_PROGRESS %) with field columns only (#, Project, City/State, Scope piers/LF, Projected Start, % Complete, open-link) — NO value/$ column. POET (26-002) opens a field detail; others show "details coming".
- Field detail (POET) = 10 NON-financial cards: General Info, PF Team, Contract Info (Operational), Engineering & Design, Project Safety, Site Readiness, Equipment, Material, QA/QC, Project Closeout. Financials section + every $/commercial field omitted by construction.
- View switching via window.foProjOpen/foProjBack (re-renders into same #foProjRoot, no extra modules).

## What I Learned
- The original project-record renderer (initProjectRecord) already had clean field()/card()/contactBlock()/linkRow() helpers — copied them into the fo-projects IIFE rather than sharing globals (each renderer block is its own try/catch IIFE in this file).
- KEY GOTCHA: financial leak via data side-channel. Stone vendor contact `notes` = "...IN #8 Limestone - $22.50/TN". That surfaced both in the Material card contact list AND the "Stone Material Name/Nomenclature" field. Schema-field allow-listing missed it. Fix: scrubMoney() regex replaces $amounts and price-per-unit ("/TN", "per pier", "$15-20/LF") with "[price omitted]"; applied to all contact notes + the stone-nomenclature field.
- Self-check false positives to ignore: CSS "margin-bottom" matches "margin"; "pierfoundations.com" URLs match "/pier". Strip JS comments before grepping the render path (my own comment said "no $/retainage/payment/LD").

## For Next Time
- When building any "restricted-audience" view over shared records, run a headless render (node + DOM stub loading the real data/*.js) and grep the RENDERED DOM, not just source. Source allow-listing won't catch values that ride in on free-text fields (notes, descriptions, addresses).
- Headless test stub pattern: load data files via `new Function('window', src)(global.window)`, stub document.getElementById to a fake root capturing innerHTML, extract the `<script>` block by its HTML comment marker, run with `new Function(code)()`.

## Verification
- node --check: 25/25 inline scripts PASS
- orphan check: ZERO (55 showModule targets all resolve; ${id} false positive excluded)
- financial-leak (rendered DOM, list+detail): required terms (subcontract value, retainage, payment terms, liquidated, pay app, change order) = NONE; $-amounts = NONE; Financials card = absent
- list view: no Value column; columns = #, Project, City/State, Scope, Projected Start, % Complete, (open); 16 rows
- `projects` (Active Projects Summary) module + nav unchanged
- NOT deployed, NOT pushed (working tree only)

File: /home/aiciv/PF-Platform/platform/index.html
