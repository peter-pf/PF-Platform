# Statement of Work: Daily Report File Uploads

**Project:** Pier Foundations -- Daily Report File Uploads to SharePoint
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad/Jonathan review_
**Implementation Status:** v1.0 BUILT -- deployed (commits cecbef6, fb1b8d7)

---

## 1. Purpose

The GUHMA SOP references hand logs and GUHM data sent from the site team. Until now those files arrived informally and had to be filed into SharePoint by hand. This work lets the field crew attach the day's hand logs and GUHM data right on the Submit Daily Report form, and the platform files them into the correct project's QAQC folder by report date automatically.

## 2. Scope

### In Scope
- Two upload sections at the bottom of Submit Daily Report (after the safety field): "Upload Hand Logs" and "Upload GUHM Data"
- Save raw files to `03 - Engineering & Design / QAQC / <report date> / Hand Logs` or `GUHMA Data`
- Deterministic project folder resolution (active tree first, completed-projects fallback)
- Get-or-create date and bucket folders
- Chunked Graph upload sessions for large files
- conflictBehavior rename so originals are never overwritten
- `attachments[]` field on the daily report model
- field_ops RBAC, extension allow-list, size caps, filename sanitizing

### Out of Scope
- Editing or versioning files after upload
- Pulling files back into the platform UI for viewing
- Automated GUHMA parsing (that is GUHMA Integration)
- Moving existing historical files into the new structure

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| End User (Primary) | Field Foreman / Operator | Uploads hand logs and GUHM data with the daily report |
| End User | Jonathan Reinking | Retrieves QC files from SharePoint |
| Engineering Advisor | Dr. Ed Garbin | Reviews QAQC data for signoff |
| Decision Maker | Brad Reinking | Approves the workflow |
| Builder | Peter (AI COO) | Designs, builds, and maintains the feature |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Upload sections | In-form HTML | Hand Logs and GUHM Data uploaders |
| 2 | Upload endpoint | `functions/api/field-upload.js` | Resolve folder, ensure folders, chunked upload |
| 3 | Graph helper | `functions/lib/graph.js` | App-only token via client_credentials |
| 4 | Model extension | `daily-report.js` | `attachments[]` field |
| 5 | SRS + SOW + Manual | .md files | Documentation |

## 5. Success Criteria

- Field crew attaches hand logs and GUHM data on the daily report and they land in the right project's QAQC folder by date
- Large files upload reliably via chunked sessions
- An upload never overwrites an existing original
- field_ops users cannot reach financials or any other project's folder
- The whole path was proven by a live SharePoint smoke test

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|--------------------|
| SOW + SRS | 15 min |
| Build endpoint + Graph helper | 30 min |
| Wire upload sections into the form | 15 min |
| Live SharePoint smoke test | 15 min |
| Triple-check (security, qa, reviewer) | 15 min |
| Deploy | 10 min |

## 7. Assumptions

- Graph app-only credentials are present in Cloudflare env (`AZURE_CLIENT_ID`, `AZURE_SECRET`, `AZURE_TENANT_ID`, `SP_DRIVE_ID`), same env used by `doc.js`
- Project folders live under `04 - Project Management/02 - Projects`, with completed projects under `001 - Completed Projects/<year>`
- Graph search is unreliable, so resolution is done by deterministic path listing
- Files above roughly 4 MB need upload sessions, simple PUT is not enough

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Graph search misses or returns the wrong folder | Deterministic path listing instead of search |
| Large file fails on simple PUT | Chunked upload sessions, 6.4 MiB chunks |
| Upload overwrites an existing original | conflictBehavior rename |
| Malicious filename or path traversal | Filename sanitized, extension allow-list, fixed server drive |
| Missing secrets at runtime | Fail-closed |

## 9. Verification Evidence

- Commits cecbef6 and fb1b8d7, LIVE
- Live SharePoint write smoke test into Madison 26-007: resolve -> ensure folders -> chunked upload -> verify -> cleanup
- Triple-checked by security-auditor, reviewer, and qa-engineer, all approved

## 10. Implementation Notes

- **Platform:** pf-platform.pages.dev/platform/
- **Endpoint:** `functions/api/field-upload.js`
- **Graph helper:** `functions/lib/graph.js` (shared with `doc.js`)
- **Destination:** `03 - Engineering & Design / QAQC / <report date> / {Hand Logs | GUHMA Data}`
- **Caps:** 50 MB/file, 25 files, 120 MB/request, allow-list `.guh .jpg .jpeg .png .heic .pdf .zip .xlsx`
