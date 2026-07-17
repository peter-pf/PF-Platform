# SRS - Daily Field Report Submit Flow (PDF + Email + SharePoint)

Module: `daily-report`
Endpoint: `/api/daily-report` (Cloudflare Pages Function)
Area / RBAC: `field_ops` (admin / partner / business_dev / field_ops)
Status: BUILT + verified end-to-end (test recipient + test folder). Recipient
constant left on the TEST address pending Peter/Derek layout approval.

## 1. Purpose

Replace the old in-platform approval queue for daily field reports with a direct
distribution flow. When a foreman clicks **Submit**, the platform does EXACTLY
three things and nothing else:

1. Render the daily report into a PDF (server-side, authoritative).
2. Auto-email that PDF to a mailing list.
3. Save the same PDF into the SharePoint "Daily Reports Output (TEST)" folder.

The approval machinery (`submitted -> approved -> sent-to-HR` status transitions,
the privileged approve/send-to-HR actions, and the owner-only buttons) is REMOVED.

## 2. Functional Requirements

- FR1 - On `action:'submit'`, the server renders the stored report record to a
  single PDF (US Letter, multi-page as needed).
- FR2 - The server emails that PDF as a base64 file attachment to the configured
  recipient list, sending AS `peter@pierfoundations.com` (Graph sendMail).
- FR3 - The server uploads the same PDF bytes into the fixed SharePoint folder
  "Daily Reports Output (TEST)" (drive-item id, conflictBehavior `rename`).
- FR4 - `create` / `update` still persist a draft record to KV. `submit` finalizes
  the record to `status:'sent'` and records `pdfName`, `pdfWebUrl`, `emailedTo`,
  `sentAt` for the portal history list.
- FR5 - ZERO financials in the PDF, the email, or the record: no dollar amounts,
  rates, or costs. Only hours, counts, weather, narrative, maintenance, safety.
- FR6 - The PDF content includes: project name + number, date, foreman, crew rows
  (name + HOURS, no pay), production (columns + LF), weather (precip + temp),
  equipment owned/rental (machine + meter hours), maintenance rows, future issues,
  delays, safety, work-completed narrative, and attachment file names.

## 3. Recipients (the single flip point)

- Server-side constant `ACTIVE_RECIPIENTS` in `functions/api/daily-report.js`.
- TEST (current): `pfpeter@agentmail.to` ONLY. The three partners are never
  emailed during the build/test.
- PRODUCTION (go-live): `dfranke@`, `jreinking@`, `breinking@` (all @pierfoundations.com).
- To flip: set `ACTIVE_RECIPIENTS = PROD_RECIPIENTS` (one line, clearly commented),
  OR set the `DAILY_REPORT_RECIPIENTS` env var (comma-separated) which overrides
  the constant with no code change. The client can NEVER influence recipients.

## 4. SharePoint Target

- Folder: "Daily Reports Output (TEST)" under `/TEST - Write-Back Dev/` in the
  `SP_DRIVE_ID` drive (same drive `field-upload.js` uses).
- Drive-item id (full, 34 chars): `016ISVH6546BCGQXTIBFFKDG4HC7AZI27B`.
  The build spec quoted the first 20 chars (`016ISVH6546BCGQXTIBF`); the live
  folder resolves to the full id (verified via a Graph folder listing).
- Fixed on the server (never client-supplied). Overridable via
  `PF_DAILY_OUTPUT_FOLDER_ID` env var for the eventual production folder.
- Filename: `DailyReport_{projectNumber}_{YYYY-MM-DD}_{shortid}.pdf`,
  conflictBehavior `rename`.

## 5. Security Requirements

- SR1 - Auth gate (`_middleware.js`) + `requireArea('field_ops')` on GET and POST.
- SR2 - Graph app-only creds (`AZURE_*`) and `SP_DRIVE_ID` live ONLY in CF env
  vars, never exposed to the browser. Token minted via `lib/graph.js`.
- SR3 - FAIL CLOSED: if Graph creds / `SP_DRIVE_ID` are missing, `submit` returns
  503 and the draft is preserved. A report is NEVER silently dropped.
- SR4 - Partial-failure honesty: if the email succeeds but the SharePoint upload
  fails, the record stays a draft and the response says so (no false "sent").
- SR5 - Existing WRITE hardening retained: body cap (32KB), strict JSON, field
  rebuild + length caps, angle-bracket strip, server-set audit fields.
- SR6 - The PDF renderer sanitizes every string to WinAnsi + PDF-string-escaped;
  it performs no I/O, no eval, no network.

