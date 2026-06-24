# BD CRM — GC's to Contact (target accounts by sector)

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Brad's BD build-out, item 3 (GC's to Contact, subdivided by sector).

## Inspected source structure (verified, not assumed)
The "GC's to Contact" tab is a MATRIX, not a columnar record table:
- ROW 2 holds the SECTOR / list names as COLUMN HEADERS.
- Each COLUMN below row 2 is a vertical list of GC names for that sector.
- Col 0 is a 1..N rank index (layout scaffolding, dropped).
- One column (col 3) has a BLANK row-2 header but holds 27 GC entries (an Ohio
  regional continuation). It is NOT dropped: it gets a fallback label
  "Column 3 (no sector header)" and the blank header is reported in `_omitted`.
- Some GC cells embed a " - location" note; we keep the full Name and also split
  a Note where a dash separator exists.

Sectors found (9): Best guess ENR top 100 (98), Top ENR by Indiana (22),
Column 3 / no header (27), Industrial (7), IN apartments (11), OH apartments
(14), Wind Turbine GCs (12), GC's (21), Ray's List (3). Total 215 GC entries.

## Data model
- Builder: `platform/sync/build-gc-targets.py` -> `platform/data/gc-targets.js`:
  ```
  window.PF_GC_TARGETS = {
    sectors: [ { name, gcs:[ {id, fields:{Name, Note}} ] } ],
    fields: ['Name','Note'],
    totalGcs, generated, source, sourceTab
  }
  ```
- Collision-safe ids `gc_<sha1(sector||name)>` (unique per sector+name, so the
  same GC in two sectors gets two ids). Builder hard-verifies id uniqueness.

## UI
- Module `mod-bd-targets` (replaces the old "Target Accounts" placeholder), under
  Business Development. Collapsible sector groups, search across GCs + notes, GC
  count per sector. If a GC name exactly matches a company in bd-records, an
  "in CRM" link jumps to Companies & Contacts (nice-to-have, exact match only).
- All data rendered via window.esc.

## Gating
- `/data/gc-targets.js` -> business_dev (admin/partner/business_dev; field_ops
  BLOCKED), in `functions/lib/auth.js` DATA_FILE_AREAS.

## Omitted / notes
- Col 3 blank row-2 header reported in `_omitted` (data kept under a fallback
  label, not dropped). No other omissions; the tab carries only names (+ embedded
  location notes), so fields are Name + Note only (no invented fields).

## Verification (2026-06-24)
- Builder STDOUT: 9 sectors, 215 GC entries, blank-header column reported,
  ID UNIQUENESS OK (215 unique).
- `node migrations/test-rbac.mjs`: gc-targets.js -> business_dev, field_ops
  denied; feed-shape + id-uniqueness assertions pass (suite 511 pass / 0 fail).
- Deploy OK; gate 401 with no creds on /data/gc-targets.js.
