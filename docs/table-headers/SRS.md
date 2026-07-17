# SRS — Wrapping Column Headers + Wider Name Column (all data tables)

**Module:** Platform-wide table styling
**File:** `platform/index.html` (single-file SPA, CSS in `<style>` + `renderHighlightTable` colgroup)
**Branch:** `website-build-20260609`
**Owner request 1 (wrap):** Derek — "In the header of each of those columns, if you cannot fit
the text in the viewable area on screen, have it wrap the text and make the header height
larger so I can actually read what each column is. Apply this to all tables."
**Owner request 2 (name width):** Derek — "make the project header width about twice as wide as
it is now on all pages so you can read the project name, for example i cannot see it in the
actively pricing tab."

> Section 7 covers the name-column widening. Sections 1–6 cover header wrapping.

---

## 1. Purpose

Column HEADER cells must display their FULL label. When a label does not fit its column
width, it WRAPS onto multiple lines and the header row grows taller (auto height) so every
column name is readable. Applies to EVERY data table on the platform. Headers wrap WITHIN
their existing column width — columns are NOT widened. Body cells keep their current
behaviour.

## 2. Functional requirements

- **FR-1 Wrap, don't clip.** Every table `th` uses `white-space: normal` (no `nowrap`),
  `overflow: visible` and no `text-overflow: ellipsis`, so header text never truncates.
- **FR-2 Grow the row.** Header cells have `height: auto` + `line-height: 1.25`; the header
  row auto-grows to fit the tallest wrapped header.
- **FR-3 Break long words.** `overflow-wrap: break-word` + `word-break: break-word` so a
  single long token still breaks instead of overflowing.
- **FR-4 Keep column widths.** Fixed-layout tables (`pf-hl-table`) keep `table-layout: fixed`
  + their colgroup widths; wrapping happens WITHIN the width. The content-sized wide table
  (`pf-wide`, `width: max-content`) gets a `max-width` cap on its headers so a long label
  wraps instead of stretching the column.
- **FR-5 Sort arrows intact.** The ▲/▼ sort indicator (appended inline at the end of the
  label) still renders on a wrapped 2–3 line header.
- **FR-6 Alignment.** Headers use `vertical-align: bottom` so a 1-line and a 3-line header
  in the same row align (labels sit just above the body), keeping mixed heights tidy.
- **FR-7 Sticky header preserved.** The wide feasibility_review table's sticky Project
  header cell stays `position: sticky` with taller wrapped headers.

## 3. Tables covered (audit)

A single global rule targets every table-header selector found in the CSS audit, plus the
base `table thead th`:

| Selector | Table | Was clipping? |
|----------|-------|---------------|
| `table thead th` | base tables (Projects, GUHMA/pier-log, generic) | YES (`white-space: nowrap`) — removed |
| `.pf-hl-table th` | precon bucket highlight tables (+ `.pf-hl-sortable`) | YES (`overflow:hidden` + `ellipsis` + `nowrap`) — removed |
| `.pf-wide th` | feasibility_review wide raw-feed table | YES (`white-space: nowrap`) — removed, `max-width:320px` added |
| `.pfdash-table th` | project dashboard (Budget vs Actual) | YES (shared `th,td { nowrap }`) — th now wraps, td keeps nowrap |
| `.pf-table th` | generic pf tables | no (already wrapped) — normalized |
| `.ts-day-table th` / `.ts-sum-table th` | timesheets | no — normalized |
| `.ba-table th` | budget-actual detail | no — normalized |

Body cells are untouched: `.pf-wide td` keeps `max-width: 320px` + ellipsis; `.pfdash-table td`
keeps `nowrap`; `.num` body cells keep `nowrap` for numeric alignment.

## 4. Implementation

CSS-only (no JS change). In the main `<style>`:
1. Removed `white-space: nowrap` from `table thead th`.
2. Added a global header rule (selector list above) with
   `white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
   overflow-wrap: break-word; word-break: break-word; height: auto; line-height: 1.25;
   vertical-align: bottom;` (`!important` beats the per-table `nowrap`/`ellipsis` declarations).
