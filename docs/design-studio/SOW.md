# PF Design Studio — Statement of Work (SOW)

**Module:** PF Design Studio
**Version:** 1.0
**Date:** 2026-06-16
**Owner:** Peter (AI COO)
**Status:** Complete (Phase 1, frontend-only) — re-hosted behind the portal login; security-vetted; gate verified.

---

## Scope delivered
1. Took the origin editor (`puretechnyc/purebrain-design-editor`, Nathan/PureBrain — CRA + Fabric.js) and re-hosted the **frontend only** at `pf-platform.pages.dev/design-studio/`.
2. Configured the build to live under a sub-path: CRA `homepage=/design-studio`, `BrowserRouter basename=/design-studio`, scoped assets (`<base href="/design-studio/">`, `static/js` + `static/css`).
3. Added a scoped SPA rewrite in `_redirects`: `/design-studio/* -> /design-studio/index.html 200`.
4. Placed the studio behind the **single** portal login (no second password) by hosting it as a path on the already-gated `pf-platform` origin.
5. Added a portal sidebar launch button in the **Tools** section ("Design Studio"); the studio sidebar carries a **"Back to Portal"** control.

## Work performed — security & hygiene
- Security vet before re-host: confirmed **0 runtime network calls, no install scripts, no secrets, no XSS sinks.**
- Did **not** deploy the origin Node + MongoDB backend; its known authentication bugs are documented and the backend is deferred to Phase 2.
- Clean-sweep: deleted the old standalone `pf-design-editor.pages.dev` so no unauthenticated copy of the tool remains online.

## Verification
- Gate: **401** on `/design-studio/` and `/design-studio/editor` without credentials.
- Security findings: clean (0 network calls / no install scripts / no secrets / no XSS sinks).
- Old standalone deployment confirmed removed.

## Out of scope / Phase 2
- Accounts + cloud-save (requires deploying a backend — only after fixing the documented backend auth bugs, or wiring it to PF auth).
- PF-branded template library inside the editor.
- In-portal embed (currently launches in a new tab from the Tools section).
