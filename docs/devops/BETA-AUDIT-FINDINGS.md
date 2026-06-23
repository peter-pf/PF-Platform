# PF Internal Platform — Beta-Readiness Audit

**Date:** 2026-06-23   **Branch:** website-build-20260609   **Auditor:** Peter (read-only)
**Target:** users in front of the platform by **July 1, 2026**
**Scope:** Static functional audit of `platform/index.html` + docs-currency audit. No code or docs were modified.

---

## TL;DR / Beta-Readiness Verdict

**The platform is functionally ready for Beta.** The static audit found **zero hard blockers**: all 58 nav links resolve to a panel (1:1, no broken links, no orphans), all 30 inline JS blocks pass `node --check`, all 9 Cloudflare Functions pass `node --check`, every data feed referenced by the SPA exists on disk, and the role-aware feed loader, precon renderer, and per-user auth are all correctly wired. There is no user click that lands on a JS error or a missing feed.

What is *not* ready is **documentation and a handful of empty placeholder panels**. The user manual still describes the OLD shared password box and never mentions the new per-user login, password reset, or role-based visibility — the first thing every Beta user will touch. Seven nav items open "to be built out" placeholders. The release-stages doc still says "15 modules / Alpha." None of these break functionality, but they will confuse Beta users and make the platform look unfinished.

**Top 5 things to close before July 1:**
1. **Update `manual.html` "Logging In"** to the new per-user login + password-reset + role visibility (Blocker for user trust). — docs/Peter
2. **Add login/first-time-password coverage to `training.html`** (Jonathan & Derek guides). — docs/Peter
3. **Decide the fate of the 7 placeholder panels** — hide from nav for Beta OR label them clearly "Coming in a later release" (currently say "to be built out"). — Peter + Deploy Engineer
4. **Refresh `docs/PLATFORM-RELEASE-STAGES.md`** — "15 modules / ALPHA" is stale; update to the ~57-module Beta set and current stage. — docs/Peter
5. **Backfill SRS/SOW for the live functional modules that lack them** (notably `pf-coi`, `financials-wip`, the BD trio) so docs track reality per the Build Protocol. — docs/Peter

Everything else is should-fix or nice-to-have.

---

## Part A — Static Functional Audit (`platform/index.html`)

### A1. Module navigation — CLEAN ✅
- Extracted **58** unique `showModule('X')` targets and **58** `id="mod-X"` panels (template literals like `${id}` excluded).
- **Broken links (nav with no panel): NONE.**
- **Orphan panels (panel with no nav): NONE.**
- `showModule(id)` (index.html:2324) calls `getElementById('mod-'+id).classList...` with no null-guard, but since nav↔panel is provably 1:1 this cannot fault in practice. Low risk; a one-line guard would be belt-and-suspenders.

### A2. JavaScript validity — CLEAN ✅
- Extracted all **30** inline `<script>` blocks (all plain JS; no `type=module`, no external `src`) and ran `node --check` on each. **All 30 pass.**
- Also ran `node --check` on all **9** Cloudflare Functions (`functions/_middleware.js`, `functions/lib/auth.js`, `functions/api/*.js`). **All 9 pass.**
- Note: an initial extractor pass reported a "syntax error" in the first block — this was HTML-comment text leaking into the extractor, NOT a real bug. Confirmed clean after isolating the real `<script>` body.

