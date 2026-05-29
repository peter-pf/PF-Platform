# Statement of Work: Subcontractor Coordination Tool

**Project:** Pier Foundations -- Subcontractor Coordination & Vendor Management
**Version:** 1.0
**Date:** May 29, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_

---

## 1. Purpose

PF relies on several key subcontractors and vendors for every project: Miller Land Surveying (MLS) for staking/layout, Paddacks and Stephan Trucking for equipment transport, and multiple stone suppliers. The Estimating SOP contains contact information scattered through procedural steps (Paddacks: Miah, miah@paddacks.com; Stephan: Mark Maller, mark@stephantrucking.com; MLS: Brett Miller, brett@mlswebsite.us). Performance history, availability, and scheduling are not tracked.

This tool centralizes subcontractor contact information, tracks performance history, manages scheduling, and provides a single reference for all vendor relationships.

## 2. Scope

### In Scope
- Subcontractor/vendor contact directory
- Performance tracking (on-time delivery, quote responsiveness, quality)
- Availability and scheduling coordination
- Quote history and pricing trends
- Integration with Bid Estimate Generator for contact lookup and quote requests

### Out of Scope
- Contract management (legal documents)
- Insurance certificate tracking (Phase 2)
- Payment processing (in QuickBooks)
- New vendor sourcing/qualification

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Coordinates subs during estimating and project execution |
| End User | Derek Franke | Manages relationships with GCs and some vendors |
| Decision Maker | Brad Reinking | Approves vendor relationships |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Vendor Directory | Database | All subs/vendors with contacts, services, and history |
| 2 | Performance Tracker | Dashboard | Ratings and history for each vendor |
| 3 | Scheduling View | Calendar | Vendor availability and project assignments |
| 4 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- All vendor contacts are findable in under 10 seconds
- Performance data helps identify the best vendor for each project
- Scheduling prevents double-booking of key vendors
- Quote history provides pricing benchmarks for new estimates

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build vendor directory + performance tracker | 25 min |
| Build scheduling view | 15 min |
| Review with Jonathan | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF's key subs are: Miller Land Surveying (layout), Paddacks (transport), Stephan Trucking (transport)
- Stone suppliers are managed in the Material Cost Estimator tool
- Layout pricing is typically $8-14 per column (per SOP)
- Transport involves 3+ loads per mobilization (Cat 336 + vibro, 80K excavator, F450/F550 + trailer, fall-off load)
- Subs are engaged per-project, not under long-term contracts

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Vendor contacts change without notice | Include "last verified" date; prompt for re-verification quarterly |
| Over-reliance on single vendors | Track backup vendors; alert when primary is unavailable |
| Performance ratings are subjective | Use objective metrics (on-time %, quote response time, price competitiveness) |

## 9. Open Questions for Brad/Jonathan

1. Are there vendors beyond MLS, Paddacks, and Stephan that PF uses regularly?
2. Has PF ever had a bad experience with a vendor that should be documented?
3. Do any vendors require advance booking (how far ahead)?
4. Are there regional subs used only for certain states?
5. Does PF track insurance certificates for subs currently?
