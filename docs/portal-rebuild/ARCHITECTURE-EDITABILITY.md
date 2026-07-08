# Framework: Editable Portal + Write-Back + Embedded Files

Brad (2026-06-17): wants the platform to be (1) EDITABLE — make updates directly in the portal, then Peter updates the backend documents to match; and (2) able to EMBED files directly in the portal in certain spots instead of just linking out. Both are feasible. Details TBD with Brad.

## 1. Editable portal with write-back — FEASIBLE
Today the platform is READ-ONLY: data flows SharePoint → sync scripts → generated JS (`data/*.js`) → display. To make it editable we add a WRITE path.

**Proven pattern we already have:** the Crew Schedule is editable + persisted via a Cloudflare Pages Function (`functions/api/schedule.js`) backed by Cloudflare KV (optimistic concurrency). Same shape extends to any editable area.

**The one decision that governs everything — SOURCE OF TRUTH per data type:**
- **Recommended:** the PORTAL becomes the system of record for editable fields (stored in Cloudflare KV/D1, behind the existing auth gate). Peter then writes the change BACK to the backing SharePoint/Excel document so the doc stays current as an OUTPUT. This avoids the two-way-edit conflict (portal edit vs someone editing the Excel directly).
- Write-back to SharePoint is feasible via Microsoft Graph (we hold Files.ReadWrite.All + Sites.ReadWrite.All). Graph's Excel API can PATCH specific cells/ranges; for formula-heavy workbooks (e.g. Turnover Budget) write only to designated INPUT cells, never formula cells — or regenerate a clean output copy rather than editing the live workbook.

