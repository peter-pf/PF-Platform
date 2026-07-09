# Statement of Work: HR Module Integration

**Project:** Pier Foundations -- Wire the Meridian-PT HR module into the PF-Platform shell
**Version:** 2.0
**Date:** July 9, 2026
**Prepared by:** Peter (AI COO)
**Branch:** `module-integration` (off `website-build-20260609`)

---

## Status: v2.0 UPDATE COMPLETE on `module-integration` (byte-identical file swap; Training Studio + compliance dashboard = 8 tabs). Wiring UNCHANGED. NOT deployed (Peter triple-checks + deploys through the gate).

## 1. Scope

**v2.0:** Update the already-wired, **external, Peter-re-vetted** HR module (Meridian-PT) to its new version via a **byte-identical file swap** of `platform/hr/index.html`. This is NOT new wiring -- the nav item, iframe embed, and RBAC/path gating from v1.0 remain in place and were re-verified, not re-added. Do NOT modify the module's own code. Stage everything on `module-integration`. No deploy, no push to main.

## 2. Work Performed

### 2.1 Module file swap (byte-identical)
- **Replaced** `platform/hr/index.html` with the updated vetted source from `/home/aiciv/vetting/pf-hr-module-v2/index.html`.
- **Byte-identical** (SHA-256 verified before and after the copy: `2407ae7da2821ef1b60b57204b3b35370a1bcc1718f38e0094f4c2d2609005ad` on both source and deployed copy).
- Prior version (7 tabs, SHA `dbf0bd53...`, provenance `ec197949...`) superseded.
- New source adds tab #8 **Training Studio** and expands **Compliance** into a compliance dashboard. Module remains a single self-contained file, DEMO data, client-side only.

### 2.2 Shell nav + embed (`platform/index.html`) -- UNCHANGED (re-verified)
- The `HR` nav item (`data-module="hr" onclick="showModule('hr')"`, PF Admin section) is intact.
- The `mod-hr` module-view with the **interactive same-origin iframe** (`data-src="/hr/" data-interactive="1"`) is intact.
- `moduleTitles.hr = 'Human Resources'` is intact.
- **Nothing re-added** -- these were confirmed present and correct against the new module.

### 2.3 RBAC (`functions/lib/auth.js`) -- UNCHANGED (re-verified)
- `hr` present in the `ROLES` array.
- `AREA_ROLES.hr = ['admin', 'hr']` present (tight scope: admin + hr role only; partners excluded).

### 2.4 Path gating (`functions/lib/auth.js` -> `areaForPath`) -- UNCHANGED (re-verified)
- The `/hr/` prefix branch (`if (pathname === '/hr' || pathname.startsWith('/hr/')) return 'hr';`) is intact, placed BEFORE the static-asset / static-extension checks so no `/hr/` path leaks to the permissive `general` bucket. Fail-closed via the existing `functions/_middleware.js`.

### 2.5 Documentation
- Updated `docs/hr-module/SRS.md`, `SOW.md`, `MANUAL.md` to v2.0 (8 tabs, Training Studio, compliance dashboard, provenance `d6e1517`, new SHA-256, known low-risk quiz-title note).

## 3. Verification

| Check | Result |
|-------|--------|
| SHA-256 source == `platform/hr/index.html` | MATCH (`2407ae7d...09005ad`) |
| Network/exec sink grep (`fetch`/`XMLHttpRequest`/`FormData`/`WebSocket`/`sendBeacon`/`eval`/`new Function`/`.exec(`) | NONE found |
| `FileReader.readAsText` (SOP upload, client-side only) | Present, no upload path |
| 8 tabs present in source | Confirmed (records, onboarding, policies, timeoff, performance, orgchart, compliance, training) |
| `/hr/` nav item + `mod-hr` interactive iframe | Intact (unchanged) |
| `areaForPath -> 'hr'` + `AREA_ROLES.hr = ['admin','hr']` | Intact (unchanged) |
| Quiz-question `sec.title` (~line 1137) escaped at render | YES -- `esc(q)` @ ~1156; `esc(sec.title)` @ ~1158 |

## 4. Out of Scope / Not Done

- No deploy, no `deploy.sh`, no push to main -- Peter deploys through the gate.
- No changes to the module's own code (file swap only).
- No re-wiring -- nav/iframe/RBAC left as-is (v1.0), only re-verified.
- No live HR backend (module is DEMO-only, client-side only).
- D1 migration CHECK constraint NOT modified (still a provisioning follow-up in the SRS + architecture doc).

## 5. Files Touched (v2.0)

| File | Change |
|------|--------|
| `platform/hr/index.html` | REPLACED -- byte-identical v2 vetted module (Training Studio + compliance, 8 tabs) |
| `docs/hr-module/SRS.md` | Updated to v2.0 |
| `docs/hr-module/SOW.md` | Updated to v2.0 (this file) |
| `docs/hr-module/MANUAL.md` | Updated to v2.0 |

Not touched in v2.0 (unchanged from v1.0): `platform/index.html` (nav + iframe), `functions/lib/auth.js` (RBAC + path gate), `docs/portal-rebuild/ARCHITECTURE-EDITABILITY.md`.

## v2.1 Security Fix (2026-07-09, provenance 2b09f5b)
Resolved the SEC-01 LOW self-XSS flagged at v2 review. Meridian added `escAttr()` (escapes single and double quotes, not just angle brackets) and applied it to all inline onclick handlers that interpolate SOP headings or employee names (e.g. the Audio Script Play button, the review Open button). Attribute/JS-string breakout is now blocked. Also removed `.docx` from the upload accept list (now `.txt`/`.md` only, which `FileReader.readAsText` handles correctly; server-side `.docx` parsing deferred to the Pure Work backend). Byte-swap sha256-verified; RBAC and network posture (zero egress) unchanged.
