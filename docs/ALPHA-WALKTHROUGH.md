# PF Operations Platform — Alpha Review Walkthrough

**For:** Brad Reinking & Jonathan Reinking
**From:** Peter (AI COO)
**Date:** May 30, 2026
**Platform URL:** https://pf-platform.pages.dev/platform/
**Password:** PierFoundations2024

---

## What You're Looking At

This is the **Alpha version** of the PF Operations Platform — a unified command center for everything Pier Foundations does, from bid screening to project closeout. Every module was built using Jonathan's actual files (bid log, project master, POET estimate, GUHMA data, modulus test) so the data you see is real, not placeholder.

**Current stage:** Alpha (built, deployed, needs your review before we put it into daily use)

**What I need from you:** Walk through each module below, note what's right, what's wrong, and what's missing. I'll make changes based on your feedback, then we move to UAT where Jonathan tests it on a live bid.

---

## How to Review

1. Go to **pf-platform.pages.dev/platform/**
2. Enter password: **PierFoundations2024**
3. Use the sidebar on the left to navigate between modules
4. For each module, ask yourself: *"Is this accurate? Would I actually use this?"*

---

## Module-by-Module Walkthrough

### 1. Dashboard
**What it does:** Summary view — KPIs, recent bids, active projects at a glance.

**Review questions:**
- Are these the right metrics to see first thing every day?
- What numbers are you currently tracking that aren't shown here?
- Should we add FY26 revenue goal progress ($6M target)?

---

### 2. Feasibility Tool
**What it does:** Bid/no-bid decision tool. Enter project details, get a weighted score (0-100) with a BID / REVIEW / NO-BID recommendation.

**How to test:** Click "New Assessment," fill in a recent project you know the outcome of, and see if the tool gives the right recommendation.

**Review questions:**
- Brad: What's the minimum project value worth pursuing? ($25K? $50K? $75K?)
- Brad: What's the maximum distance from the yard? (300 miles? 500 miles? No limit?)
- Are there GCs you'd always bid for regardless of score?
- Are there GCs you'd never bid for?
- Do the scoring weights feel right? (Technical 55%, Commercial 25%, Operational 15%, Risk 5%)

---

### 3. Bid Pipeline
**What it does:** All bids from the bid log — filterable by status, sortable, with FY26 progress tracking.

**Data source:** Project_Bid_Log.xlsx

**Review questions:**
- Jonathan: Do the project names, GCs, and values look right?
- Are the status categories correct? (Will Bid, Submitted, Awarded, etc.)
- Is anything missing from the bid log that should be shown here?
- Is the win rate calculation correct? (24.4% submitted, 32.4% with Garbin prelim)

---

### 4. Material Costs
**What it does:** Stone supplier pricing reference + cost calculator. Enter total LF, select a supplier, get total material cost.

**Data source:** Bid Log — Stone Costs Per Area tab

**Review questions:**
- Jonathan: Are all 17 supplier prices current? Any that changed recently?
- Are there suppliers missing from the list?
- Is the consumption rate right? (0.209 tons/LF for 30" columns)
- Should we add a 24" column consumption rate?

---

### 5. Estimating
**What it does:** Estimate builder using the POET project as a template. Auto-calculates working days, stone tonnage, and all cost lines. Also shows budget vs. actual for POET.

**Data source:** 26-0330_POET_Turnover_Budget.xlsm

**Review questions:**
- Jonathan: Are the daily rates accurate? (Operator #1 $1,000/day, #2/#3 $650/day, hotel $165/night, meals $50/day)
- Are the equipment rates right? (VSC Rig $500/day, CAT 308 $250/day)
- Is the markup structure correct? (OH 5.42%, Commissions 2.65%, Contingency 2.01%, Profit 4.0%)
- Brad: Does the "OH Calcs" vs "OH Calcs (BR)" difference need to be reflected here?

---

### 6. Active Projects
**What it does:** WIP dashboard showing all active 2026 projects with contract values, completion percentages, GC contacts, and the 130-field project checklist.

**Data source:** PF_Project_Master.xlsx

**Review questions:**
- Jonathan: Are the 5 WIP projects shown correct? Any missing?
- Are the completion percentages current?
- Does the checklist match what you actually track per project?
- Is anything in the checklist that shouldn't be there, or missing?

---

### 7. QA/QC — GUHMA
**What it does:** Parses GUHMA column installation logs. Shows per-pier metrics (depth, pressure, duration) with QA thresholds that flag issues.

**Data source:** GUHMA_Archive.zip (186 pier logs from POET)

**Review questions:**
- Jonathan: Is the minimum depth threshold right? (10 ft / 3.05m target, flag below 9 ft / 2.75m)
- Is the minimum install time threshold right? (flag below 30 seconds as too fast)
- What pressure readings indicate a problem?
- Are there other QA checks that should be automated?

---

### 8. Modulus Testing
**What it does:** Tracks modulus tests with load-deflection charts, pass/fail calculations, and a new test entry form. Uses real POET test data.

**Data source:** 26-0507_POET_Modulus_Test.xlsx

**Review questions:**
- Jonathan: Is the test procedure accurate? (loading increments, hold times, unloading sequence)
- Are the jack calibration factors current? (Small: 49.84, Large: 32.88)
- Is the pass/fail formula correct? (Kp measured >= Kp design)
- How many tests does Dr. Ed typically require per project?

---

### 9. Proposals
**What it does:** Proposal history and template structure based on the real POET submitted proposal.

**Data source:** 26-0219_POET_Projects.pdf

**Review questions:**
- Jonathan: Are the 12 proposal sections the right ones? Anything missing?
- Is the proposal format what GCs expect?
- Should we include standard exclusions/clarifications language?

---

### 10. Change Orders
**What it does:** Tracks change orders by project with status, pricing, and the CO workflow from the SOP.

**Review questions:**
- Jonathan: Does the CO workflow match how you actually handle changes in the field?
- Are the sample COs realistic?
- What information do you need to track per CO that isn't shown?

---

### 11. Equipment
**What it does:** Full equipment roster with status, daily rates, maintenance schedules, and transport coordination (Paddacks, Stephan).

**Review questions:**
- Brad/Jonathan: Is the equipment list complete? Anything missing or retired?
- Are the daily rates current?
- How do you currently track maintenance — hours-based? Calendar-based?
- Are the transport contacts current? (Paddacks/Miah, Stephan/Mark Maller)

---

### 12. Safety
**What it does:** Pre-shift inspection checklist, VSC-specific hazards, toolbox talk log, JSA template, incident reporting form.

**Review questions:**
- Jonathan: Does the pre-shift checklist cover everything your crew checks?
- Are the PPE requirements complete for VSC work?
- What safety topics come up most in toolbox talks?
- Does PF have any site-specific safety requirements not shown?

---

### 13. Daily Logs
**What it does:** Field daily report — production tracking (columns, LF, stone), equipment status, delays, safety, notes. Includes 5 sample days from POET.

**Review questions:**
- Jonathan: Is this the information your field team needs to capture daily?
- What format do you currently use for daily reports?
- Are there fields missing that the GC typically asks for?
- Should photos be attached to daily logs?

---

### 14. Subcontractors
**What it does:** Vendor roster with contacts, services, rates, and project assignments.

**Review questions:**
- Brad: Are all vendors/subs listed? Any missing?
- Are the contact details current?
- Are there vendors you'd want to flag as preferred or avoid?
- Should we track vendor performance ratings?

---

### 15. Permits
**What it does:** Permit tracker with types, status, expiration dates, and alerts for expired permits.

**Review questions:**
- Jonathan: What permits does PF typically need per project?
- Who handles permit applications — PF or the GC?
- How do you currently track utility locate expirations (811)?
- Are there state-specific permit requirements we should track?

---

### 16. Closeout
**What it does:** Project closeout tracker following Jonathan's SOP — document submission to GGG, review cycle, final invoice with retainage.

**Review questions:**
- Jonathan: Does the closeout workflow match your SOP exactly?
- Is the 10-business-day expectation for GGG realistic?
- What typically causes closeout delays?
- Should we track lien waivers here?

---

## After Your Review

1. **Send me your notes** — what's right, what's wrong, what's missing per module
2. I'll make all must-fix changes
3. We move to **UAT** — Jonathan tests the platform on the next real bid that comes in
4. After UAT, we go to **Beta** — daily use for 2 weeks
5. Then **Production v1.0** with a full platform manual

**The goal:** By the time we're done, this replaces the spreadsheet workflow — not because we force it, but because it's genuinely faster and better.
