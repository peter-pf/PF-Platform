# Project History — Software Requirements Specification (SRS)

**Module:** Project History (`platform/project-history.html`, embedded as `#mod-projecthistory`)
**Version:** 1.1
**Date:** 2026-06-08
**Owner:** Peter (AI COO)
**Status:** Alpha — deployed; Jonathan actively reviewing/iterating
**Requested by:** Jonathan (6/4 thread "PF Completed Project History Tracking"); structure approved 6/8.

---

## 1. Purpose
A searchable database of completed projects — the reference PF queries on every new bid. Becomes the data engine for the estimating tool.

## 2. Data source
`platform/data/project-history.js` (`window.PF_PROJECT_HISTORY`), assembled from:
- SharePoint completed-project folders (geotech reports, bid design, engineered submittals)
- PF master spreadsheets (commercial fields)
- Mined GUHMA production data (`production-history.json`)
- Design-team extraction from drawing title blocks (`design-teams.json`)
Source artifacts in `portal_uploads/project-history/`.

## 3. Functional requirements (per project)
- Identity: project #, name, GC, location, building type, year
- **Design Team** (added 6/8): Architect, Structural EOR, Civil Engineer, Geotechnical Engineer
- Ground conditions: geotech firm, soil summary, water table, depth to refusal/rock
- Design: column type, diameter, count, design LF, bearing, settlement
- Actual production (GUHMA): columns, LF, install days, cols/day, LF/day, avg depth
- Commercial: contract value, bid price, VSC component, $/LF, $/column
- Calibration: bid vs actual LF, design vs submittal notes
- Search box (project/GC/city); click-through detail; headline totals.

## 4. Non-functional
- **Honesty:** fields not in source shown as "not in source" (never fabricated). Junk soil summaries suppressed → point to geotech firm.
- **Provenance:** design files use internal numbering; matched by project folder. Geotech firms spot-checked vs report covers.
- Light theme + amber; list+detail layout.

## 5. Coverage (25 projects, as of 6/8)
Identity 25/25; geotech firm 25/25; soil summary 24/25; design 17/25; production 14/25;
design team — architect 21, SER 21, civil 17, geotech 25. Contract value 25/25; total ~$3.4M, ~47,900 LF.

## 6. Open items / roadmap
- Jonathan iterating (added Design Team; more enhancements expected).
- Fill logo-only design-team blanks (manual). Confirm IU Launch SER (SmithGroup, co-branded).
- Planned rollups: regional benchmarks + bid-vs-actual calibration views.
- Pricing-by-geography (stone/transport) is a sibling dataset feeding the same estimating tool.