3. `.pf-hl-table th` — removed the `overflow:hidden/ellipsis/nowrap` trio (comment kept).
4. `.pf-wide th` — removed `nowrap`, added `max-width: 320px` so headers wrap within a
   sensible width in the content-sized table.

## 5. Verification

- **RUNTIME computed-style test:** `docs/precon-sort/header-wrap.test.js` loads the REAL
  `<style>` CSS + precon IIFE into jsdom, renders submitted_bids + feasibility_review, and
  asserts via `getComputedStyle` (jsdom resolves the cascade incl. `!important`):
  every `th` `white-space === 'normal'`, no `text-overflow: ellipsis`, long words breakable,
  the wide sticky Project header still `position: sticky`, the wide BODY td keeps its
  ellipsis (unchanged), a long label (`Design Completed Date`) is present and wraps, the
  base `table thead th` wraps, and the sort ▲/▼ still renders on a wrapped header. **17/17.**
- **Regression:** `docs/precon-sort/runtime-sort.test.js` (real click→render sorting) still
  **20/20** — the header markup change did not break sorting.
- **Layout note:** jsdom has no layout engine (no `clientHeight`), so multi-line HEIGHT
  growth is guaranteed by the CSS contract (verified via computed style), not measured
  pixel height. Derek eyeballs the live result.

## 6. Known caveat

The narrowest bucket columns are ~80–90px (`Columns`, `Total LF`). Their labels are single
short words that fit on one line; multi-word labels (`Budget Submission Date`, `Follow Up
Date`) wrap to 2 lines within their width. No column has an unbreakable token wider than its
column, so no header overflows. `word-break: break-word` is the fallback if a future long
single-token label is added to a very narrow column.

---

## 7. PROJECT / NAME column widened ~2x

**Why:** the precon bucket tables (`pf-hl-table`) are `table-layout: fixed; width: 100%` with a
colgroup; the NAME column was the only flex `<col>`, so on a busy bucket (Actively Pricing) it
was squeezed to ~200px and the project name was unreadable.

**Requirements:**
- **FR-N1** Precon bucket name column gets an explicit width `NAME_W = 340px` (~2x the old ~200px
  flex effective width). Applies to every `pf-hl-table` bucket, both disciplines.
- **FR-N2** The table gets an explicit `min-width` = sum of all column widths, and `.pf-hl-wrap`
  becomes `overflow-x: auto` so the row scrolls horizontally when it exceeds the panel instead of
  crushing the name (name readability > one-screen fit — Derek's priority).
- **FR-N3** Slack is trimmed from over-wide columns first (`Sent to GGG?` 130→108px, `Bidding GCs`
  140/160→124px) so the wider name adds less horizontal scroll.
- **FR-N4** The wide feasibility_review sticky Project column: `min-width: 320px; max-width: 480px`
  (~2x the old `max-width: 240px`); still `position: sticky`.
- **FR-N5** The Projects table Name `th` + `td`: `min-width: 280px` (auto-layout reserves room).
- **FR-N6** Sorting, the sort ▲/▼, header wrapping, the 2-line name clamp, and sticky positioning
  are all preserved.

**Measured before/after (AP name column):** ~200px (flex) → **340px** (explicit) ≈ 1.7–2x.

**Verification:** `docs/table-headers/name-width.test.js` (jsdom, computed `<col>`/style widths):
**14/14**, with a proven before/after (old flex copy reports 0/flex and fails ≥320px; current file
reports 340px and passes). Sort **20/20** + header-wrap **17/17** regressions green.

**Caveat:** widening the name to 340px on a busy bucket pushes the table past a narrow panel, so a
horizontal scrollbar appears on `.pf-hl-wrap`. This is intended (Derek: readable name beats fitting
everything without scroll). On wide screens `width: 100%` still lets the name absorb extra room.
