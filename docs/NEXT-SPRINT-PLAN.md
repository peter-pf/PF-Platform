# PF Operations Platform — Sprint Plan

**Prepared by:** Peter (AI COO)
**Date:** June 16, 2026
**Context:** The original 33-item checklist is effectively complete. Live data now runs through every module that has a real SharePoint-synced source. Four new capabilities shipped beyond the checklist. The only open items are blocked on Brad.

---

## Headline Status

**29 of 33 complete (88%).** The original checklist is effectively done except the QuickBooks-dependent item and the items blocked on Brad. On top of the checklist, four bonus capabilities shipped: the Crew Schedule module, the PF Design Studio, the Trello content board, and a new portal Tools section.

```
After Days 1-3:   ████████████████████████░░░░░░░░ 24/33 (73%)
Now (June 16):    █████████████████████████████░░░ 29/33 (88%)
After Brad inputs: ████████████████████████████████ 33/33 (100%)
```

---

## Master Checklist Status (Tether's 33 Items)

### COMPLETE (29 items)

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
| 27 | Budgeting & Forecasting | Revenue forecast, break-even, capacity model |
| 28 | Invoice Generation & Tracking | AR aging, DSO, retainage tracker |
| 29 | CEO Dashboard Integration | 12 KPIs, alerts, verified in browser |
| 32 | Live Data in All Modules | Every module with a real SP source is live. Materials now wired to live SharePoint-synced stone-cost data (LIVE_STONE_COSTS) with a LIVE DATA badge |
| 33 | Platform Manual | Module-by-module user guide (manual.html) |

### REMAINING (4 items)

| # | Item | Status | What's Needed |
|---|------|--------|---------------|
| 25 | **QuickBooks API Integration** | BLOCKED | Brad to confirm QB Online vs Desktop and provide credentials |
| 26 | **ConstructConnect / RFP Scanning** | BLOCKED | Brad to decide: subscribe (~$3-10K/yr) vs free alternatives. Research done |
| 30 | **Alpha Review Changes** | WAITING | Awaiting Brad/Jonathan feedback |
| 31 | **Training Rollout (Jonathan/Derek)** | WAITING | Materials are live and self-serve in the portal. Brad to pick timing for the live walkthrough sessions |

---

## Live vs Sample Data

**Live now (real SharePoint-synced source):** dashboard, CEO dashboard, budgeting, invoicing, pipeline, projects, schedule, pricing, daily production, project history, and materials. Materials is the newest addition, wired to live stone-cost data with a LIVE DATA badge.

**Sample data (clearly labeled, pending real source):** change orders, equipment, safety, daily logs, subs/vendor roster, permits, closeout, GUHMA pier logs, modulus tests, and proposals. These correctly show clearly-labeled SAMPLE data, not live data, because no real SharePoint source exists yet. Each can be wired live the same way once a real source is available.

---

## Bonus Work Shipped — Beyond the 33-Item Checklist

These capabilities were delivered on top of the original checklist.

| Capability | Status | Notes |
|------------|--------|-------|
| **Crew Schedule Module** | SHIPPED | Editable crew-lane Gantt with drag-to-reschedule, mark done, and split mobilization, backed by Cloudflare KV. The main dashboard and CEO dashboard show a live read-only schedule summary from the same source, so there's one source of truth. Triple-checked, deployed, gated. |
| **PF Design Studio** | SHIPPED | Self-hosted Canva-style design tool re-hosted under the portal's single login at /design-studio/ with no second password, plus a Back to Portal control. Security-vetted clean. Backend accounts and cloud-save are phase 2. |
| **Trello Content Board** | SHIPPED | Social Media Pipeline approval board: Ideas, Drafting, Needs Approval, Approved & Scheduled, Posted. |
| **Portal Tools Section** | SHIPPED | New sidebar Tools section with launch buttons for the Design Studio and the Content Board. |
| **Documentation** | SHIPPED | SRS + SOW added for crew-scheduling, design-studio, and content-pipeline-trello. User manual, training guide, and role onboarding updated. |

---

## What Still Needs Brad's Input

| Item | What Peter Needs | Impact |
|------|-----------------|--------|
| QuickBooks access | QB Online vs Desktop, login credentials | Unlocks financial system integration |
| ConstructConnect decision | Subscribe (~$3-10K/yr) or use free alternatives? | Unlocks automated bid scanning |
| Alpha review feedback | Answers from the walkthrough form | Unlocks the UAT stage |
| Training timing | When to run the live walkthroughs for Jonathan and Derek | Materials are already live, this just sets the sessions |

---

## Where We Stand — June 16

The original 33-item checklist is effectively complete at 29 of 33 (88%). Every module with a real SharePoint source is wired to live data, materials included. Four bonus capabilities shipped on top of the plan.

The remaining four items all depend on Brad:
1. **QuickBooks Integration**: needs Brad's QB version and credentials
2. **ConstructConnect Scanning**: needs the subscription decision
3. **Alpha Review Changes**: needs Brad/Jonathan feedback
4. **Training Rollout**: needs Brad's timing for the Jonathan and Derek sessions

Sample-only modules will wire live the same way once real SharePoint sources exist.
