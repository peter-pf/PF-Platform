# Software Requirements Specification: Maintenance Tracker

**Project:** Pier Foundations -- Maintenance Tracker (Interactive Checklist + Manual Items)
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: v1.0 -- Built and deployed (commits bd1c428, f226c52). LIVE.

## 1. Overview

The Maintenance Tracker pulls every maintenance item and future issue out of all daily reports and turns them into one interactive checklist, grouped by equipment category. The crew can check items off, completion is recorded on the server, and finished items fade and collapse out of the way. The team can also add maintenance items by hand that did not come from a daily report. Maintenance is now its own top-level Field Operations nav item.

## 2. Functional Requirements

### 2.1 Navigation

| Item | Specification |
|------|---------------|
| Placement | Top-level Field Operations nav item, like Projects |
| Change | Promoted out of the Daily Reports group into its own item |

### 2.2 Checklist Compilation

| Item | Specification |
|------|---------------|
| Sources | `maintenance[]` and `futureIssues[]` from ALL daily reports |
| Grouping | Sectioned by the 5 fixed categories plus a Future Maintenance Items section |
| Categories | Excavator, Mast, Vibro, Drill, Rental Equipment |
| Category source | `functions/api/field-lists.js` MAINTENANCE_CATEGORIES |
| Row detail | Each row shows source project, date, and foreman |

### 2.3 Check-Off Behavior

| Item | Specification |
|------|---------------|
| Endpoint | `functions/api/maintenance-status.js` (KV) |
| Stored value | `{done, completedAt, completedBy}` |
| Server-set fields | `completedAt` and `completedBy` are set from the session, not the client |
| Completed display | Completed items fade and collapse into a "Completed" sub-group per category |
| Daily row itemKey | `reportId::djb2(fields)` |

### 2.4 Manual Items

| Item | Specification |
|------|---------------|
| Endpoint | `functions/api/maintenance-manual.js` (KV), add and soft-delete remove |
| Modeled on | `precon-manual-bid.js` |
| Add form fields | Maintenance type (the 5 categories), Issue type (Failure or Maintenance), description, optional equipment or subcategory |
| Item id | `mm_<n>` |
| Merge | Manual items merge into the same grouped checklist |
| Check-off | Via `maintenance-status`, no key collision with daily rows |
| Remove | Appears only on manual rows (tagged "manual"), soft-delete |
| Server-set fields | `createdBy` and `createdAt` are set from the session |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Storage | KV for status and manual items |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Crew checks off items on a phone |
| Clutter | Completed items fade and collapse, in line with Brad's "completed items fade out" preference |

## 4. Security and RBAC

| Control | Specification |
|---------|---------------|
| Role | field_ops on both endpoints, enforced at the gate and inside the handler |
| Key safety | Prototype-pollution guards on keys |
| Caps | Body and entry caps on both endpoints |
| Category | Validated to the 5 fixed categories |
| Financials | Zero |
| Output | All output escaped |
| Server authority | completedAt, completedBy, createdAt, createdBy all set server-side |

## 5. Verification Evidence

| Claim | Evidence |
|-------|----------|
| Built and deployed | Commits bd1c428 and f226c52, LIVE |
| Security | Triple-check rated STRONG |
| QA | qa suite 778 passed, 0 failed |
| Reviewer | Approved |

## 6. Architecture

| Component | File | Role |
|-----------|------|------|
| Categories | `functions/api/field-lists.js` | MAINTENANCE_CATEGORIES (the 5) |
| Status endpoint | `functions/api/maintenance-status.js` | KV check-off, server-set completedAt/completedBy |
| Manual endpoint | `functions/api/maintenance-manual.js` | KV add and soft-delete, server-set createdAt/createdBy |
| Source data | Daily reports | `maintenance[]` and `futureIssues[]` |

## 7. Integration Points

| System | Integration | Priority |
|--------|-------------|----------|
| Daily Reports | Source of maintenance and future-issue items | Required |
| Field Operations nav | New top-level item | Required |
| Equipment Tracker | Shares the equipment domain | Related |

## 8. Open Questions (For Brad/Jonathan)

1. Should a checked-off item ever auto-archive after a set time, or stay in the Completed sub-group?
2. Do we want maintenance completion to feed back into the Equipment Tracker maintenance schedule?
3. Should overdue maintenance items surface an alert, the way Equipment Tracker alerts on service due?
4. Are the 5 categories final, or should the list grow as the fleet grows?
