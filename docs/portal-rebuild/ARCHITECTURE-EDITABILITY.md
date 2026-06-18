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

## Confirmed direction & phasing (Brad 2026-06-17)
Goal: the whole team lives in the portal. Jonathan, Derek (primarily for NEW OPPORTUNITIES), and Brad enter information directly into the portal, and the portal BACKFILLS the spreadsheets. Confirmed feasible.

**Two-phase rollout (Brad's sequencing, matches the recommendation above):**
1. **Phase 1 — Excel → Portal (now):** pull from the Excel masters (Bid Log, Project Master, Turnover Budget, Timesheets, etc.) to POPULATE the portal. This is what we are building today. Get it all working and accurate first.
2. **Phase 2 — Portal → Excel (after Phase 1 is solid):** flip the flow. New opportunities and updates get entered IN the portal, and Peter writes them BACK into the source spreadsheets via Microsoft Graph (e.g., a new opportunity form appends a row to the Project Bid Log and creates the project record; project edits backfill the Project Master). At that point the PORTAL is the system of record and the spreadsheets become the synced output/backup.

**Key intake example:** "New Opportunity" entry in the portal (Jonathan/Derek) → saved in the portal store → Peter appends the row to `Project Bid Log.xlsx` (correct tab: Agg vs Helical) and seeds the project record. Same write-back pattern for project-record edits → Project Master, and Budget vs Actual edits → Turnover Budget input cells.

Possibility confirmed: yes (Graph Excel write API + our ReadWrite permissions). Set-up: yes, as Phase 2, built incrementally on the proven schedule-style editable+persist pattern, with an audit log of every change.

## Project document browser — mirror SharePoint subfolders + inline embed (Brad 2026-06-17)
In each project's section, build a DOCUMENT browser that mirrors the project's SharePoint SUBFOLDER structure (same folders/subfolders as the project folder: 01 Preconstruction, 02 Project Management, 03 Engineering & Design, 04 GC Drawings & Specs, 05 Field, and their subfolders). Navigate the project's files inside the portal by those same subfolders, and view each file EMBEDDED inline (via the live `/api/doc` proxy, same approach confirmed for the contract) rather than bouncing to SharePoint. So the portal becomes the single place to read every project document, organized exactly like the SharePoint folder, always live. (Builds on the embed-file proxy; extends from a single contract embed to a full per-project file tree.)

## Status
Framework agreed; Phase 1 (Excel→portal population) in progress now. Phase 2 (portal→Excel backfill) starts once Phase 1 is solid. Start the write-back with one section (e.g. New Opportunity intake) as the proof, then expand.
