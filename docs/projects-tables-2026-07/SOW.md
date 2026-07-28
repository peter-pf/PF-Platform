# Statement of Work: Projects Tables Reformat

**Module group:** Active Projects, Dead Projects, Completed Projects (2026-07-28 build cycle)
**Version:** 1.0
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** COMPLETE -- deployed to production (pf-platform.pages.dev).

> Pairs with `docs/projects-tables-2026-07/SRS.md`. House style follows `docs/portal-rebuild/SOW.md`.

---

## Scope delivered (file-path first)

1. **Active Projects reformat** -- `platform/index.html` (`#awardedRoot` render IIFE) + `platform/data/awarded-projects.js` (feed via `sync/build-awarded-index.py`)
   - Added Total LF and # of Piers columns. Added Anticipated Start Date column, widened so the label fits on one line.
   - Renamed Discipline to PF Scope and moved it to directly after Project Name. Renamed City / State to Project Location.
   - Header renames: # to PF Project #, Project to Project Name, Value to Contract Value, Start Date to Anticipated Start Date.
   - Center-aligned every header and data cell, scoped to `#awardedRoot` only.
   - Fixed sort by Anticipated Start Date, soonest first, undated at the bottom.
   - Preserved clickable project number and name into the record.

2. **Dead Projects narrowed** -- `platform/index.html` (`#deadRoot` render IIFE)
   - Filter narrowed to Canceled projects only (previously included all lost bids).

3. **Completed Projects rebuild** -- `platform/index.html` (`#completedRoot` render IIFE) + `platform/data/project-history.js` (feed, newly loaded, privileged-only)
   - Replaced the embedded Completed Projects page with a data table matching Active Projects.
   - Added dynamic year-filter buttons (All / 2026 / 2025, newest first, new years auto-appear).
   - Sorted by completion date, most recent first, undated at the bottom.
   - Clickable only when a built record exists.

## Work performed
1. Mapped the three per-project-number data sources and their different nestings (PF_PROGRESS top-level design fields; PF_PROJECT_RECORDS bid_log nested; SCHEDULE_SEED mobilization start; PF_PROJECT_HISTORY commercial.completedDate nested).
2. Built the three render changes in `index.html`, all fail-closed to em-dash on any missing value.
3. Loaded `project-history.js` into the privileged feed block so the Completed sheet has data, and confirmed it stays office-only.
4. Center-alignment scoped by render-root ID so it could not bleed to the other eight `.pf-table` tables.

## Verification (deployed)
- Active Projects: deploy `b4f8c9c1`, header 9 th equals 9 td per row, div balance 1729/1729, node --check on the IIFE passed.
- Center alignment: deploy `3b0b5a39`, rule scoped to `#awardedRoot`, base `.pf-table` rules intact.
- Dead = Canceled only: exactly 6 rows, verified against live-data.js.
- Completed rebuild: deploy `28ee76b3`, embedded-page reference gone (grep 0), year counts All 25 / 2026 8 / 2025 17 match live data.
- Production gate: root 401, /login 200, data/project-history.js 401. Committed-source parity used because Basic-Auth blocks fetching authed HTML.

## Honest caveats carried into the docs
- The # of Piers column has NO feed fallback, so several rows show em-dash. This is honest, not a bug; it is flagged as an open decision (widen to bid_log.total_columns or keep em-dash) rather than silently filled.
- Verification is committed-source parity plus simulated render against live data; a logged-in human should eyeball the three sheets in production.

## Out of scope / next
- Decide the # of Piers fallback.
- Field Operations project list and Preconstruction bid-log tables keep their own headers (not part of this work).
