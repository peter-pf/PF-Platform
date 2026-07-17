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
