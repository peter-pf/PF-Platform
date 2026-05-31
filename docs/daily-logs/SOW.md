# Statement of Work: Daily Logs & Reporting Tool

**Project:** Pier Foundations -- Daily Field Logs & Production Reporting
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The GUHMA SOP references "hand logs sent from the site team" that track column installations and stone buckets per column. The modulus testing SOP documents field testing procedures. The Project Award SOP tracks production against the LF/1000 = working days formula. Currently, daily field reporting is informal and inconsistent -- no standard template captures the data needed for production tracking, QC, billing, and project management.

This tool provides a standardized daily field report with production data (columns installed, LF, stone consumed), crew information, equipment status, weather, and safety documentation. Auto-calculates production rate against the LF/1000 target and feeds data into Project Status Tracking.

## 2. Scope

### In Scope
- Standardized daily field report template
- Production tracking: columns installed (count + LF), stone consumed
- Auto-calculated production rate vs. LF/1000 target
- Crew count and hours worked
- Weather conditions
- Equipment status (operating hours, issues)
- Safety incidents and near-misses
- Delays, issues, and field observations
- Photo documentation from field
- Integration with Project Status Tracking and GUHMA data

### Out of Scope
- Payroll processing
- Automated GUHMA data import (separate tool)
- Equipment maintenance actions (tracked in Equipment Tracker)
- Timekeeping/HR functions

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Field Foreman/Operator | Completes daily log at end of each shift |
| End User | Jonathan Reinking | Reviews logs for production tracking |
| Decision Maker | Brad Reinking | Reviews for project health |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Daily Log Form | Mobile-first HTML | Field-friendly daily report entry |
| 2 | Production Dashboard | Charts + table | Production rate tracking vs. plan |
| 3 | Log History | Searchable archive | All daily logs by project |
| 4 | PDF Report | PDF | Printable daily log for project file |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Field crew can complete a daily log in under 10 minutes on a phone
- Production rate is auto-calculated and visible to office team same day
- Daily logs provide sufficient data for GUHMA cross-checking (column count, stone buckets)
- Cumulative production data feeds Project Status Tracking accurately

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build mobile-first log form | 25 min |
| Build production dashboard + PDF | 20 min |
| Review with Brad/Jonathan | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- Production rate baseline: LF/1000 = working days (per SOP)
- Stone is measured in buckets per column (field) and tons (office/billing)
- Column diameters are 24" or 30" (affects stone consumption rate)
- Daily logs are completed at end of shift, not real-time
- Field crew has smartphone access for mobile entry
- Hand logs (paper) will remain as backup but digital is primary

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Field crew resistant to digital reporting | Make it simpler than paper; large buttons, minimal typing |
| Spotty cell coverage on remote sites | Offline capability with sync when connected |
| Data entry errors in field conditions | Input validation; reasonable range checks |
| Logs not completed daily | End-of-day reminder notification; flag missing logs |

## 9. Open Questions for Brad/Jonathan

1. What does the current hand log format look like? Can we get a sample?
2. How many buckets of stone does a typical 24" column take? 30" column?
3. What is the conversion factor from buckets to tons?
4. What weather conditions cause a work stoppage (rain threshold, wind speed, temperature)?
5. Who currently reviews daily production -- Jonathan, Brad, or both?
6. Should daily logs include a section for material deliveries received on site?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
