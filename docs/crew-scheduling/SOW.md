# Crew Scheduling — Statement of Work (SOW)

**Module:** Crew Scheduling
**Version:** 1.0
**Date:** 2026-06-15
**Owner:** Peter (AI COO)
**Status:** Complete — deployed; passed triple-check; gate verified.

---

## Scope delivered
1. Built `schedule.html` — an editable crew-lane Gantt: jobs in crew lanes, mobilizations (start date + working days + columns), plus a capacity/utilization panel that raises an "Add-a-crew signal" when active demand exceeds one lane.
2. Built `functions/api/schedule.js` — Cloudflare KV-backed persistence (key `schedule:state:v1`, binding `PF_SCHEDULE`). GET loads, PUT/POST save; the endpoint sits behind the existing `functions/_middleware.js` auth gate.
3. Built `data/schedule-seed.js` (`window.SCHEDULE_SEED`) — embedded fallback used only when KV is empty and unreachable; KV is authoritative once seeded.
4. Wired the editor into the portal as the "Schedule" module: `index.html` `#mod-schedule` iframe (`data-interactive`).
5. Built the shared read-only summary widget `window.pfScheduleWidget(elId)` (reads `/api/schedule`, one source of truth) and mounted it on the main dashboard (`#dashScheduleWidget`) and the CEO dashboard (`#ceodashScheduleWidget`).

## Work performed — correctness/safety hardening
- Optimistic concurrency: `meta.updated` version stamp; stale saves rejected with 409 so a second editor can't clobber.
- Save round-trips the server-normalized state back to the client (no UI/KV drift).
- Schema validation rebuilds state field-by-field, drops unknown keys, and caps jobs/mobilizations/crews/string length.
- Fail-loud on missing KV binding (503 on save; read-only seed fallback on GET).
- Utilization math on the widget reconciled to the scheduler's capacity panel (same clamped `workDays >= 1`, same window start).

## Verification
- Triple-check: **security PASS (0 findings)**, **QA 58/58**, **correctness ship-with-fix** (the fix being the utilization reconciliation, now applied).
- Auth gate: **401** returned on `/`, `/schedule.html`, and `/api/schedule` without credentials.
- Deployed.

## Out of scope / Phase 2
- Drag-resize ergonomics on mobilization bars.
- Surfacing the capacity "Add-a-crew signal" on the dashboards (currently editor-only).
- Auto-linking schedule mobilizations to live GUHMA production as days are logged.
