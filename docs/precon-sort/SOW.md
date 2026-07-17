# SOW — Preconstruction Bucket Table Column-Header Sorting

**Branch:** `website-build-20260609`
**File touched:** `platform/index.html` (only) + new docs in `docs/precon-sort/`
**Deploy:** `./deploy.sh` (production, `--branch main`)

---

## Work performed

Implemented clickable column-header sorting in the ONE shared precon highlight
renderer so every precon bucket subpage (both `ap` and `hp` disciplines) sorts the
same way.

### Code changes (all in `platform/index.html`)

1. **CSS** — added `.pf-hl-table th.pf-hl-sortable` (cursor, hover highlight,
   `user-select:none`, `:focus-visible` outline). Resolution + garbin headers are NOT
   given this class, so they get no affordance.

2. **Shared sort helper block** (inserted before `renderHighlightTable`):
   - `hlColSortKind(h)` → `'text' | 'money' | 'date' | null`. `garbin` → null
     (non-sortable). money = `money|effmoney|bidprice|num|diam`; date = `date|effdate`;
     everything else = text.
   - `hlSortValue(disc, p, h)` → comparable value using the SAME effective helpers as
     the cell render (`effBidValue`, `bidPriceRaw`, `pfMasterFor`, `effDate`,
     `calParseYMD`, `pfAwardedGcFor`). money → finite Number or null; date → UTC epoch
     or null; text → lowercased trimmed String.
   - `hlNameSortValue(p)` → Project name (idx -1) text value.
   - `applyHlSort(mount, list, highlights)` → sorted COPY honoring the mount's
     `data-sort-idx` / `data-sort-dir`; returns the list unchanged when no header has
     been clicked (default order preserved). Blanks/nulls sort to bottom in both
     directions; stable tiebreak on incoming index.

3. **Header render** (in `renderHighlightTable`) — the Project header and each sortable
   highlight header now carry `class="pf-hl-sortable" data-hl-sort="<idx|-1>"`,
   `role="button" tabindex="0"`, `cursor:pointer`, and an up/down arrow via `hlArrow()`
   driven by `opts.sortIdx` / `opts.sortDir`. The garbin header stays plain; the
   Resolution header is unchanged (no sort).

4. **renderMount** — after the bucket's default sort + Submitted-Bids filter, calls
   `list = applyHlSort(mount, list, highlights)` and passes the mount's current sort
   state into `hlOpts.sortIdx` / `hlOpts.sortDir`. Lifted `highlights` to `hlHighlights`
   so wiring after `innerHTML` can see the columns.

5. **`wireHlSort(mount, highlights)`** — binds click + Enter/Space on every
   `th.pf-hl-sortable[data-hl-sort]`. New column: sets `data-sort-idx` and the
   FIRST-CLICK direction by type (text→asc, money/date→desc). Same column: flips
   direction. Then `renderMount(mount)`. Wired alongside `wireHighlightExpand` /
   `wireAgeFilter` (only when `useHighlights`).

### Follow-up: feasibility_review WIDE table (`renderTable`)

Extended the SAME UX to the one precon table on the other renderer (the wide raw-feed
`renderTable`, used only by `feasibility_review`). All in `platform/index.html`:

6. **CSS** — added `.pf-wide th.pf-wide-sortable` (cursor, hover, `user-select:none`,
   `:focus-visible`). Record / Resolution / Activity headers are NOT given this class.

7. **Wide sort helper block** (inserted before `renderTable`):
   - `wideColSortKind(type)` → maps the column's declared feed `type`
     (`money|num`→money, `date`→date, else text).
   - `wideSortValue(p, col)` → comparable value from the raw feed `fields[col.key]`
     verbatim (money → Number/null, date → UTC epoch/null via `calParseYMD`, text →
     lowercased String).
   - `wideNameSortValue(p)` → sticky Project column (idx -1) text.
   - `applyWideSort(mount, list, dataCols)` → same comparator shape as `applyHlSort`
     (blanks-to-bottom, stable, no-state passthrough).
   - `wireWideSort(mount)` → binds click + Enter/Space on `th.pf-wide-sortable`;
     first-click direction read off the header's `data-wide-kind`.

