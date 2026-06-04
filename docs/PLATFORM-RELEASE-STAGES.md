# PF Operations Platform — Release Stages & Review Checklist

**Version:** 1.0
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)

---

## Release Stage Definitions

| Stage | Name | Purpose | Who Reviews | Entry Criteria | Exit Criteria |
|-------|------|---------|-------------|----------------|---------------|
| 1 | **Pre-Alpha** | Core build, data integration, architecture | Peter | SOW/SRS written | All modules coded, data connected |
| 2 | **Alpha** | Internal review — does it work? | Brad + Peter | All modules built and deployed | Brad confirms functionality and layout |
| 3 | **UAT (User Acceptance Testing)** | End user review — does it fit the workflow? | Jonathan + Derek | Brad approves Alpha | Users confirm data accuracy, workflow fit, usability |
| 4 | **Beta** | Live trial with real daily use | Full team | UAT approved | 2 weeks of daily use with no critical issues |
| 5 | **Production (v1.0)** | Official release — this is the tool | Full team | Beta period complete | Training done, manual written, data live from SharePoint |

---

## Current Status: ALPHA

We are entering **Stage 2 — Alpha**. All 15 modules are built and deployed. Brad and Jonathan need to review before we move to UAT.

---

## Module Status by Stage

| Module | Pre-Alpha | Alpha | UAT | Beta | Production |
|--------|-----------|-------|-----|------|------------|
| Dashboard | DONE | IN REVIEW | -- | -- | -- |
| Feasibility Tool | DONE | IN REVIEW | -- | -- | -- |
| Bid Pipeline | DONE | IN REVIEW | -- | -- | -- |
| Material Costs | DONE | IN REVIEW | -- | -- | -- |
| Estimating | DONE | IN REVIEW | -- | -- | -- |
| Active Projects | DONE | IN REVIEW | -- | -- | -- |
| QA/QC GUHMA | DONE | IN REVIEW | -- | -- | -- |
| Modulus Testing | DONE | IN REVIEW | -- | -- | -- |
| Proposals | DONE | IN REVIEW | -- | -- | -- |
| Change Orders | DONE | IN REVIEW | -- | -- | -- |
| Equipment | DONE | IN REVIEW | -- | -- | -- |
| Safety | DONE | IN REVIEW | -- | -- | -- |
| Daily Logs | DONE | IN REVIEW | -- | -- | -- |
| Subcontractors | DONE | IN REVIEW | -- | -- | -- |
| Permits | DONE | IN REVIEW | -- | -- | -- |
| Closeout | DONE | IN REVIEW | -- | -- | -- |

---

## Alpha Review Checklist (Brad + Jonathan)

### Brad's Review (CEO / Decision Maker)
- [ ] Login and password work
- [ ] Overall look and feel matches PF brand
- [ ] Navigation is intuitive — can find any module in 2 clicks
- [ ] Dashboard shows the right KPIs for daily decision-making
- [ ] Feasibility Tool scoring thresholds are correct (confirm min project value, max distance)
- [ ] Estimating markup structure is accurate (OH, commissions, contingency, profit %)
- [ ] Material costs — supplier list is current and complete
- [ ] Equipment roster is accurate — anything missing or wrong?
- [ ] Subcontractor/vendor contacts are correct
- [ ] Change Order workflow matches how PF actually handles COs
- [ ] No sensitive data exposed that shouldn't be

### Jonathan's Review (Primary User)
- [ ] Bid Pipeline — project names, GCs, values, statuses match his bid log
- [ ] Material Costs — stone prices match current supplier quotes
- [ ] Estimating — POET template rates are accurate (labor, equipment, stone, travel)
- [ ] Active Projects — WIP data matches Project Master spreadsheet
- [ ] QA/QC GUHMA — thresholds and data interpretation are correct
- [ ] Modulus Testing — test procedure and pass/fail criteria match field practice
- [ ] Daily Logs — report format captures everything the field team needs
- [ ] Safety — checklist items are complete for VSC operations
- [ ] Closeout — GGG workflow matches actual process
- [ ] Permits — correct permit types for PF's work
- [ ] Proposals — template sections match what PF actually submits

### Joint Review (Brad + Jonathan Together)
- [ ] Walk through a real bid scenario end-to-end (bid comes in -> feasibility -> estimate -> proposal)
- [ ] Walk through a real project scenario (award -> mobilize -> install -> closeout)
- [ ] Identify any missing fields or steps
- [ ] Agree on what needs to change before UAT
- [ ] Prioritize changes (must-fix vs nice-to-have)

---

## What Happens After Alpha

1. Brad and Jonathan complete the Alpha review checklists above
2. Peter makes all must-fix changes
3. Platform moves to **UAT** — Jonathan uses it on the next real bid
4. After UAT approval, platform enters **Beta** — daily use for 2 weeks
5. After Beta, Peter writes the platform manual and we go to **Production v1.0**

---

## Alpha Feedback Delivery Fix (June 4, 2026)
**Gap found:** the Alpha Review page saved reviewer answers to browser localStorage ONLY — feedback never reached Peter (no backend/email delivery). Jonathan's saved alpha answers were stranded on his device.
**Fix:** added a "Send Answers to Peter" button that gathers every answer + its question and opens a pre-filled email to peter@pierfoundations.com (clipboard backup; no backend needed). Deployed to all alpha-review origins (pf-platform, pf-alpha-review, pf-sprint-reports). Reviewers' localStorage-saved answers reload on reopen, so prior answers are recoverable.
**Note:** same localStorage-only pattern exists in the COO checklist (self-assessment, lower stakes — no delivery needed). Future: a proper backend would let feedback persist server-side across devices.
