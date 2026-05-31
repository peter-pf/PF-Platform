# Software Requirements Specification: Equipment & Fleet Tracking Tool

**Project:** Pier Foundations -- Equipment & Fleet Tracker
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

An equipment management module integrated into the PF Platform that tracks all PF-owned assets, their current location, operating hours, maintenance schedules, and testing jack calibration status. Provides a dashboard for fleet visibility and proactive maintenance alerts.

## 2. Functional Requirements

### 2.1 Equipment Registry

#### Equipment Record Fields
| Field | Type | Description |
|-------|------|-------------|
| Equipment ID | Text | Unique identifier (e.g., "VSC Rig #1") |
| Make | Text | Manufacturer |
| Model | Text | Model name/number |
| Year | Number | Year of manufacture |
| Serial Number | Text | Manufacturer serial |
| Category | Dropdown | Excavator, Vibroflot, Vehicle, Testing Equipment, Support |
| Weight | Number (lbs) | Operating weight (for transport quoting) |
| Status | Dropdown | Available, On Site, In Transit, Maintenance, Out of Service |
| Current Location | Text | Yard / Project Name + Address |
| Total Hours | Number | Lifetime operating hours |
| Last Hour Update | Date | When hours were last updated |
| Notes | Text | Free-form |

#### Pre-loaded Equipment
| ID | Make/Model | Weight | Category |
|----|-----------|--------|----------|
| VSC Rig #1 | Cat 336 | 98,000 lbs | Excavator |
| Excavator #2 | TBD | ~80,000 lbs | Excavator |
| Vibroflot #1 | TBD | TBD | Vibroflot |
| F450/F550 | Ford F450 or F550 | TBD | Vehicle |
| Test Jack (Small) | TBD | TBD | Testing Equipment |
| Test Jack (Large) | TBD | TBD | Testing Equipment |
| PF Job Trailer | TBD | TBD | Support |

### 2.2 Location Tracking

| Field | Type | Description |
|-------|------|-------------|
| Location Type | Dropdown | Yard, Jobsite, In Transit, Shop/Repair |
| Location Detail | Text | If Yard: "14308 Figel Rd, Monroeville, IN 46773"; If Jobsite: Project name + address |
| Arrived Date | Date | When equipment arrived at current location |
| Expected Return | Date | When expected back at yard (if on jobsite) |
| Moved By | Text | Who authorized/performed the move |

#### Location History
Track all location changes with timestamp, enabling:
- Days at each location
- Total days on site vs. in yard (utilization)
- Movement patterns

### 2.3 Maintenance Scheduling

#### Maintenance Schedule Record
| Field | Type | Description |
|-------|------|-------------|
| Equipment ID | Reference | Which asset |
| Service Type | Dropdown | Oil Change, Filter, Hydraulic, Tracks, Annual Inspection, Other |
| Interval Type | Dropdown | Hours, Calendar |
| Interval Value | Number | Every X hours or every X days |
| Last Service Date | Date | When last performed |
| Last Service Hours | Number | Equipment hours at last service |
| Next Service Due (Hours) | Number | Calculated: Last + Interval |
| Next Service Due (Date) | Date | Calculated: Last + Interval |
| Alert Lead Time | Number | Hours or days before due to alert |
| Service Provider | Text | Who performs this service |
| Notes | Text | Service notes |

#### Maintenance Alerts
| Condition | Alert Level | Notification |
|-----------|------------|-------------|
| Service due within alert lead time | Warning (Yellow) | Dashboard indicator + optional email |
| Service is overdue | Critical (Red) | Dashboard indicator + email to Brad |
| No hours update in 30+ days | Info (Blue) | Prompt to update hours |

### 2.4 Jack Calibration Tracking

| Field | Type | Description |
|-------|------|-------------|
| Jack ID | Text | "Small (<175 kips)" or "Large (>175 kips)" |
| Current Calibration Factor | Number | Small: 49.84, Large: 32.88 |
| Calibration Date | Date | Date of last calibration |
| Calibration Expiry | Date | Calibration date + 1 year |
| Calibration Provider | Text | Chicago Jack |
| Calibration Certificate | File | Upload calibration report |
| Status | Calculated | Valid, Expiring Soon (<60 days), Expired |

#### Calibration Integration
- When a modulus test form is generated, auto-populate the calibration factor from this tracker
- If calibration is expired, block modulus test form generation with warning
- Alert 60 days before calibration expiry

### 2.5 Utilization Dashboard

#### Key Metrics
| Metric | Calculation | Display |
|--------|------------|---------|
| Current Status | All equipment in a single table | Status icons |
| Utilization Rate | Days on site / Total days (trailing 90 days) | Percentage per asset |
| Average Hours/Month | Total hours / months tracked | Number per asset |
| Days Since Last Move | Current date - last location change | Number |
| Maintenance Compliance | On-time services / Total services due | Percentage |

#### Views
- **Fleet Overview:** All equipment in a card grid showing status, location, hours
- **Timeline View:** Gantt-style showing which equipment was where, when
- **Maintenance Calendar:** Upcoming maintenance by month

### 2.6 Equipment Assignment

When a project moves to Active stage (from Pipeline), prompt for equipment assignment:
- Which excavator(s) assigned
- Which vibroflot
- Which testing jack(s)
- Which vehicle(s)
- Automatically update equipment location when project starts

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds for dashboard |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- field crew needs to update hours on phone |
| Data Storage | Local (JSON) initially; database with platform |
| File Storage | Calibration certificates, maintenance receipts |

## 4. Data Flow

```
Equipment Registry
    |
    +--- Location Updates (manual or from project assignment)
    |         |
    |         v
    |    Location History --> Utilization Metrics
    |
    +--- Hours Updates (field crew input)
    |         |
    |         v
    |    Maintenance Schedule --> Alerts
    |
    +--- Calibration Updates (annual from Chicago Jack)
    |         |
    |         v
    |    Modulus Test Form --> Auto-populate calibration factor
    |
    +--- Project Assignment (from Pipeline Won stage)
    |         |
    |         v
    |    Equipment reserved --> Transport quotes triggered
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Pipeline Management | Equipment assignment at project award | Required |
| Daily Logs | Link equipment hours to daily production | Phase 2 |
| Bid Estimate Generator | Equipment availability check for scheduling | Phase 2 |
| GUHMA Integration | Equipment ID for column logging | Phase 2 |
| Modulus Test Forms | Calibration factor auto-population | Required |

## 6. Open Questions (For Brad/Jonathan)

1. What is the complete equipment list with make, model, year, and serial numbers?
2. What are the specific maintenance intervals for the Cat 336 and other equipment?
3. Are there any rental agreements for equipment that PF uses regularly?
4. Who will be responsible for updating equipment hours -- field foreman?
5. How often does equipment move between the yard and jobsites (typical turnaround)?
6. Is there a minimum utilization rate target that would justify purchasing additional equipment?
7. Are calibration certificates currently stored digitally or on paper?
