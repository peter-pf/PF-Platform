# SRS — Preconstruction Bucket Table Column-Header Sorting

**Module:** Preconstruction pipeline (precon bucket tables)
**File:** `platform/index.html` (single-file SPA)
**Branch:** `website-build-20260609`
**Status:** Built + self-checked + deployed
**Owner request:** Brad — "clickable column-header sorting on ALL the Preconstruction
bucket tables, every precon subpage table sorts the same way."

---

## 1. Purpose

Add clickable column-header sorting to every Preconstruction bucket table so a user
can reorder the rows by any data column, with a consistent UX across every precon
subpage (both disciplines: Actively Pricing `ap` and Historical Pricing `hp`). The
UX matches the existing Projects table (clickable header, up/down arrow, first click
ascending, second click descending — with the direction convention adjusted per data
type per Brad's spec).

## 2. Scope

All precon buckets that render through the ONE shared highlight renderer
`renderHighlightTable()` (the `pf-hl-table`). One implementation in the shared render
therefore covers every subpage below, for BOTH disciplines:

| Bucket (data-bucket)   | Subpage label        | Sortable columns |
|------------------------|----------------------|------------------|
| `actively_bidding`     | Actively Bidding     | Project (name), Prelim Due (date), Bid Due (date), Bidding GCs (text), Bid Price (money) |
| `budget_pricing`       | Budget Pricing       | Project, Budget Submission Date (date), Follow Up Date (date), Bidding GCs (text), Bid Total Value (money) |
| `submitted_bids`       | Submitted Bids       | Project, Bid Total (money), Total LF (money/num), Columns (money/num), Submitted (date), Bidding GCs (text) |
| `awarded`              | Awarded              | Project, Bid Total (money), Total LF (num), Columns (num), Start Date (date), Award Date (date), GC (text) |
| `not_awarded`          | Not Awarded          | Project, Bid Total (money), GC (text) |
| `not_bidding`          | Archive              | Project, Bid Total (money), GC (text) |

The Project name cell (always the first data column) is sortable via a `data-hl-sort="-1"`
header.

### Out of scope
- **`feasibility_review`** renders through the DIFFERENT wide renderer `renderTable()`
  (a raw bid-log feed dump with a sticky Project column + every feed column), not the
  styled `pf-hl-table`. It is intentionally left unchanged — it is not one of the
  styled highlight bucket tables Brad referenced, and its columns are the raw feed set.
- Non-precon tables (Projects, financials, HR, etc.) — untouched. The change is scoped
  to `renderHighlightTable` + `renderMount` + a small shared sort helper block.

## 3. Functional Requirements

- **FR-1 Clickable headers.** Each sortable column header is clickable (and keyboard-
  operable via Enter/Space) and sorts the rows by that column.
- **FR-2 Arrow indicator.** The active sort column shows an up arrow (`▲`, ascending)
  or down arrow (`▼`, descending), identical glyphs to the Projects table.
- **FR-3 Toggle.** Clicking the active column again flips the direction (asc ↔ desc).
- **FR-4 Type-aware semantics (Brad's spec):**
  - **Text** (Project, GC, Bidding GCs): first click **A→Z**, second click **Z→A**.
  - **Money / numeric** (Bid Total, Bid Price, Bid Total Value, Total LF, Columns):
    first click **large→small**, second click **small→large**.
  - **Date** (Prelim Due, Bid Due, Budget Submission, Follow Up, Submitted, Start Date,
    Award Date): first click **newest→oldest**, second click **oldest→newest**.
- **FR-5 Resolution excluded.** The Resolution column (per-row action buttons) is NOT
  sortable: no cursor, no arrow, no click handler, no `data-hl-sort`. The "Sent to GGG?"
  `garbin` checkbox column is likewise non-sortable (it is a control, not data).
- **FR-6 Default order preserved.** Until a header is clicked, each bucket keeps its
  current default order: `submitted_bids` = Date Submitted newest-first; all others =
  `sortByNumber`. Applied via `applyHlSort` returning the list unchanged when no header
  has been clicked.
- **FR-7 Independent, persistent state.** Sort selection is stored on the mount
  (`data-sort-idx`, `data-sort-dir`) so it is INDEPENDENT per bucket + discipline and
  survives re-renders (resolution changes, filter changes), exactly like the Projects
  table state and the age filter.
- **FR-8 Composes with filters.** Sorting runs AFTER the Submitted Bids aging filter and
  Hot filter, on the already-filtered list.
- **FR-9 Blank handling.** Blank / unparseable money and date values always sort to the
  BOTTOM regardless of direction. Blank text also sorts to the bottom. Sort is STABLE
  (equal values keep their incoming/default order).

## 4. Data-type extraction

Sort values use the SAME effective helpers as the cell render (what you see is what
sorts):

| Highlight `type`        | Sort kind | Value source |
|-------------------------|-----------|--------------|
| `money`                 | money     | feed `fields[key]` |
| `effmoney`              | money     | `effBidValue(p)` (override-or-feed) |
| `bidprice`              | money     | `bidPriceRaw(p)` (override) |
| `num`                   | money     | feed `fields[key]` |
| `diam`                  | money     | `pfMasterFor(p).diameter` |
| `date`                  | date      | feed `fields[key]` via `calParseYMD` → UTC epoch |
| `effdate`               | date      | `effDate(p, field)` (override-or-feed) via `calParseYMD` |
| `gc` / `awgc` / `gclist`| text      | `pfAwardedGcFor(p)` (or feed GC) |
| `text` / other feed     | text      | feed `fields[key]` |
| `garbin`                | (none)    | non-sortable |
| Project name (idx -1)   | text      | `p.name` / `fields['Project Name']` |

Money parse strips `$`, commas, etc. via `parseFloat(String(raw).replace(/[^0-9.\-]/g,''))`.
Date parse uses `calParseYMD` (ISO `YYYY-MM-DD` + US `M/D/YY[YY]`) to a UTC-midnight epoch.
Text compares case-insensitively via `localeCompare`.

## 5. Verification

- **Node self-check:** `docs/precon-sort/sort-logic.test.js` re-implements the exact
  comparator + extraction rules and asserts asc AND desc ordering for text, money,
  numeric, and date columns, blanks-to-bottom, classification (garbin = non-sortable),
  no-state passthrough, stale-index passthrough, and stability. **23/23 pass.**
- **Static review:** `node --check` on the extracted main script block — clean.
- **Live:** deployed to production; auth gate (`/` = HTTP 401) confirmed.

## 6. Non-functional

- No new dependencies. Pure DOM + existing helpers.
- XSS-safe: header labels pass through `E()` (window.esc); values are only read for
  comparison, never re-injected.
- Accessible: sortable headers are `role="button" tabindex="0"` with `aria-label`,
  keyboard-operable, and have a `:focus-visible` outline.
