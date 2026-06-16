# Crew Scheduling — Software Requirements Specification (SRS)

**Module:** Crew Scheduling (`platform/schedule.html`, embedded as `#mod-schedule`)
**Version:** 1.0
**Date:** 2026-06-15
**Owner:** Peter (AI COO)
**Status:** Complete — deployed; passed triple-check; gate verified.

---

## 1. Purpose
Give Pier Foundations one editable, persisted crew schedule: a crew-lane Gantt of jobs and mobilizations, with a capacity/utilization read that signals when a window needs a second crew. The same data drives read-only summary widgets on the main dashboard and the CEO dashboard, so everyone sees one source of truth.

## 2. Scope
- An interactive crew-lane Gantt editor (`schedule.html`) for jobs, mobilizations, and crews.
- Server-side persistence in Cloudflare KV via `/api/schedule` (GET load, PUT/POST save), behind the existing platform auth gate.
- An embedded seed (`data/schedule-seed.js` / `window.SCHEDULE_SEED`) used only as a fallback when KV has no stored state and is unreachable.
- Live read-only summary widgets that read `/api/schedule`: main dashboard (`#dashScheduleWidget`) and CEO dashboard (`#ceodashScheduleWidget`), both via `window.pfScheduleWidget`.

## 3. Architecture / Data flow
- **Source of truth:** Cloudflare KV (`PF_SCHEDULE`, key `schedule:state:v1`), once seeded.
- **Editor:** `schedule.html` GETs `/api/schedule` on load and PUTs full state on save.
- **Widgets:** the portal's shared `pfScheduleWidget(elId)` fetches `/api/schedule` (one read), then renders a read-only summary into the given element. If the API is unreachable it falls back to `window.SCHEDULE_SEED`; if neither is available it shows a neutral "Schedule unavailable" note.
- **Embedding:** the portal mounts the full editor in `#mod-schedule` as `<iframe data-src="/schedule.html" data-interactive="1">`.

## 4. Data model (`state`)
| Object | Key fields |
|--------|-----------|
| `state` | `version`, `jobs[]`, `crews[]`, `meta` |
| `job` | `id`, `number`, `name`, `crew`, `bucket`, `status_raw`, `city_state`, `gc_name`, `lf`, `columns`, `feed`, `value`, `mobilizations[]`, `done` |
| `mobilization` | `start` (YYYY-MM-DD), `work_days` (>=1), `columns`, `label`, `done` |
| `crew` | `id`, `lead`, `equipmentSet`, `men`, `activeFrom`, `active` |
| `meta` | `source`, `work_week`, `buckets[]`, `updated` (ISO version stamp for optimistic concurrency) |

## 5. Functional requirements
1. Editable crew-lane Gantt: jobs placed in crew lanes, each with one or more mobilizations (start date + working days + columns).
2. Load existing state from KV on open; if none, seed-bootstrap; show load source ("Loaded saved schedule" vs "Loaded seed schedule").
3. Save full state back to KV (`PUT`/`POST /api/schedule`); on save the server returns the normalized state and the client re-applies it so UI and KV cannot drift.
4. Capacity / utilization panel: for each active window, demand = sum of clamped working days; raises an "Add-a-crew signal" when active demand exceeds one lane's capacity.
5. Read-only summary widget reusable by both dashboards from the same `/api/schedule` read.
6. Work week is Mon–Sat (Sunday off), per `meta.work_week`.

## 6. Non-functional requirements
- **One source of truth:** editor and both dashboard widgets read the same `/api/schedule`; no parallel copies of live state.
- **Capacity parity:** the widget's utilization math reconciles to the scheduler's capacity panel (same clamped `workDays >= 1`, same window start = `max(minDate, activeFrom)`), so the two views never disagree.
- **Graceful degradation:** missing KV binding -> editor uses embedded seed (read-only), save fails loud (503) rather than silently dropping; unreadable stored state -> fall back to seed.
- **Output safety:** every value is `esc()`-escaped on render; the API also strips angle brackets from free-text fields (belt-and-suspenders).
- **Light theme + amber accent**, consistent with the platform.

## 7. Security / Auth
- All routes — `/`, `/schedule.html`, and `/api/schedule` — sit behind the server-side auth gate in `functions/_middleware.js`; unauthenticated requests get 401 before reaching any handler.
- `/api/schedule` is a write endpoint and is defense-in-depth hardened: payload size cap (256 KB), strict JSON parse in try/catch (malformed -> 400), schema validation + field-by-field rebuild (unknown keys dropped), caps on jobs (500) / mobilizations (40) / crews (20) / string length (200), no `eval`/`Function`, generic error messages with details logged server-side, and `Cache-Control: private, no-store` responses.
- Optimistic concurrency: `meta.updated` is a version stamp; a save whose base stamp is older than KV's current stamp is rejected with 409 so a second editor cannot clobber the first.

## 8. Acceptance criteria
- Editor loads state from KV, edits persist across reload, and the save round-trips the normalized state.
- Both dashboard widgets show a live read-only summary sourced from `/api/schedule`.
- Utilization on the widgets matches the scheduler's capacity panel.
- Auth gate returns 401 on `/`, `/schedule.html`, and `/api/schedule` without credentials.

## 9. Verification evidence (2026-06-15)
- Triple-check: security PASS (0 findings), QA 58/58, correctness ship-with-fix (utilization math reconciled to the capacity panel).
- Deployed.
- Gate verified: 401 on `/`, `/schedule.html`, and `/api/schedule` without credentials.

## 10. Open items / Phase 2
- Per-mobilization drag-resize ergonomics if requested by the field.
- Optional: surface the "Add-a-crew signal" on the dashboards (currently editor-only).
