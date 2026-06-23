# Changelog

All notable changes to the **PF Operations Platform** (`pf-platform.pages.dev`).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is
[SemVer](https://semver.org/) — until Production v1.0.0 the platform stays in the `0.x` line
with a release-stage suffix (see `docs/PLATFORM-RELEASE-STAGES.md` and `docs/devops/RELEASE-PROTOCOL.md`).

**Current stage: Alpha — entering UAT.**

---

## [Unreleased]

### Added
- DevOps function: team charter, release protocol, logging/monitoring runbook, and maintenance/support runbook under `docs/devops/`, plus this changelog. Formalizes how changes ship, get logged, and stay recoverable.

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
