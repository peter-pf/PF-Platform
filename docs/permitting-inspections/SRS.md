# Software Requirements Specification: Permitting & Inspections Tool

**Project:** Pier Foundations -- Permitting & Inspection Tracking
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A permitting and inspection tracking module integrated into the PF Platform that manages project permits, 811 utility locate requests, inspection scheduling, and pre-mobilization compliance verification across PF's six-state service area.

## 2. Functional Requirements

### 2.1 Permit Tracker

#### Permit Record Fields
| Field | Type | Description |
|-------|------|-------------|
| Project | Reference | Link to active project |
| Permit Type | Dropdown | Building, Excavation, Grading, Environmental, Special Use, Other |
| Issued By | Text | Issuing authority (city, county, state) |
| Permit Number | Text | Official permit number |
| Responsible Party | Dropdown | PF, GC, Owner |
| Application Date | Date | When applied |
| Issued Date | Date | When granted |
| Expiration Date | Date | When permit expires |
| Status | Dropdown | Not Required, Pending Application, Applied, Issued, Expired, Renewed |
| Alert Days | Number | Days before expiration to alert (default 14) |
| Conditions | Text | Special conditions or restrictions |
| Document | File upload | Permit document scan |
| Notes | Text | Free-form |

#### Permit Status Dashboard
| View | Description |
|------|-------------|
| By Project | All permits for a specific project |
| Expiring Soon | Permits expiring within alert window |
| All Active | Across all projects |
| Missing | Projects without expected permit types |

### 2.2 811 Utility Locate Tracking

#### Locate Request Record
| Field | Type | Description |
|-------|------|-------------|
| Project | Reference | Link to project |
| Ticket Number | Text | 811 ticket/reference number |
| Request Date | Date | When 811 was called |
| Request Method | Dropdown | Phone, Web, App |
| State | Dropdown | IN, OH, MI, IL, KY, WI |
| Locate Date | Date | When locates were marked |
| Valid Until | Date | Expiration date (state-dependent) |
| Status | Dropdown | Requested, Marked, Expired, Re-requested |
| Utilities Located | Multi-select | Electric, Gas, Water, Sewer, Telecom, Fiber, None Found |
| Conflicts Found | Yes/No | Any utility conflicts with column locations |
| Conflict Notes | Text | Details if conflicts found |
| Photos | File upload | Photos of locate marks |

#### State-Specific Validity Rules
| State | Validity Period | Notes |
|-------|----------------|-------|
| Indiana (IN) | 20 calendar days | Call 811 or use Indiana811.org |
| Ohio (OH) | 10 working days | OUPS (Ohio Utilities Protection Service) |
| Michigan (MI) | 30 calendar days | MISS DIG 811 |
| Illinois (IL) | 14 calendar days | JULIE (Joint Utility Locating Info for Excavators) |
| Kentucky (KY) | 10 working days | Kentucky 811 |
| Wisconsin (WI) | 10 working days | Diggers Hotline |

#### Auto-Alerts
- 5 days before locate expiration: Warning to re-request
- On expiration day: Critical alert -- do not excavate without valid locate
- If project duration exceeds locate validity: auto-prompt for renewal at project start

### 2.3 Inspection Scheduling

#### Inspection Record
| Field | Type | Description |
|-------|------|-------------|
| Project | Reference | Link to project |
| Inspection Type | Dropdown | Pre-construction, Foundation, Bearing Capacity, Modulus Test, Final, Special |
| Inspector | Text | Name and organization |
| Requested By | Text | Who requested (GC, engineer, building dept) |
| Scheduled Date | Date | When inspection is scheduled |
| Actual Date | Date | When inspection occurred |
| Result | Dropdown | Passed, Failed, Conditional, Rescheduled, Canceled |
| Conditions/Notes | Text | Comments or requirements from inspector |
| Report | File upload | Inspection report document |
| Follow-Up Required | Yes/No + Description | Any corrective action needed |
| Follow-Up Status | Dropdown | Not Started, In Progress, Complete |

#### Inspection Types for VSC Work
| Type | When | Who Inspects |
|------|------|--------------|
| Pre-construction | Before mobilization | GC superintendent |
| Foundation/Bearing | During installation | Geotech engineer or building inspector |
| Modulus Test | Per project spec (usually 2-3 columns) | PF crew with Dr. Ed review |
| Column Verification | During/after installation | GGG or third-party |
| Final | At completion | GC + building inspector |
| Special | As required | Varies (environmental, structural) |

### 2.4 Pre-Mobilization Compliance Checklist

Generated automatically when a project moves from Won to Active:

| Check Item | Source | Required |
|-----------|--------|----------|
| Building permit verified (GC or PF) | Permit Tracker | Yes |
| 811 utility locate requested | 811 Tracker | Yes |
| 811 utility locate confirmed/marked | 811 Tracker | Yes |
| Site access confirmed with GC | Manual | Yes |
| Submittals approved by GC/Owner | Project Award SOP | Yes |
| Equipment assigned and available | Equipment Tracker | Yes |
| Transport scheduled | Subcontractor Coordination | Yes |
| Layout/survey scheduled | Subcontractor Coordination | Yes |
| Stone delivery scheduled | Material Cost Estimator | Yes |
| Pre-construction inspection scheduled | Inspection Log | If required |
| Insurance certificates exchanged | Manual | Yes |
| Emergency contacts established | Manual | Yes |

#### Compliance Gate
- All "Required" items must be checked before crew mobilization
- "Blocked" items are flagged with reason and responsible party
- Brad receives notification if pre-mob checklist is incomplete 3 days before scheduled mobilization

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Alert Delivery | Email + dashboard notification |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- field verification on phone |
| Data Storage | Local (JSON) initially; database with platform |
| Export | PDF compliance reports, CSV permit lists |

## 4. Data Flow

```
Project awarded (Pipeline Won stage)
    |
    v
Pre-Mobilization Checklist generated
    |
    +--- Permit verification
    |         |
    |         +--- GC provides permit info --> Logged
    |         +--- PF pulls permit (if needed) --> Tracked
    |
    +--- 811 utility locate
    |         |
    |         +--- Request submitted --> Ticket # logged
    |         +--- Locates marked --> Confirmed, photos taken
    |         +--- Validity tracked --> Auto-renewal alerts
    |
    +--- Inspections scheduled
    |         |
    |         +--- Pre-construction --> Results logged
    |         +--- During work --> Modulus tests, bearing checks
    |         +--- Final --> Results logged
    |
    v
All pre-mob items complete --> Crew mobilizes
    |
    v
During project: ongoing compliance monitoring
    |
    +--- 811 renewal alerts
    +--- Inspection results logged
    +--- Permit expiration monitoring
    |
    v
Closeout: compliance docs --> Punch List & Closeout tool
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Pipeline Management | Trigger pre-mob checklist at Won stage | Required |
| Project Status Tracking | Compliance status on project dashboard | Required |
| Equipment Tracker | Equipment availability for pre-mob | Phase 2 |
| Safety Checklists | 811 verification in pre-shift checklist | Phase 2 |
| Punch List & Closeout | Compliance docs in closeout package | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. Does PF ever pull permits directly, or always works under the GC's permit?
2. What is PF's current 811 process (who calls, how is it tracked)?
3. Which inspections are most commonly required on PF projects?
4. Are there any states where VSC work requires special permits or licenses?
5. How much lead time does PF typically need for the pre-mobilization process?
6. Does PF maintain any state registrations that need renewal tracking?
7. Has PF ever been delayed by a permit or locate issue? What happened?
