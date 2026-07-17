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

## 7. Out of Scope

- No change to `field-upload.js` (Hand Logs / GUHMA attachments still upload to the
  project QA/QC folder as before; the daily-report PDF is a separate output).
- No production live-send in this build (recipient constant stays on TEST).