## 6. PDF Generation Approach (decision + rationale)

Chosen: **server-side, dependency-free PDF writer** (`functions/lib/pdf.js`),
called by `functions/lib/daily-report-doc.js`.

Why not pdf-lib (approach A with npm): the PF deploy pipeline (`deploy.sh` ->
`npx wrangler pages deploy .` on a staged copy) has NO `package.json`,
`node_modules`, or build step, and no function imports any npm package. Adding
pdf-lib would require introducing npm bundling into a proven, working deploy flow
- an unnecessary risk. Instead we emit a valid PDF 1.4 document directly
(Helvetica / Helvetica-Bold standard fonts, WinAnsi text, word wrap, rules,
automatic page breaks). This keeps the PDF authoritative and server-generated
(the spec's preference) with zero new dependencies and zero pipeline change.

Why not client-side jsPDF (approach B): a client-generated PDF is not
authoritative and would move report layout/logic into the browser. Server-side
keeps a single source of truth and keeps the crew UI thin.

## 6b. PDF Branding / Styling (Round 2, 2026-07-17)

Derek reviewed the Round 1 sample ("function is great" - no behavior change) and
asked for the PDF to be restyled to match the Pier Foundations website
(www.pierfoundations.com): "a little more colorful with some font changes similar
to how our website is styled." Layout + aesthetics ONLY. Achieved: **color +
Eurostile (both Priority 1 and Priority 2).**

Brand tokens applied (from the live site stylesheet), in `lib/pdf.js` `PF` palette:
- Accent azure `#006DB0`, azure-dark `#005A91`, azure-light `#E0F0FF`.
- Text: heading `#000000`, body `#2B2F36`, secondary `#5A6370`, muted `#8A9AAB`.
- Borders `#C8D5DC` / `#E2EAF0`; light backgrounds `#F9FAFD` / `#F3F5F8` / `#E8EEF2`.

Visual treatment:
- Full-bleed azure (`#006DB0`) header band across the top with a darker azure base
  line; the wordmark "PIER FOUNDATIONS" + "Daily Field Report" title in WHITE
  Eurostile, a "VIBRATORY STONE COLUMNS" tagline in azure-light, and the project
  number right-aligned in white.
- Each section title ("Production", "Crew", "Equipment", "Maintenance",
  "Delays", "Safety", "Work Completed", "Attachments"...) sits in a light-azure
  (`#E0F0FF`) chip with an azure Eurostile title and an azure rule beneath.
- Right-hand values (hours, counts) in azure-dark bold; labels in secondary grey;
  body in `#2B2F36`; muted footer.

Font embedding (Priority 2 - shipped):
- Eurostile Extended (the PF display font,
  `website/site/fonts/EurostileExtended.ttf`, 57KB, full ASCII coverage) is
  embedded FULL (non-subset) as a Type0 / CIDFontType2 with Identity-H encoding.
  Display strings are encoded to 2-byte glyph IDs at write time - the most robust
  TrueType path (no WinAnsi limits, no glyph re-mapping).
- A `/ToUnicode` CMap (chunked into <=100-entry `bfchar` blocks) maps GIDs back to
  Unicode so the display text stays SELECTABLE / SEARCHABLE / accessible.
- Font data is generated into `lib/eurostile-font.js` (uni->gid map, per-gid
  widths, descriptor metrics, base64 TTF) from the source TTF via fontTools.
- SAFETY FALLBACK: if the embed data is unavailable, `/F3` falls back to
  Helvetica-Bold and display text renders via the WinAnsi path, so the PDF can
  never be broken by the branding (`EURO_OK` guard).

Verified: PyMuPDF reports EurostileExtended embedded (Type0/ttf) on every page;
section titles + wordmark words are searchable; the branded PDF still uploads
(201) to the TEST folder and sendMail returns 202 to pfpeter@ only. The function
behavior (submit -> PDF -> email -> SharePoint) is byte-for-byte unchanged.

## 6c. PDF Layout Polish (Round 3, 2026-07-17)

Derek reviewed the branded version and asked for readability/layout refinements,
inspired by professional construction daily-report templates (Fieldwire, Procore,
Raken): a labeled masthead job-info block, then clean tabular body sections with
zebra rows and aligned value columns. Layout ONLY - the PF brand from Round 2 is
kept (azure band, Eurostile, light-azure chips). Function unchanged.

Header rework ("fix the head", "use the space on the right", "categories in text
before the project number"):
- `brandHeader(title, meta)` now takes a `meta` array of `{label, value}`. LEFT of
  the azure band keeps the wordmark + "VIBRATORY STONE COLUMNS" tagline + report
  title. RIGHT of the band renders a labeled job-info block (labels right-aligned
  in azure-light, values in solid white): Project / Date / Foreman / Weather /
  Project No - the named categories in text with the project number AMONG them.
  The band was heightened (74->96pt) to hold the block and no longer looks empty
  on the right.
- The DUPLICATE Project/Project Number/Date/Foreman/Weather list that used to sit
  in the body under the header is REMOVED (it now lives only in the masthead). The
  body starts at the first section (Production).

Data rows ("center the right columns", "light background to break up multiple row
areas"):
- New `table(rows, opts)` primitive renders Production, Crew, Equipment, and
  Maintenance as clean tables: labels LEFT-aligned, values CENTERED in a fixed
  right-hand value column (azure-dark bold), a thin row separator, and subtle
  ZEBRA striping (alternating `#F9FAFD` background on every other data row) so
  multi-row areas scan easily.
- `subLabels` option renders the "Owned"/"Rental" equipment group headers as
  azure-dark bold sub-heading rows (no stripe, no value).
- The azure section chips + Eurostile section titles + azure rule are unchanged.
- Narrative sections (Future Issues, Delays, Safety, Work Completed, Attachments)
  stay as flowing wrapped text under their chips.

Verified (Round 3): PyMuPDF shows EurostileExtended still embedded (Type0/ttf) +
searchable via the ToUnicode CMap (EURO_OK fallback intact); the refined PDF
(71,193 bytes, 2 pages) uploads 201 to the TEST folder + sendMail 202 to pfpeter@
only. api/daily-report.js untouched.

## 6d. Charcoal Header + Logo + Value Alignment (Round 4, 2026-07-17)

Derek reviewed v3 and asked for four header/alignment changes. Body styling
(azure section chips, Eurostile titles, zebra rows) is kept. Function unchanged.

1. Tagline removed - "VIBRATORY STONE COLUMNS" text is gone from the header.
2. Header background changed from azure to CHARCOAL GREY `#2B2F36` (PF's dark text
   colour; `PF.charcoal`), with a thin azure `#006DB0` accent line at the band
   base. All header text is white/light: the title in white, metadata labels in a
   muted light grey (`#C8D5DC`, `PF.lightGrey`), values in solid white.
3. PF LOGO embedded in the header. The prepared JPEG (`dr-v4/pf-header-logo.jpg`,
   1392x950, the white "PF + PIER FOUNDATIONS" lockup pre-flattened onto the same
   `#2B2F36` charcoal so it sits with no visible box) is embedded as a DCTDecode
   Image XObject: raw JPEG bytes in the stream with `/Filter /DCTDecode`,
   `/ColorSpace /DeviceRGB`, `/BitsPerComponent 8`, `/Width 1392 /Height 950`,
   drawn via a `cm` matrix + `/Im0 Do`. It is baseline JPEG, 3-component, no Adobe
   APP14 -> DeviceRGB is correct. The band grew to 104pt to fit the lockup cleanly.
   The separate Eurostile "PIER FOUNDATIONS" wordmark TEXT was REMOVED (the logo
   carries it); the "Daily Field Report" title (white) is kept, placed on its own
   baseline below the lockup so they never overlap. Font data + logo data are
   generated into `lib/pf-logo.js` (base64 JPEG + dims). A `LOGO_OK` guard falls
   back to a text wordmark if the asset is ever missing, so the header can't break.
4. Value column ALIGNED vertically. The `table()` primitive now RIGHT-ALIGNS every
   value to a single shared right edge (`PAGE_W - MARGIN - 8`) instead of centering
   per cell, so all values (34, 612, 10 h, 9.5 h, 1452.3 hr, 210 hr, ...) line up
   on one vertical axis top-to-bottom across every section (Derek: "the text needs
   to be aligned going up and down the page").

Verified (Round 4): PyMuPDF reports 1 image on page 1 (1392x950, DeviceRGB,
DCTDecode) + EurostileExtended still embedded (Type0/ttf) and section titles /
masthead labels searchable; the wordmark is no longer duplicated as PDF text (it
lives in the logo image). The PDF (135,142 bytes, 2 pages) uploads 201 to the TEST
folder + sendMail 202 to pfpeter@ only. api/daily-report.js untouched.

## 7. Out of Scope

- No change to `field-upload.js` (Hand Logs / GUHMA attachments still upload to the
  project QA/QC folder as before; the daily-report PDF is a separate output).
- No behavior change in Round 2 - styling/layout only.
- No production live-send in this build (recipient constant stays on TEST).
