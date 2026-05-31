# Statement of Work: Change Order Management Tool

**Project:** Pier Foundations -- Change Order Management
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The Project Award SOP explicitly warns that "variations from the information above on which the design is based, or field changes after the design is completed may result in a CO." PF's proposals include this language, but there is no formal system for identifying, documenting, pricing, and tracking change orders through GC approval.

Change orders in aggregate pier work commonly arise from: additional columns discovered during construction, depth changes due to actual soil conditions differing from the geotech, site grade variations exceeding the +/- 3" tolerance, or scope additions (slab support, additional areas). Without a system, revenue is left on the table and documentation is inconsistent.

This tool provides a structured change order workflow from identification through GC approval, with cost calculations using the original estimate rates and photo documentation support.

## 2. Scope

### In Scope
- Change order identification and documentation
- Cost impact calculation using original estimate unit rates
- Photo documentation attachment
- GC submission tracking and approval workflow
- Change order history and audit trail per project
- Impact on project budget and schedule tracking

### Out of Scope
- Contract dispute resolution
- Legal claim documentation
- GC-initiated deductive change orders (Phase 2)
- Automated field condition detection

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Creates and prices change orders |
| End User | Field Operations Manager | Identifies conditions requiring COs in the field |
| Decision Maker | Brad Reinking | Approves CO pricing before submission |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | CO Identification Form | Interactive form | Document the changed condition |
| 2 | Cost Calculator | JavaScript | Calculate CO cost from estimate rates |
| 3 | CO Document Generator | PDF | Formal CO submission to GC |
| 4 | Approval Tracker | Status board | Track CO through submission and approval |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Every changed condition is documented within 24 hours of identification
- CO pricing is consistent with original estimate rates
- GC approval status is visible to the entire PF team
- Revenue from legitimate COs is not missed due to poor documentation

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build CO form + calculator | 25 min |
| Build document generator + tracker | 20 min |
| Review with Brad | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- CO pricing uses unit rates from the original approved estimate (turnover budget)
- PF's proposals include change order language regarding design variations
- Photo documentation is taken on mobile devices and uploaded
- COs require Brad's approval before submission to GC
- Site grade tolerance is +/- 3" per the Award SOP submittal requirements

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Field crew doesn't document conditions in real time | Simple mobile form; daily log integration as prompt |
| GC disputes CO validity | Strong documentation + photos at time of discovery |
| CO pricing is inconsistent with estimate | Lock unit rates from turnover budget |
| COs submitted late miss contractual notification windows | Alert system for time-sensitive CO conditions |

## 9. Open Questions for Brad/Jonathan

1. What is PF's current process for identifying and submitting change orders?
2. What are the most common types of change orders PF encounters?
3. Does PF have a standard CO form, or does each GC require their own format?
4. What contractual notification window does PF typically have for COs (48 hours? 7 days?)?
5. What markup does PF apply to CO work (same as original bid, or different)?
6. How often do COs get approved vs. disputed by GCs?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
