# Statement of Work: Bid & Estimate Generation Tool

**Project:** Pier Foundations -- Bid & Estimate Generation Workflow
**Version:** 1.3
**Date:** June 1, 2026
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

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review

---

## 11. v1.4 Update — Template Re-Anchor (June 4, 2026)

**Trigger:** Jonathan reported the module's example estimate came back ~1.5x too high to be competitive, and provided the master estimate template ("26-0422 Master Budget Estimate Template PF.xlsm") as the source of truth.

**Root causes of the ~1.5x overage (fixed):**
1. Inflated Garbin engineering fees (base $28,000 vs template $8,500; bidding $5,040 vs $1,000).
2. Flat `tonsPerLF` (0.209) that ignored column diameter — also the QA-flagged "diameter has no effect" bug. Stone is now geometry-driven by diameter.
3. Inflated testing/mobilization counts.
4. Markups applied to the raw construction cost instead of the template's grossed-up contract-value chain.

**Corrected build-up (mirrors template, verified to the penny on the example):**
- Construction cost (bottom-up by cost code: 5050-5053 professional, 5110 stone+trucking, 5190 testing, 5220/5230 labor+burden, 5300 travel, 5400 equipment) = ~$70,103
- + OH (from OH Calcs sheet) + Insurance = "TOTAL OF ABOVE"
- + Commissions (3.5%), Contingency (2.25-2.5%), Profit (5.0%) applied to the grossed-up contract value (solved via `TOTAL / (1 - 0.1075)`), markup factor ≈ **1.2575x**.

**Verification (self-checked):** live module driven through its UI with the example inputs (2,955 LF, 197 columns, 24") returns **$88,164** vs the template's **$88,149.89** (within 0.02%); 30" correctly prices higher than 24" (diameter now affects stone + spoils). No console errors. Old module returned ~$130k+.

**Open Questions (sec. 9) — now answered by Jonathan (6/4):**
1. Excel template received. 2. Dr. Ed's format never changes. 3. Contingency 2.5%. 4. Helical uses a different template/workflow — not pursued now. 5. Project days adjusted manually by Jonathan for weather/site. 6. Review usually just an email unless a large project.

**Status:** Rebuilt, deployed, verified. Pending Jonathan's review of the live module against more examples.

## 12. Independent Verification Pass (June 4, 2026)

Per Brad's mandate, two independent agents double-checked the rebuild after deploy.

**QA-engineer — PASS ("trust it on real bids"):** independently re-implemented computeEstimate and reconciled every line item to the template. Project total $88,164.48 vs template $88,149.89 = +0.0166%; the entire $14.59 gap traced to the template hand-rounding stone to 440 TN vs the module's geometry-derived 440.24 TN. Diameter (1.5625x stone for 30"), spoils (1.5x/2.0x), markup chain, and engineering fees all confirmed. No division-by-zero/NaN/crash on any input incl. a 500,000 LF job.

**Code reviewer — APPROVED FOR PRODUCTION:** no CRITICAL/HIGH; XSS discipline (esc()) honored, no secrets in repo, division guards consistent, the de-circularized markup formula correct.

**Hardening applied from their findings:**
- Estimator: negative inputs now clamped to 0 (defense-in-depth; UI already requires LF & columns > 0).
- Email helper (tools/pf_email.py, not in this repo): added network timeouts + clean error handling, reply-all (keeps all thread participants), hardened .env parsing.

**Re-verified after hardening:** example still returns $88,164.48; no console errors.

**Non-blocking backlog (future):** UI guard so a blank form shows "enter quantities" rather than the fixed-cost floor; rename cosmetic `rentalCompressorWeeks`→`Days`; prune dead legacy defaults; wrap hardcoded safety-module strings in esc() for consistency.

## 13. Stage Clarification (June 4, 2026)
The "approved for production" in sec.12 is the code REVIEWER's code-safety verdict, not the platform's release stage. Actual stage: **ALPHA**. The estimating rebuild has passed internal build + independent verification; it still must go through UAT/stress testing (Jonathan + Derek), then Beta (2 weeks live use), before Production (v1.0). Per docs/PLATFORM-RELEASE-STAGES.md.
