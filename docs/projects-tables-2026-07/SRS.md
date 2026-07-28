# Software Requirements Specification: Projects Tables Reformat

**Module group:** Active Projects, Dead Projects, Completed Projects (2026-07-28 build cycle)
**Version:** 1.0
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** Complete -- deployed to production (pf-platform.pages.dev). Verified via committed-source parity + simulated render against live data (Basic-Auth blocks fetching authed HTML).

> Pairs with `docs/projects-tables-2026-07/SOW.md`. House style follows `docs/portal-rebuild/SRS.md`. Covers the three project-list sheets that were reformatted this cycle. The editable project RECORD (opened from these sheets) is documented separately in `docs/project-record-overrides/`.

---

## 1. Purpose

The three project-list sheets (Active, Dead, Completed) were inconsistent. Active Projects lacked production metrics, used engineering labels that read poorly to non-engineers, and was not sorted for planning. Dead Projects mixed lost bids with canceled work. Completed Projects was an old embedded page that did not match the rest of the portal. This work brings all three sheets to one consistent, plan-friendly format.

## 2. Scope

### In scope
- Active Projects sheet (render root `#awardedRoot`, feed `awarded-projects.js`): new columns, renames, reorder, center alignment, fixed sort.
- Dead Projects sheet (render root `#deadRoot`): narrowed to Canceled projects only.
- Completed Projects sheet (render root `#completedRoot`, feed `project-history.js`): rebuilt from an embedded page into a data table matching Active Projects, with year-filter buttons.

### Out of scope
- The Field Operations project list (a separate renderer) keeps its own headers and is not touched.
- The Preconstruction bid-log tables keep their own headers and are not touched.
- The project RECORD view (sections, Edit, overrides) -- see `docs/project-record-overrides/`.
- Any new financial data. These are list sheets; contract value already shown is office-only.

## 3. Data Sources

Project names for Active Projects come from the "Project Name" column of the SharePoint Project Bid Log filtered to Bid Status = Awarded, published by `sync/build-awarded-index.py` into `data/awarded-projects.js`.

| Metric | Source (by project number) | Fallback | Missing |
|--------|----------------------------|----------|---------|
| Total LF | `PF_PROGRESS.projects[num].design_lf` | `PF_PROJECT_RECORDS.records[num].bid_log.total_lf` | em-dash |
| # of Piers | `PF_PROGRESS.projects[num].design_columns` | none (no feed authorized) | em-dash |
| Anticipated Start Date | `SCHEDULE_SEED.jobs[].mobilizations[0].start` matched on project number | none | em-dash |
| Completed date (Completed sheet) | `PF_PROJECT_HISTORY.projects[].commercial.completedDate` | `year` | em-dash |
| Actual LF (Completed sheet) | `PF_PROJECT_HISTORY.projects[].actualProduction.totalLF` | none | em-dash |

`project-history.js` carries contract dollars, so it is loaded only for privileged (office) roles, gated 401 the same as the awarded feed.

## 4. Functional Requirements

### 4.1 Active Projects
| # | Requirement | Status |
|---|-------------|--------|
| FR-1 | Add a **Total LF** column | DONE |
| FR-2 | Add a **# of Piers** column | DONE |
| FR-3 | Add an **Anticipated Start Date** column, widened so the label fits on one line | DONE |
| FR-4 | Rename **Discipline** to **PF Scope** and move it to directly after Project Name | DONE |
| FR-5 | Rename **City / State** to **Project Location** | DONE |
| FR-6 | Header renames: **#** to **PF Project #**, **Project** to **Project Name**, **Value** to **Contract Value**, **Start Date** to **Anticipated Start Date** | DONE |
| FR-7 | Center-align every header cell and every data cell (horizontal center, vertical middle), scoped to this sheet only | DONE |
| FR-8 | Always sort by Anticipated Start Date, soonest first, with undated rows at the bottom | DONE |
| FR-9 | Column order: PF Project # / Project Name / PF Scope / Project Location / General Contractor / Contract Value / Total LF / # of Piers / Anticipated Start Date | DONE |
| FR-10 | Keep the project number and project name clickable into the project record | DONE |

### 4.2 Dead Projects
| # | Requirement | Status |
|---|-------------|--------|
| FR-11 | Show **Canceled projects only** (not lost-on-price bids) | DONE |
| FR-12 | Rows without a built project record render as plain text, never a dead link | DONE |

### 4.3 Completed Projects
| # | Requirement | Status |
|---|-------------|--------|
| FR-13 | Replace the embedded Completed Projects page with a data-driven table matching the Active Projects format | DONE |
| FR-14 | Provide year-filter buttons: **All**, plus one button per distinct completion year (newest first); new years appear automatically as data grows | DONE |
| FR-15 | Sort by completion date, most recent first; undated rows sink to the bottom | DONE |
| FR-16 | Source from `PF_PROJECT_HISTORY`; a project name/number is clickable only when a built record exists | DONE |

## 5. Non-Functional / Security

- Fail closed on every value: a missing metric renders a literal em-dash, never a fabricated number. The # of Piers column has no feed fallback, so several rows honestly show em-dash rather than borrowing a number from another source.
- Center-alignment is scoped by the render root ID (`#awardedRoot`, `#completedRoot`) so it cannot bleed to the eight other tables that share the `.pf-table` class.
- Completed Projects data (`project-history.js`) is privileged-only because it carries contract dollars; confirmed 401-gated in production.
- Dead/Completed rows link into a record only when that record actually exists; synthetic blank records do not count as "exists."

## 6. Acceptance Criteria

- Active Projects shows all nine columns in the specified order, centered, sorted by Anticipated Start Date soonest-first with undated at the bottom.
- Dead Projects shows only Canceled projects.
- Completed Projects renders as a table (no embedded page), with working year buttons that match the data counts.
- No sheet displays a fabricated metric; missing values show em-dash.

## 7. Verification Evidence

| Claim | Evidence |
|-------|----------|
| Active Projects columns/renames/order live | Deploy `b4f8c9c1`; header 9 th equals 9 td per row; div balance 1729/1729; committed-source parity |
| Center alignment scoped, no bleed | Deploy `3b0b5a39`; rule scoped to `#awardedRoot`; base `.pf-table` left/top rules intact |
| Dead = Canceled only | Canceled filter yields exactly 6 rows verified against live-data.js |
| Completed rebuilt + year filters | Deploy `28ee76b3`; embedded page reference removed (grep 0); year counts All 25 / 2026 8 / 2025 17 match live data |
| Production gated | Root 401, /login 200, data/project-history.js 401 |

## 8. Open Items

1. **# of Piers fallback** -- several rows show em-dash because no Piers feed fallback was authorized. Decision for Brad: allow a fallback to `bid_log.total_columns`, or keep the honest em-dash.
2. Confirm the deployment branch is production truth before the next deploy from this working tree.
