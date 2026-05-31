# Statement of Work: Lead Generation & RFP/Bid Scanning Tool

**Project:** Pier Foundations -- ConstructConnect Scanner & Bid Opportunity Alerts
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** PENDING -- requires ConstructConnect subscription

---

## 1. Purpose

Pier Foundations currently relies on GC relationships (Derek's BD efforts) and manual scanning for bid opportunities. The Estimating SOP begins with "Receive Bid Invitation" but has no upstream process for proactively finding opportunities. This results in:

- Dependence on GCs remembering to invite PF to bid
- Missed DOT and public infrastructure projects requiring ground improvement
- No systematic coverage of PF's six-state service area (IN, OH, MI, IL, KY, WI)
- Derek spending manual hours reviewing plan rooms instead of building relationships

This tool automates the scanning of ConstructConnect, INDOT, ODOT, MDOT, IDOT, and other bid boards for projects requiring aggregate pier / vibratory stone column ground improvement. Relevant opportunities are surfaced as alerts and fed into the pipeline.

## 2. Scope

### In Scope
- Automated scanning of ConstructConnect and state DOT portals (INDOT, ODOT, MDOT, IDOT)
- Keyword and specification filtering for ground improvement / aggregate pier relevance
- Geographic filtering by PF's service area (IN, OH, MI, IL, KY, WI)
- Relevance scoring based on project type, soil conditions mentioned, and location
- Alert notifications (email or dashboard) for high-relevance opportunities
- Integration with Feasibility Tool for rapid assessment of flagged leads
- Integration with Pipeline Management for lead tracking

### Out of Scope
- Automated bid document download and parsing (Phase 2)
- Automated geotech report analysis (future tool)
- Scanning of private plan rooms requiring paid subscriptions beyond ConstructConnect
- Bidding or proposal generation

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Derek Franke | Reviews alerts, qualifies leads |
| End User (Secondary) | Jonathan Reinking | Receives qualified leads for estimating |
| Decision Maker | Brad Reinking | Approves scanning criteria, service area boundaries |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Scanner Configuration | Settings UI | Define keywords, geographies, project types to monitor |
| 2 | Scanning Engine | Backend service | Automated periodic scanning of bid sources |
| 3 | Relevance Scoring | Algorithm | Score 0-100 for each opportunity's fit with PF capabilities |
| 4 | Alert Dashboard | HTML (in platform) | List of scored opportunities with filtering and sorting |
| 5 | Alert Notifications | Email digest | Daily summary of new high-relevance opportunities |
| 6 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Derek can review daily opportunities in under 10 minutes
- Tool identifies at least 80% of opportunities that PF would want to know about
- False positive rate below 30% (not overwhelming with irrelevant results)
- At least one new lead per week that PF would have otherwise missed
- Seamless handoff from scanner to feasibility assessment

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 30 min |
| Research ConstructConnect API/scraping options | 30 min |
| Build v1 (keyword scanning + alerts) | 45 min |
| Review with Derek/Brad | _Human dependent_ |
| Revisions + DOT portal integration | 30 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF has or will obtain a ConstructConnect subscription with API or data export access
- PF's primary service area is IN, OH, MI, IL, KY, WI (Dr. Garbin licensed in 39 states -- expansion possible)
- Key search terms include: aggregate pier, vibro stone column, ground improvement, soil stabilization, deep foundations, stone columns, rammed aggregate pier
- Equipment is based at 14308 Figel Rd, Monroeville, IN 46773 (distance calculations originate here)

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| ConstructConnect API access may be limited or expensive | Research scraping alternatives; start with RSS/email parsing |
| DOT portals have inconsistent formats | Build per-portal adapters; start with INDOT |
| Too many false positives overwhelm Derek | Tune relevance scoring based on first month of feedback |
| Missed opportunities due to non-standard terminology | Include regional terms (aggregate pier, rammed aggregate pier, vibro replacement, stone column) |
| Spec sections mentioning ground improvement buried in large doc sets | Phase 2: add specification document parsing |

## 9. Open Questions for Brad/Derek

1. Does PF currently have a ConstructConnect account? What tier/access level?
2. Are there other plan rooms or bid boards PF currently monitors?
3. What project types should be excluded entirely (residential, utility, etc.)?
4. Should the tool also flag projects where ground improvement is NOT specified but soil conditions suggest it could be value-engineered?
5. What is the minimum project size worth flagging?
6. Are there specific GCs whose projects should always be flagged regardless of other criteria?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
