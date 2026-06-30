# Statement of Work: Meeting Minutes Auto-Filing to OneNote (Integration Scope)

**Project:** Pier Foundations -- Meeting Minutes Auto-Filing to OneNote
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)
**Approved by:** _Pending Brad review_
**Implementation Status:** Working as of June 30, 2026

---

## 1. Purpose

PF meeting minutes need to land in the team's OneNote notebook, in the right section, named the way the team already names pages, without anyone copying and pasting after every meeting. This integration lets Peter file minutes straight into the site-hosted "Pier Foundations" notebook over Microsoft Graph. This is an operations integration with a runbook (see MANUAL.md), not a platform UI feature.

## 2. Scope

### In Scope
- Access the site-hosted "Pier Foundations" notebook via `/sites/{SP_SITE_ID}/onenote`
- Authenticate as peter@pierfoundations.com using a delegated device-code refresh token, scope Notes.ReadWrite.All
- Resolve the correct section from the meeting type (weekly catch-up -> Weekly Owners Meetings, leadership -> PF Leadership Meetings)
- Name pages `YY-MMDD - <short name>`
- Append minutes into the existing placeholder page via PATCH content append
- Create a page via POST only when none exists
- A re-auth runbook that keeps the connection bound to peter@

### Out of Scope
- Building a platform UI for meeting notes
- Transcribing or summarizing meetings (minutes are authored separately)
- Personal `/me/onenote` notebooks
- Auto-mirroring action items into PF Action Items (open question)

## 3. Stakeholders

| Role | Name | Involvement |
|------|------|-------------|
| Operator | Peter (AI COO) | Files minutes, runs re-auth when needed |
| End User | Brad Reinking | Reads minutes in OneNote |
| End User | Jonathan, Derek | Read minutes in OneNote |
| Engineering Advisor | Dr. Ed Garbin | GGG PF section |

## 4. Deliverables

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | OneNote access tool | `tools/onenote.py` | Read/write to the site notebook via Graph |
| 2 | Section mapping | Convention | Meeting type to section |
| 3 | Page naming convention | Convention | `YY-MMDD - <short name>` |
| 4 | Re-auth runbook | MANUAL.md | How to re-authenticate as peter@ safely |
| 5 | SRS + SOW + Manual | .md files | Documentation |

## 5. Success Criteria

- Minutes land in the correct section under "Pier Foundations" > "Meeting Notes"
- Pages follow the `YY-MMDD - <short name>` convention
- Minutes append into the existing placeholder page rather than creating duplicates
- The connection stays bound to peter@pierfoundations.com and can see the site notebook
- A real filing has been done end to end

## 6. Timeline

| Milestone | Duration (AI time) |
|-----------|--------------------|
| SOW + SRS | 15 min |
| Confirm notebook structure and section ids | 15 min |
| Wire `tools/onenote.py` append + create | 20 min |
| Re-auth as peter@ (device code) | _Human dependent_ |
| Live filing test | 10 min |

## 7. Assumptions

- The "Pier Foundations" notebook is SharePoint site-hosted, reached via `/sites/{SP_SITE_ID}/onenote`
- The delegated token is authenticated as peter@pierfoundations.com with scope Notes.ReadWrite.All
- Placeholder pages exist for the recurring meetings, so filing is usually an append
- Minutes are authored before filing, the integration only places them

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Re-auth completed as Brad re-binds to an account that cannot see the site notebook | Always re-auth in a private/incognito window signed in as peter@ |
| Wrong API root (`/me/onenote`) cannot see the site notebook | Always use `/sites/{SP_SITE_ID}/onenote` |
| Duplicate pages created each week | Append into the existing placeholder page, POST only if none exists |
| Token expiry breaks filing | Re-auth runbook in MANUAL.md |

## 9. Verification Evidence

- Working as of 2026-06-30
- 6/29 PF Weekly Catch Up minutes filed into Weekly Owners Meetings, page "26-0629 - Owners Mtg"

## 10. Implementation Notes

- **Tool:** `tools/onenote.py`
- **API root:** `/sites/{SP_SITE_ID}/onenote` (NOT `/me/onenote`)
- **Auth:** delegated device-code refresh token, scope Notes.ReadWrite.All, as peter@pierfoundations.com
- **Append:** `PATCH /sites/{SP_SITE_ID}/onenote/pages/{id}/content`
- **Create:** `POST .../sections/{id}/pages` with `application/xhtml+xml`
