# HR Module -- Fail-Closed Hardening + Production Restore (Addendum)

**Parent docs:** `docs/hr-module/SRS.md` + `SOW.md` + `MANUAL.md` + `SRS-SOW-live-data-wiring-20260724.md`
**Version:** 2.2 (addendum)
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** COMPLETE -- fail-closed HR restored to production (deployment `e3069755`).

> This addendum records the fail-closed hardening (built and proven 2026-07-24) and its restore to production on 2026-07-28. It supersedes the "DEMO data only" posture in the parent SRS. The RBAC and hosting requirements in the parent docs are unchanged.

---

## 1. Purpose

The HR module previously shipped a fabricated demo roster that could paint as if it were real when the data feed failed. This addendum makes the module **fail closed**: on any data-load failure it shows an honest error and an empty table, and it never renders a fabricated roster. Sensitive fields never serialize. The corrected module was restored to production.

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| FR-1 | On a successful load, show the real roster from the HR data endpoint | DONE |
| FR-2 | On ANY data-load failure (error, non-ok, empty), show an honest error state and an empty table -- never a fabricated roster | DONE |
| FR-3 | With no active session, show a "no active session" empty state -- never a fake admin user | DONE |
| FR-4 | Compensation, SSN, and tax fields never serialize to the client under any path | DONE |
| FR-5 | RBAC: admin and hr roles only | DONE |

## 3. What Changed

- The fabricated employees and every array that carried a fabricated name (onboarding, PTO, reviews, org chart heads, training) were purged to empty. Two embedded name strings were neutralized to generic wording.
- The load path now populates the table ONLY on an authenticated real roster. Any failure sets an error state, keeps the roster empty, and renders an error banner with a retry, plus divide-by-zero guards on the summary counts.
- The provenance banner stays honest: green for live data, red for error, orange for no session.
- The HR data endpoint whitelists safe fields only, so compensation, SSN, and tax cannot leak by construction.

## 4. Non-Functional / Security

- Fail closed is the whole point: a forced feed failure renders the error state with zero fabricated names, proven at the rendered-DOM level (not just an RBAC curl pass).
- Server-side RBAC in `functions/_middleware.js` + `functions/lib/auth.js`: a non-hr, non-admin session hitting any `/hr/` path is denied. The nav item being hidden is not the boundary; the direct-URL block is.

## 5. Verification Evidence

| Scenario | Result |
|----------|--------|
| Clean load (admin + real feed) | Real names render, "live directory data" banner. PASS |
| Forced feed 500 | 0 fabricated, 0 real, "Unable to load the directory" + empty table. PASS (this is the defect, now fixed) |
| Feed ok:false / empty | Same honest error state, 0 fabricated. PASS |
| No session | "No active session" empty state, 0 fabricated. PASS |
| RBAC | /hr and /api/hr: unauth 401, admin 200, hr 200, field_ops 403, business_dev 403 |

- Render behavior proven by mocking the feed and asserting the rendered DOM (curl alone cannot prove client render).
- The fail-closed hardening was built and deployed 2026-07-24 (deploy `a3703056`), then restored to production 2026-07-28 (deployment `e3069755`) after a branch-drift check found a pre-fix branch in the working tree.

## 6. Branch-Drift Note (why the restore was needed)

A working-tree branch still carried the OLD fail-open HR file (the fabricated roster as default state). The fail-closed fix was not on that branch. The corrected fail-closed file was restored to production as deployment `e3069755`. Any future HR deploy must come from the fail-closed source, never the pre-fix branch, or it would re-ship the fabricated roster.

## 7. Status Correction

The parent SRS describes "DEMO data only." Current production HR is fail-closed against a live data endpoint: real roster on success, honest error and empty table on failure, no fabricated people, sensitive fields never serialized. Treat this addendum as the current status.
