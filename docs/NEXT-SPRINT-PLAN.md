# PF Operations Platform — Next Sprint Plan (Days 4-6)

**Prepared by:** Peter (AI COO)
**Date:** May 31, 2026
**Context:** 3-day sprint completed in 1 day (22/22 + 8 bonus). Alpha review sent. SharePoint connected. Now tackling remaining items.

---

## Master Checklist Status (Tether's 33 Items)

### COMPLETE (24 items)
| # | Item | How/When |
|---|------|----------|
| 1 | Project Status Tracking | Platform module — 18 live projects from SP |
| 2 | Bid & Estimate Generation | Platform module — POET template, auto-calc |
| 3 | Subcontractor Coordination | Platform module — 12 vendors, contacts |
| 4 | Permitting & Inspections | Platform module — permit tracker, expiration alerts |
| 5 | Safety Checklists | Platform module — pre-shift, JSA, incident form |
| 6 | Material Cost Estimation | Platform module — 11 suppliers, calculator |
| 7 | Punch List & Closeout | Platform module — GGG workflow, retainage |
| 8 | Equipment & Fleet Tracking | Platform module — 15 items, daily rates |
| 9 | Daily Logs & Reporting | Platform module — production tracking, 5 samples |
| 10 | Change Order Management | Platform module — CO tracker, SOP workflow |
| 11 | Feasibility / No-Go Tool | Platform module — weighted scoring, disqualifiers |
| 12 | Pipeline Management | Platform module — 155 live bids from SP |
| 13 | Proposal & Quote Generation | Platform module — 12-section template |
| 14 | Competitor Analysis | Market intel on file (Keller, CNC, Geopier, Menard) |
| 15 | Process Documentation / SOPs | 11 SOPs on file + 38 additions drafted |
| 16 | Workflow Automation | SharePoint sync live (4 master files) |
| 17 | SharePoint/OneDrive Connection | Graph API connected, all 6 folders accessible |
| 18 | Geotechnical Engineering Education | UC Berkeley + Purdue (A- exam) |
| 19 | Company Process Training | SOPs reviewed, additions approved by Jonathan |
| 20 | Website Development | v4.1 built, Dots version, external vendor also working |
| 21 | Engineer Resume/Bio | Dr. Garbin full CV/bio on file |
| 22 | Additional Workflow Docs | 34 SOW/SRS documents, all v1.2 |
| 23 | Project Management Dashboard | Unified platform with 15 modules |
| 24 | GUHMA Integration | 186 pier logs parsed, QA module built |

### REMAINING (9 items)

| # | Item | Blocker | Can Peter Do It? |
|---|------|---------|-----------------|
| 1 | **ConstructConnect / RFP Scanning** | Needs CC subscription ($3K-$10K/year) | Research done, SOW written. Need Brad to decide on subscription |
| 2 | **QuickBooks API Integration** | Needs QB version + credentials | SOW written. Need Brad to provide QB access |
| 3 | **Budgeting & Forecasting** | Depends on QuickBooks | Can build framework now, populate after QB connected |
| 4 | **Invoice Generation & Tracking** | Depends on QuickBooks | Can build template now, integrate after QB |
| 5 | **CEO Dashboard Integration** | Needs Brad's vision for what he wants | Can build draft based on MBA COO dashboard framework |
| 6 | **Training Rollout (Jonathan/Derek)** | Waiting on Alpha review feedback + Brad's timing | Platform manual can be drafted now |
| 7 | **Alpha Review Changes** | Waiting on Brad/Jonathan feedback | Ready to implement when feedback arrives |
| 8 | **Live Data in All Modules** | Dashboard uses live data; other modules still have sample data | Can wire remaining modules to live JSON |
| 9 | **Platform Manual** | Depends on Alpha review finalization | Can draft now, finalize after changes |

---

## Next Sprint Plan — Days 4-6

