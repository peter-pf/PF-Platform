# Project History — Statement of Work (SOW)

**Module:** Project History
**Version:** 1.1
**Date:** 2026-06-08
**Owner:** Peter (AI COO)
**Status:** Complete — deployed (Alpha, Jonathan reviewing)

---

## Scope delivered
1. Mined 25 completed projects from SharePoint (geotech, bid design, engineered submittal) + master spreadsheets (commercial) + GUHMA (production) → `projects-database.json`.
2. Extracted design teams (architect/SER/civil/geotech) from drawing title blocks → `design-teams.json`, merged in.
3. Built `data/project-history.js` and `project-history.html` (searchable list + click-through detail, Design Team section, headline totals).
4. Wired into nav, `#mod-projecthistory`, moduleTitles.

## Verification
- Reviewed assembled data: 24/25 soil summaries real (1 boilerplate suppressed); geotech firms spot-checked vs report covers; design-file numbering quirk handled by folder match; design-team nulls confirmed as logo-only title blocks (not misses).
- Lightweight self-check: `node` eval of data file + inline-JS parse; wiring grep-confirmed. No browser (per Brad).
- Coverage notes written (`coverage-notes.md`, `design-teams-coverage.md`) — gaps explicit.

## Deployment
- Live at pf-platform.pages.dev → "Project History". Committed/pushed (commits a208fe8, 896cab4).

## Out of scope / follow-ups
- Regional-benchmark + bid-vs-actual calibration rollup views.
- Manual fill of logo-only design-team blanks; confirm IU Launch SER.
- Further enhancements per Jonathan's review.
