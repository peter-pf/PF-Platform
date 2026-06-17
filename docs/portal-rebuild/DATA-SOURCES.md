# PF Platform Rebuild — Data Sources (where each section pulls from)

Brad confirmed sources 2026-06-17. Until PF's own BD software ships, the portal pulls from SharePoint spreadsheets + project folders.

## Bid / BD data → Project Bid Log
- File: SharePoint `01 - Admin / 13 - Master Spreadsheets / Project Bid Log.xlsx`.
- Sheets: **Agg Pier Bid Log** (aggregate piers), **Helical Pier Bid Log** (helicals). Also FY $ Goal Tracker, 2025 Win Loss Log, Stone Costs Per Area, Filter Lists.
- Layout (Agg Pier Bid Log): group headers row 5, field headers row 6, data rows row 7+. Key = **Project Number** (col 1, e.g. "26-002").
- Fields (0-indexed): 1 Project Number · 2 Project Name · 3 City/State · 4 Address · 5 Site Size (Acres) · 6 Total SF (Bldg Pad) · 7 Total LF · 8 Total Columns · 9 Total Stone (TN) · 10 Duration (Days) · 11 Top vs Bottom Feed · 12 Tax · 13 Min Insurance Req · 14 Wage Req · 15 Invite Date · 16 Due Date · 17 Date Submitted · 18 Projected Start Date · 19 Follow Up Date · 20 **Bid Status** · 21 Bid Total Value · 22 $/SF · 23 $/LF · 24 $/Day · 25 $/Column · 26 General Contractor · 27 Contact Name · 28 GC Email · 29 GC Phone · 31 Engineer/Design Firm · 32 Prelim Design Fee · 33 Design Completed Date · 34 Date Paid.
- **Bid Status buckets** (top-of-sheet summary + per-row col20): Actively Bidding, Budget Pricing, Submitted, Awarded, Will Not Bid, Not Awarded → these directly drive the **Preconstruction → Aggregate Piers / Helical Pilings → stage views** in the nav.
- Feeds the project record's **General Info + Contract Info** (and the award value).
- POET (26-002) example: Awarded, $343,037.07, 17,003 LF, 1,865 columns, 3,250 TN stone, 16 days, Top feed, Taxed, 5 Mil Umbrella, Union wage; GC POET Bioprocessing / Kristen Lovell / bidding@poet.com; Engineer Garbin GeoStructural, design completed 2026-02-18.

## Project contacts → per-project "Project Info.xlsx"
- In each project folder: `04 - Project Management / 02 - Projects / {project} / ...Project Info.xlsx`, sheet "Project Name Project Contacts".
- Directory of Owner, GC (PM/PE/Superintendent), Engineering (AP design/geotech/structural/survey), PF Team, Vendors (stone, fuel, equipment rentals, trucking, safety). ~14 columns (name/email/phone in later columns).
- Feeds **PF Team** + the contact rows across sections.

## Post-award contract data → LOI / Subcontract in the project folder
- Once awarded, the GC emails an LOI then a Subcontract; saved into the project's folder under `04 - Project Management / 02 - Projects / {project}`. A new project folder is created per award.
- These fill the remaining Contract Info fields (retainage, payment terms, LDs, executed-contract date, scope specifics) — we already extract these in the subcontract review.

## Job cost codes → PF Project Master "PF Cost Codes" tab
- File: `01 - Admin / 13 - Master Spreadsheets / PF Project Master.xlsx`, tab **PF Cost Codes** (full chart of accounts, QB-aligned).
- **Job-specific COGS codes** (for the project Financials → Job Cost Report and Company Financials WIP):
  - 5050 Professional Services (5051 Engineering & Design, 5052 Material Testing, 5053 Surveying & Staking)
  - 5100 Jobsite Materials (5110 Stone, 5120 Rigid Inclusion, 5130 Helical, 5140 Equipment Consumables, 5190 Ground Improvement Testing)
  - 5200 Job Labor (5210 Subcontractors, 5215 Willis Dirt Works Retainer, 5220 Employee Labor, 5230 Payroll Tax)
  - 5300 Job Travel (5310-5360 air/car/mileage/hotel/parking/meals)
  - 5400 Jobsite Equipment (5405 Transportation, 5410 Rental, 5420 Maint & Repair, 5430 Fuel)
  - 5600 Small Tools · 5700 Permits & Fees (5710 Printing, 5720 Bonds, 5730 Permits/Licenses) · 5800 Closeout (5810 As-Builts, 5820 Warranty) · 5900 Incentives (5910 Commissions, 5920 Bonuses) · 5950 Other/Contingency
