# Statement of Work: Bid & Estimate Generation Tool

**Project:** Pier Foundations -- Bid & Estimate Generation Workflow
**Version:** 1.1
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The Estimating SOP is PF's most detailed process -- 20+ steps from receiving a bid invitation to submitting a final proposal. It involves creating project folders, extracting drawings in Bluebeam, sending packages to Dr. Ed Garbin for preliminary design, performing takeoffs in Kreo, sourcing 3+ stone quotes, getting transport quotes from Paddacks and Stephan Trucking, getting layout quotes from Miller Land Surveying, and populating a detailed Excel template estimate.

Currently this entire process is manual, error-prone, and time-intensive (20+ hours per bid). The estimate template Excel file auto-calculates some values once key cells are populated (H9=LF, H15=Stone Tons, H16=Column Count), but every other input is manual.

This tool digitizes and partially automates the Estimating SOP, providing a guided workflow that follows each step, pre-populates data where possible, tracks vendor quote status, and produces a completed estimate ready for review with the head of estimating.

## 2. Scope

### In Scope
- Guided step-by-step workflow matching the Estimating SOP exactly
- Project folder structure creation (automated or assisted)
- Dr. Ed communication tracking (prelim request sent, received, reviewed)
- Takeoff data entry (column footings by type, wall footings LF, slab SF)
- Dr. Ed prelim data import (LF, column count, stone tonnage from cells T19-T21)
- Vendor quote tracking (stone, transport, layout)
- Detailed budget population following the Excel template logic
- Equipment rental calculation (1 week minimum, +1 week per 5 working days)
- Site crew travel days calculation (minimum 2, +1 per 6 working days)
- Mileage calculation from yard to project site
- Estimate review checklist
- Integration with Material Cost Estimator and Subcontractor Coordination

### Out of Scope
- Automated Bluebeam drawing extraction (manual step, tool tracks completion)
- Kreo takeoff integration (manual step, tool accepts takeoff results)
- Dr. Ed prelim design automation (Dr. Ed's independent process)
- Word document proposal generation (separate Proposal Generator tool)
- Bid submission to GC

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Runs every estimate through this workflow |
| Reviewer/Approver | Brad Reinking (Head of Estimating) | Reviews and approves estimates before bid |
| Engineering Advisor | Dr. Ed Garbin | Provides preliminary designs that feed into estimates |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Estimating Workflow | Multi-step form | Guided workflow matching all SOP steps |
| 2 | Budget Calculator | JavaScript | Replicates Excel template auto-calculations |
| 3 | Vendor Quote Tracker | Dashboard widget | Track status of stone, transport, layout quotes |
| 4 | Estimate Summary | On-screen + PDF | Complete estimate for review meeting |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Jonathan can complete an estimate in 50% less time than the current manual process
- All SOP steps are represented and none are skipped
- Budget calculations match the existing Excel template results exactly
- Vendor quote tracking eliminates missed or forgotten quote requests
- Brad can review a complete estimate summary without opening the Excel file

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 30 min |
| Build workflow engine + budget calculator | 45 min |
| Build vendor quote tracker + estimate summary | 30 min |
| Validate calculations against Excel template | 15 min |
| Review with Jonathan | _Human dependent_ |
| Revisions | 20 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF's Excel estimate template is the source of truth for all calculations
- Dr. Ed's prelim design summary tab provides LF (T20), Column Count (T19), and Stone Tons (T21)
- Working days = LF / 1000 (per SOP and Project Award SOP)
- Equipment rental: minimum 1 week, +1 week per additional 5 working days
- Site crew travel: minimum 2 trips, +1 trip per 6 working days
- Mileage calculated from 14308 Figel Rd, Monroeville, IN 46773 to project site, multiplied by 2 (round trip), potentially 4 or 6 for longer projects
- Transport companies: Paddacks (Miah, miah@paddacks.com) and Stephan Trucking (Mark Maller, mark@stephantrucking.com)
- Layout company: Miller Land Surveying (Brett Miller, brett@mlswebsite.us), typically $8-14/column
- Standard loads for transport: Cat 336 (98K lbs) with vibro setup, 80K excavator, F450/F550 with trailer, fall-off load for testing materials
- Spoils calculation: 1.5x Total LF for 24" columns, 2x Total LF for 30" columns

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Excel template formulas are complex and undocumented | Map every formula before building; validate with test cases |
| Dr. Ed prelim format changes | Build flexible import; flag format mismatches |
| Multiple buildings/areas in prelim require summing across sheets | Handle multi-area prelims per SOP warning |
| Jonathan's workflow varies from SOP for some projects | Allow step skipping with justification; don't force rigid order |

## 9. Open Questions for Brad/Jonathan

1. Can we get a copy of the current Excel estimate template to map all formulas exactly?
2. Does Dr. Ed's prelim format ever change, or is the T19/T20/T21 layout consistent?
3. What is the current contingency percentage used in estimates?
4. Are there project types that use a different estimate template or workflow?
5. How is the "project days" calculation adjusted for weather or site constraints?
6. What is the review meeting format -- in-person, Teams, or async review of the estimate file?
