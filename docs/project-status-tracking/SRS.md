# Software Requirements Specification: Project Status Tracking Tool

**Project:** Pier Foundations -- Project Status Dashboard
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A real-time project management dashboard integrated into the PF Platform that aggregates data from Daily Logs, Pipeline Management, Equipment Tracker, Change Orders, and financial inputs to display schedule, budget, and completion status for all active projects. Replaces PF's manual Project Master Sheet.

## 2. Functional Requirements

### 2.1 Portfolio Dashboard (All Projects View)

#### Summary Cards (Top of Dashboard)
| Card | Data | Display |
|------|------|---------|
| Active Projects | Count of projects in Active stage | Number |
| Total Contract Value | Sum of all active project contract values | Currency |
| Total LF Remaining | Sum of remaining LF across all projects | Number |
| Crew Days Committed | Sum of remaining working days | Number |
| Projects at Risk | Count of yellow + red status projects | Number with color |

#### Project List Table
| Column | Data | Sortable |
|--------|------|----------|
| Status Indicator | Green / Yellow / Red dot | Yes |
| Project Name | Name from Pipeline | Yes |
| GC | General contractor | Yes |
| Location | City, State | Yes |
| Completion % | LF installed / total LF | Yes |
| Schedule Status | Days ahead/behind plan | Yes |
| Budget Status | Spend vs. turnover budget | Yes |
| Days Remaining | At current production rate | Yes |
| Last Daily Log | Date of most recent log | Yes |
| Crew on Site | Current crew count | No |

#### Status Color Logic
| Color | Schedule Condition | Budget Condition |
|-------|-------------------|-----------------|
| Green | Within 10% of plan | Within 5% of budget |
| Yellow | 10-25% behind plan | 5-15% over budget |
| Red | >25% behind plan | >15% over budget |

### 2.2 Project Detail View

#### Header
| Field | Source |
|-------|--------|
| Project Name | Pipeline |
| PF Project Number | Pipeline |
| GC Name + Contact | Pipeline |
| Project Address | Pipeline |
| Contract Value (original) | Estimate |
| Contract Value (current, with COs) | CO Management |
| Column Diameter | Dr. Ed design (24" or 30") |

#### Progress Section
| Metric | Calculation | Display |
|--------|------------|---------|
| Total LF (design) | From turnover budget | Number |
| LF Installed | Cumulative from daily logs | Number |
| Completion % | Installed / Total | Progress bar |
| Columns (design) | From turnover budget | Number |
| Columns Installed | Cumulative from daily logs | Number |
| Stone Planned (tons) | From turnover budget | Number |
| Stone Consumed (tons) | Cumulative from daily logs | Number |

#### Schedule Section
| Metric | Calculation | Display |
|--------|------------|---------|
| Planned Working Days | Total LF / 1000 | Number |
| Actual Working Days | Count of work days from daily logs | Number |
| Days Remaining (at plan rate) | Remaining LF / 1000 | Number |
| Days Remaining (at actual rate) | Remaining LF / avg daily LF | Number |
| Schedule Variance | Actual - Planned (for work completed) | +/- days |
| Estimated Completion Date | Start date + actual days remaining | Date |
| Planned Completion Date | Start date + planned days | Date |

#### Production Chart
- **X-axis:** Work days (day 1 through project end)
- **Y-axis (left):** Cumulative LF installed
- **Y-axis (right):** Daily LF installed (bar chart)
- **Overlay:** Planned LF progress line (1000 LF/day slope)
- **Visual:** Actual vs. planned gap clearly visible

#### Budget Section
| Metric | Source | Display |
|--------|--------|---------|
| Turnover Budget | Bid Estimate (adjusted at award) | Currency |
| Actual Spend (to date) | Manual entry or QuickBooks | Currency |
| Budget Remaining | Budget - Actual | Currency |
| Budget Variance | (Actual - Planned at this point) | +/- Currency |
| Change Orders (approved) | CO Management | Currency |
| Adjusted Budget | Original + COs | Currency |

