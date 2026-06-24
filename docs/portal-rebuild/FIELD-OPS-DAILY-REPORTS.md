# Field Operations - Daily Reports + crew search + approval status

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Build-out section 5 (Field Operations). Most FO already existed; this
slice fills the gaps. CRITICAL: field_ops sees ZERO financials. This is the FIRST
field_ops WRITE surface. Email on hold (approval is in-platform status only).

## Audit (existed vs missing)
| Spec section 5 item | Status |
|---|---|
| FO mirror of PM with financials stripped (Projects - Field view, no $) | EXISTS (fo-projects-field.js -> mod-fo-projects; auto-stripped derivative) - kept |
| Weekly timesheets + Summary (hours, no $) | EXISTS (timesheets.js -> mod-fo-timesheets / mod-ts-summary) - kept |
| Daily Production, Daily Logs, Safety, Crew Schedule (schedule-field.js, stripped) | EXISTS - kept |
| **Daily Reports (field_ops WRITE)** | **MISSING - built** |
| **Crew SEARCH bar** | **MISSING - built** |
| **Timesheet approval STATUS flow (submitted -> approved -> sent-to-HR)** | **MISSING - built (on the daily report record)** |

Verified field_ops exposes NO financials today: every financial feed/endpoint
resolves to an area field_ops is not in (financials / financials_global /
preconstruction / business_dev / documents / user_admin). The "salary" string in
timesheets.js is the cost-code LABEL "regular salary" (no $ amounts, rates, or pay).

## Daily Reports (write-back)
- `functions/api/daily-report.js`: KV `daily_reports_v1`. GET (list, optional
  ?projectId / ?date) + POST create/update/submit/approve/send-to-hr.
- RBAC: `/api/daily-report -> field_ops` area (admin/partner/business_dev/
  field_ops), so the crew can READ + WRITE their daily reports. The approve and
  send-to-hr transitions are restricted to admin/partner IN the handler (a
  field_ops session can create/update/submit but NOT approve or send to HR).
  field_ops + unauth on a financial feed/endpoint stay 403.
- Inputs validated + length-capped, angle brackets stripped, submittedBy/
  approvedBy/sentToHrBy set from the session, hours sanitized (0-24, no $),
  production counts whole numbers, KV race documented. NO mail, no outbound fetch.

### Daily report v1 fields (ALL "confirm with Brad")
date, project (# - Name), foreman/leader, crew[] (name + hours + optional cost
code - HOURS ONLY, no pay), weather, work completed (narrative), columns
installed today, LF installed today, equipment on site, delays/issues, safety
observations/incidents. Status: draft -> submitted -> approved -> sent-to-HR.

### UI
- Module `mod-daily-reports` (nav: Field Operations > Daily Reports > Submit Daily
  Report): a new-report form (crew rows with hours, no money fields), Save draft /
  Submit for approval, and a recent-reports list with status chips. Owners
  (admin/partner) see Approve + Send to HR buttons (status only, no email). All
  data via window.esc.

## Crew search bar
- Added a search input to the Field Projects view (mod-fo-projects): filters the
  field-safe project list by number / name / city / scope. No financial columns
  exist in that view, so search never exposes $.

## Timesheet approval status flow
- The daily report carries the approval status (submitted/approved/sent-to-HR
  with who+when). The crew hours on daily reports are the source that feeds the
  timesheet view. The "5pm Sunday sent for approval" is the `submitted` ->
  `approved` -> `sent-to-HR` STATUS transition, NOT an email. No mail is sent.

## Field ops RBAC story (what field_ops CAN now do + zero-financials proof)
- NEW: field_ops can READ + WRITE daily reports (`/api/daily-report`, field_ops
  area). This is the first field_ops write surface.
- field_ops can still READ only its operational feeds (fo-projects-field.js,
  production-data.js, progress-data.js, timesheets.js [hours only],
  schedule-field.js [no value/gc]) + /api/schedule (redacted) + /api/me.
- field_ops CANNOT approve/send-to-hr (privileged transition).
- ZERO FINANCIALS: field_ops remains BLOCKED from every financial / BD / precon /
  PM feed and endpoint (pf-dashboard, projects-data, live-data, pricing,
  project-dashboard, project-records, budget-actual, awarded-projects,
  project-master, project-history, bid-log, precon-*, bd-*, opportunities,
  gc-targets, pf-coi, schedule-data/seed, estimate-template; /api/pm-project,
  /api/opportunity, /api/bd-*, /api/precon-*, /api/pipeline-state, /api/data,
  /api/users). Asserted explicitly in test-rbac.mjs.

### Timesheet fields field_ops CAN vs CANNOT see
- CAN: employee name, number, title, status, department, supervisor, days,
  HOURS totals, cost-code labels, per-job hour allocations.
- CANNOT: any dollar amount, pay rate, wage, or salary figure (none exist in the
  feed; verified no literal $N, no numeric rate/wage/pay/salary).

## Verification (2026-06-24)
- `node migrations/test-rbac.mjs`: 661 pass / 0 fail (daily-report -> field_ops
  read+write; approve/send-to-hr privileged; NO-mail/NO-money source checks; the
  full ZERO-financials matrix: field_ops blocked from 24 financial feeds + 10
  endpoints, allowed only its 8 operational surfaces).
- Headless daily-report test: 22 pass / 0 fail (field_ops create/submit/readback,
  submittedBy from session; field_ops approve+send-to-hr -> 403; partner approve /
  admin send-to-hr status only; no-session 403; validation 4xx not 500; XSS
  stripped; hours sanitized [$ stripped, >24 capped]; field_ops blocked from all
  financial feeds + endpoints).
- Timesheet exposure: NO $, no rate/wage/salary numeric; hours only.
- Deploy OK; gate 401 with no creds on /, /api/daily-report (GET + POST).

## Not exercised live
- A real authenticated field_ops POST against the DEPLOYED endpoint (env cannot
  mint a live pf_session; shared Basic-Auth gate). Proven headlessly against the
  real Function code; the deployed gate 401s unauth.

## Confirmed
- No mail sent, no mail API called anywhere. Approval is in-platform status only.
- No financials anywhere in the field_ops surface (feeds, endpoints, daily report,
  timesheet).
