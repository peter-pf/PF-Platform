# Preconstruction — Historical Bid Log + per-bid Activity Log

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Precon slice (historical win/loss archive, per-bid activity log, bucket
summary rows). Builds on the existing precon pipeline / buckets / dashboard /
awarded-fork (not rebuilt here).

## A. Historical Bid Log (read-only, by year)

### Inspected source structure (verified, not assumed)
The Project Bid Log workbook has a per-year "2025 Win Loss Log" tab. It has TWO
parts:
- A SUMMARY/STATS block (rows 1-19): win/loss category counts (Budget, Awarded,
  Will Not Bid, Not Awarded - Not Low / Canceled / Low) with Total Count / Prelim
  Used / Prelim % columns, plus Total Projects rows and Win Rate ratios.
- A row-by-row bid table: a single block title at row 22, the COLUMN HEADER row at
  row 23 ("Number", "Project Number", "Project Name", ... "Date Paid", 35 cols;
  "Number" is a rank index, dropped), then 161 bid rows. Repeated header rows
  (Bid Status reads "Bid Status") are skipped. Some cells hold spreadsheet errors
  (#REF!, #DIV/0!) which are kept VERBATIM, never computed.

The win/loss OUTCOME is derived from the Bid Status column:
Completed / Awarded -> win; Not Awarded - * / Will Not Bid -> loss; else other.
(2025: 18 win / 116 loss / 27 other across 161 rows.)

### Data model
- Builder: `platform/sync/build-precon-historical.py` ->
  `platform/data/precon-historical.js`:
  ```
  window.PF_PRECON_HISTORICAL = {
    years: [ { year, tab, columns:[...], rows:[{id, outcome, fields:{...}}],
              summary:[{label, totalCount?, prelimUsed?, prelimPct?}] } ],
    generated, source, source_url
  }
  ```
- Years sort newest first; the section is extensible (a 2026 tab would appear
  automatically). Collision-safe ids; builder verifies uniqueness within a year.

### UI
- Module `mod-precon-historical` (nav: Preconstruction > Historical Bid Log).
  Year tabs ("2025 Historical Bid Log"), the summary stats block, a searchable
  full-column table with win (green) / loss (red) / other row accents, and the
  source link. Read-only. All data via window.esc.

### Gating
- `/data/precon-historical.js` -> preconstruction (admin/partner/business_dev;
  field_ops BLOCKED).

## B. Per-bid Activity Log (write-back)

Tracks changes, communications, notes, and file REFERENCES per bid. Mirrors the
bd-interaction KV pattern. NO file upload, NO mail.

### KV + endpoint
- `platform/functions/api/precon-log.js`: GET/POST an append-only log per bid.
- KV key: `precon_log__<bidId>` on env.PF_SCHEDULE -> `{ items:[...], meta }`.
- Entry: `{ id, kind, date, who, channel, note, fileRef, addedBy, addedAt }`,
  kind in {note, change, comm, file}. channel only for comm. fileRef is a
  link/path for kind file (the file itself is not stored).
- `requireArea(session, 'preconstruction')` on BOTH GET and POST (defense in
  depth) + `/api/precon-log -> preconstruction` in areaForPath. admin/partner/
  business_dev allowed; field_ops + unauth -> 403. Inputs validated + capped,
  angle brackets stripped, addedBy/addedAt server-set, KV race documented. No
  mail, no outbound fetch.

### BID ID SCHEME (consistent across precon-pipeline.js, the activity log, and
build-precon-historical.py)
- `bidId = Project Number` when it is a real value (not blank, not the "x"
  placeholder), prefixed `num_<lowercased number>`.
- else a hash of `(Project Name + General Contractor)`, prefixed `ng_<hash>`
  (the UI uses a small deterministic djb2 hash; the historical builder uses sha1
  of the same name+gc seed under an `hbid_` prefix). The key point: a given bid
  resolves to the SAME key every render, so its log never orphans, and the
  Project-Number path matches the existing precon `jobKey`.

### UI
- An "Activity" link on every bid row in the precon bucket tables opens an inline
  panel under the table: the bid's log (newest first) + an add-entry form (type,
  date, who, channel, file ref, note). Reads/appends via /api/precon-log. All
  values via window.esc.

## C. Bucket summary rows
- Each precon bucket (AP + HP stages) shows a one-line summary above the table:
  count of bids, total Bid Total Value, total Total LF. Blank values are skipped
  from the sum (no NaN). Example reconcile (AP Submitted Bids): 48 bids,
  $10,408,505 total value (= manual per-row sum), 424,319 total LF.

## Verification (2026-06-24)
- Historical builder STDOUT: 2025 -> 161 rows (18 win / 116 loss / 27 other), 34
  columns, 14 summary lines, ID UNIQUENESS OK, no omissions.
- `node migrations/test-rbac.mjs`: 543 pass / 0 fail (precon-historical.js +
  /api/precon-log -> preconstruction, field_ops + unauth denied, GET+POST
  source-level requireArea, NO mail / NO fetch, feed shape).
- Headless precon-log test: 17 pass / 0 fail (preconstruction user appends +
  reads back; partner + admin can log; field_ops + no-session -> 403; validation
  rejects bad kind / missing note / missing bidId; XSS stripped; separate bids
  do not bleed).
- Summary reconcile: AP Submitted Bids 48 / $10,408,505 / 424,319 LF.
- Deploy OK; gate 401 with no creds on /, /data/precon-historical.js,
  /api/precon-log (GET + POST).

## Not exercised live
- A real authenticated precon POST/GET against the DEPLOYED endpoint (env cannot
  mint a live pf_session; shared Basic-Auth gate). Proven headlessly against the
  real Function code; the deployed gate 401s unauth.
