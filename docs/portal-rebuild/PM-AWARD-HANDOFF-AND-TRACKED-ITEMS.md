# Project Management - Award handoff + per-project tracked items

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Build-out section 4 (Project Management). Most PM already existed; this
slice fills the two real gaps found in the audit. Email on hold (no mail).
Budget-vs-costs deferred (skipped).

## Audit (what existed vs what was missing)
| Spec section 4 item | Status | Action |
|---|---|---|
| Project dashboard (Project # - Name), per-project records (openProjectRecord/POET), project financials by number | EXISTS | skip |
| Awarded Projects index (mod-awarded-projects), precon awarded/not-awarded fork | EXISTS | skip |
| Current vs Completed split by year | EXISTS (Active Projects Summary = current; Projects Completed = mod-projecthistory, project-history.js carries a `year` field, 2025 etc.) | skip |
| PF Project Schedule | EXISTS (schedule-data.js + mod-schedule + Awarded Projects Schedule) | skip |
| **Award -> PM handoff (assign next project number, carry BD/precon history)** | **MISSING** | **built** |
| **Project Dashboard tab col-C tracked items per project** | **MISSING** (no builder read the "Project Dashboard" tab) | **built** |

## A. Award -> PM handoff
When a precon bid is awarded (the existing pipeline-state fork), it can be handed
to PM: assign the next project number and create a PM project carrying the
precon/BD history.

### Project number scheme (v1, confirm with Brad)
`YY-NNN` (e.g. 26-018). The NEXT number is the max existing NNN for the CURRENT
year + 1, zero-padded to 3, derived across BOTH the existing base numbers the
client sends (from project-master.json / awarded-projects.js) AND numbers this
overlay already assigned (so re-runs never collide). A new calendar year restarts
at 001. The live space today runs 26-001..26-017, so the next is 26-018.

### Data model
KV overlay, key `pm_projects_v1` on env.PF_SCHEDULE:
```
{ projects:[{ id, projectNumber, name, gc, value, status:'current'|'completed',
  sourceBidId, sourceOppId, history, awardedAt, awardedBy, createdAt, updatedAt,
  completedBy?, completedAt? }], meta:{updated} }
```
Idempotent: if a `sourceBidId` already has a PM project, the existing record is
returned (an award is never numbered twice). `sourceBidId` uses the same bidLogId
scheme as precon-pipeline + the activity log (Project Number else hash of
name+GC), so the precon/BD history links by id and is never lost.

### Endpoint
`functions/api/pm-project.js`: GET list + POST create/update/complete.
`requireArea(session, 'preconstruction')` on GET and POST + `/api/pm-project ->
preconstruction` in areaForPath. admin/partner/business_dev allowed; field_ops +
unauth -> 403. Inputs validated + capped, angle brackets stripped, awardedBy +
audit server-set, KV race documented. No mail, no outbound fetch.

### UI
- Module `mod-pm-handoff` (nav: Project Management > Projects > Award to PM
  Handoff): lists awarded bids in "Awaiting handoff" (Create PM project button ->
  assigns number) and "Handed to PM" (shows the assigned number). Data via esc.

## B. Project Dashboard tracked items per project
The "Project Dashboard" tab is TRANSPOSED: each project is a column (row 2 = PF
Project Number), and the ~125 tracked items are the rows, grouped by a col-A
section marker (General Info, PF Team, Contract Info, Engineering & Design,
Project Safety, Site Readiness, Equipment, Material, QA / QC, Project Closeout).

- Builder `sync/build-project-dashboard.py` -> `data/project-dashboard.js` =
  `window.PF_PROJECT_DASHBOARD { projects:[{projectNumber, name, sections:[{name,
  items:[{label,value}]}]}], sections, generated, source, sourceTab }`. 15
  projects, 10 sections, ~100+ tracked items each (only items with a value shown).
- **Financials OMITTED:** the "Financials / Invoicing / Pay Application" section
  (G702/G703, retainage billing/paid, invoice dates) is deliberately NOT ingested
  (field_ops sees zero financials + budget-vs-costs deferred). Recorded in
  `_omitted`. No invented fields.
- UI: the tracked-items checklist is appended to the existing project record view
  (openProjectRecord + the POET record), grouped by section, showing what is
  needed to complete the project. Data via esc.

### Gating
- `/data/project-dashboard.js` -> financials (PROJECT-level: admin/partner/
  business_dev; field_ops BLOCKED). The Financials section is omitted at ingest.

## Verification (2026-06-24)
- Project-dashboard builder STDOUT: 15 projects, 10 sections (Financials omitted),
  ~100+ items each, OMITTED = Financials section, 0 financial-invoicing items.
- `node migrations/test-rbac.mjs`: 597 pass / 0 fail (pm-project ->
  preconstruction, field_ops + unauth denied; derives YY-NNN + idempotent +
  NO-mail/NO-fetch source checks; project-dashboard.js -> financials, field_ops
  denied; Financials section omitted + no G702/G703 leak).
- Headless pm-project test: 21 pass / 0 fail (award -> next number 26-018 from
  existing max 26-017; second -> 26-019; idempotent re-award returns existing; new
  year resets to 27-001; complete/update; field_ops + no-session 403; validation
  4xx not 500; XSS stripped; overlay-only fallback -> 26-001).
- Project-number derivation: given 26-001..26-017 the next is 26-018; year 27
  resets to 27-001.
- Deploy OK; gate 401 with no creds on /, /data/project-dashboard.js,
  /api/pm-project (GET + POST).

## Not exercised live
- A real authenticated PM POST/GET against the DEPLOYED endpoint (env cannot mint
  a live pf_session; shared Basic-Auth gate). Proven headlessly against the real
  Function code; the deployed gate 401s unauth.

## Confirmed
- No mail sent, no mail API called anywhere in this slice.
- Budget-vs-costs NOT built (deferred); the Project Dashboard Financials section
  is omitted from ingest.
