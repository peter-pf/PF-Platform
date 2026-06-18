# PF Platform Portal-Rebuild — Software Requirements Specification (SRS)

**Module group:** Portal Rebuild (2026-06-17/18 session) — `platform/index.html`, `platform/functions/api/doc.js`, `platform/sync/*.py`, `platform/data/*.js`
**Version:** 1.0
**Date:** 2026-06-18
**Owner:** Peter (AI COO)
**Status:** Built in working tree — NOT yet deployed/committed (Peter to review, deploy, commit). Verification = local checks only (node --check on extracted inline scripts, orphan scans, data validations); 401 gate inherited from existing `_middleware.js`; `/api/doc` proven at the Graph layer, NOT yet exercised under a logged-in browser session.

> Scope of this SRS: only the modules built/changed in the 2026-06-17/18 portal-rebuild session. The design intent for each lives in the sibling docs (VISION-AND-ROADMAP, PROJECT-RECORD-SCHEMA, DATA-SOURCES, ARCHITECTURE-EDITABILITY, PF-DASHBOARD-SPEC, WORKFLOW-SOP). The shipped auto %-complete engine is documented separately in `docs/auto-progress/`. House style follows `docs/auto-progress/SRS.md`.
> Honesty notes carried through (do not overstate): Madison baseline provisional; POET %-baseline pending; Schaaf (26-015) and Park & Poplar (26-013) contracts are DRAFTs (not executed); the per-project `analysis` + `execution_status` blocks are hand-added to the generated `project-records.js` and a future full regen of `build-project-records.py` would DROP them unless baked into the generator (TODO); `/api/doc` verified at Graph layer only.

---

## 1. Nav IA — 8-header collapsible information architecture

### Purpose
Replace the flat nav with Brad's reconciled 8 top-level collapsible headers + nested subcategories so the portal mirrors how PF actually works (win the work → do the work → field → schedule → financials).

### Requirements
- FR1.1 — Eight collapsible top-level sections: PF Admin, Dashboard, Business Development, Preconstruction, Project Management, Field Operations, Projects Schedule, Company Financials (plus PF Dashboard placeholder). Each header toggles `collapsed` on click.
- FR1.2 — Renames: **Active Projects → Active Projects Summary**; **Project History → Projects Completed**; **Subcontractors → Vendors** (nav label + module title; internal module id `subs` unchanged).
- FR1.3 — Removed standalone sections: **Permits**, **Change Orders**, **Closeout** (Change Orders/Closeout removed under Project Management per Brad; Permits removed).
- FR1.4 — Preconstruction nests two disciplines (Aggregate Piers, Helical Pilings), each with six stage views (Actively Bidding, Budget Pricing, Feasibility Review, Submitted Bids, Awarded, Not Awarded), plus an Estimating & Tools subcategory retaining existing tools (Feasibility, Bid Pipeline, Estimating, Material Costs, Stone & Transport Pricing, Proposals).
- FR1.5 — All existing modules remain reachable (no orphaned panels).

### Implementation
- `platform/index.html` — nav markup (`nav-section` / `nav-section-label` / `nav-sub` / `nav-sub-label` / `nav-item[data-module]`), `showModule()` router, `module-view` panels.

### Acceptance / Verification
- AC1.1 — Every `data-module` resolves to a `mod-*` panel (orphan scan = 0). **PASS** (orphan check run).
- AC1.2 — Renamed labels present; Permits/Change Orders/Closeout panels removed from nav. **PASS** (grep of nav block).
- AC1.3 — Preconstruction stage views present for both AP and HP (12 stage modules). **PASS**.

### Known limitations / follow-ups
- L1.1 — PF Admin subcategories and PF Dashboard panel are Brad to-do / placeholder (PF Dashboard spec captured in PF-DASHBOARD-SPEC.md, not yet built).
- L1.2 — "Safety" appears under both Project Management and Field Operations pointing at the same `safety` module (intentional dual-entry; single source).

---

## 2. Preconstruction pipeline (Bid-Log driven)

### Purpose
Populate the Preconstruction stage views from the Project Bid Log, bucketed by the Bid Log's column-A section, with the full bid-log column set visible.

### Requirements
- FR2.1 — Each stage view (AP + HP) lists the bids whose Bid Log section (column A) matches that stage. Source: `Project Bid Log.xlsx` (Agg Pier Bid Log / Helical Pier Bid Log).
- FR2.2 — Show the FULL bid-log column set: **AP = 34 columns, HP = 33 columns** (per DATA-SOURCES field map). Wide horizontally-scrollable table.
- FR2.3 — Bucketing is by the column-A section header, not a re-derived status, so the portal agrees with the sheet's own grouping.

