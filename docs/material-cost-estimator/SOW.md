# Statement of Work: Material Cost Estimation Tool

**Project:** Pier Foundations -- Aggregate Material Cost Estimator
**Version:** 1.1
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The Estimating SOP requires Jonathan to manually source 3+ stone quotes per project by searching Google Maps for quarries near each project site, calling sales reps, and emailing quote requests. Stone is PF's largest material cost (hundreds to thousands of tons per project at $15-40/ton delivered). This process is repeated for every bid and takes significant time with no historical price tracking.

This tool provides a regional stone pricing database, supplier contact management, delivery cost estimation, and automated quote request generation to reduce the time spent sourcing stone quotes from hours to minutes.

## 2. Scope

### In Scope
- Regional aggregate pricing database by state (IN #8s, IL CA-7, MI 6-AA, WI 1" Clear, OH #57)
- Stone supplier contact directory with quote history
- Delivery cost estimation based on distance from quarry to project site
- Total delivered cost calculator (material + delivery per ton)
- Quote request email template generator per the Estimating SOP format
- Historical price tracking for trend analysis and budget validation
- Integration with Bid Estimate Generator for automatic cost population

### Out of Scope
- Automated quote solicitation (emails still sent by Jonathan)
- Real-time quarry inventory tracking
- Non-stone materials (rebar, concrete, etc.)
- Supplier contract negotiation

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Uses tool during estimating to find and compare stone quotes |
| Decision Maker | Brad Reinking | Reviews cost assumptions, approves supplier relationships |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Supplier Directory | Database | Stone suppliers with contacts, locations, products, and pricing history |
| 2 | Price Calculator | Interactive form | Input project location + tonnage, get estimated delivered cost |
| 3 | Quote Request Generator | Email template | Pre-filled email per SOP format for supplier outreach |
| 4 | Price History Dashboard | Charts + table | Track pricing trends by region and supplier |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Jonathan can identify 3 nearest suppliers and generate quote request emails in under 5 minutes per project
- Historical pricing provides accurate budget estimates within 15% of actual quotes received
- Tool correctly maps regional stone nomenclature (IN #8s = IL CA-7 = MI 6-AA = WI 1" Clear = #57)
- Reduces stone sourcing time by at least 50% per bid

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 20 min |
| Build supplier database + calculator | 30 min |
| Build quote generator + history tracking | 20 min |
| Review with Jonathan | _Human dependent_ |
| Revisions | 15 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF uses #57 stone (washed, no fines, crushed, angular, 3/8"-1" chips) -- typically limestone, but granite and some other types are acceptable per Dr. Ed
- Regional naming: IN = #8s, IL = CA-7, MI = 6-AA, WI = 1" Clear
- Common suppliers include: Heidelberg, IMI, Martin Marietta, StoneCo/Shelly Materials, Vulcan, Jergensen Aggregates (Melvin Stone Co), Amirize, Rogers Group
- Delivery cost is the primary variable (stone itself is relatively consistent in price; distance drives cost)
- The SOP email template format for quote requests will be followed

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Stone prices vary significantly by season and demand | Track date of each quote; flag stale prices (>90 days) |
| Delivery costs change with fuel prices | Include fuel surcharge field; flag quotes older than 60 days |
| Supplier contacts change frequently | Include "last verified" date; prompt for re-verification periodically |
| Regional stone names cause confusion | Map all regional names to #57 standard; display local name for each state |

## 9. Open Questions for Brad/Jonathan

1. What is the typical price range per ton for #57 stone (material only, no delivery) in Indiana? Ohio? Other states?
2. Are there suppliers PF would never use? Any on a preferred list?
3. Is there a minimum tonnage below which most quarries won't deliver?
4. Does PF ever use stone other than #57 (different gradation for specific soil conditions)?
5. How often do delivery rates change enough to require re-quoting?
