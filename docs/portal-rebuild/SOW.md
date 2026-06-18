# PF Platform Portal-Rebuild — Statement of Work (SOW)

**Module group:** Portal Rebuild (2026-06-17/18 session)
**Version:** 1.0
**Date:** 2026-06-18
**Owner:** Peter (AI COO)
**Status:** COMPLETE in working tree — NOT deployed, NOT committed. Peter to review, deploy, and commit. Verification = local checks (node --check / orphan scan / escaping / data validation); deploy + 401 gate confirmation + browser-session `/api/doc` test are PENDING.

> Pairs with `docs/portal-rebuild/SRS.md`. Design intent in the sibling portal-rebuild docs. House style follows `docs/auto-progress/SOW.md`.

---

## Scope delivered (file-path first)

1. **Nav IA — 8-header collapsible** — `platform/index.html`
   - 8 collapsible top-level sections + nested subcategories; renames (Active Projects → Active Projects Summary; Project History → Projects Completed; Subcontractors → Vendors); removed Permits / Change Orders / Closeout standalone sections; Preconstruction nests AP + HP with six stage views each plus Estimating & Tools.

2. **Preconstruction pipeline** — `platform/sync/build-precon-pipeline.py` → `platform/data/precon-pipeline.js`; rendered in `platform/index.html`
   - Populated from the Bid Log, bucketed by column-A section; full bid-log columns (AP 34 / HP 33) in a wide scrollable table.

3. **Project records — generalized** — `platform/sync/build-project-records.py` → `platform/data/project-records.js`; `renderProjectRecord()` in `platform/index.html`; POET standalone in `platform/data/project-record-poet.js`
   - Single number-keyed data file for all awarded projects; one project-aware renderer (bulk record first, POET fallback), 11-section schema.

4. **Per-project deep records (POET / Schaaf 26-015 / Park & Poplar 26-013)** — `platform/sync/build-project-record.py`; entries in `project-record-poet.js` + `project-records.js`
   - Verbatim-sourced subcontract field extraction + live contract embed. POET = 19 fields from the executed subcontract; Schaaf + P&P deepened (their contracts are DRAFTs).

5. **Per-project Subcontract Analysis + execution-status badge** — `platform/index.html` (analysis renderer + `pr-exec` badge); `analysis`/`execution_status` objects in `platform/data/project-records.js`
   - Analysis moved into each project record; verdict + risks + key terms + insurance/scope summaries; prominent execution-status badge (green/amber/grey). Migrated the Shiel / P&P / Schaaf reviews from the standalone tab. Standalone `subcontracts.html` retained pending retirement.

6. **`/api/doc` live-embed proxy** — `platform/functions/api/doc.js`; embed helper in `platform/index.html`
   - Auth-gated, drive-restricted (`SP_DRIVE_ID` server-fixed), item-id validated, content-only, server-side Graph creds, fails closed. Streams a single live SharePoint file inline.

7. **Budget vs Actual job-cost tracker (POET)** — `platform/sync/build-budget-actual.py` → `platform/data/budget-actual-poet.js`; module in `platform/index.html`
   - Budget vs actual by line under PM → Financials; formula-graph parse (roll-up vs detail rows from cell formulas); clickable invoices matched to supporting docs.

8. **TimeSheets (weekly + summary)** — `platform/sync/build-timesheets.py` → `platform/data/timesheets.js`; modules in `platform/index.html`
   - Field Operations → TimeSheets: weekly hours by cost code + job (+ per-diem nights); annual per-employee Summary. Read-only.

9. **Field-facing Projects view** — `platform/index.html` (`mod-fo-projects` field renderer + `scrubMoney()`)
   - Financials-stripped read-only project view; never reads `analysis`/financial fields; `scrubMoney()` redacts price text in notes.

10. **Awarded Projects index** — `platform/sync/build-awarded-index.py` → `platform/data/awarded-projects.js`; module in `platform/index.html`
    - Data-driven from Bid Log award status; links into each project record.

