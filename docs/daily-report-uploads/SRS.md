# Software Requirements Specification: Daily Report File Uploads

**Project:** Pier Foundations -- Daily Report File Uploads to SharePoint
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: v1.0 -- Built and deployed (commits cecbef6, fb1b8d7). LIVE.

## 1. Overview

Daily Report File Uploads adds two upload sections to the bottom of the Submit Daily Report form so the field crew can attach the day's hand logs and GUHM data to the report. On submit, the raw files are saved straight into that project's SharePoint QAQC folder, organized by report date, so the office and the engineer can find them later without a separate handoff.

## 2. Functional Requirements

### 2.1 Upload Sections

| Section | Location | Destination subfolder |
|---------|----------|-----------------------|
| Upload Hand Logs | Bottom of Submit Daily Report, after the safety field | `Hand Logs` |
| Upload GUHM Data | Bottom of Submit Daily Report, after the safety field | `GUHMA Data` |

### 2.2 SharePoint Destination Path

Files are written into the project's engineering tree, organized by report date:

```
03 - Engineering & Design / QAQC / <report date> / Hand Logs
03 - Engineering & Design / QAQC / <report date> / GUHMA Data
```

### 2.3 Project Folder Resolution

| Item | Specification |
|------|---------------|
| Method | Deterministic path listing, NOT Graph search |
| Reason | Graph search was unreliable in live testing |
| Search order | Active tree first: `04 - Project Management/02 - Projects` |
| Fallback | `001 - Completed Projects/<year>` |
| Folder creation | Date and bucket folders are get-or-created |

### 2.4 Upload Mechanics

| Item | Specification |
|------|---------------|
| Token | Graph app-only token via client_credentials |
| Large files | Graph upload sessions, 6.4 MiB chunks |
| Small files | Simple PUT caps around 4 MB, so sessions are used above that |
| Conflict behavior | rename, so an upload never overwrites an existing original |

### 2.5 Daily Report Model

`daily-report.js` is extended with an `attachments[]` field recording what was uploaded with the report.

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Reliability | Deterministic folder resolution, not search |
| Large file support | Chunked upload sessions, 6.4 MiB chunks |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Field crew uploads from a phone |
| Failure mode | Fail-closed if Graph secrets are missing |

## 4. Security and RBAC

| Control | Specification |
|---------|---------------|
| Role | field_ops, enforced at the gate and inside the handler |
| Drive | Server-fixed, not client-supplied |
| Bucket | Fixed enum (Hand Logs or GUHMA Data) |
| reportDate | Validated |
| Filename | Sanitized, path-traversal safe |
| Extension allow-list | `.guh` `.jpg` `.jpeg` `.png` `.heic` `.pdf` `.zip` `.xlsx` |
| Size caps | 50 MB per file, 25 files per request, 120 MB per request |
| Link safety | https-only webUrl, no `javascript:` in href |
| Secrets | Fail-closed on missing secrets |

## 5. Verification Evidence

| Claim | Evidence |
|-------|----------|
| Built and deployed | Commits cecbef6 and fb1b8d7, LIVE |
| End-to-end works | Live SharePoint write smoke test: resolve -> ensure folders -> chunked upload -> verify -> cleanup, into Madison 26-007 |
| Triple-check passed | security-auditor, reviewer, and qa-engineer all reviewed and approved |

## 6. Architecture

| Component | File | Role |
|-----------|------|------|
| Upload endpoint | `functions/api/field-upload.js` | Receives files, resolves folder, uploads |
| Graph helper | `functions/lib/graph.js` | App-only token via client_credentials, shared with `doc.js` |
| Daily report model | `daily-report.js` | Extended with `attachments[]` |

### Environment (already set in Cloudflare)

`AZURE_CLIENT_ID`, `AZURE_SECRET`, `AZURE_TENANT_ID`, `SP_DRIVE_ID` (same env used by `doc.js`).

## 7. Integration Points

| System | Integration | Priority |
|--------|-------------|----------|
| Submit Daily Report form | Two new upload sections | Required |
| SharePoint (Graph) | QAQC folder write | Required |
| `functions/lib/graph.js` | Shared Graph token | Required |
| GUHMA Integration | GUHM data lands where QC reads it | Related |

## 8. Open Questions (For Brad/Jonathan)

1. Should the report block submission if a hand log upload fails, or save the report and flag the missing file?
2. Do we want a confirmation listing the SharePoint links on the report after upload?
3. Are there other file types the field needs to upload beyond the current allow-list?
4. Should completed-project uploads be blocked, or always allowed via the fallback path?
