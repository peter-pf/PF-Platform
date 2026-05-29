# Statement of Work: Feasibility / No-Go Tool

**Project:** Pier Foundations — Feasibility & Bid/No-Bid Decision Tool
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_

---

## 1. Purpose

Pier Foundations currently has no formal process for deciding whether to invest estimating resources in a bid opportunity. The Estimating SOP states "confirm the project requires AP" but does not define specific go/no-go criteria. This results in:

- Estimating time spent on projects PF shouldn't be pursuing
- No risk assessment before committing resources (20+ hours per bid)
- No standardized evaluation across team members
- Missed opportunities that should have been pursued

This tool provides a rapid, standardized project feasibility assessment that outputs a clear Bid / No-Bid / Review recommendation with a risk score.

## 2. Scope

### In Scope
- Feasibility assessment form with weighted scoring criteria
- Automated Bid / No-Bid / Needs Review recommendation
- Risk scoring (0-100) across technical, commercial, and operational dimensions
- Integration with PF's estimating workflow (Step 1 of SOP — before committing to a bid)
- PDF-exportable assessment report for project file
- Historical tracking of assessments and outcomes (win/loss correlation)

### Out of Scope
- Full cost estimation (separate tool)
- Geotech report analysis automation (future phase)
- GC relationship scoring (future — depends on Derek's BD data)
- Automated bid submission

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Uses tool for every incoming bid invitation |
| End User (Secondary) | Derek Franke | May use for BD opportunity assessment |
| Decision Maker | Brad Reinking | Reviews edge cases, approves criteria weighting |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |
| Engineering Advisor | Dr. Ed Garbin | Validates technical feasibility criteria |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Feasibility Assessment Form | HTML (in platform) | Interactive form with all criteria fields |
| 2 | Scoring Engine | JavaScript | Weighted scoring algorithm producing 0-100 risk score |
| 3 | Recommendation Output | On-screen + PDF | Bid / No-Bid / Review with score breakdown |
| 4 | Criteria Configuration | Editable | Brad/Jonathan can adjust weights and thresholds |
| 5 | Assessment History | Data store | Track past assessments for win/loss analysis |
| 6 | SRS Document | .md file | Full requirements specification |
| 7 | Design Document | .md file | Architecture and UI design |

## 5. Success Criteria

- Jonathan can complete an assessment in under 5 minutes
- Tool correctly identifies projects outside PF's capability (soil type, depth, distance)
- Risk score correlates with actual project outcomes over time
- Reduces wasted estimating effort by filtering unsuitable projects early
- Brad and Jonathan agree the criteria reflect actual business decision factors

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS + Design Doc | 30 min |
| Build v1 | 30 min |
| Review with Brad/Jonathan | _Human dependent_ |
| Revisions | 15 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF's primary service is aggregate pier / VSC installation (24" and 30" diameter)
- Maximum practical treatment depth is approximately 30 feet
- PF's equipment is based at 14308 Figel Rd, Monroeville, IN 46773
- PF currently operates in IN, OH, MI, IL, KY, WI (Dr. Garbin licensed in 39 states)
- Minimum project size and maximum distance thresholds to be confirmed by Brad/Jonathan
- Criteria weighting to be validated by Brad/Jonathan before deployment

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Criteria don't match actual decision factors | Validate with Jonathan on 3 recent bid/no-bid decisions |
| Tool is too rigid (passes on good opportunities) | Include "Needs Review" middle category, not just binary |
| Team doesn't use it | Make it faster than the current mental checklist — under 5 min |
| Scoring weights are wrong | Make weights configurable, adjust based on win/loss data over time |
