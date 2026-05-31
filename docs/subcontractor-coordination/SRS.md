# Software Requirements Specification: Subcontractor Coordination Tool

**Project:** Pier Foundations -- Subcontractor Coordination & Vendor Management
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A vendor management module integrated into the PF Platform that centralizes subcontractor contacts, tracks performance across projects, manages scheduling, and maintains quote history for PF's key trade partners.

## 2. Functional Requirements

### 2.1 Vendor Directory

#### Vendor Record Fields
| Field | Type | Description |
|-------|------|-------------|
| Company Name | Text | Business name |
| Trade/Service | Dropdown | Surveying/Layout, Transport, Stone Supply, Engineering, Equipment Rental, Testing, Other |
| Primary Contact | Text | Main contact name |
| Contact Email | Email | Primary email |
| Contact Phone | Phone | Primary phone |
| Secondary Contact | Text | Backup contact |
| Address | Text | Business address |
| Service Area | Multi-select states | IN, OH, MI, IL, KY, WI |
| Preferred Status | Dropdown | Preferred, Approved, Probation, Do Not Use |
| Relationship Since | Date | When PF started using this vendor |
| Last Used | Date | Most recent project |
| Last Verified | Date | When contact info was confirmed |
| Insurance on File | Yes/No + Expiry | COI status |
| Notes | Text | General notes |

#### Pre-loaded Vendors
| Company | Trade | Contact | Email | Notes |
|---------|-------|---------|-------|-------|
| Miller Land Surveying (MLS) | Surveying/Layout | Brett Miller | brett@mlswebsite.us | $8-14/column typical |
| Paddacks | Transport | Miah | miah@paddacks.com | Primary hauler |
| Stephan Trucking | Transport | Mark Maller | mark@stephantrucking.com | Secondary hauler |
| Garbin GeoStructural Group (GGG) | Engineering | Dr. Ed Garbin | _TBD_ | Prelim design 5+ business days |
| Chicago Jack | Testing/Calibration | _TBD_ | _TBD_ | Annual jack calibration |

### 2.2 Performance Tracking

#### Per-Project Rating
| Metric | Scale | Description |
|--------|-------|-------------|
| Quote Responsiveness | 1-5 | How quickly they returned the quote |
| Price Competitiveness | 1-5 | Relative to other quotes received |
| On-Time Delivery | 1-5 | Met scheduled dates |
| Quality of Work/Product | 1-5 | Meets PF standards |
| Communication | 1-5 | Responsive, clear, proactive |
| Overall | Calculated avg | Average of above |

#### Aggregate Metrics
| Metric | Calculation |
|--------|------------|
| Average Rating | Mean of all project ratings |
| Projects Completed | Count of projects where vendor was used |
| Average Quote Response Time | Days from request to quote received |
| On-Time Rate | % of projects delivered on schedule |
| Price Trend | Average cost over last 6/12 months |

### 2.3 Scheduling

#### Availability Tracking
| Field | Type | Description |
|-------|------|-------------|
| Vendor | Reference | Which vendor |
| Project | Reference | Which project |
| Service Required | Text | What they're doing |
| Requested Date | Date | When PF needs them |
| Confirmed Date | Date | When vendor confirmed |
| Status | Dropdown | Requested, Confirmed, In Progress, Complete, Canceled |
| Duration | Number (days) | How long the service takes |
| Notes | Text | Scheduling notes |

#### Calendar View
- Show all vendor commitments across projects
- Highlight conflicts (vendor booked on overlapping dates)
- Filter by vendor or by project
- Color-code by status (requested = yellow, confirmed = green, conflict = red)

### 2.4 Quote History

#### Quote Record
| Field | Type | Description |
|-------|------|-------------|
| Vendor | Reference | Who quoted |
| Project | Reference | Which project |
| Service | Text | What was quoted |
| Quote Date | Date | When received |
| Amount | Currency | Quoted price |
| Unit | Text | Per column, per load, per ton, lump sum |
| Was Selected | Yes/No | Did PF use this quote |
| Competing Quotes | Number | How many quotes received for this service |
| Notes | Text | Special terms, conditions |

#### Price Analysis
- Trend chart: vendor pricing over time
- Comparison: vendor vs. vendor for same service type
- Regional pricing: how costs vary by project location

### 2.5 Vendor Communication Templates

Pre-built email templates matching SOP formats:

| Template | Used For | Pre-populated Fields |
|----------|----------|---------------------|
| Transport Quote Request | Paddacks / Stephan | Project address, yard address, load list |
| Layout Quote Request | MLS | Project name, column count, location |
| Prelim Design Request | Dr. Ed (GGG) | Project docs list, timeline |
| Stone Quote Request | Suppliers | Project, stone type (regional name), tonnage |

### 2.6 Vendor Scorecard

Generate a summary scorecard for each vendor showing:
- Overall performance rating (1-5 stars)
- Projects completed count
- On-time delivery percentage
- Average quote response time
- Price trend (increasing, stable, decreasing)
- Recommendation: Continue, Monitor, Replace

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Search | Find any vendor in under 5 seconds |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- look up contacts on phone |
| Data Storage | Local (JSON) initially; database with platform |
| Export | CSV vendor list, PDF scorecards |

## 4. Data Flow

```
Bid Estimate Generator needs vendor quotes
    |
    v
Look up vendors in directory by trade + service area
    |
    +--- Generate quote request email from template
    |
    +--- Track quote status (requested, received, selected)
    |
    v
Project completes
    |
    v
Rate vendor performance (per-project)
    |
    v
Aggregate scores update vendor scorecard
    |
    v
Scorecard informs future vendor selection
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Bid Estimate Generator | Vendor contact lookup + quote templates | Required |
| Material Cost Estimator | Stone supplier data shared | Required |
| Equipment Tracker | Transport scheduling | Phase 2 |
| Pipeline Management | Vendor assignment at project stages | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. Are there other vendors PF uses regularly beyond MLS, Paddacks, Stephan, GGG, and Chicago Jack?
2. Has PF had any vendor reliability issues worth documenting?
3. Are there backup vendors for transport if both Paddacks and Stephan are unavailable?
4. Does PF require COIs (Certificates of Insurance) from all subs?
5. How far in advance does PF typically schedule MLS for layout?
6. Are there regional subs used for projects in specific states (e.g., a Michigan-only layout company)?
