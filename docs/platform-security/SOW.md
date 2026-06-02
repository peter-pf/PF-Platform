# Statement of Work: Platform Security Hardening

**Project:** Pier Foundations -- PF Operations Platform security hardening
**Version:** 1.0
**Date:** June 2, 2026
**Prepared by:** Peter (AI COO)

---

## Background

On June 2, 2026 a three-agent code triple-check (correctness, security, QA) reviewed the PF Platform at Brad's direction. The security agent found two blocking CRITICALs in the authentication layer that Peter had originally built. This SOW covers the work to remediate the security findings.

## Scope

### Phase A — Authentication & data exposure (COMPLETE, deployed & verified June 2, 2026)

1. **Sign the session token (SEC-001).** Replaced unsigned base64-JSON token with HMAC-SHA256 signed token using a secret from `PF_TOKEN_SECRET`. Verification recomputes the signature and constant-time-compares before trusting any payload.
2. **Protect `/api/*` and remove wildcard CORS (SEC-002).** Removed the blanket `/api/` auth-skip in middleware; removed `Access-Control-Allow-Origin: *` from `api/data.js`.
3. **Fail closed + rotate (SEC-003).** Middleware now returns 500 if `PF_AUTH_USER`, `PF_AUTH_PASS`, or `PF_TOKEN_SECRET` is missing — no hardcoded fallback. Password rotated; old password (`PierFoundations2024`) is dead.
4. **Don't cache authed responses (SEC-005).** `Cache-Control: private, no-store` on authenticated and data responses.
5. **Generic error messages (SEC-008).** `api/data.js` no longer returns `error.message`; logs server-side, returns a generic message.
6. **Verification.** 9 external (curl) tests against the live deployment — all pass (see SRS §4).

**Files changed:** `platform/functions/_middleware.js`, `platform/functions/api/data.js`
**Secrets set on CF Pages (production):** `PF_AUTH_USER`, `PF_AUTH_PASS`, `PF_TOKEN_SECRET`

### Phase B — Output safety / XSS (COMPLETE, deployed & verified June 2, 2026)

7. **Escape all data at `innerHTML` sites (SEC-004 / XSS-1, XSS-2).** DONE. Standardized on one global helper `window.esc` (handles null/undefined; escapes `& < > " '`); the two pre-existing helpers now delegate to it. **132 data-derived insertion points wrapped** across all 18 modules. Function-arg-as-classname and filter/comparison logic left raw (only displayed values escaped) so no behavior changed. **Self-check:** injected `<img src=x onerror="window.__XSS_FIRED=true">` and `<b>TAGTEST</b>` into test records, rendered headless — payload did NOT fire and renders as escaped text; a CONTROL run on the unfixed code DID fire (proving the test detects XSS); no-regression run shows 156 bids/18 projects rendering with zero console errors. Production re-verified: `window.esc` deployed, auth still enforced.

### Phase C — Backlog (when relevant)

8. CSRF protection before any write endpoint ships (SEC-006).
9. Harden `.env` parsing in `sp-sync.py` (SEC-007).
10. Move SharePoint file IDs to config (SEC-009).
11. Shorter token lifetime + revocation when sessions gain write authority (SEC-010).

## Deliverables

- [x] Hardened middleware + API function, deployed
- [x] Production secrets configured (fail-closed)
- [x] External verification suite passing
- [x] Security SRS + SOW (this document)
- [x] XSS escaping pass (Phase B) — 132 sites, verified
- [ ] New credentials delivered to Brad / team

## Acceptance Criteria

- No request without valid signed auth reaches any page or data endpoint. (MET)
- Forged or tampered tokens are rejected. (MET)
- No known/default credential grants access. (MET)
- No secrets in source. (MET)
- Free-text data cannot execute script in another user's session. (MET — Phase B verified)

## Self-Check Discipline (per Brad, June 2, 2026)

Every fix in this SOW is paired with an external, runnable verification before it is reported as done — not a code-review assertion. "Coding without self-checking" is treated as incomplete work. The Phase A nine-test suite is the template; Phase B must add an XSS payload test.
