# Statement of Work: Pipeline Management Tool

**Project:** Pier Foundations -- Pipeline Management & Opportunity Tracking
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

PF currently tracks bids on a SharePoint-based Bid Log (located in `03 - Estimating`) and awarded projects on a separate Project Master Sheet. There is no unified view of the full pipeline from initial lead through project completion. The Estimating SOP references the Bid Log for tracking due dates and contact info, while the Project Award SOP references moving projects between estimating and project management folders and updating multiple spreadsheets.

This results in:
- No single view of PF's full business pipeline
- Manual movement of data between disconnected spreadsheets
- No pipeline velocity metrics (time from lead to award, win rate, etc.)
- Difficulty forecasting workload and revenue

This tool provides a unified pipeline from lead through completion, replacing manual spreadsheet tracking with an integrated workflow that connects to the Feasibility Tool, Bid Estimate Generator, and Project Status Tracking.

## 2. Scope

### In Scope
- Unified pipeline with stages: Lead > Qualifying > Bidding > Submitted > Won > Lost > Active > Complete
- Pipeline dashboard with stage counts, values, and aging
- Automatic stage transitions triggered by connected tools
- Win/loss tracking with reason codes
- Pipeline velocity metrics and forecasting
- Historical pipeline data for business analysis

### Out of Scope
- CRM functionality (contact management is in Subcontractor Coordination)
- Financial reporting (in QuickBooks Integration)
- Detailed project management (in Project Status Tracking)
- Marketing campaign tracking

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Brad Reinking | Reviews pipeline for business decisions |
| End User | Derek Franke | Manages Lead and Qualifying stages |
| End User | Jonathan Reinking | Manages Bidding and Submitted stages |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Pipeline Board | Interactive dashboard | Kanban-style view of all opportunities by stage |
| 2 | Pipeline List View | Table | Sortable/filterable list of all pipeline entries |
| 3 | Stage Transition Logic | Backend | Automatic and manual stage progression rules |
| 4 | Pipeline Metrics | Dashboard widget | Win rate, velocity, forecast, aging |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Brad can see the full pipeline status in a single view in under 30 seconds
- Win/loss data is accurate and trackable over time
- Pipeline replaces the need to manually update the SharePoint Bid Log for tracking purposes
- Stage transitions happen automatically when connected tools complete their workflows

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 20 min |
| Build pipeline board + list view | 30 min |
| Build stage transitions + metrics | 20 min |
| Review with Brad | _Human dependent_ |
| Revisions | 15 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- The SharePoint Bid Log will continue to exist as the system of record until Brad approves this tool as a replacement
- Project numbering follows PF's existing convention (sequential in Bid Log column B)
- The Feasibility Tool feeds qualified leads into the pipeline
- The Bid Estimate Generator moves entries from Bidding to Submitted
- The Project Award SOP process moves entries from Won to Active

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Duplicate data between Bid Log and Pipeline | Initially sync with Bid Log; transition when Brad is comfortable |
| Team doesn't adopt new tool | Make it faster than the spreadsheet; auto-populate from connected tools |
| Stage definitions don't match PF's actual process | Validate stage names and transitions with Brad/Jonathan |
| Lost data during transition from spreadsheet | Keep Bid Log as backup; import historical data for baseline |

## 9. Open Questions for Brad/Jonathan

1. Should the pipeline tool replace the SharePoint Bid Log, or run alongside it?
2. Are there any pipeline stages missing from: Lead > Qualifying > Bidding > Submitted > Won > Lost > Active > Complete?
3. What loss reasons should be tracked? (Price, schedule, scope, GC chose competitor, project canceled, etc.)
4. How far back should historical bid data be imported for baseline metrics?
5. Should Derek and Jonathan have different dashboard views tailored to their pipeline stages?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