### Implementation
- `platform/sync/build-precon-pipeline.py` → `platform/data/precon-pipeline.js` (`window.PF_PRECON_PIPELINE`).
- `platform/index.html` — stage panels render the keyed pipeline rows in a scrollable table.

### Acceptance / Verification
- AC2.1 — `node --check` on extracted inline render script. **PASS**.
- AC2.2 — Pipeline rows bucket to the correct stage panels by column-A section. **PASS** (spot-checked against sheet).
- AC2.3 — Full column counts rendered (AP 34 / HP 33). **PASS** (column headers present).

### Known limitations / follow-ups
- L2.1 — "Feasibility Review" is a stage label in the nav; whether the Bid Log uses an exact-matching section header for it depends on the live sheet — rows only appear where the sheet's column-A section matches.

---

## 3. Project records — generalized to all awarded projects

### Purpose
Generalize the single POET project record into a keyed data file covering all awarded projects, rendered by one project-aware renderer.

### Requirements
- FR3.1 — One generated, number-keyed data file holds every awarded project record (15+ records; awarded set ~16).
- FR3.2 — A single renderer `renderProjectRecord(num, root)` resolves a record by number — `PF_PROJECT_RECORDS.records[num]` first, falling back to the standalone POET record (`PF_PROJECT_POET`) — and renders the same 11-section schema for any project.
- FR3.3 — Record schema follows PROJECT-RECORD-SCHEMA.md (General Info, PF Team, Contract Info, Engineering & Design, Project Safety, Site Readiness, Equipment, Material, QA/QC, Financials, Project Closeout).
- FR3.4 — Field source precedence honored (Bid Log → LOI → Subcontract); never fabricate — blank where no source has it.

### Implementation
- `platform/sync/build-project-records.py` → `platform/data/project-records.js` (`window.PF_PROJECT_RECORDS`, keyed by number).
- `platform/data/project-record-poet.js` (`window.PF_PROJECT_POET`) — POET kept as a standalone deep record / fallback.
- `platform/index.html` — `renderProjectRecord()` + project-aware opener (lines ~10460-10485).

### Acceptance / Verification
- AC3.1 — `node --check` on the data files and inline renderer. **PASS**.
- AC3.2 — Renderer resolves bulk record by number, POET falls back. **PASS** (code path verified).
- AC3.3 — No fabricated values; missing fields render blank. **PASS** (renderer escapes/blank-guards).

### Known limitations / follow-ups
- L3.1 — Most records are populated from Bid Log only; Contract Info / Engineering / Site Readiness fields are sparse until each project's documents are extracted (document-sourced population is the open intake workflow — needs Brad's folder walkthrough).
- L3.2 — Only POET, Schaaf, and Park & Poplar have deep per-project document extraction so far (see §4).

---

## 4. Per-project deep records — POET, Schaaf (26-015), Park & Poplar (26-013)

### Purpose
Deepen three records to "POET level": subcontract-derived fields extracted verbatim from the source contract, plus a live inline contract embed.

### Requirements
- FR4.1 — POET (26-002): General/Contract Info filled from the **fully-executed** subcontract (19 fields, verbatim-sourced).
- FR4.2 — Schaaf CPA (26-015) and Park & Poplar (26-013): subcontract fields extracted verbatim from each project's contract; live contract embed wired.
- FR4.3 — Every extracted field traceable to the source document; no paraphrase that changes meaning.

### Implementation
- `platform/sync/build-project-record.py` — deep single-project extractor (POET-class).
- `platform/data/project-record-poet.js`, plus Schaaf + P&P entries in `platform/data/project-records.js`.
- Live contract embed via `/api/doc` (see §6).

### Acceptance / Verification
- AC4.1 — POET 19 fields match the executed subcontract. **PASS** (verbatim check).
- AC4.2 — Schaaf + P&P fields extracted and embed wired. **PASS** (records present, embed item ids set).
- AC4.3 — XSS: all rendered field values escaped via `E()`/`esc`. **PASS** (escaping review).

### Known limitations / follow-ups
- L4.1 — **Schaaf (26-015) and Park & Poplar (26-013) contracts are DRAFTs, not executed.** Their extracted terms reflect the draft; re-extract on execution. The execution-status badge reflects this (amber/draft).
- L4.2 — POET is fully executed; the other deep records are not.

---

## 5. Per-project Subcontract Analysis section + execution-status badge

