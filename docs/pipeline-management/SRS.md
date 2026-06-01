# Software Requirements Specification: Pipeline Management Tool

**Project:** Pier Foundations -- Pipeline Management & Opportunity Tracking
**Version:** 1.3
**Date:** June 1, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A pipeline management module integrated into the PF Platform that tracks all business opportunities from initial lead through project completion. Provides visual pipeline views, automated stage transitions, win/loss analytics, and revenue forecasting.

## 2. Functional Requirements

### 2.1 Pipeline Stages

| Stage | Owner | Entry Trigger | Exit Trigger |
|-------|-------|--------------|--------------|
| **Lead** | Derek | ConstructConnect Scanner alert or manual entry | Derek qualifies or rejects |
| **Qualifying** | Derek | Lead accepted for evaluation | Feasibility Tool produces BID recommendation |
| **Bidding** | Jonathan | Feasibility approved; estimating resources committed | Bid submitted to GC |
| **Submitted** | Jonathan | Bid sent to GC | GC awards or rejects |
| **Won** | Brad/Jonathan | LOI or verbal award received | Project setup complete (Award SOP done) |
| **Lost** | Auto | GC notifies of rejection or PF withdraws | N/A (terminal) |
| **Active** | Project Manager | Award SOP complete; crew mobilized or mobilizing | Punchlist/closeout complete |
| **Complete** | Project Manager | Closeout documents delivered; final invoice sent | N/A (terminal) |

### 2.2 Pipeline Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Project Name | Text | Yes | Project identifier |
| PF Project Number | Text | No (assigned at award) | Per Bid Log convention |
| GC Name | Text | Yes | General contractor |
| GC Contact | Text | No | Contact person at GC |
| Project Location | Text | Yes | City, State |
| Distance from Yard | Number | Auto-calculated | Miles from 14308 Figel Rd, Monroeville, IN |
| Estimated Value | Currency | Yes | Expected contract value |
| Actual Contract Value | Currency | No (at award) | Final contracted amount |
| Bid Due Date | Date | No | Submission deadline |
| Stage | Dropdown | Yes | Current pipeline stage |
| Feasibility Score | Number | Auto (from Feasibility Tool) | 0-100 risk score |
| Feasibility Recommendation | Text | Auto | BID / REVIEW / NO-BID |
| Source | Dropdown | Yes | ConstructConnect, GC Direct, Referral, DOT, Other |
| Project Type | Dropdown | Yes | Commercial, Industrial, Data Center, Warehouse, Wind Energy, Infrastructure, Other |
| Column Count (est.) | Number | No | From prelim or estimate |
| Total LF (est.) | Number | No | From prelim or estimate |
| Working Days (est.) | Number | Auto | LF / 1000 |
| Loss Reason | Dropdown | At loss | Price, Schedule, Scope, Competitor, Canceled, Capacity, Distance, Other |
| Notes | Text | No | Free-form notes |
| Created Date | Date | Auto | When entry was created |
| Last Updated | Date | Auto | Last modification |
| Days in Stage | Number | Auto | Aging indicator |

### 2.3 Pipeline Board (Kanban View)

- Columns for each active stage: Lead | Qualifying | Bidding | Submitted | Won | Active
- Cards show: Project Name, GC, Value, Location, Days in Stage
- Color coding: Green (<7 days in stage), Yellow (7-14 days), Red (>14 days)
- Drag-and-drop to manually move between stages
- Click card for full detail view
- Filter by: GC, State, Project Type, Value Range, Source

### 2.4 Pipeline List View

- Sortable table with all pipeline entry fields
- Column visibility toggle
- Bulk actions: export selected, change stage, assign owner
- Quick filters: My items, Hot leads, Overdue bids, Active projects
- Search by project name, GC name, or location

### 2.5 Stage Transition Rules

