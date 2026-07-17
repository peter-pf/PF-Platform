# SOW — Wrapping Column Headers (all data tables)

**Branch:** `website-build-20260609`
**Files touched:** `platform/index.html` (CSS only) + `docs/table-headers/` + `docs/precon-sort/header-wrap.test.js`
**Deploy:** `./deploy.sh` (production, `--branch main`)

---

## Work performed

Derek approved the sort fix and asked for readable column headers everywhere: when a header
label does not fit its column, wrap it and let the header row grow taller. Implemented
CSS-first (no JS change) across ALL data tables.

### CSS changes (all in `platform/index.html` `<style>`)

1. **Removed** `white-space: nowrap` from base `table thead th`.
2. **Added** a global header-wrap rule targeting every table-header selector from the audit:
   `table th, .pf-table th, .pf-wide th, .pf-hl-table th, .pfdash-table th, .ts-day-table th,
   .ts-sum-table th, .ba-table th` →
   `white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
   overflow-wrap: break-word; word-break: break-word; height: auto; line-height: 1.25;
   vertical-align: bottom;`
3. **`.pf-hl-table th`** — removed the `overflow:hidden` + `text-overflow:ellipsis` +
   `white-space:nowrap` trio (precon bucket tables). Keeps `table-layout: fixed` + colgroup
   widths so headers wrap within their fixed width.
4. **`.pf-wide th`** — removed `nowrap`; added `max-width: 320px` so long labels wrap within a
   sensible width in the content-sized (`width: max-content`) wide table.

Body cells untouched (`.pf-wide td` keeps ellipsis; `.pfdash-table td` + `.num` keep nowrap).
Sticky header (`.pf-wide th.pf-sticky-col`) and sticky Project column unchanged — still sticky
with taller headers.

### Files
- `platform/index.html` — the CSS change.
- `docs/table-headers/SRS.md` — spec (tables covered, requirements, caveat).
- `docs/table-headers/SOW.md` — this file.
- `docs/precon-sort/header-wrap.test.js` — runtime computed-style verification (17 assertions).

## Verification (evidence)

- `node docs/precon-sort/header-wrap.test.js` → **17 passed, 0 failed**: every pf-hl-table +
  pf-wide + base `table thead th` has `white-space: normal` (was nowrap), no ellipsis, long
  words breakable; wide sticky Project header still `position: sticky`; wide BODY td keeps
  ellipsis; long label `Design Completed Date` wraps; sort arrow still present on a wrapped
  header after a click.
- `node docs/precon-sort/runtime-sort.test.js` → **20 passed, 0 failed** (sorting regression:
  header markup change did not break the click→render sort path).
- `node --check` on the extracted main script block → clean.
- Deploy: `Uploading Functions bundle` → `Deployment complete!` → canonical `env=production`
  → `auth gate on root: HTTP 401`.

## Definition of Done (header wrap)
- [x] All data-table `th` wrap instead of clip (global rule + per-table clip removals).
- [x] Header row grows taller (height:auto + line-height); vertical-align:bottom for tidy mix.
- [x] Column widths preserved (fixed-layout colgroup kept; wide capped, not widened).
- [x] Sort ▲/▼ still renders on wrapped headers.
- [x] Wide feasibility_review sticky header still sticky.
- [x] Runtime computed-style test 17/17; sort regression 20/20.
- [x] SRS + SOW written.
- [x] Deployed to production, 401 gate confirmed.
- [x] Committed + pushed to `website-build-20260609`.

---

## FOLLOW-UP: PROJECT / NAME column widened ~2x (Derek)

Derek: "make the project header width about twice as wide as it is now on all pages so you
can read the project name, for example i cannot see it in the actively pricing tab."

### Root of the cramping
The precon bucket highlight tables (`pf-hl-table`) are `table-layout: fixed; width: 100%`.
The NAME column was the ONLY flex `<col>` (no explicit width), so on a busy bucket (Actively
Pricing = 5 highlight cols + price badge + GC editor + a 232px action col = ~896px of fixed
width) the name was squeezed to `100% - 896px` ≈ **~200px** and the project name clipped.

### Changes (all in `platform/index.html`)
1. **`renderHighlightTable` colgroup** — name `<col>` gets an EXPLICIT width `NAME_W = 340px`
   (~1.7–2x the old ~200px). The colgroup build sums all column widths into `totalW` and sets
   the table `min-width: totalW` so the wrapper scrolls when the row exceeds the panel instead
   of crushing the name. Trimmed slack: `Sent to GGG?` 130→108px, `Bidding GCs` 140/160→124px
   (priority 2a) so the extra name width adds less horizontal scroll.
2. **`.pf-hl-wrap`** — `overflow: hidden` → `overflow-x: auto; overflow-y: visible` so the
   widened table scrolls horizontally rather than clipping (priority 2b). Name readability wins
   over one-screen fit (Derek's stated priority).
3. **`.pf-wide th.pf-sticky-col` / `td.pf-sticky-col`** (feasibility_review sticky Project col)
   — `max-width: 240px` → `min-width: 320px; max-width: 480px` (~2x). Still `position: sticky`.
4. **Projects table** (`.table-wrap` auto-layout) — Name `th` + `td` get `min-width: 280px` so
   the name reserves readable room (the table already auto-sizes + `.table-wrap` scrolls).

Body cells, the 2-line name clamp (`pf-hl-nameprominent`), sorting, header wrap, and sticky
positioning all preserved.

### Verification (evidence)
- `node docs/table-headers/name-width.test.js` → **14 passed, 0 failed**: AP name `<col>` now
  explicit **340px** (was flex/no-width), disc col still 34px, table `min-width` set (~1198px),
  `.pf-hl-wrap` overflow-x=auto (was hidden), Project header still sortable + arrow after click;
  wide sticky Project min-width 320 / max-width 480 / still sticky; Projects Name th+td min-width
  280px.
- **Before/after proof:** running the harness against a scratch copy with the OLD flex name col
  reports name width **0px (flex)** and FAILS the ≥320px assertion; the current file reports
  **340px** and PASSES.
- Regressions: `runtime-sort.test.js` **20/20**, `header-wrap.test.js` **17/17**, `node --check`
  clean.
- Measured before/after AP name column: **~200px (flex) → 340px (explicit)** ≈ 1.7–2x.

### Definition of Done (name width)
- [x] Precon bucket name `<col>` explicit 340px (~2x); table min-width + wrap scroll.
- [x] Wide feasibility_review sticky Project column 320–480px (~2x the old 240px).
- [x] Projects table Name th+td min-width 280px.
- [x] Slack trimmed (Sent to GGG?, Bidding GCs) before adding scroll.
- [x] Sort, arrows, header wrap, sticky positioning all still pass.
- [x] name-width test 14/14 with proven before/after; deployed + 401 confirmed.
