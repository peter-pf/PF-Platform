# HR Module — Live Data Wiring (SRS / SOW)

**Change:** Wire the portal HR module from DEMO data to REAL Pier Foundations directory data.
**Date:** 2026-07-24
**Author:** web-dev (Peter's HR-wiring build)
**Branch:** feature-hr-live-data-20260724
**Status:** Built + self-reviewed. Deployed to PREVIEW only. Production HOLD pending Peter's go (HR-to-prod is Peter's review gate).

---

## 1. Software Requirements Specification (SRS)

### 1.1 Purpose
Replace the HR module's fictional demo employee array with a curated, NON-SENSITIVE
directory roster of the 5 real Pier Foundations employees, served through a
role-gated API, so the Employee Records and directory views reflect reality while
compensation, tax, SSN, benefits, and payment data remain strictly out of the portal.

### 1.2 Scope
- IN scope: employee DIRECTORY + ORG view (name, title, department, location, start
  date, status, work email, work phone).
- OUT of scope (HARD boundary): compensation, bonus, salary, wages, pay rates, tax
  forms (W-4/WH-4/941), SSN, benefits, payment schedules, W9. These stay
  document-only in SharePoint under existing SP permissions and are NEVER surfaced
  in the portal. Multi-state payroll (WI-resident crew working IN/OH/MI) is a CPA
  question, not portal logic — explicitly out of scope.

### 1.3 Functional Requirements
- FR-1: A new endpoint `GET /api/hr` returns the curated roster as JSON
  `{ ok, employees[], meta }`, where each employee has ONLY the safe fields:
  `id, name, title, department, location, startDate, status, workEmail, workPhone`.
- FR-2: `/api/hr` is gated to the `hr` area (roles: admin + hr ONLY) at BOTH the
  middleware (areaForPath) AND in-handler (requireArea). Non-admin/non-hr sessions
  receive 403; unauthenticated requests receive 401. Fails closed.
- FR-3: Output is whitelist-filtered to the safe fields on every response; any other
  key on the source object is dropped before serialization (structural leak guard).
- FR-4: The HR module loads real identity via `GET /api/me` (server reads the
  HttpOnly `pf_session` cookie) instead of sniffing the non-existent `pf_auth_token`
  cookie, then loads the real roster via `GET /api/hr` and replaces its demo array.
- FR-5: If `/api/me` or `/api/hr` is unavailable (true standalone), the module falls
  back to the built-in demo data so the page still renders for local preview.
- FR-6: The Employee Records tab shows a provenance banner stating the data is live
  directory data, that comp/tax/benefits are not shown, and that TBD fields await
  confirmation.

### 1.4 Non-Functional / Security Requirements
- NFR-1 (sensitive boundary): No code path in `/api/hr` reads, computes, or returns
  any sensitive field. The roster is a server-side constant curated only from
  non-sensitive sources (org knowledge, D1 login-email records, role map). No
  Graph/SharePoint/KV/external call is made; no HR document is opened.
- NFR-2 (RBAC): `hr` area = `['admin','hr']`. `/data/hr-roster.json` (the register of
  record) is also classified to the `hr` area as defense-in-depth so the raw file
  cannot be fetched by non-hr roles.
- NFR-3 (D1 constraint): The `users.role` CHECK constraint (originally
  `admin|partner|field_ops`) is widened to include `business_dev` and `hr` via
  migration `0003_widen_role_check.sql`, applied BEFORE any hr/business_dev user is
  seeded. Existing rows/hashes/roles are copied verbatim — no re-seed, no password
  change, no session invalidation.

### 1.5 Data Sourcing & TBDs
Roster curated ONLY from non-sensitive sources. Values not available from a
non-sensitive source are set to `TBD — confirm with Brad/Derek`:
- John Willis — Field Operations Manager, Field Operations, Wisconsin (field crew), workEmail jwillis@pierfoundations.com, Active. startDate/workPhone = TBD.
- Seth Willis — Operator, Field Operations, Wisconsin (field crew), workEmail swillis@pierfoundations.com, Active. startDate/workPhone = TBD.
- Jordan LeMay — Operator, Field Operations, Wisconsin (field crew), workEmail jlemay@pierfoundations.com, Active. startDate/workPhone = TBD.
- Kendall Mavity — Bookkeeping / Billing, Accounting, Indiana, Active. workEmail/startDate/workPhone = TBD.
- Chase Kinsey — Active. title/department/location/workEmail/startDate/workPhone = TBD (no non-sensitive source available).

**TBD list to confirm with Brad/Derek:** all start dates; all work phones;
Kendall Mavity work email; Chase Kinsey title, department, location, work email.

---

## 2. Statement of Work (SOW)

### 2.1 Deliverables
1. `platform/data/hr-roster.json` — curated register of record (safe fields only).
2. `platform/functions/api/hr.js` — role-gated `/api/hr` endpoint (safe fields only, whitelist-filtered).
3. `platform/functions/lib/auth.js` — `/api/hr` -> `hr` area routing + `/data/hr-roster.json` -> `hr` classification.
4. `platform/hr/index.html` — identity via `/api/me`, roster via `/api/hr`, demo fallback, provenance banner, shape/status normalization.
5. `platform/migrations/0003_widen_role_check.sql` — widen users.role CHECK to include business_dev + hr.
6. This SRS/SOW + a training/manual doc.

### 2.2 Verification (self-check)
- JS syntax: hr.js, auth.js, and the HR module inline script all pass `node --check`.
- Whitelist leak test: poison fields (salary/ssn/bonus) injected into a source row are dropped from output (verified).
- Sensitive-term scan: comp/tax/SSN/benefit terms appear ONLY in boundary comments, never as data.
- RBAC: existing test-rbac.mjs = 776 passed (2 pre-existing daily-report failures, unrelated/untouched); 10 targeted HR RBAC assertions pass (admin+hr allowed; partner/business_dev/field_ops/unknown denied; /api/hr and raw roster both gated to hr).

### 2.3 Deploy plan
- Deploy to a PREVIEW branch (NOT production). Verify on preview: /api/hr 401 unauth,
  safe roster to authed admin/hr, 5 real names render, zero sensitive fields in
  response or DOM.
- Apply migration `0003_widen_role_check.sql` to D1 BEFORE seeding any hr user.
- Production deploy is HELD for Peter's one-word go (HR-to-prod is Peter's review gate).
- Should go through pf-devops-verifier before prod.

### 2.4 Rollback
- Revert is a redeploy of the prior production bundle (Cloudflare retains deployments).
- The migration is a pure constraint widening; it does not need rollback (it only
  ADDS permitted role values). No data was altered.
