# Software Requirements Specification: HR Module

**Project:** Pier Foundations -- HR Module (Meridian-PT, wired into PF-Platform shell)
**Version:** 2.0
**Date:** July 9, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: v2.0 -- module UPDATED (Training Studio + compliance dashboard, 8 tabs) via byte-identical file swap on branch `module-integration`. Wiring UNCHANGED. NOT deployed (Peter triple-checks + deploys through the gate).

## 1. Overview

The HR module is an **external** application built by **Meridian-PT**. It is a single, self-contained `index.html` that renders a full HR workspace with **eight tabs**. It has been **Peter-vetted clean**: one file, zero network calls, no external resources, no `eval`/`exec`, proper `esc()` HTML escaping, and it reads the `pf_auth_token` cookie only to toggle demo-vs-prod init (it never transmits it). It renders **DEMO data only** and is **entirely client-side** -- there is no live backend and no network egress.

This SRS covers **wiring the module into the PF-Platform shell**, not building the module. The module's own code was copied byte-identical and is not modified.

**v2.0 change summary:** The prior seven-tab version (provenance `ec197949...`, SHA `dbf0bd53...`) was **replaced** by a byte-identical swap of the updated Meridian-PT source (provenance `d6e1517`). The update adds an eighth tab, **Training Studio**, and expands the **Compliance** tab into a compliance dashboard. No shell wiring changed; this was a file swap only.

## 2. Provenance

| Field | Value |
|-------|-------|
| Author | Meridian-PT (external) |
| Source repo | `/home/aiciv/vetting/pf-hr-module-v2` |
| Provenance commit | `d6e151734c1f5dec8925e04810a98c2eb4c73e7d` (`d6e1517`) |
| Vetted source file | `index.html` |
| SHA-256 (source) | `2407ae7da2821ef1b60b57204b3b35370a1bcc1718f38e0094f4c2d2609005ad` |
| SHA-256 (deployed copy `platform/hr/index.html`) | `2407ae7da2821ef1b60b57204b3b35370a1bcc1718f38e0094f4c2d2609005ad` (MATCHES -- byte-identical) |
| Prior version (superseded) | commit `ec197949...`, SHA `dbf0bd53...`, 7 tabs |
| Security review (re-vet) | Peter: single self-contained file, ZERO network calls (Training Studio "auto-generates" content entirely client-side), SOP upload uses `FileReader.readAsText` and NEVER leaves the browser (no `FormData`/`fetch`), no `eval`/`exec` sinks, uploaded SOP content escaped via `esc()` in the main render paths, reads `pf_auth_token` cookie only to toggle demo/prod init and never transmits it |

## 3. The Module -- Eight Tabs

1. **Employee Records** -- employee directory / profiles
2. **Onboarding** -- new-hire onboarding workflow
3. **Policies** -- HR policy library
4. **Time Off** -- PTO / leave tracking
5. **Performance** -- performance reviews / tracking
6. **Org Chart** -- organizational structure
7. **Compliance** -- compliance dashboard (HR compliance items + status, expanded in v2.0)
8. **Training Studio** (NEW in v2.0) -- upload a `.txt`/`.md` SOP client-side via `FileReader.readAsText`, parse it into sections, and **auto-generate slides, a quiz, flashcards, and an audio script LOCALLY** with no network calls. All generation is in-browser; nothing is uploaded or transmitted.

All eight render **DEMO data** in this version. No live backend is connected; all Training Studio generation is client-side only.

## 4. Functional Requirements

### 4.1 Hosting
| Item | Specification |
|------|---------------|
| Location | Served same-origin at `/hr/` from `platform/hr/index.html` |
| Modification | NONE -- module copied byte-identical (SHA-256 verified) |
| Data | DEMO only; no live backend; all Training Studio generation is client-side (no network egress) |

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
- **No network egress:** the entire module (including v2.0 Training Studio generation) runs client-side. The SOP upload uses `FileReader.readAsText` and never leaves the browser.

## 6. Verification Evidence

- `sha256sum` of source == deployed copy: `2407ae7d...09005ad` (match).
- `grep` for network/exec sinks (`fetch`, `XMLHttpRequest`, `FormData`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, `.exec(`): NONE found.
- `FileReader` / `readAsText` present (SOP upload) -- confirmed client-side read only, no upload path.
- 8 tabs confirmed in source (Employee Records, Onboarding, Policies, Time Off, Performance, Org Chart, Compliance, Training Studio).
- Wiring re-verified UNCHANGED: `/hr/` nav item + `mod-hr` interactive iframe in `platform/index.html`; `areaForPath -> 'hr'` and `AREA_ROLES.hr = ['admin','hr']` in `functions/lib/auth.js`.

## 7. Known Gaps / Follow-ups

- **DEMO data only** -- no live HR backend. A future phase would add data endpoints (each gated to the `hr` area).
- **D1 role CHECK constraint:** `platform/migrations/0001_init.sql` has `CHECK (role IN ('admin','partner','field_ops'))` -- predates both `business_dev` and `hr`. Must be widened before an `hr` user can be inserted into the live D1 `users` table. Does not affect the current demo module.

## 8. Known Low-Risk Note (v2.0 re-vet)

In the Training Studio quiz generator (`renderPFQuiz`, ~line 1137), the question string is built by concatenating the user-uploaded SOP section title:

```js
var q = 'Based on "' + sec.title + '": Which of the following is correct?';
```

`q` is **escaped at render** -- it is emitted as `... + esc(q) + ...` at ~line 1156, and `sec.title` is separately escaped again via `esc(sec.title)` in the "Review the ... section" feedback string at ~line 1158. `esc()` is a proper text-node-based HTML escaper (`document.createTextNode(...).innerHTML`). Because the SOP content is user-supplied and read locally (never from an attacker-controlled network source) and is escaped on the render path, this is **low risk / no action required**. Noted for completeness.
