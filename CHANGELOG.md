# Changelog

All notable changes to the **PF Operations Platform** (`pf-platform.pages.dev`).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is
[SemVer](https://semver.org/) — until Production v1.0.0 the platform stays in the `0.x` line
with a release-stage suffix (see `docs/PLATFORM-RELEASE-STAGES.md` and `docs/devops/RELEASE-PROTOCOL.md`).

**Current stage: Alpha — entering UAT.**

---

## [Unreleased]

### Added
- Bid Recap milestone fields live: the Subcontract Agreement > Bid Recap subsection gains two new display-layer fields — "Released to Start Submittals" (a date milestone with native date-picker via `PF_FIELD_DATE_LABELS` + `pfToDateInputValue`, rendered MM/DD/YYYY) and "Bid Sent to GC" (a clickable, per-project-editable SharePoint link via `fieldLinked(..., 'website')`, blank until set). Additive display layer only (`index.html` +62/-3, two commits `94ccd36` date field + `9a87eea` link field), no Functions, no data mutation, no auth touch. Shipped from `bid-recap-released-submittals-20260807` @ `9a87eea` (base `subcontract-recap-rework-20260807` = prior prod canonical `497959e9`; `git merge-base --is-ancestor 304d1ba 9a87eea` = YES, `bd93a1f` feature tip and `85f4499` structural rename both ancestors = YES, so no section/Contract-Recap regression). New prod canonical `66e3870a` (env=production, branch=main, 2026-08-07T17:11:23Z). Prod auth fully gated post-deploy: `/api/me` 401, `/` 401 (Basic realm), `/api/contacts` 401 (contact directory Function still deployed + CRM-gated, body "Authentication required", not open/500). Verified against shipped bytes: "Dead Projects"/"Project Summary"/"PF Project Schedule" present, "Award to PM Handoff"/"mod-pm-handoff" absent, prior features intact (`functions/api/contacts.js` + `/api/contacts` + "Save contact(s) to directory", `pfFmtPhone` 17×, Contract Recap `twoCol` + "Project Substantial Completion Date", "Agreement Date (Face)" gone), new markers present ("Released to Start Submittals" 3×, "Bid Sent to GC" 2×, `PF_FIELD_DATE_LABELS` 4×, date-picker), Bid Recap render order Bid Recap subhead -> Released to Start Submittals -> Bid Sent to GC -> Contract Recap subhead, 166 real bids.
- Portal-wide phone-number display formatting live: new `pfFmtPhone` display helper in `index.html` normalizes stored phone values to `(111) 111-1111` at render time, label-gated so only phone fields are reformatted, and keeps numbers clickable via `tel:`. Display-only cosmetic change (same class as the live date formatter) — no Functions, no data mutation, no auth touch. Shipped from `phone-format-20260807` @ `99aebf3` (base `contact-directory-20260807` @ `18035e5` = the prior prod canonical `e1e3b3da`; `git merge-base --is-ancestor 18035e5 99aebf3` = YES, and `85f4499` structural rename is an ancestor = YES, so no section regression). Change = `index.html` only (`pfFmtPhone` present 16× in shipped bundle); test file `sync/pffmtphone_test.js` not shipped (rsync excludes `sync/`). New prod canonical `6b951da7` (env=production, branch=main, 2026-08-07T13:53:47Z). Prod auth fully gated post-deploy: `/api/me` 401, `/` 401 (Basic realm "PF Operations Platform"), `/api/contacts` 401 (contact directory Function still deployed + CRM-gated, not open/500). Structure verified against shipped bytes: "Dead Projects"/"Project Summary"/"PF Project Schedule" present, "Award to PM Handoff"/"mod-pm-handoff" absent, contact directory (`functions/api/contacts.js` + `/api/contacts` + "Save contact(s) to directory" markers) intact, 166 real bids.
- Master contact directory wiring live: new `functions/api/contacts.js` (read + write-back to PF Master Contact List.xlsx, GET+POST both `requireArea('crm')`), `functions/lib/auth.js` classifies `/api/contacts` as the `crm` area (admin + partner + business_dev; field_ops blocked), and `index.html` gains contact typeahead + a "Save contact(s) to directory" write-back button. Carries no financials (names/titles/companies/phones/emails only). Shipped from `contact-directory-20260807` @ `bf27b2a` (base `general-info-rework-20260806` @ `8eae0af` = current prod canonical structure; `git merge-base --is-ancestor 8eae0af bf27b2a` = YES). Passed adversarial code review (GO, no blockers). New prod canonical `e1e3b3da` (env=production, branch=main). Prod auth fully gated: `/api/me` 401, `/` 401 (Basic realm), `/api/contacts` 401 (deployed + CRM-gated, not open/500).
- DevOps function: team charter, release protocol, logging/monitoring runbook, and maintenance/support runbook under `docs/devops/`, plus this changelog. Formalizes how changes ship, get logged, and stay recoverable.

### Changed
- Contract Recap rework live: the Subcontract Agreement > Contract Recap subsection is condensed into a fixed `twoCol` left/right grouping; the "Agreement Date (Face)" field is deleted (removed from view and the section editor); "Substantial / Final Completion" is relabeled "Project Substantial Completion Date" (display label only, same `SF.completion_dates` binding and override round-trip); and "Subcontract Value" is moved to the top of the left column directly under "GC Project #". Every field stays a `.pr-field[data-pr-label]` child of the `contract` card, so `pfEditSection`/`pfSaveSection` and the `contract` override key round-trip are unchanged. `index.html` display layer only (+24/-12). Shipped from `subcontract-recap-rework-20260807` @ `bd93a1f` (base `phone-format-20260807` = prior prod canonical `6b951da7`; `git merge-base --is-ancestor 99aebf3 bd93a1f` = YES, CHANGELOG tip `91e1bed` and `85f4499` structural rename both ancestors = YES, so no section regression). New prod canonical `497959e9` (env=production, branch=main, 2026-08-07T16:11:07Z). Prod auth fully gated post-deploy: `/api/me` 401, `/` 401, `/api/contacts` 401 (contact directory Function still deployed + CRM-gated, not open/500). Verified against shipped bytes: "Dead Projects"/"Project Summary"/"PF Project Schedule" present, "Award to PM Handoff"/"mod-pm-handoff" absent, contacts (`functions/api/contacts.js` + `/api/contacts` + "Save contact(s) to directory") and `pfFmtPhone` (17×) intact, Contract Recap left-column order GC Project # -> Subcontract Value -> GC Subcontract #, old completion label gone, 166 real bids.
- Portal project-section rework live: General Info 5-subsection restructure, contact cards, MM/DD/YYYY dates, Equipment+Material into Site Readiness, Subcontract Bid/Contract Recap, standalone Engineering restored, preview-auth middleware fix. Shipped from `general-info-rework-20260806` @ `2df8ff7` (base carries current section structure; `git merge-base --is-ancestor 85f4499 HEAD` = YES). Prod auth unchanged and fully gated (the middleware bypass is preview-host-only, unreachable in production). Brad approved: "Portal changes are approved to go live with, please proceed."
- Project detail sections renumbered sequential 1-10 (gap-free): General Info=1, Subcontract Agreement=2, Engineering=3, Safety=4, Site Readiness=5, Equipment=6, Material=7, QA/QC=8, Financials=9, Closeout=10. Display numbers only (card() first argument); no section keys, data, or content changed. Shipped from `general-info-rework-20260806` @ `ef07b02`. Brad approved.
- General Info rework (office project-detail view): the standalone PF Team section was merged into General Info (data preserved via the `pfTeam` override key), General Info condensed to a responsive multi-column layout with black+bold field labels and reorganized into blue-headered subsections (Project Info -> General Contractor Info with GC contacts -> Owner -> PF Team -> Documents at bottom), and the "Contract Info" section was renamed to "Subcontract Agreement". Shipped from `general-info-rework-20260806` (base `pm-fullwidth-v2-20260806`, which carries the current section structure). Brad approved the preview.
- PM pages full-width redone on the correct base after regression rollback. The 4 PM wrapper classes (`.pf-index-root`, `.ts-root`, `.pr-root`, `.ba-wrap`) set to `max-width: none` and `.pr-root .ba-table-wrap` breakout set to `width: 100%`, shipped from `pm-fullwidth-v2-20260806` (base `financials-widen-v2-20260804`, which carries the current section structure). CSS-only; Brad approved v2 preview.

### Notes
- Recommended (pending Brad's approval to schedule): weekly D1 backup, weekly health check, monthly security review. See `docs/devops/MAINTENANCE-SUPPORT.md`.

---

## [0.9.0] — 2026-06-18 — Alpha/UAT

Per-user authentication and role-based access went live.

### Added
- **Per-user login + RBAC** backed by Cloudflare D1 (`pf-platform-db`). Three roles: `admin`, `partner`, `field_ops`. Server-side enforcement in `platform/functions/_middleware.js` with default-deny, page-level checks, and `requireArea` backstops.
- **First-login password reset** (`must_reset`) flow forcing users to set their own password.
- **Auth functions**: `login`, `logout`, `me`, `reset-password` under `platform/functions/api/`.
- **Audit log** (`audit_log` table) recording login/logout/failed-auth events.
- **Rate limiting** on auth via KV (`PF_SCHEDULE`).

### Changed
- PBKDF2 iterations set to **100,000** (Cloudflare Workers caps PBKDF2 at 100k; the earlier 210k value caused login 500s).
- `_middleware` PUBLIC_PATHS allow-list extended to clean URLs (`/login`, `/denied`, `/reset-password`) so the login page is reachable.

### Security
- **SEC-09/10:** sensitive `/data/*` files gated by role; role-aware SPA loading (field_ops cannot fetch pricing/financial data).
- **SEC-12/13/15:** stripped dollar amounts and GC identities from the field-ops schedule view; added a **build-time data-classification guard** (`migrations/check-data-classification.mjs`) to block restricted data from reaching field-facing surfaces.
- Migration files (password hashes) and `*.toml` excluded from the public deploy; D1 schema/hashes never served to the web root.
- Shared Basic-Auth gate retained as a no-lockout fallback until every user has logged in per-user.

---

## [0.8.0] — 2026-06-17 — Alpha

Major portal rebuild: a unified, navigable operations platform (~58 module panels).

### Added
- **8-header collapsible navigation skeleton** (information architecture per Brad's 2026-06-17 vision) + Project Record schema.
- **Project records for all 15 awarded projects**, with per-project detail views populated from live SharePoint data; several deepened to POET level with extracted subcontracts.
- **Per-project Subcontract Analysis** section with execution-status badges; standalone subcontract tab retired.
- **Preconstruction pipeline** views populated from the Bid Log, bucketed by Bid Log section, with full columns (AP 34 / Helical 33) and Bid-Status grouping.
- **Field Operations area**: field-facing Projects view (operational data, zero financials), Awarded Projects index, Insurance/PF COI, TimeSheets module (weekly hours by cost code + job) and annual TimeSheets summary.
- **Financials**: Budget vs Actual job-cost tracker (POET) under Project Management.
- **Auto percent-complete** computed from GUHMA column logs (LF drives completion).
- **Inline live-document embeds** via an auth-gated, drive-restricted `/api/doc` proxy.
- **PF Dashboard spec** (16 KPIs, weekly/monthly/annual toggle).

### Changed
- Renamed: Subcontractors → Vendors; Active Projects → Active Projects Summary; Project History → Projects Completed.
- Removed standalone Change Orders, Closeout, and Permits sections (per Brad).
- Weekly live SharePoint data refresh (Bid Log, Project Master, Estimating, BD).

### Docs
- Portal-rebuild SRS + SOW (11 modules), manual/training "What's New" sections, full 7-phase project-workflow SOP, and the platform-rebuild vision/roadmap.

---

## [0.5.0] — 2026-06-02 — Alpha

Security hardening of the platform after a three-agent code triple-check.

### Security
- **SEC-001:** session token now HMAC-SHA256 **signed** (`PF_TOKEN_SECRET`); forged tokens rejected.
- **SEC-002:** all `/api/*` routes require auth; removed wildcard CORS.
- **SEC-003:** credentials/secret read only from env vars, **fail-closed** (HTTP 500 if missing) — no hardcoded fallback.
- **SEC-004:** stored-XSS fixed — all data-derived values HTML-escaped via shared `window.esc` (132 sites).
- **SEC-005:** authenticated responses marked `private, no-store` (no shared-CDN caching of financial data).
- **SEC-008:** verbose error details no longer returned to the client.
- Verified live with curl/headless tests (no-auth → 401, forged token → 401, valid → 200). See `docs/platform-security/SRS.md`.

---

## [0.1.0] — 2026-05-30 — Pre-Alpha → Alpha

Initial unified platform build.

### Added
- Single-page operations platform shell (sidebar nav, shared CSS design system, modular JS) on Cloudflare Pages.
- Core modules built from Jonathan's real files: Dashboard, Feasibility, Bid Pipeline, Material Costs, Estimating, Active Projects, QA/QC GUHMA, Modulus Testing, Proposals, and supporting modules.
- Release-stage framework (Pre-Alpha → Alpha → UAT → Beta → Production) with review checklists.

---

[Unreleased]: https://github.com/peter-pf/PF-Platform/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/peter-pf/PF-Platform/releases/tag/v0.9.0
[0.8.0]: https://github.com/peter-pf/PF-Platform/releases/tag/v0.8.0
[0.5.0]: https://github.com/peter-pf/PF-Platform/releases/tag/v0.5.0
[0.1.0]: https://github.com/peter-pf/PF-Platform/releases/tag/v0.1.0
