# Preconstruction - Action Items + Bid Calendar

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Build-out section 3 (action items with completion log, feeding an auto
bid calendar). Builds on the existing precon pipeline (not rebuilt). Email is on
hold: no mail anywhere.

## A. Action items (write-back, date-based)

### Data model
KV single-list overlay (like bd_overlay_v1), key `precon_actions_v1` on
env.PF_SCHEDULE:
```
{ actions: [ {
    id, title, dueDate, assignee, linkedBidId,
    priority,            // DERIVED from dueDate: overdue | due-soon | upcoming | none
    status,              // 'open' | 'done'
    note,
    createdBy, createdAt, updatedAt,
    completedBy, completedAt,   // set from the SESSION on complete
    deleted              // soft delete (kept for audit, hidden in UI)
  } ], meta:{updated} }
```

### Priority rule (derived, never hardcoded)
`priority = derivePriority(dueDate, now)`:
- no/blank/unparseable dueDate -> `none`
- dueDate < today              -> `overdue`
- dueDate within 7 days        -> `due-soon`  (DUE_SOON_DAYS = 7, v1 default)
- otherwise                    -> `upcoming`

Priority is recomputed on every write AND refreshed on every GET, so it never
goes stale as time passes. The client uses the same rule so the UI and server
agree.

### Endpoint
`platform/functions/api/precon-action.js`:
| Method + action | Purpose |
|---|---|
| `GET` | list non-deleted actions, priority refreshed |
| `POST {action:'create'}` | add (title required; dueDate optional) |
| `POST {action:'complete'}` | status done + completedBy/At from session |
| `POST {action:'reopen'}` | back to open, clears completion |
| `POST {action:'update'}` | edit title/dueDate/assignee/linkedBidId/note/status |
| `POST {action:'delete'}` | soft delete (deleted=true) |

`requireArea(session, 'preconstruction')` on GET and POST + `/api/precon-action
-> preconstruction` in areaForPath. admin/partner/business_dev allowed; field_ops
+ unauth -> 403. Inputs validated + length-capped, angle brackets stripped, audit
+ completedBy/At server-set, KV read-modify-write race documented. No mail, no
outbound fetch.

### UI
- Module `mod-precon-actions` (nav: Preconstruction > Action Items & Calendar),
  tab 1 "Action items": add form, Open list (sorted by due date, priority chip),
  Completed list (faded, shows who closed it and when). Complete / Reopen /
  Delete per item. All data via window.esc.

## B. Bid calendar (derived agenda)
- Tab 2 "Bid calendar": merges (1) open bid Due Dates from window.PF_PRECON
  (open buckets only - excludes awarded + not_awarded) and (2) open action items
  with a due date. Sorted ascending, grouped Overdue / This week / Later. Blank
  or unparseable dates are skipped (no crash). Read-only; no new ingest.

### bid id linkage
An action item may carry `linkedBidId` using the same scheme as the activity log
+ precon-pipeline (Project Number when real, else hash of name+GC).

## Gating
- `/api/precon-action` -> preconstruction (field_ops BLOCKED). No new data feed
  (the calendar reads the already-loaded precon-pipeline.js + the action items KV).

## Verification (2026-06-24)
- `node migrations/test-rbac.mjs`: 565 pass / 0 fail (precon-action ->
  preconstruction, field_ops + unauth denied on GET+POST, source-level
  requireArea, derives priority, NO mail / NO fetch).
- Headless precon-action test: 23 pass / 0 fail (create -> list; complete sets
  done + completedBy/At from session; reopen; update; soft delete hides; two
  items independent; field_ops + no-session -> 403; validation missing title /
  bad status / bad action / missing id -> 4xx not 500; XSS stripped; blank due
  date -> priority none, no crash).
- Calendar derivation sample: Overdue (d=-3), This week (d=2, d=5), Later (d=20),
  blank + bad dates skipped without crash.
- Deploy OK; gate 401 with no creds on /, /api/precon-action (GET + POST).

## Not exercised live
- A real authenticated precon POST/GET against the DEPLOYED endpoint (env cannot
  mint a live pf_session; shared Basic-Auth gate). Proven headlessly against the
  real Function code; the deployed gate 401s unauth.
