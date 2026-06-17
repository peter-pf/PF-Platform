# Framework: Editable Portal + Write-Back + Embedded Files

Brad (2026-06-17): wants the platform to be (1) EDITABLE — make updates directly in the portal, then Peter updates the backend documents to match; and (2) able to EMBED files directly in the portal in certain spots instead of just linking out. Both are feasible. Details TBD with Brad.

## 1. Editable portal with write-back — FEASIBLE
Today the platform is READ-ONLY: data flows SharePoint → sync scripts → generated JS (`data/*.js`) → display. To make it editable we add a WRITE path.

**Proven pattern we already have:** the Crew Schedule is editable + persisted via a Cloudflare Pages Function (`functions/api/schedule.js`) backed by Cloudflare KV (optimistic concurrency). Same shape extends to any editable area.

**The one decision that governs everything — SOURCE OF TRUTH per data type:**
- **Recommended:** the PORTAL becomes the system of record for editable fields (stored in Cloudflare KV/D1, behind the existing auth gate). Peter then writes the change BACK to the backing SharePoint/Excel document so the doc stays current as an OUTPUT. This avoids the two-way-edit conflict (portal edit vs someone editing the Excel directly).
- Write-back to SharePoint is feasible via Microsoft Graph (we hold Files.ReadWrite.All + Sites.ReadWrite.All). Graph's Excel API can PATCH specific cells/ranges; for formula-heavy workbooks (e.g. Turnover Budget) write only to designated INPUT cells, never formula cells — or regenerate a clean output copy rather than editing the live workbook.

**Build pieces:** edit UI per field/section → POST to a Pages Function → persist to KV/D1 (source of truth) → Function calls Graph to update the SharePoint doc → audit log of who/what/when (this also feeds Brad's project-log / Communications requirement). Roll out incrementally, section by section, not all at once.

**Risks to manage:** conflict/source-of-truth (solved by "portal is SOR, doc is output"), validation per field, write-back to complex Excel formulas (write input cells only), and auth (write endpoints stay behind the gate; Graph creds server-side in CF env).

## 2. Embed files in the portal (vs links) — FEASIBLE
Instead of opening SharePoint in a new tab, render the file inside the portal in "certain locations."
- **Pattern we already have:** the platform embeds some docs via `<iframe class="doc-frame">`. Extend by proxying the SharePoint file bytes through a Cloudflare Function (authenticated via Graph, so the file stays behind our gate) and rendering inline — PDF.js / `<embed>` for PDFs, `<img>` for photos.
- Good first targets: the COI PDF, invoices on the Budget vs Actual lines, approved drawings, project photos.
- Tradeoffs: file size/performance and the auth proxy; fine for targeted spots, not for embedding everything.

## Status
Framework agreed in principle; detailed scope (which sections become editable first, which files embed where) to be worked through with Brad. Start with the schedule-style editable pattern on one section as the proof, then expand.
