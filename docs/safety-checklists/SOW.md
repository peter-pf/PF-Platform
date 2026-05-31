# Statement of Work: Safety Checklists Tool

**Project:** Pier Foundations -- Safety Checklists & Compliance
**Version:** 1.2
**Date:** May 31, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

VSC/aggregate pier installation involves heavy equipment operation (Cat 336 at 98K lbs), vibration exposure, silica dust from stone handling, noise from vibratory equipment, and work near open excavations. OSHA compliance requires documented safety protocols, equipment inspections, and training records. Currently PF has no standardized digital safety checklist system, creating compliance risk and documentation gaps.

This tool provides pre-shift safety checklists specific to VSC operations, equipment inspection forms, toolbox talk logging, and OSHA compliance tracking.

## 2. Scope

### In Scope
- Pre-shift safety checklist for VSC operations
- PPE verification checklist
- Equipment inspection forms (daily and weekly)
- Toolbox talk log and topic library
- OSHA compliance tracking (silica, heat, vibration, noise, fall protection)
- Incident and near-miss reporting (linked to Daily Logs)
- Safety documentation archive for project closeout

### Out of Scope
- OSHA reporting submission (manual process)
- Workers' compensation claims
- Medical surveillance programs
- Third-party safety audits

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Field Foreman | Completes daily checklists before work begins |
| End User | Crew Members | PPE verification, incident reporting |
| Decision Maker | Brad Reinking | Sets safety policy, reviews compliance |
| Builder | Peter (AI COO) | Designs, builds, and maintains the tool |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Pre-Shift Safety Checklist | Mobile form | Daily safety verification before operations |
| 2 | Equipment Inspection Form | Mobile form | Daily equipment safety checks |
| 3 | Toolbox Talk Log | Form + topic library | Record daily safety briefings |
| 4 | Compliance Dashboard | HTML | OSHA compliance status summary |
| 5 | SRS Document | .md file | Full requirements specification |

## 5. Success Criteria

- Pre-shift checklist takes under 5 minutes to complete
- 100% of work days have documented safety checklists
- Toolbox talk topics are relevant to VSC operations and rotate appropriately
- Safety documentation is readily available for GC requests or OSHA inspections

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|-------------------|
| SOW + SRS | 15 min |
| Build checklist forms | 25 min |
| Build toolbox talk library + dashboard | 20 min |
| Review with Brad | _Human dependent_ |
| Revisions | 10 min |
| Deploy to platform | 10 min |

## 7. Assumptions

- PF crews work with Cat 336 excavator, vibratory equipment, and #57 aggregate stone
- OSHA silica exposure standards (Table 1 compliance for construction) apply
- Noise exposure from vibratory equipment may require hearing protection
- Heat illness prevention applies during summer operations
- PF's typical crew size is 2-4 workers per site

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| Crew views checklists as paperwork burden | Keep it under 5 minutes; show value in protection |
| Missing compliance requirements specific to VSC work | Consult OSHA standards for pile driving/ground improvement |
| Checklist fatigue (checking boxes without reading) | Randomize question order; periodic surprise items |
| GC safety requirements vary by project | Allow project-specific safety additions |

## 9. Open Questions for Brad

1. Does PF currently have any safety checklists or forms in use?
2. Has PF had any OSHA inspections or citations? What areas were flagged?
3. What PPE is standard for VSC operations (hard hat, steel toes, hearing, safety glasses, gloves, hi-vis)?
4. Does PF have a safety manual or written safety program?
5. Do GCs typically require PF-specific safety documentation at project start?
6. Is there a designated safety officer, or is Brad the responsible party?

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Data Source:** SharePoint live sync (4 master files)
- **Stage:** Alpha -- awaiting Brad/Jonathan review
