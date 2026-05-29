# Statement of Work: Punch List & Closeout Tool

**Project:** Pier Foundations -- Punch List & Project Closeout
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_

---

## 1. Purpose

The GUHMA SOP describes generating the final column installation report as part of closeout. The modulus testing SOP produces test reports that must be delivered to the GC and engineer. The Project Award SOP references moving projects through active to complete status. Currently there is no formal checklist ensuring all closeout documents are assembled and delivered before PF leaves a project.

This tool provides an end-of-project workflow that tracks the assembly and delivery of the complete closeout document package: GUHMA report, modulus test results, as-built drawings, stone delivery tickets, daily logs, lien waivers, and warranty letter. Ensures nothing is missed and GC sign-off is obtained.

## 2. Scope

### In Scope
- Closeout document checklist with status tracking
- Document assembly from connected tools (GUHMA, daily logs, modulus tests)
- GC sign-off tracking and communication
- Lien waiver generation/tracking
- Warranty letter generation
- Final project metrics summary
- Integration with Pipeline Management (Complete stage)

### Out of Scope
- Document creation (GUHMA reports, test results created in their respective tools)
- Final invoicing (in QuickBooks)
- Warranty claim management (future phase)
- Record retention policy enforcement

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Assembles closeout packages |
| End User | Field Operations Manager | Provides field documentation |
| Decision Maker | Brad Reinking | Approves final documentation |
| Engineering Advisor | Dr. Ed Garbin | Provides engineering closeout docs |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Closeout Checklist | Interactive checklist | All required documents with status |
| 2 | Document Package Assembler | File collection | Gather docs from connected tools |
| 3 | Lien Waiver Template | PDF | Standard lien waiver for PF |
| 4 | Warranty Letter Template | PDF | Standard warranty letter |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Zero closeout items missed on any project
- Closeout package is assembled in under 1 hour (currently takes multiple hours)
- GC receives complete documentation package at or before demobilization
- Pipeline entry moves to Complete only after all checklist items are satisfied

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build closeout checklist + assembler | 25 min |
| Build templates (lien waiver, warranty) | 15 min |
| Review with Brad/Jonathan | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- Closeout documents include: GUHMA combined PDF report, modulus test results, approved shop drawings (as-built), stone delivery tickets, daily logs, lien waivers, warranty letter
- GUHMA report is generated per the GUHMA SOP (combined PDF of all columns)
- Modulus test reports come from the modulus testing SOP process
- Stone delivery tickets are collected on site during construction
- PF provides a standard warranty on aggregate pier installations

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Field documents not collected during project | Daily log tool prompts for documentation; end-of-project reminder |
| GC delays sign-off | Automated follow-up reminders; track aging |
| Missing stone delivery tickets | Prompt field crew to upload daily; reconcile against invoice |
| Warranty terms need legal review | Get Brad's approval on standard warranty language |

## 9. Open Questions for Brad/Jonathan

1. What documents are included in PF's current closeout package?
2. Does PF have a standard warranty letter? What does it cover and for how long?
3. Does PF use conditional or unconditional lien waivers? Progress and final?
4. What format does the GC typically want closeout documents in (single PDF, USB, cloud link)?
5. Is there a retention period for project documents (5 years? 10 years?)?
6. Does Dr. Ed provide any closeout documentation beyond the approved shop drawings?
