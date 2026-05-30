# Statement of Work: Project Status Tracking Tool

**Project:** Pier Foundations -- Project Status Dashboard
**Version:** 1.1
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The Project Award SOP describes a "PF Project Master Sheet" with a Project Schedule tab and Project Dashboard tab. The schedule uses color coding by project status and the LF/1000 = working days formula. The dashboard has yellow-highlighted items that need updating per project. Currently this is an Excel spreadsheet that requires manual updates from multiple sources (daily logs, financial data, GC communications).

This tool provides a real-time project dashboard that automatically aggregates data from Daily Logs, Pipeline Management, Equipment Tracker, and Change Orders to show schedule vs. actual, spend vs. budget, completion percentage, and color-coded status for all active projects.

## 2. Scope

### In Scope
- Real-time project dashboard for all active projects
- Schedule tracking (planned vs. actual days, LF progress)
- Budget tracking (turnover budget vs. actual spend)
- Completion percentage (LF installed / total LF)
- Milestone tracking (submittals, mobilization, completion)
- Color-coded status indicators (on track, at risk, behind)
- Individual project detail view
- Portfolio summary view

### Out of Scope
- Financial accounting (in QuickBooks)
- Resource planning/scheduling across projects
- Client/GC portal access
- Earned value management (Phase 2)

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Brad Reinking | Reviews all project statuses |
| End User | Jonathan Reinking | Monitors projects during execution |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Portfolio Dashboard | HTML | All active projects summary |
| 2 | Project Detail View | HTML | Deep dive on individual project |
| 3 | Status Alerts | Notifications | Auto-alerts for at-risk items |
| 4 | Weekly Status Report | PDF | Exportable weekly summary |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Brad can see status of all active projects in under 30 seconds
- Data is current (updated from daily logs same day)
- At-risk projects are visually obvious without clicking into details
- Replaces the need for manual Project Master Sheet updates

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build portfolio dashboard | 30 min |
| Build project detail view + alerts | 25 min |
| Review with Brad | _Human dependent_ |
| Revisions | 15 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- Production rate baseline: LF/1000 = working days
- Budget baseline: turnover budget (adjusted estimate after award)
- Status color coding: Green (on track), Yellow (at risk), Red (behind schedule or over budget)
- Project milestones follow the Award SOP workflow
- Daily Logs provide daily production data for schedule tracking
- Financial data requires QuickBooks integration or manual entry until then

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Data freshness depends on daily log compliance | Flag missing daily logs; prompt for entry |
| Budget data may lag if QuickBooks not integrated | Allow manual cost entry; prioritize QB integration |
| Too many metrics overwhelm the dashboard | Start with top 5 KPIs; add complexity gradually |
| Different projects have different metrics of success | Standardize on LF/schedule/budget as core; allow custom metrics |

## 9. Open Questions for Brad

1. What are the top 3 things you want to see first when checking project status?
2. How do you currently review the Project Master Sheet -- daily, weekly, on-demand?
3. What thresholds should trigger "at risk" vs. "behind" status (e.g., 10% behind = yellow, 20% = red)?
4. Should the dashboard show financial data (margins, actual costs) or just schedule/production?
5. How many projects does PF typically have active simultaneously?
6. Should there be a view comparing performance across projects (benchmarking)?