#### Budget Breakdown
| Line Item | Budgeted | Actual | Variance |
|-----------|----------|--------|----------|
| Engineering (GGG) | From estimate | Actual invoice | +/- |
| Stone (material + delivery) | From estimate | Actual invoices | +/- |
| Transport (mob/demob) | From estimate | Actual invoices | +/- |
| Equipment Rental | From estimate | Actual invoices | +/- |
| Labor | From estimate | Actual payroll | +/- |
| Layout (MLS) | From estimate | Actual invoice | +/- |
| Travel | From estimate | Actual expenses | +/- |
| Contingency | From estimate | Used | Remaining |

#### Milestone Tracker
| Milestone | Planned Date | Actual Date | Status |
|-----------|-------------|-------------|--------|
| LOI/Award Received | | | |
| Submittals Sent to GC | | | |
| Submittals Approved | | | |
| Crew Mobilized | | | |
| First Column Installed | | | |
| 50% Complete | | | |
| Modulus Testing | | | |
| Last Column Installed | | | |
| Demobilization | | | |
| Closeout Docs Submitted | | | |
| Final Payment Received | | | |

### 2.3 Alerts and Notifications

| Trigger | Severity | Recipients |
|---------|----------|------------|
| No daily log for active project (work day) | Warning | Jonathan |
| Project status changes to Yellow | Warning | Brad |
| Project status changes to Red | Critical | Brad + Jonathan |
| Budget >10% over on any line item | Warning | Brad |
| Production rate below 800 LF/day (3-day avg) | Warning | Jonathan |
| Stone inventory below 1 day supply | Critical | Jonathan |
| Milestone overdue | Warning | Jonathan |
| No daily log for 3+ work days | Critical | Brad + Jonathan |

### 2.4 Weekly Status Report

Auto-generated PDF containing:
| Section | Content |
|---------|---------|
| Portfolio Summary | Active project count, total value, overall health |
| Project-by-Project | Status, completion %, schedule/budget summary |
| Highlights | Projects completed, milestones hit this week |
| Concerns | Red/Yellow projects with explanation |
| Next Week | Upcoming milestones, mobilizations, demobilizations |
| Production Summary | Total LF installed across all projects this week |

### 2.5 Historical Performance

| Metric | Description |
|--------|-------------|
| Average Project Margin | Actual margin across completed projects |
| Average Schedule Performance | Days ahead/behind across completed projects |
| Production Rate by Project Type | Average LF/day by project category |
| Seasonal Trends | Production rate by month (weather impacts) |
| GC Performance | Schedule and payment performance by GC |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 3 seconds for portfolio dashboard |
| Data Refresh | Real-time from daily logs; manual entry for financials |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- Brad checks on phone |
| Data Storage | Local initially; database with platform |
| Export | PDF weekly report; CSV data export |
| Print | Dashboard printable on single page |

## 4. Data Flow

```
Daily Logs --> Production data (LF, columns, stone, crew)
    |
Equipment Tracker --> Equipment status and hours
    |
Change Orders --> CO value adjustments
    |
Pipeline Management --> Project info, stage, contract value
    |
QuickBooks (future) --> Actual costs, invoicing
    |
    v
Project Status Dashboard
    |
    +--- Portfolio view (all projects)
    +--- Detail view (per project)
    +--- Alerts (threshold-based)
    +--- Weekly report (auto-generated)
    +--- Historical performance (trend analysis)
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Core module | Required |
| Daily Logs | Auto-feed production data | Required |
| Pipeline Management | Project info and stage | Required |
| Change Order Management | Budget adjustments | Required |
| Equipment Tracker | Equipment status per project | Phase 2 |
| QuickBooks | Actual cost data | Phase 3 |
| Punch List & Closeout | Final project metrics | Phase 2 |

## 6. Open Questions (For Brad)

1. What are the top 3 metrics you look at first when reviewing project status?
2. What thresholds feel right for Yellow vs. Red status (10%/25% suggested above)?
3. How frequently do you want the weekly status report -- weekly on Monday, on Friday, both?
4. Should financial data (margins, actual costs) be visible to Jonathan, or Brad only?
5. Is 1000 LF/day the correct production baseline for all projects, or does it vary?
6. How many concurrent active projects does PF typically manage?
7. Should completed projects remain visible on the dashboard for benchmarking?
