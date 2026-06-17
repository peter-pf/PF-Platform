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
