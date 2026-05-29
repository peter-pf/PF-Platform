# Statement of Work: Proposal & Quote Generation Tool

**Project:** Pier Foundations -- Proposal & Quote Generator
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_

---

## 1. Purpose

The Estimating SOP (Steps 19-22) describes manually updating a Word template proposal with project-specific details after the estimate is approved. The template has highlighted fields that need updating: date, project name/address, contract documents date, architect, geotech engineer, pricing, spoils amount, layout alternate, and project workflow timeline. This is repetitive manual work that follows a predictable pattern.

This tool auto-generates PF's standard proposal document from a completed and approved estimate, populating all template fields with project-specific data. The output matches PF's existing Word template format exactly.

## 2. Scope

### In Scope
- Auto-generation of PF Word-template-style proposals from approved estimates
- Population of all highlighted template fields from estimate data
- Spoils calculation (1.5x LF for 24" columns, 2x LF for 30" columns)
- Layout alternate calculation (layout quote * 25-50%, per SOP)
- Project workflow timeline from Dr. Ed's design submittal timeline
- Duration of work calculation (working days + 3-5 buffer days, presented as range)
- Bearing pressure from GGG prelim design
- PDF export matching PF branding
- Version tracking for proposal revisions

### Out of Scope
- Estimate calculation (handled by Bid Estimate Generator)
- Bid submission to GC
- Contract generation (post-award)
- Alternate pricing for helical piles (flagged but manually determined)

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Generates proposals after estimate approval |
| Reviewer/Approver | Brad Reinking | Final review before submission |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Proposal Generator | Form + auto-populate | Fills template from estimate data |
| 2 | Proposal Preview | On-screen | Visual preview before PDF generation |
| 3 | PDF Output | PDF (PF branding) | Matches existing Word template format |
| 4 | Revision Tracker | Version list | Track changes between proposal versions |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Proposal generation takes under 2 minutes from approved estimate (currently 30+ min)
- Output matches PF's existing Word template format exactly
- All calculated fields (spoils, duration, bearing pressure) are correct
- Brad can review and approve without re-entering any data

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Map PF Word template fields | 15 min |
| Build generator + preview | 30 min |
| Build PDF output | 15 min |
| Review with Jonathan | _Human dependent_ |
| Revisions | 15 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF's Word template proposal has a consistent format with highlighted fields
- Pricing is always as directed by head of estimating in the review meeting
- Spoils formula: 1.5x Total LF (24") or 2x Total LF (30")
- Layout alternate: layout quote * 25-50% (discuss with head of estimating)
- Duration presented as a range (e.g., "5-10 working days" for a 5-day estimate)
- Bearing pressure comes from the GGG prelim design tab
- Taxes inclusion/exclusion is project-specific

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Word template format changes | Build template mapping as configuration, not hardcoded |
| Some proposals require custom sections | Allow manual overrides and additions |
| PDF formatting doesn't match Word exactly | Use Word template as PDF base; iterate on formatting |
| Alternate pricing requires judgment calls | Flag alternates for manual input; suggest defaults |

## 9. Open Questions for Brad/Jonathan

1. Can we get a copy of the current Word template proposal to map every field exactly?
2. Is the layout alternate always 25-50% of the layout quote, or does it vary?
3. What other alternates besides layout and slab support are commonly included?
4. Should helical pile alternates be calculated or always manually determined?
5. How is the tax inclusion/exclusion decision made (state? project type? GC preference?)?
6. Is the proposal ever customized beyond what the template provides (custom cover letters, etc.)?
