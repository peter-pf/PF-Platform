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

### Phase B — Output safety / XSS (PENDING)

7. **Escape all data at `innerHTML` sites (SEC-004 / XSS-1, XSS-2).** ~30 render sites in `index.html` concatenate SharePoint free-text into `innerHTML` without escaping. Standardize on one escape helper and apply uniformly. Requires its own self-check (inject a `<script>`/`onerror` payload into a test record, confirm it renders inert).

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
- [ ] New credentials delivered to Brad / team
- [ ] XSS escaping pass (Phase B)

## Acceptance Criteria

- No request without valid signed auth reaches any page or data endpoint. (MET)
- Forged or tampered tokens are rejected. (MET)
- No known/default credential grants access. (MET)
- No secrets in source. (MET)
- Free-text data cannot execute script in another user's session. (Phase B — open)

## Self-Check Discipline (per Brad, June 2, 2026)

Every fix in this SOW is paired with an external, runnable verification before it is reported as done — not a code-review assertion. "Coding without self-checking" is treated as incomplete work. The Phase A nine-test suite is the template; Phase B must add an XSS payload test.
