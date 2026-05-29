# Software Requirements Specification: Punch List & Closeout Tool

**Project:** Pier Foundations -- Punch List & Project Closeout
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A project closeout module integrated into the PF Platform that provides a structured checklist for assembling all required closeout documents, tracking GC sign-off, and transitioning projects to Complete status in the Pipeline. Pulls documents from connected tools and generates standard lien waivers and warranty letters.

## 2. Functional Requirements

### 2.1 Closeout Document Checklist

| # | Document | Source | Required | Notes |
|---|----------|--------|----------|-------|
| 1 | GUHMA Column Installation Report | GUHMA Integration | Yes | Combined PDF of all column logs |
| 2 | Modulus Test Results | Modulus test tool | Yes | Test report for each test column |
| 3 | Approved Shop Drawings (As-Built) | Engineering files | Yes | GGG stamped drawings (GI-100, GI-200, GI-300) |
| 4 | Stone Delivery Tickets | Field / Material tracking | Yes | All delivery receipts for project |
| 5 | Daily Field Logs | Daily Logs tool | Yes | All daily reports for project duration |
| 6 | Progress Lien Waiver(s) | Generated | As needed | For each progress payment |
| 7 | Final Lien Waiver | Generated | Yes | Upon final payment |
| 8 | Warranty Letter | Generated | Yes | Standard PF warranty |
| 9 | Safety Documentation | Safety Checklists | Recommended | Pre-shift checklists, toolbox talks |
| 10 | Project Photos | Daily Logs / Field | Recommended | Key installation photos |
| 11 | Change Order Documentation | CO Management | If applicable | All approved COs |
| 12 | Final Invoice | QuickBooks / Manual | Yes | Final billing |
| 13 | Subcontractor Lien Waivers | From subs | If applicable | MLS, transport lien waivers |

### 2.2 Checklist Status Tracking

| Status | Meaning | Visual |
|--------|---------|--------|
| Not Started | Document not yet collected/generated | Gray |
| In Progress | Being assembled or awaiting info | Yellow |
| Ready | Document complete and uploaded | Green |
| N/A | Not applicable to this project | Strikethrough |
| Blocked | Waiting on external party (GC, Dr. Ed, sub) | Red |

### 2.3 Document Assembly

#### Auto-Collection
The tool automatically pulls available documents from connected systems:
- GUHMA report from GUHMA Integration
- Modulus test results from testing records
- Daily logs from Daily Logs tool
- Safety docs from Safety Checklists
- CO documentation from Change Order Management
- Photos from Daily Logs

#### Manual Upload
For documents not in connected systems:
- Stone delivery tickets (scanned/photographed)
- Subcontractor lien waivers
- GC-specific forms
- Any additional documentation

### 2.4 GUHMA Quality Verification (Pre-Closeout)

Before marking GUHMA report as Ready, verify per the GUHMA SOP:
| Check | Description | Status |
|-------|-------------|--------|
| All columns accounted | Pile count matches submittal | Pass/Fail |
| All columns at design depth | No red-flagged short columns unresolved | Pass/Fail |
| Stone buckets reconciled | GUHMA data matches hand logs | Pass/Fail |
| Report formatted correctly | Project info, time diagram, profiles correct | Pass/Fail |

### 2.5 Lien Waiver Templates

#### Progress Lien Waiver
| Field | Type | Description |
|-------|------|-------------|
| Project Name | Auto | From project record |
| GC Name | Auto | From project record |
| Payment Amount | Currency | For this progress payment |
| Payment Period | Date range | Work period covered |
| Through Date | Date | Payment through date |
| Waiver Type | Dropdown | Conditional, Unconditional |
| PF Signatory | Text | Authorized signer |

#### Final Lien Waiver
| Field | Type | Description |
|-------|------|-------------|
| All fields above | | Same as progress |
| Total Contract Value | Currency | Final contract amount (including COs) |
| All Payments Received | Yes/No | Confirm all payments received |
| Final Release | Text | Standard release language |

