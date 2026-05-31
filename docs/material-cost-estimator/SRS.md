# Software Requirements Specification: Material Cost Estimation Tool

**Project:** Pier Foundations -- Aggregate Material Cost Estimator
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A material cost estimation module integrated into the PF Platform that maintains a regional stone supplier database, calculates delivered stone costs by project location, generates quote request emails per the Estimating SOP, and tracks historical pricing for budget validation.

## 2. Functional Requirements

### 2.1 Supplier Directory

#### Supplier Record Fields
| Field | Type | Description |
|-------|------|-------------|
| Supplier Name | Text | Company name |
| Contact Name | Text | Sales rep name |
| Contact Email | Email | Sales rep email |
| Contact Phone | Phone | Sales rep phone |
| Quarry Location | Address | Physical quarry address |
| Quarry Lat/Long | Coordinates | For distance calculations |
| State | Dropdown | IN, OH, MI, IL, KY, WI, Other |
| Products Available | Multi-select | #57 (IN #8s), #67, #4, Limestone, Granite, Other |
| Local Product Name | Text | Regional name for #57 (e.g., "CA-7" in IL) |
| Last Quote Date | Date | Most recent price received |
| Last Quoted Price ($/ton) | Currency | Material price only |
| Last Delivery Rate ($/ton) | Currency | Delivery cost per ton |
| Delivery Min Tonnage | Number | Minimum order for delivery |
| Notes | Text | Reliability notes, special terms, etc. |
| Status | Dropdown | Active, Inactive, Do Not Use |
| Last Verified | Date | When contact info was last confirmed |

#### Pre-loaded Suppliers
Seed the database with known PF suppliers:
- Heidelberg
- IMI (Irving Materials Inc.)
- Martin Marietta
- StoneCo / Shelly Materials
- Vulcan Materials
- Jergensen Aggregates (Melvin Stone Co)
- Amirize
- Rogers Group

### 2.2 Price Calculator

#### Input Fields
| Field | Type | Description |
|-------|------|-------------|
| Project Address | Address | Delivery destination |
| Stone Type | Dropdown | #57 (default), Other |
| Tonnage Required | Number | From Dr. Ed prelim design (cell H15 in estimate template) |
| Number of Quotes Needed | Number | Default 3 (per SOP requirement) |

#### Calculation Logic
1. Geocode the project address
2. Find all Active suppliers within configurable radius (default: 100 miles)
3. Sort by estimated delivered cost (last quoted material + estimated delivery)
4. Delivery estimation formula: `Base rate + (distance_miles * per_mile_rate)`
   - Base rate and per-mile rate derived from historical delivery quotes
   - Flag as "estimated" vs "quoted" in output
5. Display top suppliers ranked by estimated total delivered cost per ton

#### Output Fields
| Field | Description |
|-------|-------------|
| Supplier Name | From directory |
| Distance to Project | Miles from quarry to project site |
| Material Cost ($/ton) | Last quoted price (with date) |
| Estimated Delivery ($/ton) | Calculated or last quoted |
| Total Delivered ($/ton) | Material + Delivery |
| Total Project Cost | Delivered rate * tonnage |
| Quote Freshness | Days since last quote; flagged if >90 days |
| Data Source | "Quoted" or "Estimated" |

### 2.3 Regional Stone Name Mapping

| Standard Name | IN | IL | MI | WI | OH | KY |
|--------------|----|----|----|----|----|----|
| #57 stone | #8s | CA-7 | 6-AA | 1" Clear | #57 | #57 |

When generating quote requests, the tool automatically uses the correct regional name based on the quarry's state.

### 2.4 Quote Request Generator

Generate pre-filled email per the Estimating SOP format:

#### Template
```
Subject: Stone Quote Request -- [Project Name]

[Supplier Contact Name],

Please provide a quote for the below project.

Project: [Project Name]
Stone Material: #57 stone without fines ([Regional Name for supplier's state])
Address: [Project Address]
[Tonnage] Tons of stone.

Please include delivered pricing to the project site.

Thank you,
[Sender Name]
Pier Foundations, LLC
```

#### Features
- Auto-populate from calculator results
- Insert correct regional stone name based on supplier state
- Generate 3+ emails simultaneously (one per supplier)
- Copy-to-clipboard for each email
- Track which suppliers have been contacted and response status

### 2.5 Price History

#### Data Captured Per Quote
| Field | Type |
|-------|------|
| Supplier | Reference |
| Project | Reference |
| Quote Date | Date |
| Material Price ($/ton) | Currency |
| Delivery Price ($/ton) | Currency |
| Total Delivered ($/ton) | Currency |
| Tonnage Quoted | Number |
| Was Selected | Yes/No |
| Notes | Text |

#### Dashboard Views
- Price trend by supplier over time (line chart)
- Average delivered cost by state (bar chart)
- Supplier comparison for last 6 months (table)
- Stale quote alerts (quotes older than 90 days for active suppliers)

### 2.6 Stone Specification Reference

Display a reference card for Jonathan/operators:

| Property | Specification |
|----------|--------------|
| ASTM Designation | #57 |
| Size Range | 3/8" - 1" |
| Material | Crushed, angular, washed |
| Fines | None (no fines specification) |
| Preferred Material | Limestone |
| Acceptable | Granite, other (confirm with Dr. Ed) |
| Not Acceptable | Rounded river rock, uncrushed gravel |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds for calculator results |
| Geocoding | Use free geocoding service (Nominatim or similar) |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive -- usable on phone for field quote checks |
| Data Storage | Local (JSON) initially, database when platform matures |
| Export | CSV export of price history for accounting |

## 4. Data Flow

```
Jonathan enters project location + tonnage
    |
    v
Geocode project address
    |
    v
Find suppliers within radius
    |
    v
Calculate estimated delivered costs
    |
    v
Display ranked supplier list
    |
    +--- Generate quote request emails (3+)
    |         |
    |         v
    |    Jonathan sends emails to suppliers
    |         |
    |         v
    |    Quotes received --> Enter actual prices
    |         |
    |         v
    |    Price history updated
    |
    +--- Best delivered price --> Feed to Bid Estimate Generator (cell for stone cost)
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Bid Estimate Generator | Feed cheapest delivered cost into estimate | Required |
| Google Maps / Geocoding | Distance calculations | Required |
| Price History | Historical data for budget estimates | Required |
| Email Client | Generate draft emails for quote requests | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. What is a reasonable search radius for quarries -- 50 miles? 100 miles? Varies by project size?
2. At what age should a quote be flagged as stale -- 60 days? 90 days?
3. Are there any suppliers on a "do not use" list?
4. Has PF ever used non-limestone stone? Under what circumstances?
5. What is the typical delivery minimum (tons) for most quarries?
6. Is there a cost difference between 24" and 30" column stone requirements, or is it always #57 regardless?
