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

### Files
- `platform/index.html` — feature (bucket highlight render + wide feasibility_review render).
- `docs/precon-sort/SRS.md` — spec (buckets + feasibility_review columns, exclusions, semantics).
- `docs/precon-sort/SOW.md` — this file.
- `docs/precon-sort/sort-logic.test.js` — runnable node self-check (41 assertions).

## Verification (evidence)

- `node docs/precon-sort/sort-logic.test.js` → **41 passed, 0 failed** — 23 bucket
  (text/money/numeric/date asc+desc, blanks-to-bottom, garbin non-sortable, no-state +
  stale-index passthrough, stability) + 18 wide (feasibility_review Project/City/Bid
  Total/Due Date/text-typed-quantity asc+desc, blanks-to-bottom, wide type mapping,
  guards, stability).
- `node --check` on the extracted main script block of index.html → clean (the only
  regex-split "failure" is a pre-existing false positive from a `</script>` string
  inside a JS comment, unrelated to this change and present at HEAD).
- Deploy: `Uploading Functions bundle` → `Deployment complete!` → canonical
  `env=production` → `auth gate on root: HTTP 401`.

## Definition of Done
- [x] Feature in index.html — bucket highlight render (all buckets, both disciplines).
- [x] Feature in index.html — feasibility_review WIDE render (all data cols, both disciplines).
- [x] Resolution + garbin (bucket) and Record/Resolution/Activity (wide) excluded from sort.
- [x] Default order preserved until a header is clicked (both renders).
- [x] Node self-check passes (41/41; asc + desc for text/money/date, blanks-to-bottom).
- [x] SRS + SOW updated.
- [x] Deployed to production, 401 gate confirmed.
- [x] Committed + pushed to `website-build-20260609`.
