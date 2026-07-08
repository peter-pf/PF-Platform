# Statement of Work: HR Module Integration

**Project:** Pier Foundations -- Wire the Meridian-PT HR module into the PF-Platform shell
**Version:** 1.0
**Date:** July 8, 2026
**Prepared by:** Peter (AI COO)
**Branch:** `module-integration` (off `website-build-20260609`)

---

## Status: COMPLETE on `module-integration`. NOT deployed (Peter triple-checks + deploys through the gate).

## 1. Scope

Wire an **external, Peter-vetted** HR module (Meridian-PT) into the existing PF-Platform shell as-is. Do NOT modify the module's own code. Stage everything on `module-integration`. No deploy, no push to main.

## 2. Work Performed

### 2.1 Module placement (byte-identical)
- Created `platform/hr/`.
- Copied the vetted `index.html` -> `platform/hr/index.html`, **byte-identical** (SHA-256 verified before and after: `dbf0bd53821069de2436d601175a5a336fd00a1c8ee5d09cbad360884ba60b45` on both).
- `docs/index.html` in the source repo is an identical GitHub-Pages publishing copy and is **NOT referenced** by the module (0 `docs/` references) -> skipped per instructions.

### 2.2 Shell nav + embed (`platform/index.html`)
- Added an `HR` nav item in the **PF Admin** section (where Design Studio lives), matching the existing `data-module` / `onclick="showModule('hr')"` styling.
- Added a `mod-hr` module-view with an **interactive same-origin iframe** (`data-src="/hr/" data-interactive="1"`), mirroring the design-studio interactive-iframe pattern where `showModule()` sets `frame.src = url` when `frame.dataset.interactive === '1'`.
- Registered `moduleTitles.hr = 'Human Resources'`.

### 2.3 RBAC (`functions/lib/auth.js`)
- Added `hr` to the `ROLES` array.
- Added `AREA_ROLES.hr = ['admin', 'hr']` (tight scope: admin + hr role only; partners excluded).
- Added `AREA_ROLES.crm = ['admin', 'partner', 'business_dev']` (future CRM module; inert until a `/crm/` path is mapped).

### 2.4 Path gating (`functions/lib/auth.js` -> `areaForPath`)
- Added a branch mapping the entire `/hr/` prefix (`/hr`, `/hr/`, `/hr/index.html`, `/hr/*`) to the `hr` area, placed BEFORE the `STATIC_ASSET_PREFIXES` / static-extension checks so no `/hr/` path leaks to the permissive `general` bucket (the bucket `/design-studio/` uses).
- Mechanism: the existing `functions/_middleware.js` calls `areaForPath(path)` then `roleCanAccess(session.role, area)`; a failure returns `deny()` (302 -> `/denied.html` for HTML navs, 403 JSON for fetches). Fail-closed.

### 2.5 Documentation
- Created `docs/hr-module/SRS.md`, `SOW.md`, `MANUAL.md` (this set).
- Updated `docs/portal-rebuild/ARCHITECTURE-EDITABILITY.md` (the canonical role->access map) with the new `hr` role, the `hr` + `crm` areas, and the D1 CHECK-constraint gap note.

## 3. Verification

| Check | Result |
|-------|--------|
| SHA-256 source == `platform/hr/index.html` | MATCH (`dbf0bd53...ba60b45`) |
| `node --check` auth.js / _middleware.js | Clean |
| Headless RBAC test (real auth.js) | 23/23 pass |
| field_ops / partner / business_dev @ `/hr/` | DENIED (fail-closed) |
| admin / hr @ `/hr/` | ALLOWED |
| `/design-studio/` area | Unchanged (`general`) |

## 4. Out of Scope / Not Done

- No deploy, no `deploy.sh`, no push to main -- Peter deploys through the gate.
- No changes to the module's own code.
- No live HR backend (module is DEMO-only).
- D1 migration CHECK constraint NOT modified (flagged as a provisioning follow-up in the SRS + architecture doc).

## 5. Files Touched

| File | Change |
|------|--------|
| `platform/hr/index.html` | NEW -- byte-identical vetted module |
| `platform/index.html` | HR nav item + `mod-hr` interactive iframe + `moduleTitles.hr` |
| `functions/lib/auth.js` | `ROLES += hr`; `AREA_ROLES.hr` + `AREA_ROLES.crm`; `/hr/` path gate |
| `docs/hr-module/SRS.md` | NEW |
| `docs/hr-module/SOW.md` | NEW (this file) |
| `docs/hr-module/MANUAL.md` | NEW |
| `docs/portal-rebuild/ARCHITECTURE-EDITABILITY.md` | RBAC/area map updated |
