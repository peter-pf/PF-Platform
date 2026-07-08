# Software Requirements Specification: HR Module

**Project:** Pier Foundations -- HR Module (Meridian-PT, wired into PF-Platform shell)
**Version:** 1.0
**Date:** July 8, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: v1.0 -- WIRED on branch `module-integration`. NOT deployed (Peter triple-checks + deploys through the gate).

## 1. Overview

The HR module is an **external** application built by **Meridian-PT**. It is a single, self-contained `index.html` that renders a full HR workspace with seven tabs. It has been **Peter-vetted clean**: one file, zero network calls, no external resources, no `eval`, proper `esc()` HTML escaping, and it reads the `pf_auth_token` cookie only to toggle demo-vs-prod init (it never transmits it). It currently renders **DEMO data only** -- there is no live backend yet.

This SRS covers **wiring the module into the PF-Platform shell**, not building the module. The module's own code was copied byte-identical and is not modified.

## 2. Provenance

| Field | Value |
|-------|-------|
| Author | Meridian-PT (external) |
| Source repo | `/home/aiciv/vetting/pf-hr-module` |
| Provenance commit | `ec1979491f1cffa0d6e0c62bd6158c2da083fe22` |
| Vetted source file | `index.html` |
| SHA-256 (source) | `dbf0bd53821069de2436d601175a5a336fd00a1c8ee5d09cbad360884ba60b45` |
| SHA-256 (deployed copy `platform/hr/index.html`) | `dbf0bd53821069de2436d601175a5a336fd00a1c8ee5d09cbad360884ba60b45` (MATCHES -- byte-identical) |
| Security review | Peter: single self-contained file, ZERO network calls, no external resources, no `eval`, reads `pf_auth_token` cookie only to toggle demo/prod init and never transmits it, proper `esc()` escaping |

## 3. The Module -- Seven Tabs

1. **Employee Records** -- employee directory / profiles
2. **Onboarding** -- new-hire onboarding workflow
3. **Policies** -- HR policy library
4. **Time Off** -- PTO / leave tracking
5. **Performance** -- performance reviews / tracking
6. **Org Chart** -- organizational structure
7. **Compliance** -- HR compliance items

All seven render **DEMO data** in this version. No live backend is connected.

## 4. Functional Requirements

### 4.1 Hosting
| Item | Specification |
|------|---------------|
| Location | Served same-origin at `/hr/` from `platform/hr/index.html` |
| Modification | NONE -- module copied byte-identical (SHA-256 verified) |
| Data | DEMO only; no live backend |

### 4.2 Shell integration (nav + embed)
| Item | Specification |
|------|---------------|
| Nav item | `HR` added to the **PF Admin** nav section (the section that hosts Design Studio), matching the existing `data-module` / `showModule()` styling |
| Embed | `mod-hr` module-view containing an interactive same-origin iframe: `<iframe class="doc-frame" data-src="/hr/" data-interactive="1">` |
| Activation | `showModule('hr')` sets `frame.src = '/hr/'` because `frame.dataset.interactive === '1'`; the live session cookie authenticates the request. This mirrors the design-studio / pricing / schedule interactive-iframe pattern exactly |
| Page title | `moduleTitles.hr = 'Human Resources'` |

### 4.3 Access control (RBAC)
| Item | Specification |
|------|---------------|
| New role | `hr` added to `ROLES` in `functions/lib/auth.js` |
| New area | `AREA_ROLES.hr = ['admin', 'hr']` -- **admin + `hr` role ONLY** (Melanie's confirmed tight scope; partners NOT included) |
| Future area | `AREA_ROLES.crm = ['admin', 'partner', 'business_dev']` pre-declared (harmless, default-deny; no `/crm/` path mapped yet) |
| Path gate | `areaForPath()` maps the entire `/hr/` prefix (`/hr`, `/hr/`, `/hr/index.html`, `/hr/*`) to the `hr` area, placed BEFORE the static-asset allow-list so no `/hr/` path can leak to the permissive `general` bucket |

## 5. Non-Functional / Security Requirements

- **Fail-closed:** a non-hr, non-admin session hitting any `/hr/` path is denied by the middleware -- 302 to `/denied.html` for HTML navigations, 403 JSON for fetches. Verified by headless test importing the real `auth.js` (23/23 pass).
- **Server-side enforcement:** the gate lives in `functions/_middleware.js` + `functions/lib/auth.js`, not the UI. The nav item being hidden is NOT the boundary; the direct-URL block is.
- **No module edits:** the vetted file is deployed byte-identical; any future update re-vets from source.

## 6. Verification Evidence

- `sha256sum` of source == deployed copy: `dbf0bd53...ba60b45` (match).
- `node --check` clean on `auth.js` and `_middleware.js`.
- Headless RBAC test (imports real `auth.js`): 23/23 pass, incl. field_ops/partner/business_dev DENIED at `/hr/`, admin/hr ALLOWED, design-studio unchanged (`general`), crm map correct.

## 7. Known Gaps / Follow-ups

- **DEMO data only** -- no live HR backend. A future phase would add data endpoints (each gated to the `hr` area).
- **D1 role CHECK constraint:** `platform/migrations/0001_init.sql` has `CHECK (role IN ('admin','partner','field_ops'))` -- predates both `business_dev` and `hr`. Must be widened before an `hr` user can be inserted into the live D1 `users` table. Does not affect the current demo module.
