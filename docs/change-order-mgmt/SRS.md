# Software Requirements Specification: Change Order Management Tool

**Project:** Pier Foundations -- Change Order Management
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A change order management module integrated into the PF Platform that provides a structured workflow for identifying, documenting, pricing, submitting, and tracking change orders on active projects. Uses original estimate unit rates for pricing consistency and supports photo documentation.

## 2. Functional Requirements

### 2.1 Change Order Types

| CO Type | Trigger | Example |
|---------|---------|---------|
| Additional Columns | Design revision or field discovery | New footings added to structural plan |
| Depth Change | Actual soil conditions differ from geotech | Columns need to go deeper than designed |
| Site Grade Variance | Grade exceeds +/- 3" tolerance | Site not prepared to spec before PF mobilizes |
| Scope Addition | GC requests additional work | Slab support, additional building area |
| Design Revision | Engineer revises after submittal | Changed column spacing, diameter, or bearing pressure |
| Mobilization Change | Additional mob/demob required | Split mobilization, return trip |
| Material Change | Stone specification change | Different gradation required |

### 2.2 Change Order Record Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| CO Number | Auto-generated | Yes | Project# - CO# (e.g., 26-003-CO1) |
| Project | Reference | Yes | Link to active project |
| CO Type | Dropdown | Yes | From types above |
| Date Identified | Date | Yes | When condition was discovered |
| Identified By | Text | Yes | Who found it (field crew, PM, engineer) |
| Description | Text (multi-line) | Yes | Detailed description of changed condition |
| Reference Documents | Text | No | Drawing number, spec section, contract clause |
| Photos | File upload (multiple) | Recommended | Field documentation |
| Impact - Additional LF | Number | If applicable | Additional linear feet |
| Impact - Additional Columns | Number | If applicable | Additional column count |
| Impact - Additional Stone (tons) | Number | If applicable | Additional stone required |
| Impact - Additional Days | Number | If applicable | Schedule impact |
| Unit Rate Source | Auto | Yes | From turnover budget |
| CO Cost | Calculated | Yes | Quantity * unit rate + markup |
| Markup Percentage | Number | Yes | _Confirm standard with Brad_ |
| Total CO Amount | Calculated | Yes | CO Cost * (1 + Markup%) |
| Status | Dropdown | Yes | Draft, Pending Brad, Approved, Submitted to GC, GC Approved, GC Disputed, Resolved |
| GC Submission Date | Date | At submission | When sent to GC |
| GC Response Date | Date | At response | When GC responded |
| GC Response | Dropdown | At response | Approved, Partial Approval, Disputed, Pending |
| GC Approved Amount | Currency | At approval | Amount GC approved (may differ from requested) |
| Notes | Text | No | Free-form |

### 2.3 Cost Calculation

#### Unit Rates (From Turnover Budget)
Pull the following rates from the project's approved turnover budget:

| Cost Component | Unit | Source |
|---------------|------|--------|
| Per LF rate | $/LF | Turnover budget total / total LF |
| Per column rate | $/column | Derived from estimate |
| Stone (delivered) | $/ton | From estimate stone line |
| Equipment rental | $/week | From estimate |
| Crew day rate | $/day | From estimate labor lines |
| Mob/Demob | $/trip | From estimate transport lines |

#### CO Cost Formula
```
Material Cost = additional_stone_tons * stone_rate_per_ton
Labor Cost = additional_days * crew_day_rate
Equipment Cost = additional_weeks * equipment_weekly_rate
Other Direct Costs = (mob_if_needed + layout_if_needed + engineering_if_needed)

Subtotal = Material + Labor + Equipment + Other
Markup = Subtotal * markup_percentage
Total CO = Subtotal + Markup
```

### 2.4 Photo Documentation

| Feature | Description |
|---------|-------------|
| Upload | Multiple photos per CO from mobile or desktop |
| Timestamp | Preserve photo timestamp metadata |
| Annotation | Optional text annotation on each photo |
| Required | System prompts for photos on all COs (strongly recommended, not blocked) |
| Storage | In project folder structure |

### 2.5 Approval Workflow

```
Field identifies changed condition
    |
    v
Create CO draft (field crew or PM)
    |
    v
Price CO using turnover budget rates
    |
    v
Submit to Brad for internal review
    |
    +--- Brad Approves --> Submit to GC
    |         |
    |         v
    |    GC Reviews
    |         |
    |         +--- GC Approves --> Update project budget
    |         |
    |         +--- GC Partial Approval --> Negotiate or accept
    |         |
    |         +--- GC Disputes --> Document, escalate
    |
    +--- Brad Requests Revisions --> Revise and resubmit
    |
    +--- Brad Rejects --> Archive with reason
```

### 2.6 CO Document Output

Generate a formal CO submission document (PDF) containing:
- PF header and project information
- CO number and date
- Description of changed condition
- Reference to contract/drawing clause
- Cost breakdown (itemized)
- Total requested amount
- Photos (attached or embedded)
- Signature lines (PF + GC)

### 2.7 CO Dashboard

| View | Content |
|------|---------|
| By Project | All COs for a specific project with status |
| Summary | Total CO value pending, approved, disputed across all projects |
| Aging | COs awaiting GC response, sorted by days outstanding |
| Revenue Impact | Approved CO revenue vs. original contract value |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Photo Upload | Accept JPEG, PNG up to 10MB per photo |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Full CO creation capability on mobile (field use) |
| Data Storage | Local (JSON) initially; database with platform |
| Export | PDF CO document, CSV CO summary |

## 4. Data Flow

```
Field Condition Identified
    |
    v
CO Created (Draft)
    |
    +--- Photos uploaded
    +--- Cost calculated from turnover budget
    |
    v
Brad Reviews
    |
    +--- Approved --> PDF generated --> Submitted to GC
    |                                       |
    |                                       v
    |                               GC Response tracked
    |                                       |
    |                                       +--- Approved --> Project budget updated
    |                                       +--- Disputed --> Escalation workflow
    |
    +--- Rejected --> Archived
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Project Status Tracking | CO impact on budget and schedule | Required |
| Bid Estimate Generator | Pull unit rates from turnover budget | Required |
| Daily Logs | Prompt for CO when field conditions noted | Phase 2 |
| QuickBooks | CO invoicing | Phase 3 |

## 6. Open Questions (For Brad/Jonathan)

1. What is PF's standard markup percentage on change order work?
2. Does PF use a standard CO form currently, or adopt each GC's format?
3. What is the typical contractual window for CO notification (how many days)?
4. Are there CO types that are more common than others?
5. How are disputed COs currently handled -- does PF have a resolution process?
6. Should the tool track back-charges from GCs to PF as well?
7. What is the typical CO approval turnaround time from GCs?
