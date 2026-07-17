# SOW - Daily Field Report Submit Flow (PDF + Email + SharePoint)

Module: `daily-report`
Branch: `website-build-20260609`
Spec source: Derek Franke (2026-07)

## Work Performed

### New files
- `platform/functions/lib/pdf.js` - dependency-free PDF 1.4 writer for the
  Workers runtime (Helvetica/Helvetica-Bold, WinAnsi text, word-wrap, rules,
  key/value + two-column rows, automatic page breaks, `toBytes()` + base64 helper).
- `platform/functions/lib/daily-report-doc.js` - renders a daily-report record to
  PDF bytes; Graph `sendReportEmail` (sendMail AS peter@, PDF as base64
  fileAttachment); `uploadReportPdf` (simple PUT to the fixed SharePoint folder);
  `buildEmailBody`, `pdfFilename` helpers. ZERO financials.

### Changed files
- `platform/functions/api/daily-report.js`
  - Removed the approval queue: `approve` / `send-to-hr` actions, the
    `PRIVILEGED_ACTIONS` gate, `isPrivileged()`, and the `submitted/approved/
    sent-to-HR` status machine.
  - `submit` now runs the 3-step flow: render PDF -> Graph sendMail -> SharePoint
    PUT. Finalizes the record to `status:'sent'` with `pdfName/pdfWebUrl/
    emailedTo/sentAt` audit fields.
  - Added `ACTIVE_RECIPIENTS` (TEST vs PROD constant, single flip point) +
    `DAILY_REPORT_RECIPIENTS` env override; `PF_DAILY_OUTPUT_FOLDER_ID` env
    override for the SharePoint folder (default = the known TEST folder id).
  - FAIL CLOSED on missing Graph creds / recipients; partial-failure honesty.
- `platform/index.html` (daily-reports module)
  - Submit button relabeled "Submit & send report"; success message reflects
    email + SharePoint distribution.
  - Removed the owner-only Approve / Send-to-HR buttons + their handlers +
    `transition()`. A `sent` report now shows a "View PDF" SharePoint link.
  - `statusChip` maps `sent` -> green; legacy statuses still render.
  - Module header comments updated to describe the 3-step flow.

## PDF Approach

Server-side, dependency-free PDF writer (see SRS section 6). Chosen because the
deploy pipeline bundles no npm deps; adding pdf-lib would require changing a
proven deploy flow. The PDF is authoritative and server-generated.

## Verification (self-check mandate - REAL end-to-end evidence)

The two outbound side effects were exercised against LIVE Microsoft Graph using
the SAME app-only credentials and the SAME Graph operations the Worker performs,
with the real PDF produced by the shared renderer. Harness:
`/home/aiciv/daily-report-build/e2e-graph-test.py`.

1. PDF render (local, shared renderer): `sample.pdf`, 5392 bytes, 2 pages, valid
   (opens in PyMuPDF, selectable text, clean layout). Saved to
   `/home/aiciv/daily-report-build/sample.pdf`.
2. SharePoint upload: PUT to folder `016ISVH6546BCGQXTIBFFKDG4HC7AZI27B` ->
   HTTP 201 Created, item id `016ISVH67OXWFALZLXXNCJVZTM3FYHWUNK`, 5392 bytes.
   webUrl under `/TEST - Write-Back Dev/Daily Reports Output (TEST)/`.
3. Email: Graph sendMail AS peter@ to `pfpeter@agentmail.to` ONLY -> HTTP 202
   Accepted. The three partners were NOT emailed.
4. Folder GET listing confirmed the new file is present.

Static checks: `node --check` passes on `daily-report.js`, `pdf.js`,
`daily-report-doc.js`.

## Not deployed to production

Per the build directive, this was NOT deployed to production live-send. The
recipient constant stays on the TEST address. Go-live steps: flip
`ACTIVE_RECIPIENTS` to `PROD_RECIPIENTS` (or set `DAILY_REPORT_RECIPIENTS`),
confirm `PF_DAILY_OUTPUT_FOLDER_ID` for the production folder if different, then
deploy via `./deploy.sh`.

## Known items / follow-ups

- The spec's folder id was truncated (20 of 34 chars); corrected to the full id
  after a Graph listing. Confirm with Derek whether "Daily Reports Output (TEST)"
  is the intended folder or a placeholder for a production "Daily Report Output".
- KV read-modify-write concurrency limitation is unchanged (one foreman per report
  in practice); durable fix is a future D1 migration.

---

## Round 2 (2026-07-17) - PF brand restyle (styling ONLY, no behavior change)

Derek approved the function ("function is great") and asked for the PDF to match
the PF website: more colorful + font changes. Achieved BOTH priorities:
color branding AND Eurostile Extended embedding.