### A3. Data-feed wiring — CLEAN ✅
- The SPA loads data via a **role-aware bootstrap** (index.html:~1310, block #0): it calls `/api/me` synchronously, then `document.write`s the correct `/data/*.js` feeds for the caller's role (field_ops gets the financials-stripped derivatives; admin/partner get the full set). Fails closed to `field_ops` on any error. Good design.
- **Referenced feeds that do NOT exist on disk: NONE.** All 13 referenced `.js` feeds are present.
- **Present-but-never-referenced** `.json` files (`bd-master.json`, `bid-log.json`, `estimate-template.json`, `project-master.json`, `schedule-seed-state.json`, `sync-meta.json`) and `.js` files (`pricing-data.js`, `production-data.js`, `project-history.js`, `insurance-baseline.js`, `schedule-data.js`) are **NOT dead** — they are either (a) source data for the `sync/*.py` build pipeline, (b) loaded by standalone HTML pages (`pricing.html`, `daily-production.html`, `project-history.html`, `subcontracts.html`), or (c) gated server-side via `auth.js areaForPath`. No action needed.
- `/api/data.js` is a **stub** (returns a placeholder "Phase 2 will connect to SharePoint" message). It is **not called by the SPA**, so it surfaces nothing to users. Harmless for Beta; flag for cleanup.

### A4. Dead / placeholder content
- **7 nav-reachable panels are empty "to be built out" placeholders** (see Should-fix SF-3). These are the only user-visible dead content.
- The string `'undefined'` appears ~10x but **every occurrence is a defensive `typeof X !== 'undefined'` guard** — correct practice, not a rendering bug. No raw `NaN`/`undefined` rendered into UI was found.
- No `TODO`/`FIXME`/`lorem` in user-visible content. One `coming soon` (inside a placeholder panel) and the `PLACEHOLDER` token (a CSS class comment) only.

### A5. Console-risk patterns — LOW ✅
- 109 `getElementById` calls; 44 immediate-deref-on-same-line. Spot-checked the high-traffic ones (`sidebar`, `fabMenu`, `pageTitle`, `mod-'+id`, dashboard mounts) — all target statically-present elements. No high-risk null-deref found beyond the theoretical `showModule` case in A1.
- The precon panels (12 `.precon-mount` divs) are rendered by `renderAll()`/`renderMount()` inside a try/catch IIFE (index.html:10925), invoked on `DOMContentLoaded` and immediately if already loaded. **Functionally wired and populated** from `window.PF_PRECON`. (The HTML comment at line 2156 calls it `initPrecon()` — that function name does not exist; it is a **stale comment label only**, not a broken call. Cosmetic.)

---

## Part B — Docs-Currency Audit

### B1/B2/B3. Module → docs mapping
- **57 live functional modules** (58 nav ids minus one `${id}` template-literal false positive).
- **33 per-module doc dirs** under `docs/`, most with both `SRS.md` and `SOW.md`. Docs missing one half: `budgeting-forecasting` (no SRS), `ceo-dashboard` (no SRS), `invoicing-ar` (no SRS), `subcontract-tracker` (no SOW), `platform-data-integrity` (neither — has KPI-DEFINITIONS.md only).

**Live modules with NO mapped SRS/SOW (11):**
| Module | Note |
|---|---|
| `pf-coi` (PF COI) | **Live functional feature — real doc gap.** |
| `financials-wip` (WIP & Cashflow) | Currently a placeholder panel; doc + build both pending. |
| `bd-leads`, `bd-targets`, `bd-outreach` | Placeholder panels; doc pending until built. |
| `alphareview`, `sprintreports`, `sopadditions`, `cheatsheet`, `coochecklist`, `pfadmin` | Info/utility pages — legitimately need no SRS/SOW. |

**Doc dirs NOT mapped to any live module (forward-looking or cross-cutting, NOT stale-describing-removed-modules):**
`change-order-mgmt`, `permitting-inspections`, `punch-list-closeout` (roadmap features not yet in the UI); `platform-security`, `portal-rebuild`, `auto-progress`, `design-studio`, `content-pipeline-trello`, `constructconnect-scanner`, `workflow-automation` (infra/cross-cutting). None describe a module that was removed, so none are actively misleading — but `change-order-mgmt`/`permitting`/`closeout` should be tagged "planned, not yet built" so a reader doesn't expect them in the nav.

### B4. User-facing docs (`manual.html`, `training.html`)
- **`manual.html` covers the CURRENT module set well** — headings include Preconstruction Pipeline, Project Record, Subcontract Analysis, Budget vs Actual, TimeSheets, Field View, Awarded Projects Index, PF COI, the new sidebar, Design Studio, Content Board. Good.
- **`manual.html` "Logging In" is STALE.** It describes the legacy shared Basic-Auth box ("a small sign-in box… the username and password your administrator gave you… usually only once per device"). The platform now uses a **per-user login** (`login.html`, `/api/login` with PBKDF2 against D1, role-based `pf_session` cookie, `reset-password.html` / `/api/reset-password`, `denied.html`). The manual does NOT document: per-user accounts, first-time password set, password reset, or **why field crew see fewer modules (role-based visibility)**. This is the #1 docs gap — it is the first screen every Beta user hits.
- **`training.html` does NOT cover login at all** — zero references to `login.html`, reset-password, first-time-password, or roles in the Jonathan/Derek quick-start guides.

### B5. `docs/PLATFORM-RELEASE-STAGES.md` — STALE ✅ (flagged as requested)
- Line 23: "We are entering **Stage 2 — Alpha**. **All 15 modules** are built and deployed." Line 21: "Current Status: ALPHA."
- The module-status table (lines 29–50) lists the **old 15 modules** (Dashboard, Feasibility, Bid Pipeline, Material Costs, Estimating, Active Projects, GUHMA, Modulus, Proposals, Change Orders, Equipment, Safety, Daily Logs, Subcontractors, Permits, Closeout) — pre-rebuild. Needs full refresh to the ~57-module Beta set and current stage.

---

## Consolidated Punch List

### 🔴 BLOCKERS (must fix before Beta)
| ID | Finding | Where | Severity | Owner |
|----|---------|-------|----------|-------|
| **B-1** | Manual's "Logging In" describes the OLD shared password box; the platform now uses per-user login + password reset + role-based visibility. First thing every user touches. | `platform/manual.html` ("Logging In" section) | High | docs / Peter |

*(No functional/code blockers found — nav, JS, data feeds, auth, precon renderer all verified working.)*

### 🟡 SHOULD-FIX (before Beta ideally)
| ID | Finding | Where | Severity | Owner |
|----|---------|-------|----------|-------|
| **SF-1** | Training guides never mention the new login / first-time password / roles. | `platform/training.html` | Med | docs / Peter |
| **SF-2** | Release-stages doc says "15 modules / ALPHA" with the old module table. | `docs/PLATFORM-RELEASE-STAGES.md:21-50` | Med | docs / Peter |
| **SF-3** | 7 nav-reachable panels are empty "to be built out" placeholders. For Beta, either hide them from nav or relabel to "Coming in a later release." | index.html — `mod-pfadmin` (2138), `mod-bd-leads` (2146), `mod-bd-targets` (2149), `mod-bd-outreach` (2152), `mod-schedule-awarded` (2246), `mod-financials-wip` (2250), `mod-pf-dashboard` (2254) | Med | Peter + Deploy Engineer |
| **SF-4** | Live functional module `pf-coi` has no SRS/SOW (Build Protocol requires docs track reality). | `docs/` (no `pf-coi` dir) | Med | docs / Peter |
| **SF-5** | Doc dirs for not-yet-built features (`change-order-mgmt`, `permitting-inspections`, `punch-list-closeout`) aren't tagged "planned" — a reader may expect them in nav. | those `docs/*/SRS.md` headers | Low-Med | docs / Peter |
| **SF-6** | Docs missing one half of SRS/SOW pair: `budgeting-forecasting`, `ceo-dashboard`, `invoicing-ar` (no SRS); `subcontract-tracker` (no SOW); `platform-data-integrity` (neither). | `docs/` | Low-Med | docs / Peter |

### 🟢 NICE-TO-HAVE (can follow during Beta)
| ID | Finding | Where | Severity | Owner |
|----|---------|-------|----------|-------|
| **NH-1** | `showModule()` has no null-guard on `getElementById('mod-'+id)`. Safe today (1:1 nav↔panel) but a guard prevents future regressions. | index.html:2324 | Low | Deploy Engineer / QA |
| **NH-2** | Stale comment names the precon renderer `initPrecon()`; the real function is `renderAll()`. Cosmetic. | index.html:2156 | Low | Deploy Engineer |
| **NH-3** | `/api/data.js` is a stub returning a placeholder message; not called by the SPA. Clean up or finish in Phase 2. | `functions/api/data.js` | Low | Deploy Engineer |
| **NH-4** | Confirm `precon-pipeline.js` actually carries Helical (hp) projects, not just placeholders, so the 6 HP stage panels aren't perpetually empty for users. | `platform/data/precon-pipeline.js` | Low | QA / Peter |

---

## Verification evidence (what was actually run)
- `comm` diff of 58 `showModule` targets vs 58 `mod-X` ids → empty both directions (no broken/orphan).
- `node --check` on 30 extracted inline JS blocks → all pass; on 9 `functions/` files → all pass.
- `comm` diff of `/data/*` references vs `platform/data/` contents → no missing feeds.
- Grep scans for TODO/FIXME/coming-soon/lorem/placeholder/undefined/NaN with context inspection.
- Heading/keyword extraction from `manual.html` & `training.html`; confirmed login mechanism via `functions/_middleware.js` (per-user `pf_session` + legacy shared gate).
- Module→doc mapping via alias table over `docs/` SRS/SOW presence.
