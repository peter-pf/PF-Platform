# Project Record Schema (Phase 2) — from PF Project Master → "Project Dashboard" tab

**Source:** SharePoint `01 - Admin / 13 - Master Spreadsheets / PF Project Master.xlsx`, sheet **Project Dashboard**, columns A (section) → B (field group) → C (sub-field). Brad (2026-06-17): "All of this content we would want reflected... somewhere in the portal." This is the AUTHORITATIVE per-project record structure for Project Management → Projects → {project}. Supersedes the paraphrased 10-subsection list in VISION-AND-ROADMAP.md.

Header fields: **PF Project Number**, **Project Name**.

Related sheets in the same workbook (for later phases): `PF Dashboard`, `Project Schedule`, `2026/2025 WIP & Completed Projects`, `Accounts`, `PF Cost Codes`, `Completed`, `WIP`, `Archived Projects`.

## Sections & fields

### 1. General Info
- General Contractor → Project Manager; Site Superintendent; GC Project Number / Contract No.
- Project Address; County; Township; Project Scope; Projected PF Start Date; Contract Duration (working days); Estimated Project Completion; Total Piers (Qty); Total LF; Column Diameter; Estimated Stone (TN); Estimated Spoils (CY); Top Feed or Bottom Feed.

### 2. PF Team
- Project Manager; Field Operation Mgr; Operator 2; Operator 3; Equipment; Precon / Estimating.

### 3. Contract Info
- LOI / NOI Date; Bid Invite Date; Bid Due Date; Prelim Completed By; Fully Executed Contract Date.
- Tax Exempt?; If not Tax Exempt, Sales Tax Rate; Certified Payroll?; Prevailing Wage? Rate?; Retainage % Amount Withheld?; Retainage Release; Surveying & Staking; Anticipated Spoils (CY); Project Working Hours; Date COI Sent to GC; Date W9 Sent to GC.

### 4. Engineering & Design
- Release Date to Start Submittals from GC.
- Items needed for Submittal Completion → CAD Files for Structural Fndtn; Full Structural PDF set; Civil Grading Plan PDF; Finish Floor Elevation (FFE); Confirmed Working Grade Elevation; Unfactored Service Loads (DL + LL); Sent Job Number to Shop Dwg Eng.
- Submittals Received from Engineering; Submittals Sent to GC; Submittals Approved & Returned from GC; Submittals & Shop Dwgs Saved to Files; Submittals & Shop Dwgs Sent to Print; Shop Drawings Ready for pickup; Docs Sent to Surveyor / Layout.
- Files: Approved AP Shop Dwgs (CAD); Approved AP Shop Dwgs (PDF); Civil Drawings (PDF); Civil Drawings (CAD); PDF File for Original Survey; Structural Foundations (PDF).
- Testing Requirements → Jack to Be Used for Testing (Big/Small).

### 5. Project Safety
- Site Specific Safety Plan (SSSP); Other Misc. Safety Docs; Material Safety Data Sheets (MSDS); Toolbox Talks Prepared for Site Team; Jobsite Safety Analysis (JSA); Daily Equipment Checklist; Hand Log Sheets.
- Utility Locates → Locate Ticket # (Excavator ID); Date Locates Need Called In By; Date Locates Actually Called In; Date Ticket Cleared to Start; Date Ticket Expires.

### 6. Site Readiness
- Field Paperwork → Mod Load Test Report; Mod Test Jack Calibration Report.
- Mobilization Preparation → Bldg Pad Passed Proof Roll Report; Building Pad Elevation at Staking; Bldg Pad Prep Notes.
- Project Files in PM & Field OneDrive Folder; Field Operations Mgr Jobsite Visit w/ GC.

### 7. Equipment
- PF Equipment Mobilization to Site → Predrill Rig (Sany); Mast, Vibro Rig (Deere 350G); PF Parts Load - Gooseneck Trailer; Fall Off Load.
- Rental Equipment Needed - Notes → Track Loader (CAT 289 or 299); Mini Excavator; Telehandler; Air Compressor.

### 8. Material
- Aggregate Piers - Notes → Stone Material Approved by Eng; Stone Material Name/Nomenclature; Stone Material Qty (TN); Stone Delivery Setup/Ordered.
- Rigid Inclusions → Concrete Mix; Concrete Pump.
- Helical Piles → Helical Material Approved by Eng; Helical Material Qty; Helical Delivery Setup/Ordered.
- Equipment Fuel → Fuel Tank/Containment; Fuel Delivery.

### 9. QA / QC
- Handlogs vs GUHMA Data Checks; Modulus Load Test. *(ties to the shipped auto %-complete engine)*

