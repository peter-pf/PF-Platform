# Software Requirements Specification: Bid & Estimate Generation Tool

**Project:** Pier Foundations -- Bid & Estimate Generation Workflow
**Version:** 1.3
**Date:** June 1, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A guided estimating workflow integrated into the PF Platform that mirrors every step of the Estimating SOP. Tracks document preparation, Dr. Ed prelim design communication, takeoff data, vendor quotes, and produces a completed detailed budget matching PF's Excel template calculations.

## 2. Functional Requirements

### 2.1 Workflow Steps (Matching Estimating SOP)

| Step | SOP Reference | Tool Action | Status Tracking |
|------|--------------|------------|-----------------|
| 1 | Receive bid invitation | Create estimate from Pipeline or manual entry | Auto |
| 2 | Download geotech report | Upload or link geotech file | Checkbox |
| 3 | Confirm AP required | User confirms after geotech review | Checkbox |
| 4 | Download drawings (civil, structural, architectural) | Upload or link drawing files | Checkbox |
| 5 | Add to Bid Log | Auto-populate Pipeline entry | Auto |
| 6 | Create project folder structure | Generate folder structure template | Auto |
| 7 | Copy estimate + proposal templates | Link to templates | Auto |
| 8 | Rename files per convention (YY-MMDD) | Suggest naming; user confirms | Assisted |
| 9 | Extract bid docs in Bluebeam | Checklist of required pages | Checkbox per page |
| 10 | Send to Dr. Ed | Track email sent date, 5-day minimum lead time | Date + alert |
| 11 | Track addenda | Log addenda received; flag if drawings updated | Manual + alerts |
| 12 | Kreo takeoffs | Enter takeoff results into tool | Data entry |
| 13 | Receive Dr. Ed prelim | Import prelim data (LF, columns, tons) | Data import |
| 14 | Cross-check takeoffs vs prelim | Flag major discrepancies | Auto-compare |
| 15 | Populate detailed budget | Auto-calculate from imported data | Auto |
| 16 | Source vendor quotes | Track stone, transport, layout quotes | Status tracker |
| 17 | Complete budget details | Enter remaining manual items | Data entry |
| 18 | Review with head of estimating | Schedule review; track approval | Status |
| 19 | Generate proposal | Hand off to Proposal Generator | Link |
| 20 | Final review and submit | Track submission | Status |

### 2.2 Takeoff Data Entry (Step 12)

| Field | Type | Unit | SOP Reference |
|-------|------|------|---------------|
| Column Footings by Type | Table: Type + Count | EA | Step 11.e.i |
| Wall Footings by Type | Table: Type + Length | LF | Step 11.e.ii |
| Slab Area by Type | Table: Type + Area | SF | Step 11.e.iii |
| Building Footprint | Number | SF | Cell H17 in template |
| Site Size | Number | Acres | Cell H18 (SF / 43,560) |
| Civil Slab Area | Number | SF | Step 11.f (cross-check) |

### 2.3 Dr. Ed Prelim Data Import (Step 13)

| Field | Source Cell | Destination Cell | Description |
|-------|-----------|-----------------|-------------|
| Total LF | T20 (Prelim Design Summary) | H9 (Detailed Budget) | Total linear feet of piers |
| Column Count | T19 (Prelim Design Summary) | H16 (Detailed Budget) | Total number of columns |
| Stone Tonnage | T21 (Prelim Design Summary) | H15 (Detailed Budget) | Required stone (tons) |
| Engineering Cost | ~W54 (Prelim Design Summary) | Engineering line item | Full design cost |
| Design Timeline | Near W54 | Schedule reference | Weeks for full design |
| Bearing Pressure | GI-100 design criteria | Proposal reference | PSF value |
| Column Diameter | GI-200 detail | 24" or 30" | Determines spoils calc |

**Multi-area handling:** If Dr. Ed's prelim has multiple buildings/areas on separate sheets, the tool must sum T19, T20, and T21 across all sheets before populating H9, H15, H16.

### 2.4 Detailed Budget Calculator

#### Auto-Calculated Fields (from LF, Column Count, Stone Tons)
| Field | Calculation | Notes |
|-------|------------|-------|
| Working Days | LF / 1000 | Per SOP production rate |
| Equipment Rental Weeks | ceil(Working Days / 5) | Minimum 1 week |
| Site Crew Travel Trips | 2 + floor(Working Days / 6) | Minimum 2 |
| Mileage (round trip) | Distance * 2 | From yard to project; may be *4 or *6 for longer projects |
| Spoils (CY or tons) | 1.5 * LF (24") or 2 * LF (30") | Per proposal template |

#### Manual Input Fields (Vendor Quotes)
| Field | Source | Template Cell |
|-------|--------|--------------|
| Garbin Engineering | Dr. Ed prelim (~W54) | Engineering line |
| Stone Cost ($/ton delivered) | Cheapest of 3+ quotes | Stone material + delivery |
| Transport - VSC Rig | Paddacks or Stephan quote | Mob line - VSC rig |
| Transport - Predrill | Paddacks or Stephan quote | Mob line - predrill |
| Transport - PF Trailer | Paddacks or Stephan quote | Mob line - trailer |
| Transport - Fall Off Load | Paddacks or Stephan quote | Mob line - fall off |
| Layout ($/column) | Miller Land Surveying quote | Surveying line |

