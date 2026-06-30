# Statement of Work: Maintenance Tracker

**Project:** Pier Foundations -- Maintenance Tracker (Interactive Checklist + Manual Items)
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed (commits bd1c428, f226c52)

---

## 1. Purpose

Maintenance items and future issues were being noted inside daily reports but never rolled up anywhere, so nothing tracked whether they actually got fixed. This work gathers every maintenance item and future issue from all daily reports into one interactive checklist, grouped by equipment category, lets the crew check items off with the completion recorded on the server, and lets the team add maintenance items by hand. Maintenance also gets its own top-level Field Operations nav item.

## 2. Scope

### In Scope
- Promote Maintenance to its own top-level Field Operations nav item
- Compile `maintenance[]` and `futureIssues[]` from ALL daily reports into one checklist
- Group by the 5 fixed categories (Excavator, Mast, Vibro, Drill, Rental Equipment) plus a Future Maintenance Items section
- Show source project, date, and foreman on each daily row
- Check-off persistence via new KV endpoint `functions/api/maintenance-status.js`
- completedAt and completedBy set server-side from the session
- Completed items fade and collapse into a "Completed" sub-group per category
- Manual items via new KV endpoint `functions/api/maintenance-manual.js` (add and soft-delete)
- Manual Add form, manual items merge into the same checklist, remove only on manual rows
- field_ops RBAC, prototype-pollution guards, caps, escaped output

### Out of Scope
- Hours-based maintenance scheduling and alerts (that lives in Equipment Tracker)
- Editing a daily report's maintenance note from the checklist
- Parts ordering or work-order workflow
- Any financials

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Field Foreman / Operator | Checks off maintenance, adds manual items |
| End User | Jonathan Reinking | Tracks fleet maintenance status |
| Decision Maker | Brad Reinking | Reviews maintenance health |
| Builder | Peter (AI COO) | Designs, builds, and maintains the feature |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Top-level nav item | In-platform nav | Maintenance, out of Daily Reports group |
| 2 | Grouped checklist | In-platform HTML | Daily + manual items by category |
| 3 | Status endpoint | `functions/api/maintenance-status.js` | KV check-off, server-set completion |
| 4 | Manual endpoint | `functions/api/maintenance-manual.js` | KV add and soft-delete |
| 5 | Manual Add form | In-platform HTML | Add a maintenance item by hand |
| 6 | SRS + SOW + Manual | .md files | Documentation |

## 5. Success Criteria

- Every maintenance item and future issue from the daily reports shows in one place, grouped by equipment
- The crew can check an item off and it stays checked, with who and when recorded by the server
- The team can add maintenance items that did not come from a daily report
- Completed items fade and collapse so the view stays clean
- field_ops users see no financials, and keys are safe from pollution

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|--------------------|
| SOW + SRS | 15 min |
| Promote nav + compile checklist | 20 min |
| Build status endpoint (KV) | 15 min |
| Build manual endpoint (KV) + Add form | 20 min |
| Triple-check (security, qa, reviewer) | 15 min |
| Deploy | 10 min |

## 7. Assumptions

- Daily reports carry `maintenance[]` and `futureIssues[]`
- The 5 categories come from `functions/api/field-lists.js` MAINTENANCE_CATEGORIES
- KV is the right store for check-off state and manual items
- Manual items follow the `precon-manual-bid.js` pattern
- completedAt, completedBy, createdAt, createdBy must come from the session, never the client

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Manual item key collides with a daily row | Distinct id scheme (`mm_<n>` vs `reportId::djb2`), no collision |
| Client spoofs who completed an item | completedBy and completedAt set server-side |
| Prototype pollution via crafted keys | Prototype-pollution guards on keys |
| Checklist clutters as items pile up | Completed items fade and collapse per category |
| Oversized payloads | Body and entry caps on both endpoints |

## 9. Verification Evidence

- Commits bd1c428 and f226c52, LIVE
- Triple-checked: security rated STRONG, qa 778 passed 0 failed, reviewer approved

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Categories:** `functions/api/field-lists.js` MAINTENANCE_CATEGORIES
- **Status:** `functions/api/maintenance-status.js` (KV, `{done, completedAt, completedBy}`)
- **Manual:** `functions/api/maintenance-manual.js` (KV, add + soft-delete, ids `mm_<n>`)
- **Daily row key:** `reportId::djb2(fields)`
