# Statement of Work: Permitting & Inspections Tool

**Project:** Pier Foundations -- Permitting & Inspection Tracking
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

The Project Award SOP mentions coordinating submittals and ensuring projects are ready for crew mobilization, but does not detail permit tracking or inspection scheduling. VSC work may require building permits, utility locates (811), and inspections depending on jurisdiction and project scope. The pre-shift safety checklist references confirming underground utility locates. Currently there is no system for tracking permits, their status, deadlines, or required inspections.

This tool tracks permits by project, manages deadline alerts, schedules inspections, verifies compliance before and during work, and tracks utility locate (811) requests.

## 2. Scope

### In Scope
- Permit tracking by project (type, status, deadline, authority)
- 811 utility locate tracking (request, confirmation, expiration)
- Inspection scheduling and results logging
- Deadline alerts for permit renewal or expiration
- Pre-mobilization compliance verification checklist
- Integration with Project Status Tracking

### Out of Scope
- Permit application preparation (varies by jurisdiction)
- Fee payment processing
- Building code analysis
- Environmental impact assessment

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Tracks permits during project setup |
| End User | Field Foreman | Verifies permits/locates before work |
| Decision Maker | Brad Reinking | Reviews compliance status |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Permit Tracker | Database + dashboard | All permits by project with status |
| 2 | 811 Locate Tracker | Status board | Utility locate requests and confirmations |
| 3 | Inspection Log | Form + history | Schedule and record inspection results |
| 4 | Pre-Mob Compliance Checklist | Checklist | Verify all permits/locates before crew arrives |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- No crew arrives on site without required permits and locates confirmed
- All permit deadlines have advance alerts (configurable, default 14 days)
- 811 locate expiration is tracked and re-requests triggered before expiry
- Inspection results are documented and available for closeout

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build permit tracker + 811 management | 25 min |
| Build inspection log + pre-mob checklist | 15 min |
| Review with Brad/Jonathan | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF typically works under the GC's general building permit (PF does not usually pull permits directly)
- 811 utility locates are required before any excavation/penetration work
- 811 locates are valid for a limited time (typically 10-30 days depending on state)
- Inspections may be required by the GC, building department, or geotechnical engineer
- PF operates across multiple states (IN, OH, MI, IL, KY, WI) with varying requirements

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Permit requirements vary significantly by jurisdiction | Configurable permit types; note jurisdiction requirements |
| 811 locate expiration missed on long projects | Auto-alert before expiration; prompt for re-request |
| GC responsible for permits but doesn't pull them | Pre-mob checklist includes GC permit confirmation |
| State-specific 811 rules differ | Track by state; document each state's validity period |

## 9. Open Questions for Brad/Jonathan

1. Does PF ever pull permits directly, or always works under the GC's permit?
2. What inspections are typically required for VSC work (building dept, geotech, structural)?
3. Does PF use a specific 811 service or app for utility locates?
4. How long are 811 locates valid in Indiana? Other states?
5. Are there any environmental permits required for VSC work (stormwater, erosion, etc.)?
6. Does PF maintain any licenses or registrations that need renewal tracking?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