### 10. Financials
- Invoicing / Pay Application → Prepare G702 & G703 for Invoicing; Prepare Lien Waiver (if app); Submit G702, G703, Lien Waiver; Invoice Due by Date of Month.
- Retainage Billing Invoiced → Retainage Paid.

### 11. Project Closeout
- Final As Built Dwgs to Garbin Geo; Column Logs from Rig (PDF) to Garbin; Modulus Load Test - Passed - to Garbin; Certified Payroll Jobs - Certified Payroll; Final As Built Dwgs from Garbin Geo → PF Check Garbin As Builts vs PF; Final As Built Dwgs Sent to GC.

### Notes
- Free-text project notes field.

## Naming convention (Brad 2026-06-17)
Projects are `YY-NNN - Project Name` where YY = 2-digit year (the year establishes the prefix) and NNN = 3-digit project number. POET = `26-002 - POET`. 2026 jobs = `26-NNN - Name`; 2027 jobs = `27-NNN - Name`. Portal records + folders follow this.

## Document-sourced population workflow (Brad 2026-06-17) — the repeatable intake
Goal: ultimately the record's fields are EXTRACTED from the project's source documents, not hand-keyed, and this repeats for every new project. Brad will show where each document type lives on a typical project. Source docs to extract from:
- **Contract / subcontract** → Contract Info, General Info (parties, dates, value, retainage, payment, LDs, scope). *(Already proven on POET: 19 fields auto-extracted from the executed subcontract.)*
- **Submittal documents** → Engineering & Design (submittal items, drawings, testing requirements).
- **Original contract drawings** (structural foundation, civil) + **geotech report** → General Info (scope, loads), Engineering & Design, Site Readiness.
- Bid Log / estimating → General Info (already wired).

Build path: a repeatable per-project extractor that reads the project folder's documents and populates General Info, PF Team, Contract Info, Engineering & Design, Project Safety, Site Readiness, etc. Generalize the POET subcontract extractor to take `--project NN-NNN` and run across the project's document set. NEXT INPUT NEEDED FROM BRAD: a walkthrough of where each document type lives in a typical project folder, so the extractor knows where to look.

## Editability (Brad 2026-06-17)
The record must be EDITABLE and user-friendly, not just read-only data. Make every cell editable with save (Phase 2 write-back per [[ARCHITECTURE-EDITABILITY]] — portal becomes system of record, backfills the source docs). The project record is a good proof-of-concept for the editable pattern. The clickable email/contact links are good; extend that user-friendliness with inline editing.

## Per-job subcontract analysis (Brad 2026-06-17) — replaces the standalone Subcontracts tab
Direction: KEEP the subcontract analysis TOOL, but run it PER JOB inside each project record, and RETIRE the standalone "Subcontracts" tab/module (subcontracts.html) — "not super useful." Each job holds its OWN contract within it, and the tool extrapolates everything from that contract into the project record's Subcontract/Contract section:
- Project scope / scope-of-work summary
- Contract terms & language (summarized)
- Insurance requirements → once the project COI is issued, check it against our PF COI and produce a report IN that job (gap report)
- Dates: contract date, project start date, commencement date
- Liquidated damages (LDs) if any
- Contract duration (how many days we have to do the work)
- Total subcontract value
*(Already proven on POET: 19 fields auto-extracted. Generalize per project.)*
**Migration caution:** the standalone Subcontracts tab currently holds the reviewed Shiel / Park & Poplar / Schaff data. Don't delete that data until those jobs' per-job records hold their subcontract analysis, or it's preserved. Sequence: build per-job subcontract section → migrate existing reviews → then retire the tab.

## Field source map (Brad 2026-06-17) — where each field is pulled from
- **General Contractor** ← bid documents + the contract/contract agreement (multiple sources).
- **GC Project Number / Contract No.** ← the subcontract agreement.
- **GC Project Manager** ← email correspondence (get Peter connected to email, or Brad forwards relevant emails).
- (Plus the Bid Log / estimating, subcontract, submittals, drawings, geotech per the document-sourced workflow above.)

## Intake workflow (Brad 2026-06-17)
When the contract comes in, **Brad forwards the contract email to Peter** → Peter ADDS it to the project AND ANALYZES it (same as the subcontracts tool), extracting the fields above into the project record. (Email-driven intake; pairs with the document-sourced population.)

## Build notes (Phase 2)
- Each section becomes a collapsible card in the project detail view; each field editable + clickable (Brad's requirement). Many fields are date/status trackers (good for the workflow engine + project log).
- Several fields auto-populate from data we already hold: pier/LF/stone/spoils/column-diameter from estimating; QA/QC from the auto %-complete engine; subcontract-derived fields (retainage, payment terms, scope) from the subcontract review.
- C-column sub-field labels were partially truncated on read; re-pull exact text from the sheet when wiring fields.