### Changed / new files
- `platform/functions/lib/pdf.js` (rewrote v2): added RGB fill/stroke colour, the
  `PF` brand palette, `fillRect`, an azure `brandHeader` band, azure-chip
  `heading`, coloured `keyVal`/`row`/`rule`, and EMBEDDED Eurostile (Type0 /
  CIDFontType2, Identity-H) with a chunked `/ToUnicode` CMap. `EURO_OK` guard
  falls back to Helvetica-Bold if the embed data is ever missing. `toBytes()`
  reworked to byte-exact assembly so it can embed the raw TTF stream.
- `platform/functions/lib/eurostile-font.js` (new, generated): uni->gid map,
  per-gid widths, descriptor metrics, and base64 of the raw TTF. Generated from
  `website/site/fonts/EurostileExtended.ttf` via fontTools.
- `platform/functions/lib/daily-report-doc.js`: switched to `brandHeader`,
  coloured the Owned/Rental subheads + footer, indented equipment rows. Same
  fields, same data, ZERO financials.

### Unchanged (verified)
- `functions/api/daily-report.js` NOT touched. Submit flow (PDF -> email ->
  SharePoint), recipients (TEST = pfpeter@ only), and the TEST folder id are
  identical to Round 1.

### PDF approach note
Full (non-subset) TrueType embed was chosen over subsetting: the TTF is small
(57KB) with complete ASCII coverage and intact glyf/loca/cmap/hmtx tables, so
full embedding is both safe and simpler (no glyph renumbering). It did NOT
threaten reliability, so it shipped. Had it been risky, the plan was to fall back
to Helvetica-Bold display + color-only branding.

### Verification (Round 2)
- `node --check` passes on `pdf.js`, `eurostile-font.js`, `daily-report-doc.js`,
  `daily-report.js`.
- PyMuPDF: 2 pages, valid; every page reports `EurostileExtended` embedded
  (Type0, ttf); section titles + wordmark words are searchable via the ToUnicode
  CMap. Sample overwritten at `/home/aiciv/daily-report-build/sample.pdf`
  (70,348 bytes) + rendered PNGs eyeballed - clean azure branding, no clutter.
- Live Graph e2e (branded PDF): SharePoint PUT -> 201 Created, id
  `016ISVH6YRVVK5A2HWJVG2EN45BSME6YP2`, 70,348 bytes, in the TEST folder;
  sendMail AS peter@ -> 202 Accepted to `pfpeter@agentmail.to` ONLY; folder
  listing confirms the file. NOT deployed; recipient stays on TEST.

---

## Round 3 (2026-07-17) - layout/readability polish (styling ONLY)

Derek reviewed the branded PDF and asked for pro field-report layout refinements
(Fieldwire/Procore/Raken pattern): labeled masthead + tabular body with zebra
rows and aligned value columns. Brand from Round 2 kept. Function unchanged.

### Changed files
- `platform/functions/lib/pdf.js`:
  - `brandHeader(title, meta)` reworked into a real masthead. Band heightened to
    96pt; LEFT keeps wordmark/tagline/title; RIGHT renders a labeled job-info
    block (`meta` = array of {label, value}) with right-aligned azure-light labels
    and solid-white values. Replaces the lone floating project number.
  - New `table(rows, opts)` primitive: left labels + CENTERED value column +
    subtle zebra striping (`#F9FAFD` alt rows) + thin row separators. `subLabels`
    renders group headers (Owned/Rental) as bold sub-heading rows.
- `platform/functions/lib/daily-report-doc.js`:
  - Passes the job-info `meta` block to `brandHeader`; REMOVED the duplicate body
    Project/Date/Foreman/Weather key-value list. Body now starts at Production.
  - Production, Crew, Equipment, Maintenance render via `table()`. Narrative
    sections stay as wrapped text. Still ZERO financials.

### Unchanged (verified)
- `functions/api/daily-report.js` NOT touched. Submit flow, recipients
  (TEST = pfpeter@ only), TEST folder id, and the Eurostile embed + ToUnicode CMap
  are identical to Round 2.

### Verification (Round 3)
- `node --check` passes on `pdf.js` + `daily-report-doc.js`.
- PyMuPDF: 2 pages; EurostileExtended still embedded (Type0/ttf); section titles +
  masthead labels (Production/Crew/Equipment/Project/Foreman/Weather...) all
  searchable. Sample overwritten at `/home/aiciv/daily-report-build/sample.pdf`
  (71,193 bytes); both page PNGs eyeballed - clean masthead, centered values,
  zebra rows, no clutter.
- Live Graph e2e (Round 3 PDF): SharePoint PUT -> 201 Created, id
  `016ISVH6ZTE2N3KXDCK5GIEKSVQETVDY6L`, 71,193 bytes, in the TEST folder;
  sendMail AS peter@ -> 202 Accepted to `pfpeter@agentmail.to` ONLY; folder
  listing confirms the file. NOT deployed; recipient stays on TEST.
