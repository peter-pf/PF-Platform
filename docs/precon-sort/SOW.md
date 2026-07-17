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

### Files
- `platform/index.html` — feature.
- `docs/precon-sort/SRS.md` — spec (buckets, columns, Resolution exclusion, semantics).
- `docs/precon-sort/SOW.md` — this file.
- `docs/precon-sort/sort-logic.test.js` — runnable node self-check (23 assertions).

## Verification (evidence)

- `node docs/precon-sort/sort-logic.test.js` → **23 passed, 0 failed** (text/money/
  numeric/date asc+desc, blanks-to-bottom, garbin non-sortable, no-state + stale-index
  passthrough, stability).
- `node --check` on the extracted main script block of index.html → clean (the only
  regex-split "failure" is a pre-existing false positive from a `</script>` string
  inside a JS comment, unrelated to this change and present at HEAD).
- Deploy: `Uploading Functions bundle` → `Deployment complete!` → canonical
  `env=production` → `auth gate on root: HTTP 401`.

## Definition of Done
- [x] Feature in index.html (shared render, all highlight buckets, both disciplines).
- [x] Resolution + garbin excluded from sort.
- [x] Default order preserved until a header is clicked.
- [x] Node self-check passes (asc + desc for text/money/date, blanks-to-bottom).
- [x] SRS + SOW written.
- [x] Deployed to production, 401 gate confirmed.
- [x] Committed + pushed to `website-build-20260609`.