### Day 4: Data Integration + Financial Framework
**Theme: Make every module show real data, build financial tools**

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 1 | Wire live SP data into ALL modules (not just dashboard) | Peter | 30 min | Pipeline, projects, materials, estimating all show live data |
| 2 | Build CEO Dashboard module | Peter | 30 min | Brad's daily view: 12 KPIs (6 ops + 6 finance) from MBA framework |
| 3 | Build Budgeting & Forecasting module (framework) | Peter | 20 min | Break-even analysis, capacity model, cash flow forecast template |
| 4 | Build Invoice Tracking module (template) | Peter | 15 min | G702/G703 tracker, retainage, AR aging |
| 5 | Ingest remaining SP files (SOPs, safety docs, templates) | Agents | BG | Deep knowledge from all 11 SOPs, safety manual, templates |
| 6 | INDOT/ODOT bid board scan | Agents | BG | Bridge/foundation/ground improvement opportunities |

### Day 5: Polish + Integrations + Manual
**Theme: Tighten everything up, start the manual**

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 7 | Implement remaining Tether feedback (items 4 & 8) | Peter | 15 min | Feasibility as prominent CTA, real-data-first UAT approach |
| 8 | Alpha review changes (from Brad/Jonathan feedback) | Peter | 30-60 min | All must-fix items resolved |
| 9 | ConstructConnect alternatives research | Agents | BG | Free/low-cost bid scanning options (BidClerk, iSqFt, state DOT boards) |
| 10 | Draft Platform Manual v1 | Peter | 30 min | Module-by-module user guide for Jonathan/Derek |
| 11 | Update 3-day sprint report with final status | Peter | 10 min | Complete scorecard for Tether's checklist |
| 12 | Competitor monitoring refresh | Agents | BG | Keller, CNC, Geopier, Menard latest activity |

### Day 6: QuickBooks Prep + Training + Cleanup
**Theme: Prep for QB integration, training materials, tie loose ends**

| # | Task | Owner | Time | Deliverable |
|---|------|-------|------|-------------|
| 13 | QuickBooks integration prep (chart of accounts, job costing setup guide) | Peter | 20 min | Ready-to-implement QB configuration guide |
| 14 | Training materials for Jonathan | Peter | 20 min | Quick-start guide for daily platform use |
| 15 | Training materials for Derek | Peter | 15 min | BD/pipeline module walkthrough |
| 16 | IIJA reauthorization check | Agents | BG | BUILD America 250 status update |
| 17 | Data center lead research refresh | Agents | BG | Google Zodiac, Meta Lebanon updates |
| 18 | Final documentation push to Git | Peter | 10 min | All docs v1.3, everything committed |

---

## What Still Needs Brad's Input

| Item | What Peter Needs | Impact |
|------|-----------------|--------|
| QuickBooks access | Version (Online/Desktop), login credentials | Unlocks financial integration (3 checklist items) |
| ConstructConnect decision | Subscribe ($3-10K/yr) or use free alternatives? | Unlocks automated bid scanning |
| Alpha review feedback | Answers from walkthrough form | Unlocks UAT stage |
| CEO Dashboard priorities | What does Brad want to see first thing every morning? | Drives dashboard design |
| Feasibility thresholds | Min project value, max distance, always/never GCs | Calibrates scoring engine |
| Tax strategy status | Which of the 7 recommendations are already in place? | Prioritizes tax actions |

---

## After Day 6 — What's Left

If all goes to plan, after Day 6 we'll be at **30 of 33** Tether checklist items complete (91%).

The final 3 depend on external factors:
1. **QuickBooks Integration** — needs Brad's credentials
2. **ConstructConnect Live Scanning** — needs subscription decision
3. **Training Rollout** — needs Brad's timing for Jonathan/Derek sessions

---

## Checklist Progress

```
Day 1-3 (completed Day 1): ████████████████████████░░░░░░░░ 24/33 (73%)
After Day 4-6:              ██████████████████████████████░░ 30/33 (91%)
After Brad inputs:          ████████████████████████████████ 33/33 (100%)
```
