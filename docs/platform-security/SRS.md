# Software Requirements Specification: Platform Security & Authentication

**Project:** Pier Foundations -- PF Operations Platform (cross-cutting security)
**Version:** 1.0
**Date:** June 2, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Auth hardening built, deployed, and verified June 2, 2026. XSS hardening pending.

## 1. Overview

The PF Operations Platform holds real business-critical data: bid pricing, project financials (paid/unpaid/retainage), KPIs, and ~184 General Contractor contact records. It is served as a single-page app on a public Cloudflare Pages URL (`pf-platform.pages.dev`). Because the URL is publicly reachable, authentication and output safety are the controls that keep that data private.

This SRS captures the security requirements the platform must meet. It was created after a three-agent code triple-check (correctness, security, QA) on June 2, 2026 surfaced two blocking authentication CRITICALs in the original implementation.

## 2. Functional Requirements

### 2.1 Authentication

| # | Requirement | Status |
|---|-------------|--------|
| AUTH-1 | All page routes and all `/api/*` routes require authentication before serving any content | DONE |
| AUTH-2 | Authentication is enforced server-side (Cloudflare Pages Functions middleware), with no client-side-only gate that can be bypassed | DONE |
| AUTH-3 | Initial login uses HTTP Basic Auth; on success the server issues a session cookie | DONE |
| AUTH-4 | The session token is cryptographically signed (HMAC-SHA256) so it cannot be forged by hand-crafting its contents | DONE |
| AUTH-5 | Token verification recomputes and constant-time-compares the signature BEFORE trusting any payload field | DONE |
| AUTH-6 | The session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, with a 24-hour expiry | DONE |
| AUTH-7 | Credentials and the token-signing secret come ONLY from environment variables; if any is missing the platform fails closed (HTTP 500), never falling back to a hardcoded credential | DONE |
| AUTH-8 | Default/known credentials are never shipped in source; the working password is rotated whenever it may have been exposed | DONE (rotated June 2) |

### 2.2 Data Exposure & Transport

| # | Requirement | Status |
|---|-------------|--------|
| DATA-1 | Authenticated responses are not cached by shared CDNs (`Cache-Control: private, no-store`) | DONE |
| DATA-2 | No wildcard CORS (`Access-Control-Allow-Origin: *`) on any endpoint serving business data | DONE |
| DATA-3 | No live secrets (API keys, client secrets, tokens) are committed to the repository; all are read from env vars | DONE (verified) |
| DATA-4 | Internal error details are not returned to the client; generic messages only, details logged server-side | DONE |

### 2.3 Output Safety (XSS)

| # | Requirement | Status |
|---|-------------|--------|
| XSS-1 | All data-derived values (especially free-text SharePoint fields: project names, GC contacts, notes) are HTML-escaped at every `innerHTML` insertion point | PENDING |
| XSS-2 | A single shared escape helper is used uniformly across all modules | PENDING |
| XSS-3 | A Content-Security-Policy header is evaluated as defense-in-depth | BACKLOG |

### 2.4 Future Write Endpoints (not yet built)

| # | Requirement | Status |
|---|-------------|--------|
| CSRF-1 | Any state-changing endpoint (POST/PUT/DELETE) requires a CSRF token in addition to `SameSite=Strict`, and verifies `Origin`/`Referer` | BACKLOG (no write endpoints exist yet) |
| TOK-1 | Evaluate shorter token lifetime + server-side revocation/denylist when sessions carry write authority | BACKLOG |

## 3. Non-Functional Requirements

- **Fail closed:** misconfiguration must deny access, never grant it.
- **Verifiability:** every security control must be testable from outside the system (curl/headless), not just asserted in code review.
- **Least disclosure:** error messages, headers, and committed files must not reveal internal structure or secrets.

## 4. Verification Evidence (June 2, 2026)

All tests run against the live production deployment after the hardening deploy:

| Test | Expected | Result |
|------|----------|--------|
| Request with no auth | 401 | 401 PASS |
| Forged token (base64 JSON, no signature) — the original exploit | 401 | 401 PASS |
| Forged token with fake signature | 401 | 401 PASS |
| Old (rotated-out) password | 401 | 401 PASS |
| New password via Basic Auth | 200 + signed Set-Cookie | PASS |
| Reuse legitimately-issued signed cookie | 200 (session persists) | PASS |
| Tamper one character of a valid signed cookie | 401 (signature catches it) | PASS |
| Authenticated page serves real platform HTML | platform `<title>` + live-data.js | PASS |
| `/api/data` without auth (was wide open before) | 401 | 401 PASS |

## 5. Traceability to Findings

| Finding (CODE-REVIEW-FINDINGS-2026-06-02) | Requirement | Status |
|---|---|---|
| SEC-001 forgeable token | AUTH-4, AUTH-5 | FIXED |
| SEC-002 open `/api/` + CORS `*` | AUTH-1, DATA-2 | FIXED |
| SEC-003 hardcoded credential fallback | AUTH-7, AUTH-8 | FIXED |
| SEC-004 stored XSS via raw innerHTML | XSS-1, XSS-2 | PENDING |
| SEC-005 financial data cacheable | DATA-1 | FIXED |
| SEC-008 verbose error leak | DATA-4 | FIXED |
| SEC-006 no CSRF | CSRF-1 | BACKLOG (no write endpoints) |
| SEC-007 brittle .env parsing | (pipeline hardening) | BACKLOG |
| SEC-009 file IDs in source | (config hygiene) | BACKLOG |
| SEC-010 no token revocation | TOK-1 | BACKLOG |
