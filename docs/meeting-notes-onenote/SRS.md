# Software Requirements Specification: Meeting Minutes Auto-Filing to OneNote

**Project:** Pier Foundations -- Meeting Minutes Auto-Filing to OneNote
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Working as of June 30, 2026. Operations integration (runbook below).

## 1. Overview

This is a lightweight spec for an operations integration that files PF meeting minutes into the team's OneNote notebook. Peter authors the minutes and writes them into the correct OneNote section and page, matching the existing section structure and page naming convention, so the team finds them where they expect. This is a runbook-driven integration, not a UI feature. See MANUAL.md for the runbook.

## 2. Functional Requirements

### 2.1 Notebook Location

| Item | Specification |
|------|---------------|
| Notebook | "Pier Foundations" |
| Hosting | SharePoint site-hosted notebook |
| API path | `/sites/{SP_SITE_ID}/onenote`, NOT `/me/onenote` |
| Access tool | `tools/onenote.py` |

### 2.2 Authentication

| Item | Specification |
|------|---------------|
| Method | Delegated device-code refresh token |
| Scope | Notes.ReadWrite.All |
| Required identity | The token MUST be authenticated as peter@pierfoundations.com |
| Re-auth rule | Complete re-auth in a private or incognito window signed in as peter@, never as Brad |
| Failure mode | A sign-in completed as Brad re-binds the connection to an account that cannot see the site notebook |

### 2.3 Structure

```
Pier Foundations (notebook)
  Meeting Notes (section group)
    BD Weekly
    GGG PF
    Investigation Meetings
    Meetings
    PF Action Items
    PF Leadership Meetings
    Weekly Owners Meetings
```

### 2.4 Page Naming Convention

| Item | Specification |
|------|---------------|
| Format | `YY-MMDD - <short name>` |
| Examples | `26-0629 - Owners Mtg`, `26-0624 - PF Leadership Mtg` |

### 2.5 Meeting-to-Section Mapping

| Meeting | Section |
|---------|---------|
| Weekly catch-up | Weekly Owners Meetings |
| Leadership | PF Leadership Meetings |

### 2.6 Write Operations

| Action | Operation |
|--------|-----------|
| Append into an existing placeholder page | `PATCH /sites/{SP_SITE_ID}/onenote/pages/{id}/content` with an append command |
| Create a new page (only if none exists) | `POST .../sections/{id}/pages` with `application/xhtml+xml` |

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Identity | Must operate as peter@pierfoundations.com |
| Idempotency | Prefer append into the existing placeholder page over creating duplicates |
| Convention | Page names must follow `YY-MMDD - <short name>` |
| Traceability | Minutes land in the section that matches the meeting type |

## 4. Verification Evidence

| Claim | Evidence |
|-------|----------|
| Working | Confirmed working as of 2026-06-30 |
| Live filing proven | 6/29 PF Weekly Catch Up minutes filed into Weekly Owners Meetings, page "26-0629 - Owners Mtg" |

## 5. Architecture

| Component | Item | Role |
|-----------|------|------|
| Access tool | `tools/onenote.py` | OneNote read/write via Graph |
| Auth | Delegated device-code refresh token | Scope Notes.ReadWrite.All, as peter@ |
| Target | `/sites/{SP_SITE_ID}/onenote` | Site-hosted "Pier Foundations" notebook |

## 6. Open Questions (For Brad/Jonathan)

1. Should every meeting type get an auto-created placeholder page each week, so filing is always an append?
2. Who else should be able to trigger filing, or is this Peter-only?
3. Do we want a short index page that links the latest minutes per section?
4. Should action items also be mirrored into the PF Action Items section automatically?
