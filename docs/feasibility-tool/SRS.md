# Software Requirements Specification: Feasibility / No-Go Tool

**Project:** Pier Foundations — Feasibility & Bid/No-Bid Decision Tool
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

A web-based assessment tool integrated into the PF Platform that evaluates incoming bid opportunities across technical, commercial, and operational criteria to produce a Bid / No-Bid / Review recommendation with a weighted risk score.

## 2. Functional Requirements

### 2.1 Input Fields

#### Section A: Project Information (Required)
| Field | Type | Description |
|-------|------|-------------|
| Project Name | Text | Name of the project |
| GC Name | Text | General contractor issuing the bid |
| Project Location | Text | City, State |
| Distance from Yard | Number (miles) | Distance from 14308 Figel Rd, Monroeville, IN 46773 |
| Bid Due Date | Date | Submission deadline |
| Estimated Project Value | Currency | Expected contract value |
| Project Type | Dropdown | Commercial, Industrial, Infrastructure, Data Center, Warehouse, Wind Energy, Residential, Other |

#### Section B: Technical Feasibility (Required)
| Field | Type | Options/Range | Weight |
|-------|------|--------------|--------|
| Soil Type | Multi-select | Soft clay, Stiff clay, Loose sand, Dense sand, Silt, Peat/Organic, Fill, Mixed/Unknown | 15% |
| Treatment Depth Required | Number (feet) | 0-50+ | 15% |
| Undrained Shear Strength (cu) | Dropdown | <15 kPa (too soft), 15-25 kPa (marginal), 25-50 kPa (ideal), 50+ kPa (may not need AP), Unknown | 10% |
| SPT N-value Range | Dropdown | <4 (very soft), 4-10 (good candidate), 10-30 (maybe), >30 (doesn't need AP), Unknown | 5% |
| Geotech Report Available | Yes/No | Is a geotech report included with the bid docs? | 5% |
| Structural Loads | Dropdown | Light (<100 kPa), Moderate (100-200 kPa), Heavy (200-400 kPa), Very Heavy (>400 kPa), Unknown | 5% |

#### Section C: Commercial Viability (Required)
| Field | Type | Options/Range | Weight |
|-------|------|--------------|--------|
| GC Relationship | Dropdown | Existing (worked together), Known (met/talked), New (never worked with), Referred | 10% |
| Payment Terms | Dropdown | Net 30, Net 45, Net 60, Net 90+, Pay-when-paid, Unknown | 5% |
| Bonding Required | Yes/No/Unknown | Does the project require a performance bond? | 3% |
| Prevailing Wage | Yes/No/Unknown | Is this a publicly funded project requiring prevailing wages? | 2% |
| Competition Level | Dropdown | Low (1-2 bidders), Medium (3-5), High (5+), Unknown | 5% |

#### Section D: Operational Capacity (Required)
| Field | Type | Options/Range | Weight |
|-------|------|--------------|--------|
| Schedule Conflict | Dropdown | No conflict, Minor overlap, Major overlap, Crew fully committed | 10% |
| Mobilization Timeline | Dropdown | 4+ weeks (comfortable), 2-4 weeks (tight), <2 weeks (very tight) | 5% |
| Column Count Estimate | Number | Estimated number of piers (rough) | 0% (info only) |
| Project Duration Estimate | Number (days) | Based on LF/1000 rule from SOP | 0% (info only) |

#### Section E: Risk Factors (Optional)
| Field | Type | Weight |
|-------|------|--------|
| Site Access Concerns | Yes/No + Notes | 2% |
| Environmental/Permitting Issues | Yes/No + Notes | 2% |
| Unusual Specs or Requirements | Yes/No + Notes | 1% |

### 2.2 Scoring Logic

#### Disqualifiers (Automatic No-Bid)
These conditions produce an immediate NO-BID regardless of score:
- Soil Type = Peat/Organic only (VSC not suitable)
- Treatment Depth > 35 feet (beyond practical VSC limit)
- Undrained Shear Strength < 15 kPa with no other soil types (insufficient lateral confinement)
- Crew fully committed with no relief in schedule
- Bid due date is less than 3 business days away AND no Dr. Ed prelim is possible

#### Scoring Formula
```
Total Score = Sum of (Field Score * Field Weight) for all weighted fields
```

Each field is scored 0-100 internally:

**Distance scoring:**
- 0-50 miles: 100
- 50-100 miles: 85
- 100-200 miles: 70
- 200-300 miles: 50
- 300-500 miles: 30
- 500+ miles: 10

**Soil Type scoring:**
- Soft clay (cu 25-50 kPa): 100 (ideal)
- Loose sand: 90
- Silt: 85
- Mixed/Unknown: 60
- Stiff clay: 50 (may not need improvement)
- Fill: 70 (variable)
- Dense sand: 20 (likely doesn't need AP)
- Peat/Organic: 0 (disqualifier)

**Treatment Depth scoring:**
- 5-20 feet: 100 (sweet spot)
- 20-25 feet: 80
- 25-30 feet: 60
- 30-35 feet: 30
- 35+ feet: 0 (disqualifier)
- Unknown: 50

**GC Relationship scoring:**
- Existing: 100
- Referred: 80
- Known: 60
- New: 30

**Schedule Conflict scoring:**
- No conflict: 100
- Minor overlap: 70
- Major overlap: 30
- Fully committed: 0 (disqualifier)

**Payment Terms scoring:**
- Net 30: 100
- Net 45: 80
- Net 60: 50
- Net 90+: 20
- Pay-when-paid: 10
- Unknown: 40

### 2.3 Output

#### Recommendation Thresholds
| Score Range | Recommendation | Action |
|-------------|---------------|--------|
| 75-100 | **BID** | Proceed with estimating. Strong fit for PF. |
| 50-74 | **REVIEW** | Discuss with Brad before committing estimating resources. |
| 0-49 | **NO-BID** | Pass. Document reason and notify GC professionally. |

#### Output Display
- Overall score (0-100) with color indicator (green/amber/red)
- Recommendation (BID / REVIEW / NO-BID) with confidence level
- Score breakdown by category (Technical, Commercial, Operational, Risk)
- Any disqualifiers that triggered
- Top 3 risk factors identified
- Suggested talking points if pursuing (competitive advantages for this project)
- PDF export for project file

### 2.4 Additional Features

#### Assessment History
- Save all completed assessments
- Track outcome (won/lost/no-bid) for each assessed project
- Over time, correlate scores with win rates to refine weighting

#### Quick Mode
- For rapid screening: only require Section A + 3 key fields (soil type, depth, distance)
- Produces a preliminary score with lower confidence
- Full assessment required before committing estimating resources

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Load Time | < 2 seconds |
| Assessment Time | < 5 minutes for full, < 1 minute for quick mode |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive — usable on phone between job sites |
| Data Storage | Local (JSON) initially, SharePoint once connected |
| Accessibility | WCAG 2.1 AA minimum |
| Export | PDF with PF branding |

## 4. Data Flow

```
Bid Invitation Received (from GC)
    |
    v
Jonathan opens Feasibility Tool
    |
    v
Enters project data (5 min)
    |
    v
Tool calculates weighted score
    |
    v
+--- BID (75+) ----> Proceed to Estimating SOP Step 1
|
+--- REVIEW (50-74) --> Flag for Brad discussion
|
+--- NO-BID (0-49) --> Document reason, notify GC, archive
    |
    v
Assessment saved to history
    |
    v
After project outcome known: update win/loss for scoring refinement
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded as a module in unified portal | Required |
| Bid Log (SharePoint) | Auto-populate project info if bid is in log | Phase 2 |
| Pipeline Tracker | Feed BID assessments into pipeline | Phase 2 |
| Estimating Workflow | Link to SOP steps after BID recommendation | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. What is the minimum project value worth pursuing? ($25K? $50K? $75K?)
2. What is the maximum distance from the yard you'd consider? (300 miles? 500 miles? No limit with Dr. Garbin's 39-state license?)
3. Are there any GCs you would always bid for regardless of other factors?
4. Are there any GCs you would never bid for?
5. What is the minimum lead time needed from Dr. Ed for a prelim? (SOP says 5 days minimum — is that firm?)
6. Should prevailing wage projects get a score penalty, or just a cost adjustment flag?
7. Is there a bonding capacity limit that should trigger a no-bid?