8. **Header render** (in `renderTable`) — the sticky Project header
   (`data-wide-sort="-1"`) and each DATA column header carry `pf-wide-sortable`,
   `data-wide-sort="<idx>"`, `data-wide-kind`, `role="button" tabindex="0"`, cursor, and
   an up/down arrow via `wideArrow()` (from `opts.sortIdx`/`opts.sortDir`). Record /
   Resolution / Activity headers stay plain.

9. **renderMount `else` branch** — applies `applyWideSort(mount, list, wideDataCols)` to
   the default-sorted list and passes the mount's sort state into the `renderTable` opts.
   Wired `wireWideSort(mount)` in the `else` of the sort-wiring line.

## BUGFIX (Round 3): non-Project columns did nothing

**Root cause:** `applyHlSort(mount, list, highlights)` called `hlSortValue(disc, p, h)`
for `idx>=0` columns, but `disc` was NOT a parameter of `applyHlSort` and not in scope
-> `ReferenceError: disc is not defined` thrown inside the click handler's
`renderMount`, aborting the re-render. Project (`idx===-1`) used `hlNameSortValue(p)`
(no disc) so ONLY Project worked. Original isolation test passed a literal `'ap'` disc,
so it never hit the real scope -> false green.

**Fix (all in `platform/index.html`):**
- `applyHlSort` signature -> `applyHlSort(disc, mount, list, highlights)`; `disc`
  forwarded to `hlSortValue`.
- Callsite in `renderMount` -> `list = applyHlSort(disc, mount, list, highlights);`.
- Corrected the misleading comment that claimed disc was already passed.
- `applyWideSort` unaffected (its `wideSortValue(p, col)` never took `disc`).

### Files
- `platform/index.html` — feature + the disc bugfix.
- `docs/precon-sort/SRS.md` — spec + §4a root cause.
- `docs/precon-sort/SOW.md` — this file.
- `docs/precon-sort/runtime-sort.test.js` — **NEW** jsdom runtime test (real click ->
  render path, 20 assertions). This is the test that would have caught the bug.
- `docs/precon-sort/sort-logic.test.js` — comparator unit check (41 assertions).

## Verification (evidence)

- **RUNTIME (jsdom, real click->render):** `node docs/precon-sort/runtime-sort.test.js`
  → **20 passed, 0 failed**. Loads the real precon IIFE + real columns/rows, renders
  submitted_bids + feasibility_review, dispatches real header clicks, asserts row order
  actually reorders asc+desc for money/date/text, Project sorts, Resolution inert.
- **Before/after proof:** running the harness with `PF_INDEX_OVERRIDE` pointed at a copy
  with the bug re-introduced FAILS with the exact `ReferenceError: disc is not defined`
  on the non-Project click; the fixed file PASSES 20/20.
- **Comparator unit check:** `node docs/precon-sort/sort-logic.test.js` → **41 passed,
  0 failed** (23 bucket + 18 wide).
- `node --check` on the extracted main script block of index.html → clean.
- Deploy: `Uploading Functions bundle` → `Deployment complete!` → canonical
  `env=production` → `auth gate on root: HTTP 401`.

## Definition of Done
- [x] Root cause found + fixed (`disc` passed into `applyHlSort`).
- [x] RUNTIME test proves non-Project columns reorder rows asc+desc (before-fail/after-pass).
- [x] Feature in index.html — bucket highlight render (all buckets, both disciplines).
- [x] Feature in index.html — feasibility_review WIDE render (all data cols, both disciplines).
- [x] Resolution + garbin (bucket) and Record/Resolution/Activity (wide) excluded from sort.
- [x] Default order preserved until a header is clicked (both renders).
- [x] SRS + SOW updated with root cause + runtime test.
- [x] Deployed to production, 401 gate confirmed.
- [x] Committed + pushed to `website-build-20260609`.
