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

---

## Round 4 (2026-07-17) - charcoal header + PF logo + value alignment (styling ONLY)

Derek reviewed v3 and asked for four header/alignment changes. Body styling kept.
Function unchanged.

### Changed / new files
- `platform/functions/lib/pf-logo.js` (new, generated): base64 of
  `dr-v4/pf-header-logo.jpg` (1392x950 baseline JPEG, 3-component RGB) + dims.
  Same offline-generation pattern as `eurostile-font.js` so the Worker stays
  filesystem-free.
- `platform/functions/lib/pdf.js`:
  - `brandHeader`: band is now CHARCOAL `#2B2F36` (was azure) with a thin azure
    base line; band grew to 104pt. Draws the PF logo lockup (upper-left) via a new
    `drawImage(x,y,w,h)` primitive; REMOVED the Eurostile "PIER FOUNDATIONS"
    wordmark text and the "VIBRATORY STONE COLUMNS" tagline (the logo carries the
    name). Title stays white on its own baseline below the lockup. Metadata labels
    -> `PF.lightGrey`, values -> white. `LOGO_OK` guard falls back to a text
    wordmark if the asset is missing.
  - `drawImage`: emits `q w 0 0 h x y cm /Im0 Do Q`, sets a usage flag.
  - `toBytes`: registers the logo as a DCTDecode Image XObject (DeviceRGB, 8bpc)
    and adds `/XObject << /Im0 N 0 R >>` to each page's Resources.
  - `table`: values now RIGHT-ALIGNED to a shared right edge
    (`PAGE_W - MARGIN - 8`) instead of per-cell centered, so the value column
    lines up top-to-bottom across all sections.
  - Added `PF.charcoal` (#2B2F36) + `PF.lightGrey` (#C8D5DC) to the palette.
- `platform/functions/lib/daily-report-doc.js`: unchanged logic; values now align
  by virtue of the table() change.

### Unchanged (verified)
- `functions/api/daily-report.js` NOT touched. Submit flow, recipients
  (TEST = pfpeter@ only), TEST folder id, Eurostile embed + ToUnicode CMap
  identical to Round 3.

### PDF approach note (logo embed)
JPEG/DCTDecode was chosen over PNG: the prepared JPEG is baseline, 3-component,
no Adobe APP14 marker, so the raw bytes drop straight into the stream with
`/Filter /DCTDecode` + `/ColorSpace /DeviceRGB` - no PNG/zlib decode, no alpha
compositing. The logo is pre-flattened onto the header charcoal so it needs no
transparency. Reused the existing `{head, bin}` binary-stream mechanism in
`toBytes()` (same one used for the embedded TTF).

### Verification (Round 4)
- `node --check` passes on `pf-logo.js`, `pdf.js`, `daily-report-doc.js`,
  `daily-report.js`.
- PyMuPDF: 2 pages; 1 image on page 1 (1392x950, DeviceRGB, DCTDecode); Eurostile
  still embedded (Type0/ttf); section titles + masthead labels searchable; the
  wordmark is NOT duplicated as PDF text (it lives in the logo). Sample overwritten
  at `/home/aiciv/daily-report-build/sample.pdf` (135,142 bytes); both page PNGs
  eyeballed - charcoal header, seamless logo (no box), title clear of the lockup,
  values aligned on one vertical axis.
- Live Graph e2e (Round 4 PDF): SharePoint PUT -> 201 Created, id
  `016ISVH6YD2BE5FBR3YJHYS4DR7RK7QREX`, 135,142 bytes, in the TEST folder;
  sendMail AS peter@ -> 202 Accepted to `pfpeter@agentmail.to` ONLY; folder
  listing confirms the file. NOT deployed; recipient stays on TEST.

---

## Round 5 (2026-07-17) - black body text, no blue-on-blue (styling ONLY)

Derek: no blue text on blue background; all black body + headers. BODY-ONLY.
The charcoal header from Round 4 is untouched.

### Changed files
- `platform/functions/lib/pdf.js` ONLY:
  - `heading()`: chip `PF.azureLight` -> `PF.bg2` (neutral light grey #F3F5F8);
    title colour `PF.azure` -> `PF.heading` (black, still Eurostile); underline
    rule `PF.azure` -> `PF.border` (grey #C8D5DC).
  - `table()`: default `labelColor` `PF.body` -> `PF.heading`; default
    `valueColor` `PF.azureDark` -> `PF.heading`; Owned/Rental sub-heading colour
    `PF.azureDark` -> `PF.heading`.
  - `text()`: default body colour `PF.body` -> `PF.heading` (narrative sections
    now black; the footer still passes `PF.muted` explicitly).

### Unchanged (verified)
- `brandHeader()` (charcoal band, logo XObject, white title, white/light-grey
  metadata, azure base line) NOT touched.
- `functions/api/daily-report.js` NOT touched. Submit flow, recipients
  (TEST = pfpeter@ only), TEST folder id, logo embed, Eurostile embed + ToUnicode
  CMap all identical to Round 4.
- `daily-report-doc.js` NOT touched (it only passes neutral `PF.border`/`PF.muted`
  to the footer; body colours now come from the primitives' new black defaults).

### Verification (Round 5)
- `node --check` passes on `pdf.js` + `daily-report-doc.js`.
- PyMuPDF: 2 pages; logo image still present on page 1 (1392x950, DeviceRGB,
  DCTDecode); EurostileExtended still embedded (Type0/ttf); titles searchable.
  Sample overwritten at `/home/aiciv/daily-report-build/sample.pdf` (135,142
  bytes); both page PNGs eyeballed - all body text black, grey section chips + grey
  rules (no blue in the body), charcoal header unchanged.
- Live Graph e2e (Round 5 PDF): SharePoint PUT -> 201 Created, id
  `016ISVH65JMRKHHXGZONFKWSUXYK7SINU3`, 135,142 bytes, in the TEST folder;
  sendMail AS peter@ -> 202 Accepted to `pfpeter@agentmail.to` ONLY; folder
  listing confirms the file. NOT deployed; recipient stays on TEST.

---

## Round 6 (2026-07-17) - lined rows, no row shading (styling ONLY)

Derek: keep the header chip background, remove the row background; delineate rows
with lines instead. `table()`-only change.

### Changed files
- `platform/functions/lib/pdf.js` ONLY, in `table()`:
  - Removed the zebra `fillRect(MARGIN, rowBot, CONTENT_W, rowH, PF.bg1)` on odd
    rows and the now-unused stripe `idx` counter. Rows sit on plain white.
  - Kept the per-row separator line and made it the sole delineation:
    `PF.borderLt`/0.4pt -> `PF.border` (#C8D5DC) / 0.5pt.

### Unchanged (verified)
- `heading()` grey chips (`PF.bg2`) + black Eurostile titles + grey underline rule
  NOT touched. All-black body text, right-aligned values NOT touched.
- `brandHeader()` (charcoal band, logo, white title, metadata, azure base line)
  NOT touched.
- `functions/api/daily-report.js` + `daily-report-doc.js` NOT touched. Submit flow,
  recipients (TEST = pfpeter@ only), TEST folder id, logo + Eurostile embeds all
  identical to Round 5.

### Verification (Round 6)
- `node --check` passes on `pdf.js`.
- PyMuPDF: 2 pages; logo image still present (1392x950, DeviceRGB, DCTDecode);
  EurostileExtended still embedded (Type0/ttf); titles searchable. Sample
  overwritten at `/home/aiciv/daily-report-build/sample.pdf` (134,882 bytes); both
  page PNGs eyeballed - grey header chips kept, data rows on white with thin grey
  separator lines (no shading), charcoal header unchanged.
- Live Graph e2e (Round 6 PDF): SharePoint PUT -> 201 Created, id
  `016ISVH6Y2WU2CGEU6BBCLOMZEYAQYNZRC`, 134,882 bytes, in the TEST folder;
  sendMail AS peter@ -> 202 Accepted to `pfpeter@agentmail.to` ONLY; folder
  listing confirms the file. NOT deployed; recipient stays on TEST.

---

## Round 7 (2026-07-17) - filename convention + GO LIVE (DEPLOYED)

Derek approved the v6 layout ("use that going forward") and gave one final
requirement (filename format), then we went to production.

### Changed files
- `platform/functions/lib/daily-report-doc.js`:
  - `pdfFilename()` rewritten to Derek's format `YY-MMDD-[project name].pdf`
    (e.g. `26-0717-Test Data Center - Phase 1.pdf`). YY-MMDD from the report date.
  - New `safeProjectName()` strips only SharePoint-illegal chars
    (`\ / : * ? " < > |`) + control chars, keeps spaces/hyphens, trims,
    drops leading/trailing dots, bounds to 80 chars.
- `platform/functions/api/daily-report.js`:
  - `ACTIVE_RECIPIENTS` flipped `TEST_RECIPIENTS` -> `PROD_RECIPIENTS`
    (dfranke@ / jreinking@ / breinking@ pierfoundations.com). GO LIVE.

### Go-live sequence (executed in order)
1. Filename code change; local sample regenerated -> `26-0717-Test Data Center -
   Phase 1.pdf`; PyMuPDF confirms logo + Eurostile intact.
2. TEST verification (recipients STILL pfpeter@): live Graph e2e uploaded
   `26-0717-Test Data Center - Phase 1.pdf` to the TEST folder (201 Created, id
   `016ISVH667OKJ576IU6FAIKRDDKFG7O2ZC`, 134,882 bytes) + sendMail 202 to
   `pfpeter@agentmail.to` ONLY. Filename format confirmed in the folder listing.
3. Flipped `ACTIVE_RECIPIENTS` -> `PROD_RECIPIENTS`.
4. Deployed via `./deploy.sh` (docs gate passed; Compiled Worker successfully;
   Functions bundle uploaded; live root returns HTTP 401 auth gate).
5. NO post-deploy submission (would have emailed the three partners). The flow was
   already proven end-to-end in step 2.

### Confirmation
- NO email was sent to the three partners during this process (the only test send
  went to pfpeter@ before the flip; no submission after the flip).
- `daily-report.js` submit logic, SharePoint TEST folder id, logo + Eurostile
  embeds, and the v6 layout are otherwise unchanged.

### Deploy evidence
See the primary report / commit for the exact deploy console lines (docs gate ok,
"Compiled Worker successfully", Functions bundle, canonical env=production, root
HTTP 401).
