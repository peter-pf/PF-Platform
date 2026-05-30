# Statement of Work: GUHMA Integration (Research & Specification)

**Project:** Pier Foundations -- GUHMA Column Logging Integration
**Version:** 1.1
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed to pf-platform.pages.dev/platform/

---

## 1. Purpose

GUHMA is PF's column installation logging software used to record and verify every aggregate pier installed. The GUHMA Column Checking SOP describes a detailed manual process: downloading zip files of column data, opening them in the GUHMA desktop app, configuring report settings, verifying depths against shop drawings, reconciling stone bucket counts against hand logs (sometimes editing raw data files in Notepad), and generating a combined PDF report for closeout.

This is a RESEARCH AND SPECIFICATION document -- not a build spec. Before building any integration, we need to understand GUHMA's data format, export capabilities, and API availability. We need sample data files from a completed project to understand the structure.

## 2. Scope

### In Scope (Research Phase)
- Document GUHMA's data file format (the .txt files that can be edited in Notepad per SOP)
- Identify all data fields captured per column (depth, pressure, winch, buckets, timestamp)
- Evaluate GUHMA's export/import capabilities
- Determine if GUHMA has an API or database that can be queried
- Specify automated QC checks that could be performed on GUHMA data
- Design integration architecture for PF Platform
- Identify sample data requirements

### In Scope (Future Build Phase -- pending research)
- Automated depth verification against shop drawing design depths
- Automated stone bucket reconciliation against hand logs / daily logs
- Automated anomaly detection (pressure spikes, incomplete columns, depth shortfalls)
- GUHMA report generation assistance
- QC dashboard for project-level column quality

### Out of Scope
- Modifying the GUHMA software itself
- Replacing GUHMA with a custom solution
- Real-time data streaming from GUHMA (unless API supports it)
- Vibroflot equipment control or automation

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Jonathan Reinking | Currently runs GUHMA QC process |
| Engineering Advisor | Dr. Ed Garbin | Reviews GUHMA data for engineering signoff |
| Decision Maker | Brad Reinking | Approves integration approach |
| Builder | Peter (AI COO) | Researches, designs, and builds integration |

## 4. Deliverables

### Research Phase (Current)
| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | GUHMA Data Format Analysis | .md file | File structure, field definitions, data types |
| 2 | Integration Options Assessment | .md file | API, file import, database, or manual approaches |
| 3 | QC Check Specification | .md file | What automated checks are possible |
| 4 | Build Recommendation | .md file | Recommended approach with effort estimate |

### Build Phase (Future)
| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 5 | GUHMA Data Importer | Backend | Import column data files into PF Platform |
| 6 | QC Dashboard | HTML | Automated verification results |
| 7 | Exception Report | PDF | Columns requiring review or correction |

## 5. Success Criteria (Research Phase)

- GUHMA data format is fully documented with field definitions
- At least one complete project's GUHMA data has been analyzed
- Integration approach is selected with clear rationale
- Automated QC checks are specified with thresholds
- Brad/Jonathan agree the proposed QC checks match their manual process

## 6. Timeline

| Milestone | Duration |
|-----------|---------|
| SOW + SRS (this document) | 15 min |
| Obtain sample GUHMA data from Jonathan | _Human dependent_ |
| Analyze data format and structure | 30 min (after data received) |
| Document integration options | 20 min |
| Review with Brad/Jonathan | _Human dependent_ |
| Build Phase (if approved) | 2-4 hours AI time |

## 7. What We Know from the SOP

From the GUHMA Column Checking SOP, we know:

- **Data files:** Downloaded as a zip from Operations Manager, saved to `project folder/Engineering & Design/QAQC/Guhma Data`
- **File format:** Can be opened in Notepad (text-based). The bucket count is in a specific column position, described as "one column to the left of the `;0;` column"
- **Data tracked per column:** Depth, time, pressure (flot), winch down pressure, winch up pressure, buckets of stone
- **Report elements:** Time diagram (depth + buckets over time), Depth/Time diagram (vertical with depth, flot pressure, winch A down, winch B up, buckets), profile view
- **Verification steps:** (1) All columns accounted for vs. submittal, (2) All depths match design, (3) Bucket counts match hand logs
- **Report settings:** Specific graph configurations documented in SOP (depth ranges, pressure ranges 0-5000 PSI, bucket ranges 0-5, intervals)
- **Equipment ID:** Currently "VSC Rig" -- will change to numbered rigs as fleet grows
- **Output:** Combined PDF of all columns sent to GC and engineer as part of closeout

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| GUHMA data format is proprietary and undocumented | Reverse-engineer from sample files; contact GUHMA vendor |
| No API or export capability beyond manual files | Build file-based import; parse text files directly |
| Data format changes with GUHMA software updates | Build parser with version detection; flag format changes |
| QC thresholds need engineering judgment | Work with Dr. Ed to define acceptable ranges |

## 9. Open Questions (Critical -- Need Before Build)

1. **Can Jonathan provide a zip file of GUHMA data from a completed project?** This is the single most important input.
2. What version of GUHMA software does PF use?
3. Does GUHMA have a vendor support channel or documentation?
4. Does Dr. Ed's team have any tools for analyzing GUHMA data?
5. Are there any columns that failed depth verification on past projects? What happened?
6. How often do bucket counts need manual correction in the data files?
7. Is there a tolerance for depth shortfall (e.g., within 6 inches is acceptable)?
8. What pressure ranges indicate normal vs. abnormal column installation?