#### Notes Tracking
For each vendor selection, record in notes cell:
- Which stone supplier is held in the budget
- Which transport company is held (Paddacks vs Stephan)

### 2.5 Vendor Quote Tracker

| Vendor Type | Contacts | Quotes Needed | Status Options |
|-------------|----------|--------------|----------------|
| Stone Supplier | 3+ quarries near project | 3 minimum | Not Started, Requested, Received, Selected |
| Transport | Paddacks (Miah) + Stephan (Mark) | 2 minimum | Not Started, Requested, Received, Selected |
| Layout/Survey | Miller Land Surveying (Brett) | 1 | Not Started, Requested, Received |

#### Quote Request Email Templates

**Stone Quote:**
```
Subject: Stone Quote - [Project Name]

Please provide a quote for the below project.

Project: [Project Name]
Stone Material: #57 stone without fines ([Regional Name])
Address: [Project Address]
[Tonnage] Tons of stone.

Thank you,
Jonathan Reinking
Pier Foundations, LLC
```

**Transport Quote:**
```
Subject: Transport Quote - [Project Name]

[Mark/Miah],

We are looking at a job in [City, ST]. Could you please quote a haul based on the following?

We would like this pickup from the farm/yard and delivery to site.
Site location: [Project Address]
Truck from: 14308 Figel Rd, Monroeville, IN 46773

Load: presumably 3 loads
- Our 98k lb excavator / vibro setup (Cat 336)
- 80k excavator load
- F450/F550 to trailer PF job trailer
- Fall Off Load for testing materials

Looking for a budget on this. Can you guys provide a price per load to make it 1 way to the site, and then pick up the same load and bring it back roughly 2 weeks later, please?

Thank you!
```

**Layout Quote:**
```
Subject: Layout Quote - [Project Name]

Brett,

We have a project with [Column Count] columns that need staking.

Project: [Project Name]
Location: [Project Address]

Can you provide a quote for layout?

Thank you,
Jonathan Reinking
Pier Foundations, LLC
```

### 2.6 Estimate Summary Output

| Section | Fields |
|---------|--------|
| Project Info | Name, GC, Location, Distance, Bid Due Date |
| Design Summary | Column count, Total LF, Stone tons, Column diameter, Working days |
| Cost Breakdown | Engineering, Stone, Transport, Equipment Rental, Labor, Layout, Travel, Contingency |
| Total Price | Bottom line from detailed budget |
| Vendor Selections | Which suppliers/transporters held in budget |
| Review Status | Reviewed by, Date, Approved/Revisions needed |

### 2.7 Takeoff Cross-Check (Step 14)

Compare Jonathan's Kreo takeoff counts against Dr. Ed's prelim:

| Comparison | Threshold for Flag |
|-----------|-------------------|
| Column count (Jonathan vs Dr. Ed) | >10% discrepancy |
| LF (Jonathan vs Dr. Ed) | >10% discrepancy |
| Slab SF (Civil vs Structural) | >15% discrepancy |

Flag major discrepancies for review. Minor discrepancies are expected and noted only.

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Calculation Accuracy | Must match Excel template output exactly |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Desktop-primary; mobile for status checks only |
| Data Storage | Local (JSON) initially; database with platform |
| Export | PDF estimate summary; CSV budget detail |

## 4. Data Flow

```
Pipeline entry (Bidding stage)
    |
    v
Estimate Workflow Created
    |
    +--- Step 1-9: Document prep (checklists)
    |
    +--- Step 10: Dr. Ed email tracked
    |         |
    |         v
    |    Prelim received --> Import LF, Cols, Tons
    |
    +--- Step 12: Kreo takeoffs entered
    |         |
    |         v
    |    Cross-check vs Dr. Ed prelim
    |
    +--- Step 16: Vendor quotes
    |         |
    |         +--- Material Cost Estimator --> Stone quotes
    |         +--- Paddacks/Stephan --> Transport quotes
    |         +--- Miller Land Surveying --> Layout quote
    |
    +--- Budget auto-calculated
    |
    +--- Review meeting with Brad
    |         |
    |         v
    |    Approved --> Hand off to Proposal Generator
    |
    +--- Pipeline stage --> Submitted
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Core module | Required |
| Pipeline Management | Create from Bidding stage; update to Submitted | Required |
| Material Cost Estimator | Pull stone quotes and supplier data | Required |
| Proposal Generator | Feed approved estimate into proposal | Required |
| Subcontractor Coordination | Pull transport and layout contacts/quotes | Phase 2 |
| Kreo | Import takeoff data (if API available) | Phase 3 |

## 6. Open Questions (For Brad/Jonathan)

1. Can we get a copy of the Excel estimate template to map every formula and cell reference?
2. What contingency percentage is standard? Is it fixed or variable by project type?
3. How does the estimate change for projects requiring both 24" and 30" columns?
4. Are there any estimate line items beyond what the SOP describes (insurance, bonding, etc.)?
5. What is the typical Dr. Ed prelim turnaround -- is 5 business days still the minimum?
6. Does the estimate template ever get customized per project, or is it always the same template?
7. How are prevailing wage projects handled differently in the estimate?