### Purpose
Move the subcontract analysis INTO each project record (per-job) and surface a prominent execution-status badge; migrate the existing standalone-tab reviews.

### Requirements
- FR5.1 — Each project record renders a Subcontract Analysis block from `record.analysis`: verdict (GREEN/YELLOW/RED), counterparty, amount, review date, summary, key terms, insurance summary, scope summary, and the flagged-risks list (RED risks counted).
- FR5.2 — A prominent **execution-status badge** at the top of the analysis card from `record.execution_status`: green = fully executed, amber = draft/unsigned/pending, grey = unknown.
- FR5.3 — Migrate the reviewed Shiel / Park & Poplar / Schaaf data from the standalone `subcontracts.html` tab into the per-job records.
- FR5.4 — The standalone Subcontracts tab is RETAINED for now (pending retirement) so no review data is lost before migration is confirmed.
- FR5.5 — The field-facing record view must NOT read `record.analysis` (financials stripped — see §9).

### Implementation
- `platform/index.html` — analysis renderer + execution-status banner (lines ~10248-10300); badge CSS classes `pr-exec green|amber|grey`.
- `platform/data/project-records.js` — `analysis` + `execution_status` objects per migrated project.

### Acceptance / Verification
- AC5.1 — Analysis block renders verdict + risks; RED count computed. **PASS**.
- AC5.2 — Execution badge maps status string → green/amber/grey correctly. **PASS** (regex map verified).
- AC5.3 — Field view does not render the analysis block. **PASS** (separate field renderer, confirmed in code comment + path).
- AC5.4 — Migrated reviews (Shiel/P&P/Schaaf) present in records. **PASS**.

### Known limitations / follow-ups
- L5.1 — **CAVEAT (TODO): the `analysis` + `execution_status` objects are HAND-ADDED to the generated `project-records.js`.** `build-project-records.py` does NOT emit them (verified: 0 occurrences in the generator). A future full regen of that file would DROP these blocks unless the analysis/execution_status generation is baked into the generator. Until then, do not blindly overwrite `project-records.js` from the script.
- L5.2 — `execution_status` is set manually for now ("auto-determined from contract signature/DocuSign during extraction" is the intended future behavior, not yet automated).
- L5.3 — Standalone `subcontracts.html` tab is not yet retired; retire only after all migrated jobs are confirmed in their per-job records.

---

## 6. `/api/doc` live-embed proxy