### 2.6 Warranty Letter Template

| Field | Type | Description |
|-------|------|-------------|
| Project Name | Auto | From project record |
| Project Address | Auto | From project record |
| GC Name | Auto | From project record |
| Owner Name | Text | Building owner (if different from GC) |
| Installation Dates | Date range | Start to completion |
| Column Count | Number | Total columns installed |
| Total LF | Number | Total linear feet installed |
| Column Diameter | Text | 24" and/or 30" |
| Bearing Pressure | Text | Design bearing pressure (PSF) |
| Warranty Period | Text | _Confirm standard with Brad_ |
| Warranty Scope | Text | Standard warranty language |
| Exclusions | Text | Standard exclusions |
| PF Signatory | Text | Authorized signer |

### 2.7 GC Sign-Off Tracking

| Field | Type | Description |
|-------|------|-------------|
| Closeout Package Sent Date | Date | When full package was sent to GC |
| GC Contact | Text | Who received the package |
| Delivery Method | Dropdown | Email, USB, Cloud link, Hard copy |
| GC Response | Dropdown | Accepted, Revisions Requested, No Response |
| GC Response Date | Date | When GC responded |
| Outstanding Items | Text | If revisions requested, what's needed |
| Final Acceptance Date | Date | When GC accepted the complete package |
| Follow-Up Reminders | Auto | If no response in 7 days, 14 days, 30 days |

### 2.8 Final Project Metrics

Generated at closeout:
| Metric | Calculation |
|--------|------------|
| Original Contract Value | From estimate |
| Final Contract Value | Original + approved COs |
| Actual Cost | From turnover budget actuals |
| Margin | (Final Value - Actual Cost) / Final Value |
| Planned Duration | LF / 1000 from estimate |
| Actual Duration | Work days from daily logs |
| Schedule Performance | Actual vs. Planned (%) |
| Columns Planned vs. Installed | Count comparison |
| LF Planned vs. Installed | LF comparison |
| Stone Planned vs. Consumed | Tonnage comparison |
| Safety Record | Incidents, near-misses |
| Change Orders | Count, total value |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Document Package | Support files up to 50MB total per project |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Read-only on mobile; assembly on desktop |
| Data Storage | Project archive retained per retention policy |
| Export | Combined PDF closeout package; individual document export |

## 4. Data Flow

```
Project nearing completion
    |
    v
Closeout Checklist activated
    |
    +--- Auto-collect: GUHMA report, daily logs, safety docs, COs
    |
    +--- Manual upload: delivery tickets, sub lien waivers
    |
    +--- Generate: lien waivers, warranty letter
    |
    +--- GUHMA quality verification
    |
    v
All items Ready or N/A
    |
    v
Package sent to GC
    |
    +--- GC accepts --> Final metrics calculated
    |                       |
    |                       v
    |                  Pipeline --> Complete
    |
    +--- GC requests revisions --> Address items --> Resubmit
    |
    +--- No response --> Automated follow-ups
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Pipeline Management | Transition to Complete stage | Required |
| GUHMA Integration | Pull column installation report | Required |
| Daily Logs | Pull all project daily logs | Required |
| Safety Checklists | Pull safety documentation | Phase 2 |
| Change Order Management | Pull approved CO documentation | Phase 2 |
| QuickBooks | Final invoice status | Phase 3 |
| Project Status Tracking | Final project metrics | Required |

## 6. Open Questions (For Brad/Jonathan)

1. What is PF's standard warranty period and scope?
2. Does PF use conditional or unconditional lien waivers?
3. What closeout items do GCs most commonly request beyond what's listed?
4. Is there a standard document retention period PF follows?
5. Does PF provide as-built drawings, or are the approved shop drawings sufficient?
6. How is the closeout package typically delivered to GCs (email, cloud, physical)?
7. Are there any state-specific lien waiver requirements across PF's service area?