- Income: 4100 Agg Pier, 4200 Helical Piling, 4900 Retainage. Management 6000s, Professional Fees 7000s, Insurance 7100s, Overhead 7200s. Full list (158 rows) in the workbook — reference there, do not duplicate.
- Used in Phase 6 (Company Financials, built ON TOP of QuickBooks per Brad's decision) and the per-project Financials/Job Cost Report.

## Already-built engines (reuse)
- **Auto %-complete** (`data/progress-data.js`): installed columns + LF per project from GUHMA logs → QA/QC section + completion %.
- **Subcontract review** (subcontracts.html + review docs): extracted contract terms + risk flags → Subcontract + Contract Info + the clickable risk dashboard (Phase 4).

## Financials: WIP, Completed, job/company cost (Brad 2026-06-17)
Definitions:
- **WIP (Work in Progress)** = a running total of all work **awarded but not yet completed**. Lives in the Financials section. *(This also resolves Jonathan's open pipeline question — "pipeline value = awarded but not yet completed" = WIP.)*
- On completion a project **moves from WIP to "Completed Projects"** (rename: use **Completed Projects** instead of "Project History").
- **Completed Projects** view = total completed to date, AND broken out by year (2025, 2026, future years).

Data sources:
- **PF Project Master.xlsx** tabs: `WIP`, `Completed`, `2026 WIP & Completed Projects`, `2025 WIP & Completed Projects` → the job-cost / WIP / completed figures (per-project and per-year).
- **PF Financials Budget.xlsx** (true job + company cost tracking): SharePoint `01 - Admin / 03 - Financials / Accounting / PF Financials Budget` (workbook name "PF Financials Budget"). Tabs:
  - **Chase Cking Cashflow** — most costs incurred (materials, equipment, travel, overhead, etc.).
  - **State Bank Cashflow** — primarily employee labor costs.
  - Together these track cost-to-job and company cashflow; reconcile against PF Cost Codes.
- Build per Brad's decision: financials layered **on top of QuickBooks** (not replacing QB). Phase 6/7.

## Proposal / Bid Template (PF standard)
- File: SharePoint `03 - Estimating / 01 - Aggregate Piers` (latest "Pier Foundations - Bid Template.docx"). Copy saved at `portal_uploads/from-portal/portal_20260617_192843_26-0422PierFoundations-BidTemplate.docx`. Jonathan is the owner.
- Structure: Proposed Work · Project Bid Documents · Base Bid Pricing (per building/area) · Additional Pricing Options (layout, mob/demob, alt scopes, helicals) · Scope of Work · Project Workflow & Durations · Clarifications · Exclusions · General Terms & Conditions (Exhibit A) · Insurance limits table.
- **Submittal Items Needed** (canonical list, due to PF within 1 wk of NTP/LOI — drives the submittal workflow, Phase 5, and the Engineering & Design section): Structural Foundation Plan (CAD) · Civil Grading Plan (CAD) · Full Structural (PDF) · Full Civil (PDF) · Design Service Loads (DL+LL) · Any additional geotech reports (post-bid) · Site Grade Elevation during PF install (±3"). *(If PF does staking/layout, also Survey/Site Control PDF + Civil Site Plan CAD per the workflow spec.)*
- **PF standard commercial terms** (the BASELINE to compare GC subcontracts against in the clickable risk dashboard, Phase 4): Payment net-30, payment not withheld for others' delays · No retainage (final pay due on completion if any) · No liquidated/delay damages on PF · Changed Site Conditions clause (PF entitled to CO for differing subsurface) · Bond excluded unless stated · Proposal to be attached/referenced in the subcontract. Deviations in a GC sub (e.g. Schaaf: pay-if-paid, retainage, LDs flow-down, no DSC clause, personal guaranty) = the "risk exposure" items to surface.
- **Insurance limits PF proposes:** CGL $1M/occ, $2M agg, $2M products-comp/op · Auto (hired/non-owned) $1M · Umbrella $3M/occ + $5M excess layer · Professional Liability + Workers Comp.
- Uses: submittal workflow (Phase 5), proposal auto-build (ties to [[estimating-module-spec]] — Peter pre-builds ~80% of the proposal), and subcontract risk comparison (Phase 4).

