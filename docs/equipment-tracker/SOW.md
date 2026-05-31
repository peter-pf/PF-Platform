# Statement of Work: Equipment & Fleet Tracking Tool

**Project:** Pier Foundations -- Equipment & Fleet Tracker
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

PF's equipment fleet is the backbone of operations -- the Cat 336 (98K lbs) with vibro setup is the primary production asset, supported by an 80K excavator, F450/F550 trucks, vibroflot, and testing jacks. The Estimating SOP references specific equipment for transport quoting and the GUHMA SOP tracks equipment IDs. The modulus testing SOP tracks jack calibration factors that change annually (Chicago Jack calibration).

Currently there is no centralized tracking of equipment location (yard vs jobsite), maintenance schedules, utilization rates, or calibration status. This leads to:

- No visibility into equipment availability for scheduling new projects
- Risk of missed maintenance intervals (hours-based)
- Risk of expired jack calibration affecting test validity
- Manual tracking of what equipment is where

This tool provides centralized equipment tracking with location, maintenance, utilization, and calibration management.

## 2. Scope

### In Scope
- Equipment registry with all PF assets
- Location tracking (yard at 14308 Figel Rd, Monroeville, IN 46773 vs. active jobsite)
- Hours-based maintenance scheduling with alerts
- Jack calibration tracking (annual, Chicago Jack)
- Calibration factor management (current: 49.84 for small jack, 32.88 for large jack)
- Utilization reporting (days on site vs. days in yard)
- Equipment status dashboard

### Out of Scope
- GPS real-time tracking (future phase)
- Fuel consumption tracking (future phase)
- Equipment acquisition/disposal workflow
- Rental equipment from third parties (tracked in estimates, not here)

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Tracks equipment status for scheduling |
| End User | Field Operations Manager | Updates location and hours |
| Decision Maker | Brad Reinking | Reviews utilization, approves maintenance |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Equipment Registry | Database | All PF assets with specifications |
| 2 | Status Dashboard | HTML (in platform) | Current location, status, hours for all equipment |
| 3 | Maintenance Scheduler | Alert system | Hours-based maintenance alerts |
| 4 | Calibration Tracker | Alert system | Annual calibration due dates and current factors |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Anyone on the team can see where every piece of equipment is in under 10 seconds
- Maintenance alerts fire before service is due (configurable lead time)
- Jack calibration expiration is never missed
- Utilization data helps justify equipment purchases or identify underused assets

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build equipment registry + dashboard | 25 min |
| Build maintenance + calibration tracking | 20 min |
| Review with Brad | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF's current fleet includes: Cat 336 (98K lbs) with vibro setup, 80K excavator, F450/F550, vibroflot, testing jacks (small: <175 kips, large: >175 kips)
- Equipment is based at 14308 Figel Rd, Monroeville, IN 46773 when not on a jobsite
- Jack calibration is annual through Chicago Jack
- Current calibration factors: small jack = 49.84, large jack = 32.88
- Equipment ID convention: "VSC Rig" for now, will change to "VSC Rig #1, #2, #3" as fleet grows (per GUHMA SOP)
- Hours tracking is manual (operator reports)

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Hours data not consistently updated | Simple update interface; prompt at project start/end |
| Maintenance intervals vary by equipment type | Configurable intervals per asset |
| Fleet grows and tracking becomes complex | Build for scalability from the start (VSC Rig #1, #2, #3) |
| Calibration factor confusion between jacks | Clear labeling; auto-populate in modulus test forms |

## 9. Open Questions for Brad/Jonathan

1. What is the complete list of PF-owned equipment (make, model, year, serial)?
2. What are the maintenance intervals for each piece of equipment (hours or calendar)?
3. When was the last jack calibration, and when is the next one due?
4. Is there other equipment not mentioned in the SOPs (generators, compressors, etc.)?
5. Who is responsible for updating equipment hours -- operators, Jonathan, or both?
6. Does PF rent any equipment regularly that should be tracked alongside owned assets?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
