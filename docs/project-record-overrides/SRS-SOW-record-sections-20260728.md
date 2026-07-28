# Project Record -- Sections Cleanup + Engineering Comments (Addendum)

**Parent docs:** `docs/project-record-overrides/SRS.md` + `SOW.md` + `MANUAL.md`
**Version:** 1.1 (addendum)
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** COMPLETE -- deployed to production.

> This addendum records three project-record changes shipped the same cycle as the per-section overrides. The override/edit mechanism itself is unchanged and remains in the parent SRS/SOW/MANUAL. All three changes are in the OFFICE project-record renderer; the Field Operations project view is not touched.

---

## Changes

### 1. Tracked-items panel folded into the sections
The standalone "Tracked items to complete" panel was removed. Its items are now shown inline inside the matching drop-down section cards (General Info, PF Team, Contract Info, Engineering, Safety, Site Readiness, Equipment, Material, QA/QC, Closeout), deduped against fields already shown in each card.

| # | Requirement | Status |
|---|-------------|--------|
| FR-1 | Remove the standalone tracked-items panel | DONE |
| FR-2 | Show each tracked item under its matching section card as a read-only row | DONE |
| FR-3 | Do not duplicate an item that the card already shows (dedupe by label) | DONE |
| FR-4 | Folded rows are read-only and invisible to the per-section Edit mechanism (no phantom editable fields) | DONE |

### 2. All record sections default collapsed on open
When a record is opened, every section starts collapsed. The user expands the sections they need. Header click still toggles a section open and closed.

| # | Requirement | Status |
|---|-------------|--------|
| FR-5 | Every section is collapsed when the record first opens | DONE |
| FR-6 | Clicking a section header expands/collapses it as before | DONE |

### 3. Engineering & Design Comments subsection
A labeled "Engineering & Design Comments" subsection was added inside each project record's Engineering & Design section. It is a placeholder now with an honest empty state; future data will come from Dr. Garbin's submittal-review workbook, matched by project number.

| # | Requirement | Status |
|---|-------------|--------|
| FR-7 | Show an Engineering & Design Comments subsection inside the Engineering & Design section | DONE |
| FR-8 | Show an honest empty state until real comments exist; never fabricate content | DONE |
| FR-9 | Cover existing, POET, and newly synthesized estimating/award records (shared renderer) | DONE |

## Non-Functional / Security

- All three changes are additive-after-render into existing section card bodies. They add no editable fields, so the per-section Edit and override flow is unchanged (the editor only scans labeled fields, which these injected rows do not carry).
- The changes re-apply after every save, so they survive edit cycles.
- Records remain editable exactly as documented in the parent MANUAL. Field Operations project view is not affected.

## Verification Evidence

| Claim | Evidence |
|-------|----------|
| Tracked items folded, zero data loss, deduped | Render-proof harness: POET 103 items + 26-007 102 items = 0 dropped, 0 dupes; pre-seeded labels deduped 9. Deploy `21cb0708` |
| All sections collapse on open | Both previously-open cards flipped to collapsed; committed-source confirms. Deploy `21cb0708` |
| Engineering Comments subsection present with empty state | Label + empty-state text + shared-renderer injection confirmed in committed source. Deploy `229ba710` |
| Edit/override unaffected | Injected rows carry no labeled fields, so the section editor ignores them |
| Production gated | Root 401, /login 200 |

## Open Items / Future

1. Populate Engineering & Design Comments from Dr. Garbin's submittal-review workbook, matched by project number, keeping the honest empty-state fallback for projects with no comments.
