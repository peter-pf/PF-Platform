# PF Operations Platform -- Architecture Document

**Version:** 1.0
**Date:** May 30, 2026
**Prepared by:** Peter (AI COO)

---

## 1. Overview

Single-page unified operations platform for Pier Foundations. Light theme, sidebar navigation, modular JavaScript architecture. All tools share the same shell, CSS design system, and data layer.

**Live URL:** https://pf-platform.pages.dev/platform/

## 2. Architecture

```
platform/
  index.html          -- Platform shell (sidebar, topbar, CSS design system, module container)
  modules/
    feasibility.js    -- Feasibility / No-Go scoring tool (1,060 lines)
    pipeline.js       -- Bid pipeline from Project_Bid_Log.xlsx (377 lines)
    materials.js      -- Stone cost calculator from Bid Log Stone Costs tab (341 lines)
    estimating.js     -- Estimate builder from POET Turnover Budget (627 lines)
    projects.js       -- Active projects from PF_Project_Master.xlsx (663 lines)
    guhma.js          -- QA/QC GUHMA column logs from GUHMA_Archive.zip (482 lines)
    modulus.js        -- Modulus testing from POET Modulus Test (729 lines)
    proposals.js      -- Proposal management from POET Proposal PDF (275 lines)
```

## 3. Data Sources

All modules built from Jonathan's actual files:

| Module | Source File | Key Data |
|--------|-----------|----------|
| Pipeline | Project_Bid_Log.xlsx | 180 rows, 36 cols, 6 sheets |
| Materials | Project_Bid_Log.xlsx (Stone Costs tab) | 17 suppliers, 7 states |
| Estimating | 26-0330_POET_Turnover_Budget.xlsm | 16 sheets, $343K template |
| Projects | PF_Project_Master.xlsx | 10 sheets, 130-field checklist |
| GUHMA | GUHMA_Archive.zip | 186 .guh files, 28K data rows |
| Modulus | 26-0507_POET_Modulus_Test.xlsx | Load-deflection data, 419 pci result |
| Feasibility | docs/feasibility-tool/SRS.md | Weighted scoring algorithm |
| Proposals | 26-0219_POET_Projects.pdf | Submitted proposal structure |

## 4. Design System

- **Theme:** Light (Brad's direction -- dark is for public website only)
- **Font:** Inter (300-700 weights)
- **Accent:** #D4703C (PF burnt orange)
- **Layout:** Fixed sidebar (240px) + fixed topbar (56px) + scrollable content
- **Responsive:** Sidebar collapses on mobile, grid adapts
- **Components:** Cards, stat-cards, tables, badges, buttons, forms, tabs, progress bars, score rings

## 5. Module Details

### 5.1 Feasibility Tool
- Multi-step form (5 sections, 20+ fields)
- Weighted scoring engine (Technical 55%, Commercial 25%, Operational 15%, Risk 5%)
- 5 automatic disqualifiers (peat soil, depth >35ft, cu <15 kPa, crew full, bid too soon)
- Score thresholds: BID (75+), REVIEW (50-74), NO-BID (0-49)
- Assessment history saved to localStorage
- Quick mode for rapid screening

### 5.2 Bid Pipeline
- 20+ real projects from bid log with actual values
- Filter by status (All, Actively Bidding, Submitted, Awarded, Not Awarded)
- FY26 progress tracker ($1.43M of $6M goal, 23.9%)
- Win rate display (24.4% submitted, 32.4% with Garbin prelim)
- Sortable columns, expandable details

### 5.3 Material Costs
- 17 real supplier prices across IN, OH, MI, IL, IA, NC
- Stone cost calculator (LF input -> tons -> cost breakdown)
- Consumption rate: 0.209 tons/LF
- State filter, cheapest supplier highlight
- Stone + Haul + Tax breakdown per supplier

### 5.4 Estimating
- POET project as reference template ($343,037)
- PF cost code structure (5000-7000 series)
- Auto-calc: working days (LF/1000), stone tons (LF x 0.209)
- Budget vs Actual tracker with variance by category
- Markup waterfall: Construction -> OH -> Insurance -> Commissions -> Contingency -> Profit

### 5.5 Active Projects
- 2026 WIP projects with real contract values
- 130-field project checklist (8 sections)
- Financials: contract value, paid, unpaid, retainage
- Progress tracking with visual bars
- 2025 completed archive tab

### 5.6 QA/QC GUHMA
- 186 pier installation logs parsed
- Per-pier metrics: duration, max depth, pressure
- QA thresholds: min depth 3.05m, min install time 30s
- Production tracking: piers/hour, daily output
- Status flagging: Verified/Review/Flag

### 5.7 Modulus Testing
- Real POET test data (86 kips design, 419.53 pci measured, PASS)
- SVG load-deflection chart with loading/unloading curves
- Auto-calculate: measured modulus, pass/fail
- Jack calibration: Small (<175 kips) = 49.84, Large (>175 kips) = 32.88
- New test entry form

### 5.8 Proposals
- Proposal history table
- 12-section template structure (from real POET proposal)
- New proposal form
- Expandable detail view

## 6. Deployment

- **Hosting:** Cloudflare Pages (pf-platform.pages.dev)
- **Repo:** github.com/peter-pf/PF-Platform
- **Branch:** main
- **Deploy:** `wrangler pages deploy platform/ --project-name=pf-platform`
- **Future:** Custom domain on pierfoundations.com

## 7. Next Steps

- [ ] Connect to SharePoint for live data sync
- [ ] QuickBooks API integration for financials
- [ ] ConstructConnect scanner for bid opportunities
- [ ] GUHMA file upload and live parsing
- [ ] PDF export for proposals and reports
- [ ] User authentication (Cloudflare Access)
