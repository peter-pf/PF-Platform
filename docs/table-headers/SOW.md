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

## Definition of Done
- [x] All data-table `th` wrap instead of clip (global rule + per-table clip removals).
- [x] Header row grows taller (height:auto + line-height); vertical-align:bottom for tidy mix.
- [x] Column widths preserved (fixed-layout colgroup kept; wide capped, not widened).
- [x] Sort ▲/▼ still renders on wrapped headers.
- [x] Wide feasibility_review sticky header still sticky.
- [x] Runtime computed-style test 17/17; sort regression 20/20.
- [x] SRS + SOW written.
- [x] Deployed to production, 401 gate confirmed.
- [x] Committed + pushed to `website-build-20260609`.