11. **Insurance / PF COI section** — `platform/sync/build-pf-coi.py` → `platform/data/pf-coi.js` (+ `platform/data/insurance-baseline.js`); module in `platform/index.html`
    - PF standard coverages from MJ; baseline for the per-job insurance gap check.

12. **User-facing docs** — `platform/manual.html` + `platform/training.html`
    - New end-user sections for the new nav, Preconstruction pipeline, project records (Contract Info + embedded contract + Subcontract Analysis + execution badge), Budget vs Actual, TimeSheets, field-facing Projects view, Awarded Projects index, Insurance/PF COI.

---

## Work performed
1. **Requirements capture** — Brad's portal-rebuild brain-dump reconciled into the portal-rebuild design docs (VISION-AND-ROADMAP, PROJECT-RECORD-SCHEMA, DATA-SOURCES, ARCHITECTURE-EDITABILITY, PF-DASHBOARD-SPEC, WORKFLOW-SOP).
2. **Build** — 7 new sync builders (`build-precon-pipeline.py`, `build-project-records.py`, `build-project-record.py`, `build-budget-actual.py`, `build-timesheets.py`, `build-awarded-index.py`, `build-pf-coi.py`) generating 9+ `data/*.js` files; `index.html` nav + renderers (~3.9k lines changed); `functions/api/doc.js` proxy.
3. **Migration** — Shiel / Park & Poplar / Schaaf subcontract reviews moved from the standalone tab into per-job records (hand-added `analysis`/`execution_status` to `project-records.js`).
4. **Docs** — this SRS + SOW; updated `manual.html` + `training.html`.

## Verification (local working tree, 2026-06-18)
- `node --check` on extracted inline scripts of `index.html`, `manual.html`, `training.html`, and the generated `data/*.js` — PASS.
- Orphan scan (`data-module` ↔ `mod-*`) — 0 orphans.
- Escaping/XSS review of new renderers — values escaped (`E()`/`esc`) or numeric-coerced.
- Data validations: Madison ~80% via auto-progress (provisional baseline); POET 19 contract fields verbatim; budget formula-graph roll-up detection (5710 Reprographics $271.46 → FedEx Office PDF).
- `/api/doc` — fail-closed (503) + 400 on bad item id verified by code-path review; Graph fetch proven at the Graph layer.
- Generator check: `build-project-records.py` emits 0 `analysis`/`execution_status` keys → confirms the regen caveat.

## Honest caveats carried into the docs (do not overstate)
- Madison baseline is PROVISIONAL (pending Jonathan's approved Garbin per-column design table).
- POET %-baseline is PENDING (needs Jonathan's design totals + sub-project split).
- Schaaf (26-015) and Park & Poplar (26-013) contracts are DRAFTs, not executed.
- The per-project `analysis` + `execution_status` blocks are HAND-ADDED to `project-records.js`; a full regen of `build-project-records.py` would DROP them unless baked into the generator (TODO). Do not blindly re-run that generator over the file.
- `execution_status` is set manually for now (auto-detection from contract signature is the intended future behavior).
- `/api/doc` is proven at the Graph layer only — NOT yet tested under a logged-in browser session behind the live `_middleware.js` gate.
- Budget vs Actual built for POET only; invoice links are best-effort matched (folder-link fallback).
- TimeSheets is read-only.

## Out of scope / next phases
- Bake analysis/execution_status generation into `build-project-records.py`.
- Browser-session test of `/api/doc`; per-project full document-tree browser.
- Document-sourced population extractor generalized to `--project NN-NNN`.
- Retire `subcontracts.html` after migration is confirmed.
- PF Dashboard build; Projects Schedule two-way sync; Company Financials on top of QuickBooks; portal→Excel write-back (Phase 2).
- Deploy to Cloudflare Pages + 401 gate confirmation + git commit (Peter does this after review).