### Purpose
Embed a single live SharePoint file inline in the portal (e.g. a project's contract) instead of linking out, while keeping the file behind the auth gate.

### Requirements
- FR6.1 — `GET /api/doc?item=<drive-item-id>` streams the bytes of one SharePoint drive item inline (Content-Disposition: inline) with the upstream content type, for iframe/PDF rendering.
- FR6.2 — Always the LIVE file (Graph `/items/{id}/content`), never a stale uploaded copy.

### Security model (Non-functional / Security)
- SEC6.1 — **Auth-gated:** lives under `/api/`, inherits the server-side gate in `functions/_middleware.js`; unauthenticated requests get 401 BEFORE reaching the handler. The proxy does not weaken or bypass the gate.
- SEC6.2 — **Drive-restricted, not an open proxy:** the SharePoint drive is FIXED to `env.SP_DRIVE_ID` server-side; the client never supplies a drive/site/host — only an `item` id, only on OUR drive.
- SEC6.3 — **Item-id validated:** `item` must match `^[A-Z0-9]{20,80}$` (drive-item id format) → else 400 before any Graph call. Optional `PF_DOC_ALLOWED_ITEMS` allow-list further restricts ids.
- SEC6.4 — **Content only:** only `/items/{id}/content` is fetched; no children/listing endpoint, so the drive cannot be enumerated or browsed.
- SEC6.5 — **Server-side creds:** Graph app-only creds (`AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID`) live ONLY in Cloudflare Pages env vars; never sent to the browser. In-isolate token cache, refreshed ~60s before expiry.
- SEC6.6 — **Fails closed:** any missing Graph env var or `SP_DRIVE_ID` → 503 (never silently proxy on misconfiguration). Responses are `private, no-store` + `X-Content-Type-Options: nosniff`.

### Implementation
- `platform/functions/api/doc.js` (onRequestGet, client-credentials flow mirroring `tools/pf_email.py`).
- `platform/index.html` — inline embed helper (`/api/doc?item=...`) in the project record (lines ~10097-10105).

### Acceptance / Verification
- AC6.1 — `node --check` on `functions/api/doc.js`. **PASS**.
- AC6.2 — Invalid/missing item id → 400; missing creds → 503 (fail closed). **PASS** (code-path review).
- AC6.3 — Graph fetch of the POET contract returns the file bytes. **PASS at the Graph layer.**

### Known limitations / follow-ups
- L6.1 — **NOT yet tested under a logged-in browser session** (end-to-end iframe render behind the live `_middleware.js` gate). Proven only at the Graph layer. Verify in-browser after deploy.
- L6.2 — Per-project full document-tree browser (mirror SharePoint subfolders, embed every file) is designed (ARCHITECTURE-EDITABILITY.md) but only the single-contract embed is wired so far.

---

## 7. Budget vs Actual job-cost tracker (POET)

### Purpose
A per-project Budget vs Actual job-cost tracker (POET first), under Project Management → Financials, parsing the Turnover/Budget workbook's formula graph and linking actual-cost lines to invoice documents.

### Requirements
- FR7.1 — Show budget vs actual by line, with same-sheet roll-up rows detected from cell formulas (a row that sums other C-rows is a roll-up, not a detail line).
- FR7.2 — Clickable invoices: actual-cost lines link to the matched supporting document when a reasonable match exists (vendor name / amount); otherwise link to the relevant invoice/vendor folder.
- FR7.3 — Two workbook loads (data_only for values + formulas for structure) to build the budget graph.

### Implementation
- `platform/sync/build-budget-actual.py` → `platform/data/budget-actual-poet.js`.
- `platform/index.html` — `budget-actual-poet` module under PM → Financials.

### Acceptance / Verification
- AC7.1 — `node --check` on `budget-actual-poet.js`. **PASS**.
- AC7.2 — Roll-up vs detail rows correctly classified from formulas (e.g. 5710 Reprographics $271.46 → matched FedEx Office PDF). **PASS** (formula-graph parse verified).
- AC7.3 — Values escaped/numeric-coerced (XSS). **PASS**.

### Known limitations / follow-ups
- L7.1 — **POET %-baseline pending:** the completion %-baseline for POET is not yet confirmed (needs Jonathan's approved design totals + sub-project split) — affects the progress side, not the cost lines.
- L7.2 — Budget vs Actual built for POET only so far; generalize per project.
- L7.3 — Invoice links are best-effort matched; unmatched lines fall back to a folder link.

---

## 8. TimeSheets (weekly + annual summary)

### Purpose
A Field-Operations TimeSheets module: weekly hours by cost code and job, plus an annual per-employee summary.

### Requirements
- FR8.1 — Weekly view: parse the PF weekly timesheet workbook; per week show hours by Cost Code and by Job #, plus regular/OT/total and per-diem nights (from the Totals row).
- FR8.2 — Annual Summary view: per employee — regular / OT / total hours + per-diem nights, rolled up across weeks.
- FR8.3 — Read-only (no write-back this phase).

### Implementation
- `platform/sync/build-timesheets.py` → `platform/data/timesheets.js`.
- `platform/index.html` — `fo-timesheets` (Weekly) + `ts-summary` (Summary) under Field Operations → TimeSheets.

### Acceptance / Verification
- AC8.1 — `node --check` on `timesheets.js`. **PASS**.
- AC8.2 — Weekly parse yields hours by cost code + job + per-diem nights; `--dump` prints the latest week with hours. **PASS**.
- AC8.3 — Annual summary aggregates per employee. **PASS**.

### Known limitations / follow-ups
- L8.1 — Read-only; entering/editing timesheets in the portal is a later (write-back) phase.

---

## 9. Field-facing Projects view (financials stripped)

### Purpose
A read-only, financials-free project view for field crews (the "Field Operations Viewer" filtered view of the same project data).

### Requirements
- FR9.1 — `fo-projects` renders the project record WITHOUT any financial content — never reads `record.analysis`, subcontract value, pricing, or job-cost.
- FR9.2 — Any price-like text in carried-over notes is scrubbed via `scrubMoney()` (e.g. "$22.50/TN", "$343,037.07", "$15-20/LF" → "[price omitted]").
- FR9.3 — Uses a separate renderer from the full PM project record (no shared code path that could leak financials).

### Implementation
- `platform/index.html` — `mod-fo-projects` panel, field-only renderer, `scrubMoney()` (lines ~10883-10905, ~11161, ~11215-11232).

### Acceptance / Verification
- AC9.1 — Field renderer never references `D.analysis` / financial fields. **PASS** (code comment + grep of the field renderer path).
- AC9.2 — `scrubMoney()` redacts $ amounts incl. per-unit and ranges. **PASS** (regex verified against sample strings).
- AC9.3 — `node --check` on the inline field renderer. **PASS**.

### Known limitations / follow-ups
- L9.1 — `scrubMoney()` is a defensive text filter on notes; the primary guarantee is that the field renderer doesn't render financial fields at all. Keep both.

---

## 10. Awarded Projects index (data-driven from Bid Log)

### Purpose
A data-driven index of awarded projects, sourced from the Bid Log award status, that links into each project record.

### Requirements
- FR10.1 — List all Bid Log rows with status = Awarded; link each to its project record (`renderProjectRecord(num)`).
- FR10.2 — Generated from the Bid Log, not hand-maintained.

### Implementation
- `platform/sync/build-awarded-index.py` → `platform/data/awarded-projects.js`.
- `platform/index.html` — `awarded-projects` module under PM → Projects.

### Acceptance / Verification
- AC10.1 — `node --check` on `awarded-projects.js`. **PASS**.
- AC10.2 — Awarded rows from Bid Log present and link to records. **PASS**.

### Known limitations / follow-ups
- L10.1 — Links resolve to a record only where that project exists in `project-records.js` (all awarded projects are generated, so coverage is the awarded set).

---

## 11. Insurance / PF COI section

### Purpose
A PF Certificate of Insurance section showing PF's standard coverages (from MJ Insurance), as the baseline to compare GC subcontract insurance requirements against.

### Requirements
- FR11.1 — Show PF's standard COI coverages (CGL, Auto, Umbrella/Excess, Professional Liability, Workers Comp) per the MJ-issued PF COI.
- FR11.2 — Serve as the baseline for the per-job insurance gap check (compare a project's required limits vs PF's actual COI).

### Implementation
- `platform/sync/build-pf-coi.py` → `platform/data/pf-coi.js`.
- `platform/data/insurance-baseline.js` — proposed/baseline limits.
- `platform/index.html` — `pf-coi` module under PM → Insurance.

### Acceptance / Verification
- AC11.1 — `node --check` on `pf-coi.js`. **PASS**.
- AC11.2 — Standard coverages render from the COI source. **PASS**.

### Known limitations / follow-ups
- L11.1 — The per-job COI gap report (project required limits vs PF COI) is designed (PROJECT-RECORD-SCHEMA insurance workflow) but not yet automated per project; the section currently presents PF's standard COI as the baseline.

---

## Cross-cutting non-functional requirements
- NFR1 — **XSS:** all rendered values escaped (`E()` / `window.esc` / numeric coercion) across new renderers.
- NFR2 — **No secrets in repo:** sync scripts read Graph/M365 creds from `~/.env`; `/api/doc` reads creds from Cloudflare env vars only.
- NFR3 — **No orphan panels:** every `data-module` maps to a `mod-*` panel (orphan scan = 0).
- NFR4 — **No fabrication:** fields left blank where no source provides them; every deep-record field traceable to its source document.
- NFR5 — **HTML validity:** inline `<script>` blocks pass `node --check` after extraction; `manual.html` + `training.html` remain valid HTML.

## Verification evidence (2026-06-18, local working tree)
- `node --check` on extracted inline scripts of `index.html`, `manual.html`, `training.html`, and the generated `data/*.js` modules — PASS.
- Orphan scan (`data-module` vs `mod-*`) — 0 orphans.
- Escaping/XSS review of new renderers — values escaped/coerced.
- 401 gate — inherited from `functions/_middleware.js` (not re-implemented).
- Data validations: Madison ~80% reproduced by the auto-progress engine (provisional baseline); POET 19 contract fields verbatim; budget formula-graph roll-up detection (5710 example).
- Generator-vs-handwritten check: `build-project-records.py` emits 0 `analysis`/`execution_status` keys → confirms §5 regen caveat.

## Open items / next phases (not in this build)
- Bake `analysis` + `execution_status` generation into `build-project-records.py` so a regen preserves them.
- Browser-session test of `/api/doc` behind the live gate.
- Document-sourced population: generalize the deep extractor to `--project NN-NNN` across each project's document set (needs Brad's folder walkthrough).
- Retire `subcontracts.html` once all migrated reviews live in their per-job records.
- Confirm Madison + POET baselines (Jonathan) to flip provisional → confirmed.
- PF Dashboard build (PF-DASHBOARD-SPEC.md); Projects Schedule two-way sync; Company Financials on top of QuickBooks; portal→Excel write-back (ARCHITECTURE-EDITABILITY.md Phase 2).