**Build pieces:** edit UI per field/section → POST to a Pages Function → persist to KV/D1 (source of truth) → Function calls Graph to update the SharePoint doc → audit log of who/what/when (this also feeds Brad's project-log / Communications requirement). Roll out incrementally, section by section, not all at once.

**Risks to manage:** conflict/source-of-truth (solved by "portal is SOR, doc is output"), validation per field, write-back to complex Excel formulas (write input cells only), and auth (write endpoints stay behind the gate; Graph creds server-side in CF env).

## 2. Embed files in the portal (vs links) — FEASIBLE
Instead of opening SharePoint in a new tab, render the file inside the portal in "certain locations."
- **Pattern we already have:** the platform embeds some docs via `<iframe class="doc-frame">`. Extend by proxying the SharePoint file bytes through a Cloudflare Function (authenticated via Graph, so the file stays behind our gate) and rendering inline — PDF.js / `<embed>` for PDFs, `<img>` for photos.
- Good first targets: the COI PDF, invoices on the Budget vs Actual lines, approved drawings, project photos.
- Tradeoffs: file size/performance and the auth proxy; fine for targeted spots, not for embedding everything.

## Confirmed direction & phasing (Brad 2026-06-17)
Goal: the whole team lives in the portal. Jonathan, Derek (primarily for NEW OPPORTUNITIES), and Brad enter information directly into the portal, and the portal BACKFILLS the spreadsheets. Confirmed feasible.

**Two-phase rollout (Brad's sequencing, matches the recommendation above):**
1. **Phase 1 — Excel → Portal (now):** pull from the Excel masters (Bid Log, Project Master, Turnover Budget, Timesheets, etc.) to POPULATE the portal. This is what we are building today. Get it all working and accurate first.
2. **Phase 2 — Portal → Excel (after Phase 1 is solid):** flip the flow. New opportunities and updates get entered IN the portal, and Peter writes them BACK into the source spreadsheets via Microsoft Graph (e.g., a new opportunity form appends a row to the Project Bid Log and creates the project record; project edits backfill the Project Master). At that point the PORTAL is the system of record and the spreadsheets become the synced output/backup.

**Key intake example:** "New Opportunity" entry in the portal (Jonathan/Derek) → saved in the portal store → Peter appends the row to `Project Bid Log.xlsx` (correct tab: Agg vs Helical) and seeds the project record. Same write-back pattern for project-record edits → Project Master, and Budget vs Actual edits → Turnover Budget input cells.

Possibility confirmed: yes (Graph Excel write API + our ReadWrite permissions). Set-up: yes, as Phase 2, built incrementally on the proven schedule-style editable+persist pattern, with an audit log of every change.

## Project document browser — mirror SharePoint subfolders + inline embed (Brad 2026-06-17)
In each project's section, build a DOCUMENT browser that mirrors the project's SharePoint SUBFOLDER structure (same folders/subfolders as the project folder: 01 Preconstruction, 02 Project Management, 03 Engineering & Design, 04 GC Drawings & Specs, 05 Field, and their subfolders). Navigate the project's files inside the portal by those same subfolders, and view each file EMBEDDED inline (via the live `/api/doc` proxy, same approach confirmed for the contract) rather than bouncing to SharePoint. So the portal becomes the single place to read every project document, organized exactly like the SharePoint folder, always live. (Builds on the embed-file proxy; extends from a single contract embed to a full per-project file tree.)

## Access control — per-user logins + role-based access (Brad 2026-06-18) — CORE D1 REQUIREMENT
Today the portal is ONE shared Basic-Auth password (PF_AUTH_USER/PASS). Brad wants per-user logins with guardrails: different staff see different areas, each with their own password. E.g. a field-ops person logs in with their own password and sees only their section, not the whole portal.

Design (build security-first, server-side enforced — not just hidden in the UI):
- **Users table in D1**: id, name, email, password_hash (salted, e.g. PBKDF2/bcrypt — never plaintext), role, active flag. Per-user passwords; admin can add/disable users.
- **Per-user login replaces the single shared password**: login form → validate against D1 (hashed) → issue a signed session token (reuse PF_TOKEN_SECRET + the existing middleware signed-token pattern). Each user their own session.
- **Roles → allowed modules/sections** (proposed, confirm with Brad):
  - Owner/Admin (Brad): full access + all edit + user management.
  - Partner (Jonathan, Derek): full view; edit their domains (estimating/BD/PM).
  - Field Ops (John Willis + crew, each own password): ONLY Field Operations — their projects field view, daily logs/timesheets entry, safety. NO financials, NO preconstruction, NO contracts.
  - HR (added 2026-07-08): the dedicated `hr` role. Access to the HR module ONLY (the `hr` area — employee records, onboarding, policies, time off, performance, org chart, compliance). TIGHT scope confirmed by Melanie: **admin + `hr` role ONLY — partners are NOT included** (HR data is confidential). The `hr` role holds NO other area (no financials, precon, contracts, field ops), enforced server-side + default-deny by direct URL.
  - (future) Office/Accounting; limited external Agency role (the agency layer noted earlier).

**Area map additions (2026-07-08, `functions/lib/auth.js`):**
- `ROLES` now includes `hr` (alongside admin, partner, business_dev, field_ops).
- `AREA_ROLES.hr = ['admin', 'hr']` — the HR module area. Served same-origin at `/hr/`; `areaForPath()` maps the entire `/hr/` prefix to the `hr` area (placed before the static-asset allow-list so no `/hr/` path leaks to the permissive `general` bucket used by `/design-studio/`). Fails closed: a non-hr, non-admin session hitting `/hr/` is denied (302 → `/denied.html` for HTML navs, 403 JSON for fetch).
- `AREA_ROLES.crm = ['admin', 'partner', 'business_dev']` — pre-declared for the FUTURE CRM module (agreed target scope). No `/crm/` path is mapped yet, so it is inert until the CRM module is wired; default-deny applies meanwhile.

**NOTE / gap flagged for provisioning:** the D1 schema CHECK constraint in `platform/migrations/0001_init.sql` is `CHECK (role IN ('admin', 'partner', 'field_ops'))` — it predates both `business_dev` and `hr`. Before an `hr` (or `business_dev`) user can be inserted into the live D1 `users` table, that CHECK must be widened to include the new roles. This does NOT affect the current HR module, which is DEMO-only (no live backend); it is a note for whoever provisions the first HR user.
- **Enforcement is server-side**: the Functions check the user's role before serving data or accepting an edit (a field-ops user can't reach financial endpoints even by URL). Reuse the financials-stripped field-view pattern for what field-ops sees.
- **Audit**: every edit logged with the user id (ties to the project-log requirement).
NEEDS FROM BRAD before building: the staff list + which role each person gets, and confirmation of the role→access map above.

## Status
Framework agreed; Phase 1 (Excel→portal population) in progress now. Phase 2 (portal→Excel backfill) starts once Phase 1 is solid. Start the write-back with one section (e.g. New Opportunity intake) as the proof, then expand.
