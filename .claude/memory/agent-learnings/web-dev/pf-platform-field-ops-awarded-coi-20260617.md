---
🌐: "Web Development"
🎯: "PF Platform nav batch: Field Operations header, data-driven Awarded Projects index, Insurance/PF COI panel, + Permits removal & Project History rename"
⏰: "2026-06-17 20:10"
🔍: "index.html SPA nav edit, 2 new SharePoint sync scripts (Graph), header-name column lookup, window.esc XSS"
💡: "The two bid-log sheets have DIFFERENT layouts (Agg Pier hdr row 6 / Helical hdr row 3; Agg Pier has an extra leading Number col so Bid Status=col21 vs Helical col20). NEVER hardcode column index across sheets — locate columns BY HEADER NAME."
📈: "16 awarded (14 AP + 2 Helical) + 11 COI coverages pulled real. Orphans ZERO, 54/54/54 module ids, 23 inline scripts node --check pass, divs 1084/1084."
rubric_score: 5
---

# PF Platform — Field Ops / Awarded Index / PF COI (+ Permits removal, rename)

## What I Built
Five coordinated changes to `/home/aiciv/PF-Platform/platform/index.html` (10k-line SPA) plus two new sync scripts. NOT deployed (Brad deploys).

1. **Field Operations** new top-level collapsible header (between Project Management and Projects Schedule): Projects (link to `projects`), Daily Reports (dailyproduction + dailylogs), TimeSheets (NEW placeholder `fo-timesheets`), Safety (`safety`, also kept under PM), QA/QC (guhma + modulus). MOVED the field items out of PM's "QA/QC & Field Tools" subcat and removed that now-empty subcat.
2. **Awarded Projects** placeholder -> data-driven index table from `window.PF_AWARDED`. POET (26-002) -> `showModule('project-poet')` "Open record"; others show muted "record being built". New `sync/build-awarded-index.py` -> `data/awarded-projects.js`.
3. **Insurance** subcat under PM with **PF COI** sub-item (`pf-coi` panel) rendering `window.PF_COI` coverage table + "View current COI (PDF)" button. New `sync/build-pf-coi.py` -> `data/pf-coi.js`.
4. **Permits** section DELETED entirely (nav sub, panel, moduleTitles key, full JS module `<script>` block ~165 lines). Zero `permits` refs remain.
5. **Project History -> Projects Completed** (nav label + moduleTitles value; id `projecthistory` unchanged).

## What I Learned
- **Bid Log dual-sheet layout trap**: `Agg Pier Bid Log` headers on row 6 with an extra leading "Number" column (Bid Status=col21, Value=col22, GC=col27). `Helical Pier Bid Log` headers on row 3, NO extra col (Bid Status=col20, Value=col21, GC=col26). Existing sp-sync.py hardcodes col21/27 and only reads Agg Pier. For multi-sheet, do `find_header_row()` (scan for a row containing 'Bid Status'+'Project Name') then `header_map()` name->col. Robust to either layout.
- **SharePoint Graph reuse**: token via `pf_email._token()` (reads /home/aiciv/.env itself — do NOT `import dotenv`, not installed). Drive id `pf_email._env()['SP_DRIVE_ID']`. Download item by id: `/drives/{drive}/items/{id}/content`. webUrl: `?$select=name,webUrl`.
- **PF COI source**: `PF Insurance Policies.xlsx` sheet `26-27 Policies` (hdr row 2) is the RELIABLE structured source — 11 clean coverage lines (carrier/agg/occ/policy#/eff). The ACORD COI PDF text-extracts poorly; xlsx wins. COI PDF webUrl is a direct Shared Documents path that opens in browser.
- **Box thread guard**: `os.environ.setdefault(OMP/OPENBLAS/MKL_NUM_THREADS,'1')` BEFORE importing openpyxl.
- **Module-id baseline**: git HEAD had 53 unique showModule targets; -permits +fo-timesheets +pf-coi = 54. `git show HEAD:platform/index.html` + comm is the clean way to prove "no existing module removed".

## For Next Time
- New project records: add `"NN-NNN": "project-xxx"` to RECORD_LINKS in build-awarded-index.py so the awarded row links to its record.
- The compare-against-new-COI-request feature is the next phase for pf-coi (store is done).
- Self-check pattern that works here: regex extract showModule targets / `id="mod-X"` panels / moduleTitles keys -> assert 3 sets equal + zero orphans; node --check each inline `<script>` (no src); HTMLParser tag-balance + div open/close count.

## Files Changed
- platform/index.html (nav, panels, moduleTitles, CSS .pf-table/.pf-index-*, 2 new render IIFEs, permits block + refs removed)
- platform/sync/build-awarded-index.py (NEW)
- platform/sync/build-pf-coi.py (NEW)
- platform/data/awarded-projects.js (NEW, generated, 16 projects)
- platform/data/pf-coi.js (NEW, generated, 11 coverages)
