# Statement of Work: In-Platform Onboarding & Documents

**Project:** Pier Foundations -- PF Operations Platform (onboarding & embedded documents)
**Version:** 1.0
**Date:** June 4, 2026
**Prepared by:** Peter (AI COO)

---

## Background

Per Brad's direction, all reference documents must open inside the platform (not external tabs), and onboarding materials are needed at different levels so staff (including Derek) can ramp at their own pace. This SOW covers the documentation/onboarding layer built June 4, 2026.

## Scope (COMPLETE, deployed & verified June 4, 2026)

1. **In-platform document embedding (DOC-1..4).** Converted all six Documents-section links from `window.open(_blank)` to in-platform `showModule()` views. Each renders in a lazy-loaded iframe in the content area; sidebar/topbar persist.
2. **Password-prompt fix (DOC-2).** Same-origin protected docs are fetched with the session cookie and rendered via `srcdoc` so the embedded frame never makes its own authed request -> no Basic-Auth dialog inside the platform.
3. **"Meet Peter" one-pager (ONB-1).** Single shareable page describing Peter -- what he is/isn't, what he does, how to work with him, how to reach him. (Built on PureBrain.)
4. **Role-level onboarding hub (ONB-2).** Tabbed guides: Executive, Estimating & Ops, BD, Admin/Office -- home-base modules, example asks, and where Peter stops (Garbin owns engineering sign-off).
5. **COO Knowledge Checklist (ONB-3).** Interactive 87-item self-assessment across 15 domains; Known/Partial/Need tags; clickable with localStorage progress, category counts, and filters.

## Deliverables

- [x] Six documents open in-platform (no external tabs)
- [x] No password prompt on embedded protected docs
- [x] Meet-Peter one-pager
- [x] Role onboarding hub (4 roles)
- [x] COO Knowledge Checklist (interactive)
- [x] SRS + SOW (this set)
- [x] Deployed to pf-platform + pushed to repo

## Acceptance Criteria

- Clicking any document keeps the user in the platform (URL unchanged, no new tab). MET
- No browser password dialog when opening an embedded protected doc. MET
- Onboarding hub switches cleanly between the four roles. MET
- COO Checklist saves progress and filters correctly. MET

## Verification

Headless Playwright suite against the live deployment (logged-in session) -- all pass; see SRS sec. 5. Each item self-checked before "done" per the self-check mandate.

## Backlog / Future

- Print/PDF export of the one-pager (offered to Brad).
- Field/Crew onboarding tab (if needed).
- Deepen the Estimating onboarding tab with the shop-drawing/submittal workflow once parameters are defined.
- Shared (cross-device) checklist state would require a backend; currently per-device via localStorage.
