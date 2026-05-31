# Software Requirements Specification: Proposal & Quote Generation Tool

**Project:** Pier Foundations -- Proposal & Quote Generator
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Alpha v1.0 -- Built and deployed May 30, 2026

## 1. Overview

A document generation module integrated into the PF Platform that produces PF-branded proposals from approved estimates. Automatically populates all template fields, calculates spoils and alternates, and outputs a PDF matching PF's existing Word template format.

## 2. Functional Requirements

### 2.1 Input Data (From Approved Estimate)

| Field | Source | Template Location |
|-------|--------|------------------|
| Proposal Date | Current date (day of submission) | Header |
| Project Name | Estimate / Pipeline | Title + body |
| Project Address | Estimate / Pipeline | Body |
| Contract Documents Date | Bid drawing set date | Body (Step 19.c) |
| Architect of Record | Bid drawings | Body (Step 19.d) |
| Drawing Date | Same as contract documents date | Body (Step 19.e) |
| Geotech Engineer | Geotech report author | Body (Step 19.f) |
| Geotech Report Date | Geotech report date | Body (Step 19.f) |
| Base Bid Price | From estimate, as directed by Brad | Pricing section (Step 19.g) |
| Spoils Amount | Calculated: 1.5x LF (24") or 2x LF (30") | Body (Step 19.h) |
| Layout Alternate | Layout quote * 25-50% | Alternates section (Step 19.i) |
| Other Alternates | Per Brad's direction (slab support, helical) | Alternates section (Step 19.j) |
| Design Submittal Timeline | From GGG prelim (~W54) | Workflow section (Step 19.k) |
| Duration of Work | Working days + 3-5 buffer, as range | Workflow section (Step 19.l) |
| Bearing Pressure (PSF) | From GGG prelim design tab | Specifications (Step 19.m) |
| Taxes | Include or Exclude (project-specific) | Pricing notes (Step 19.n) |
| Column Diameter | 24" or 30" (from Dr. Ed) | Specifications |
| Column Count | From estimate | Specifications |
| Total LF | From estimate | Specifications |
| Stone Tonnage | From estimate | Reference |

### 2.2 Proposal Sections

Matching the existing PF Word template structure:

| Section | Content | Auto/Manual |
|---------|---------|------------|
| Header | PF logo, date, "Proposal" title | Auto |
| Project Information | Name, address, GC contact | Auto |
| Scope of Work | Standard AP/VSC scope description | Template (standard) |
| Reference Documents | Contract docs + date, architect + date, geotech + date | Auto |
| Design Criteria | Column diameter, bearing pressure, column count, LF | Auto |
| Pricing | Base bid, unit prices as directed | Auto + Manual override |
| Alternates | Layout alternate, slab support, helical (if applicable) | Calculated + Manual |
| Spoils | Anticipated spoils amount with calculation basis | Auto |
| Project Workflow | Design submittal timeline, duration of work range | Auto |
| Exclusions | Standard exclusions (permits, shoring, dewatering, etc.) | Template (standard) |
| Terms & Conditions | Standard PF terms | Template (standard) |
| Tax Status | Included or excluded | Manual selection |
| Signature Block | PF authorized signatory | Template |

### 2.3 Calculation Logic

#### Spoils Calculation
```
If column_diameter == 24":
    spoils = total_LF * 1.5
If column_diameter == 30":
    spoils = total_LF * 2.0
Unit: cubic yards (or tons -- confirm with Jonathan)
```

#### Duration of Work Range
```
base_days = total_LF / 1000  (working days)
min_duration = base_days
max_duration = base_days + 5  (3-5 day buffer)
Display as: "[min_duration] - [max_duration] working days"
```

#### Layout Alternate
```
layout_alternate = layout_quote_per_column * column_count * markup_factor
Where markup_factor is between 0.25 and 0.50 (confirm with Brad in review)
```

### 2.4 Template Management

| Feature | Description |
|---------|-------------|
| Standard Template | PF's current Word template, digitized |
| Custom Sections | Allow adding project-specific notes or sections |
| Template Versioning | Track changes to the base template over time |
| Section Locking | Standard sections (terms, exclusions) locked; only Brad can edit |
| Override Capability | Any auto-populated field can be manually overridden with audit trail |

### 2.5 Review Workflow

| Step | Action | Who |
|------|--------|-----|
| 1 | Generate draft proposal from estimate | Jonathan (auto) |
| 2 | Preview on-screen | Jonathan |
| 3 | Adjust any fields needing manual input | Jonathan |
| 4 | Submit for review | Jonathan |
| 5 | Review and approve/request changes | Brad |
| 6 | Apply revisions if needed | Jonathan |
| 7 | Final approval | Brad |
| 8 | Generate PDF | Auto |
| 9 | Record proposal in Pipeline as Submitted | Auto |

### 2.6 Output Format

- PDF matching PF branding (logo, fonts, colors)
- File naming convention: `YY-MMDD Project Name - PF Bid.pdf` (per SOP Step 8.c)
- File size optimization for email attachment (keep under 10MB)

### 2.7 Revision Tracking

| Field | Description |
|-------|-------------|
| Version Number | Auto-increment (v1, v2, etc.) |
| Change Description | What was modified |
| Changed By | Who made the change |
| Date | When the change was made |
| Previous Version | Link to prior PDF |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| Generation Time | < 10 seconds from approved estimate to draft proposal |
| PDF Quality | Print-ready, matching Word template formatting |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Preview-only on mobile; generation on desktop |
| Storage | Archive all generated proposals with version history |

## 4. Data Flow

```
Bid Estimate Generator (Approved)
    |
    v
Proposal Generator
    |
    +--- Auto-populate all template fields
    |
    +--- Calculate spoils, duration, layout alternate
    |
    +--- Jonathan reviews on-screen preview
    |         |
    |         v
    |    Manual adjustments (alternates, tax, custom notes)
    |
    +--- Submit for Brad's review
    |         |
    |         +--- Approved --> Generate PDF
    |         |
    |         +--- Revisions needed --> Back to Jonathan
    |
    +--- PDF generated (YY-MMDD Project Name - PF Bid.pdf)
    |
    +--- Pipeline updated to Submitted
    |
    +--- PDF + Excel estimate sent to Brad for final review (SOP Step 22)
```

## 5. Integration Points

| System | Integration | Priority |
|--------|------------|----------|
| PF Platform | Embedded module | Required |
| Bid Estimate Generator | Pull all estimate data for auto-population | Required |
| Pipeline Management | Update stage to Submitted on proposal send | Required |
| Proposal Archive | Store all versions with metadata | Required |
| Email | Attach PDF for submission tracking | Phase 2 |

## 6. Open Questions (For Brad/Jonathan)

1. Can we get a copy of the current Word template to map every field and section exactly?
2. Is the spoils unit cubic yards or tons?
3. What is the standard buffer range for duration -- always 3-5 days, or does it vary?
4. What standard exclusions are listed in the template?
5. Are PF's terms and conditions standard across all proposals, or do they vary?
6. Who is the authorized signatory on proposals (Brad only, or can Jonathan sign)?
7. Are proposals ever sent as Word documents instead of PDF?