| Transition | Trigger | Automation |
|------------|---------|-----------|
| Lead --> Qualifying | User clicks "Qualify" or Feasibility Tool started | Create Feasibility assessment link |
| Lead --> Lost | User clicks "Pass" | Require loss reason |
| Qualifying --> Bidding | Feasibility score >= 75 (BID) | Notify Jonathan; create estimate workspace |
| Qualifying --> Lost | Feasibility score < 50 (NO-BID) | Auto-archive with NO-BID reason |
| Qualifying --> Qualifying | Feasibility score 50-74 (REVIEW) | Flag for Brad discussion |
| Bidding --> Submitted | Bid estimate completed and sent | Record submission date |
| Submitted --> Won | User marks as awarded | Trigger Award SOP checklist |
| Submitted --> Lost | User marks as lost | Require loss reason + GC feedback notes |
| Won --> Active | Award SOP checklist complete | Link to Project Status Tracking |
| Active --> Complete | Closeout checklist complete | Calculate final metrics |

### 2.6 Pipeline Metrics Dashboard

#### Key Metrics
| Metric | Calculation | Display |
|--------|------------|---------|
| Total Pipeline Value | Sum of estimated values for Lead through Submitted | Currency |
| Weighted Pipeline | Value * probability by stage | Currency |
| Win Rate | Won / (Won + Lost) for trailing 12 months | Percentage |
| Average Deal Size | Average contract value of Won projects | Currency |
| Average Cycle Time | Average days from Lead to Won | Number |
| Stage Conversion Rates | % that advance from each stage to next | Funnel chart |
| Bid Volume | Number of bids submitted per month | Bar chart |
| Win/Loss by GC | Win rate broken down by general contractor | Table |
| Win/Loss by Region | Win rate by state | Map or table |

#### Stage Probability Defaults
| Stage | Default Probability |
|-------|-------------------|
| Lead | 10% |
| Qualifying | 20% |
| Bidding | 40% |
| Submitted | 50% |
| Won | 90% |
| Active | 95% |

### 2.7 Forecasting

- Revenue forecast: weighted pipeline value by expected close month
- Workload forecast: estimated working days for Won + Active + high-probability Submitted
- Crew capacity indicator: total committed working days vs. available capacity
- Alert when pipeline is thin (fewer than X opportunities in Bidding+Submitted)

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds for pipeline board |
| Data Updates | Real-time within platform |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- Brad needs to check pipeline from phone |
| Data Storage | Local (JSON) initially; migrate to database with platform |
| Export | CSV and PDF export of pipeline data and metrics |

## 4. Data Flow

```
ConstructConnect Scanner -----> Lead (auto-created)
Derek manual entry -----------> Lead (manual)
GC bid invitation ------------> Lead or Bidding (depends on relationship)
    |
    v
Pipeline Board (Derek reviews)
    |
    +--- Qualify ---> Feasibility Tool
    |                    |
    |                    +--- BID -------> Bidding stage
    |                    +--- NO-BID ----> Lost stage
    |                    +--- REVIEW ----> Flag for Brad
    |
    +--- Bidding ----> Bid Estimate Generator
    |                    |
    |                    v
    |               Submitted (bid sent)
    |                    |
    |                    +--- Won -------> Project Award SOP
    |                    +--- Lost ------> Archive with reason
    |
    +--- Won ---------> Project Status Tracking (Active)
    |
    +--- Active ------> Daily Logs feed progress
    |
    +--- Complete ----> Closeout, final metrics
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Core module | Required |
| ConstructConnect Scanner | Auto-create Lead entries | Required |
| Feasibility Tool | Pull scores and recommendations | Required |
| Bid Estimate Generator | Track bid completion, link estimates | Required |
| Project Status Tracking | Link Won/Active to project dashboard | Required |
| Bid Log (SharePoint) | Sync during transition period | Phase 2 |
| QuickBooks | Pull actual revenue for Won projects | Phase 3 |

## 6. Open Questions (For Brad/Jonathan)

1. What stage probability percentages reflect PF's actual experience?
2. Should GC direct invitations skip the Lead stage and go straight to Qualifying or Bidding?
3. What is PF's current win rate (approximate)? This sets the baseline for tracking improvement.
4. How many concurrent Active projects can PF handle with current crew/equipment?
5. Should there be a "Hold" status for projects delayed by the GC but not lost?
6. Is there a minimum days-in-stage threshold that should trigger an alert (stale opportunity)?
