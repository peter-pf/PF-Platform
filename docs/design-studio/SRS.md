# PF Design Studio — Software Requirements Specification (SRS)

**Module:** PF Design Studio (re-hosted at `pf-platform.pages.dev/design-studio/`)
**Version:** 1.0
**Date:** 2026-06-16
**Owner:** Peter (AI COO)
**Status:** Complete (Phase 1, frontend-only) — re-hosted behind the portal login; security-vetted; gate verified.

---

## 1. Purpose
Give the team a self-hosted, Canva-style graphics editor inside the PF Platform — for one-off marketing graphics, badges, stencils, and social images — without sending company work to a third-party design SaaS, and without a second login.

## 2. Origin / provenance
- Source: `puretechnyc/purebrain-design-editor` (Nathan / PureBrain).
- Stack: Create React App + Fabric.js (canvas editor) on the frontend; a Node + MongoDB backend exists in the origin repo for accounts and cloud-save.
- **Backend is NOT deployed.** It has known authentication bugs (documented) and is deferred to Phase 2. PF runs the frontend only.

## 3. Scope
- Re-host the built CRA frontend at `/design-studio/` on the existing `pf-platform` Pages project, so it sits behind the **single** portal login (no second password).
- CRA configured with `homepage=/design-studio` and a `BrowserRouter basename` so all asset and route paths are scoped under `/design-studio/`.
- A scoped `_redirects` rule serves the SPA: `/design-studio/* -> /design-studio/index.html 200` (client-side routing).
- Portal launch button in the sidebar **Tools** section; a **"Back to Portal"** control inside the studio sidebar for return navigation.

## 4. Architecture / Integration
- **Hosting:** static CRA build under `platform/design-studio/` (index.html with `<base href="/design-studio/">`, scoped `static/js` + `static/css`, manifest, icons).
- **Auth:** inherits the platform's server-side auth gate (`functions/_middleware.js`); the studio is just another path under the protected origin, so the existing signed-cookie / Basic-Auth session covers it. No separate auth.
- **Routing:** `BrowserRouter` with `basename=/design-studio`; the `_redirects` 200-rewrite makes deep links resolve to the SPA shell.
- **Navigation:** sidebar "Design Studio" link opens `/design-studio/` (currently `target="_blank"` from the portal); in-studio "Back to Portal" returns the user to the portal.

## 5. Functional requirements
1. Open a working canvas editor (Fabric.js) at `/design-studio/` for the authenticated user.
2. Editor functions client-side only: no account, no server save in Phase 1 (export/download from the canvas as the persistence path).
3. Reachable from the portal sidebar Tools section; returnable via "Back to Portal".
4. Deep links / refreshes under `/design-studio/...` resolve to the SPA, not a 404.

## 6. Non-functional requirements
- **Single sign-on:** no second password; one portal login covers the studio.
- **Self-contained:** zero runtime network calls out of the app (verified) — work stays inside the PF origin.
- **Light/branded** consistent with PF (theme-color `#005a91`).

## 7. Security / Auth
- Behind the portal auth gate: unauthenticated requests to `/design-studio/` and `/design-studio/editor` get 401.
- Security-vetted clean before re-host: **0 runtime network calls, no install scripts, no embedded secrets, no XSS sinks.**
- The vulnerable origin backend is not deployed, so its known auth bugs are not exposed.
- Clean-sweep: the old standalone deployment `pf-design-editor.pages.dev` was deleted so there is no second, unauthenticated copy of the tool on the internet.

## 8. Acceptance criteria
- `/design-studio/` loads the editor when authenticated.
- Auth gate returns 401 on `/design-studio/` and `/design-studio/editor` without credentials.
- Sidebar launch button present in Tools; "Back to Portal" present in the studio.
- No second login is required to reach the studio.

## 9. Verification evidence (2026-06-16)
- Security vet: 0 runtime network calls, no install scripts, no secrets, no XSS sinks.
- Gate verified: **401** on `/design-studio/` and `/design-studio/editor` without credentials.
- Old standalone `pf-design-editor.pages.dev` confirmed deleted (clean-sweep).

## 10. Open items / Phase 2
- Deploy/replace the backend for accounts + cloud-save — **only after** the documented backend auth bugs are fixed (or replaced with PF auth).
- Optional template library seeded with PF brand assets (logo, colors, badge layouts).
