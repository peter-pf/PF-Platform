# PF Platform Rebuild — Vision & Roadmap

**Captured by:** Peter | **Date:** 2026-06-17 | **Source:** Brad's portal-rebuild brain-dump (3 messages) + Jonathan (LJ) notes
**Status:** CAPTURED — awaiting Brad's confirmation of reconciled IA + build order before coding the deep phases. Nav skeleton (Phase 1) ready to build on go.

> This is Brad's full product vision for the PF Platform. It is a multi-phase program, not a single build. Nothing here is lost; each phase gets its own requirements pass with the right people (Brad / Jonathan / Derek) before code, per the build protocol.

---

## TWO TOOLS
1. **PF Platform (main / Project Management tool)** — full internal ops + PM + financials. Structure below.
2. **PF Field Operations Viewer** — a SECOND, separate tool. Read-only, less information, for field crews. A filtered view of the same project data.

---

## RECONCILED TOP-LEVEL IA (main tool)
Reconciles the first nav message with the expanded second message. Collapsible dropdown headers, nested subcategories (Preconstruction goes 3 levels deep).

1. **PF Admin** — Brad builds out subcategories. Home for SOPs/training, reference docs (manual, training, onboarding, COO checklist, Meet Peter, SOP additions, SOW/SRS docs), external tools (Design Studio, Content Board). *(Brad to-do)*
2. **Dashboard** — Dashboard (overview), CEO Dashboard. (more later)
3. **Business Development** — placeholders for now; Derek builds (Leads, Target Accounts, Outreach, Communications source-of-truth that feeds projects).
4. **Preconstruction** — subcategories **Aggregate Piers** and **Helical Pilings**; under EACH, six stage views: Actively Bidding, Budget Pricing, Feasibility Review, Submitted Bids, Awarded, Not Awarded. Plus an **Estimating & Tools** subcategory keeping existing tools usable (Feasibility Tool, Bid Pipeline, Estimating, Material Costs, Stone & Transport Pricing). "Awarded" feeds Project Management → Awarded Projects.
5. **Project Management**
   - **Projects** → list of projects; each project expands into 10 subsections (see "Project Record" below).
   - **Safety**
6. **Projects Schedule** — all awarded projects' upcoming work auto-placed from the Awarded section; editable/movable here; edits reflect back into the awarded project record (two-way).
7. **Company Financials** — actual vs budget; forecasted revenue from schedule + invoicing; cost-to-job + global cashflow/forecasting by due date; WIP pull by criteria; vendor-invoice-due auto-notifications; PF cost codes; project costs linked to invoices; statement import + monthly reconciliation; P&L / Balance Sheet. OPEN: replace QuickBooks entirely?
8. **PF Dashboard** — build from the "PF Dashboard" tab on the PF Project Master to pull pertinent data accurately.

*(From msg 1, now absorbed/relocated: standalone "Field Operations" → becomes the separate Field Ops Viewer tool; "Equipment" → folds into each project's PF Readiness subsection.)*

---

## PROJECT RECORD — the backbone (PM → Projects → each project)
General Project Info pulled from BD & Estimating/Bidding to start, then filled from the subcontract agreement. **Everything editable and clickable.** Per-project subsections:
1. **General Project Info** — from BD & Estimating/Bidding, then subcontract.
2. **PF Team**
3. **Communications** — imported from BD platform; new emails auto-logged with latest updates; anyone on PF team can update; updates flow into the portal.
4. **Subcontract** — link to subcontract + extracted project-specific contract items.
5. **Financials** — Subcontract Value; Change Orders; Pay Applications (Pay App #01, #02 …; **Retainage Pay App** auto-triggered once all pay apps to date are paid AND as-builts sent, must be sent by the subcontract-stated due date); Vendor Invoices; Job Cost Report.
6. **Engineering & Design** — Submittals; QA/QC (Hand Logs, GUHMA Data Checks, Modulus Load Test, As-Builts).
7. **Project Safety**
8. **GC Site Readiness**
9. **PF Readiness** — Equipment (MOB, Rentals); Materials (Stone, Helicals); Fuel.
10. **Project Closeout**

---

## PETER WORKFLOW AUTOMATIONS (process engine + SOPs)
General: **log every email/document transfer (date + time) into the project log history.**

### LOI Issued / Notice to Proceed
1. Peter emails GGG (Jake) for the list of what Garbin needs for full design → GGG responds.
2. Peter relays needed items to the GC PM, cc team, to start submittals.
3. Peter keeps a tracking checklist of returned vs outstanding; updates daily; emails GC daily until complete.
4. Peter sends GGG a link with all docs accessible.
5. Peter updates tracking + the dashboard submittal section (who sent what, by when, dates); notifies us of anything outstanding/unanswered so we push the GC.

### Submittal Management (on LOI + GC release for shop drawings)
- Items needed from GC/Owner (also on page 2 of every proposal, "Submittal Items Needed"): Structural Foundation Plan (CAD), Civil Grading Plan (CAD), Full Structural (PDF), Full Civil (PDF), Design Service Loads (DL+LL), any additional geotech reports, site grade elevation during PF install (±3"), and if PF does staking/layout also Survey/Site Control (PDF) + Civil Site Plan (CAD).
- Daily reminder emails to GC Submittal Manager until all received.
- Compile into a folder → email Garbin (Jake & Projects); ask for prelim back no later than 3 weeks from send date; track that date in the project schedule + log.
- On Garbin return → forward design to GC Submittal Manager (cc Brad, Jonathan, Derek, Ray); track both dates.
- GC ~1–2 wk turnaround; reminder after 1 week; on receipt route to Brad/Jonathan/Derek/Ray for comment review.
  - **Approved/Reviewed:** file in 2 places (PM → approved drawings; Field → drawings), email installing crew, send to print, log all dates.
  - **Not approved / R&R:** send to Garbin for revision (ask ETA) → resubmit to GC → await.
- **Testing:** PF crew runs Modulus test per GGG/PF; Peter populates the test document per Jonathan's SOP and saves to the proper folder before work starts.
- **As-Builts:** each day at project completion the field crew emails Peter/Derek/Jonathan/Brad/Ray the GUHMA data + hand logs → Peter runs his log check + updates % complete (daily until done) → on completion Peter sends Garbin the Modulus results + hand logs + GUHMA for As-Built completion, requesting return in 14 days → on return Peter checks against records (per Jonathan SOP) → if match, send GC; if not, send Garbin discrepancies for revision first.

### Subcontract Award
- Extract risk items from the subcontract into the CEO/COO dashboard. **Make the dashboard clickable** — click a flagged summary line ("risk exposure") to jump directly into the contract language Peter called out. *(We already produce risk arrays in the subcontract review — natural extension.)*
- On a new contract, set up a task list/rules for Peter: e.g. send sample COI & insurance requirements to Certs@MJ; send Project Safety Request to Safety Resources.
- **Project Information fields:** Job Name; Jobsite Address; GC/Owner Name; GC Address; Subcontract Number; PM Name/Email/Phone; County & Township; Subcontract Date; LOI Date; Bid Invite Date (from Unanet or Jonathan's email); Bid Due Date (Unanet); Bid Prelim Info (company, date received).
- **Project Scope:** scope called out (if AP: how many / total LF; if Helical: how many / specs); staking & layout PF or GC?; project start date; duration.
- Risk (Liquidated Damages); Retainage; Payment Terms; Billing Date; Insurance Requirements (Peter sends the insurance section + sample COI to MJ Certificates → COI to GC insurance contact/PM).

### Post-approval kickoff
- Get SSSP from Progressive Safety (SOP needed).
- Call in locates for the property (SOP?).
- Peter receives invoices → codes to correct job # & cost code in the Excel tracking sheet / QB.

### Operations Items
- **Equipment Rental:** track rental delivery/pickup dates + rates; confirm we pay the national-account-agreed rate. 1 week before start (per schedule), auto-task email to set up 265 track loader delivery to (Job Name & Address) by date (1 wk out), site contact John Willis (+contact info); follow-up email 2 days prior to confirm; track what we rent, dates, cost. On completion (Peter confirms logs 100%), email rep to call off pickup, cc Brad & John Willis.
- **Transport of Equipment; Stone Setup.**
- **Prepare to Mob:** review submittals. **Mob to Site. Demob:** John emails completion → call off fuel delivery (ref job#); call off stone deliveries + request final invoices (ref job#); schedule equipment pickup/demob/transport to next job; call off rentals + request final invoices (ref job#); do column checks.

---

## SOPs & TRAINING FOR PETER (cross-cutting)
- Create SOPs and ingest workflows to train Peter correctly — "all things Peter needs to learn."
- Including: best university programs in Geotechnical Engineering and Ground Improvement design (curriculum to study).
- Tie each workflow above to a written SOP so the process runs the same way every time.

---

## OPEN PRODUCT DECISIONS (need Brad / partners)
1. **Accounting scope (big one):** build a full accounting system to eliminate QuickBooks entirely (P&L, Balance Sheet, reconciliations)? This is the largest, most compliance-sensitive piece (tax, audit, bonding). Peter's recommendation: integrate/sync with QB first and build PF-specific layers (job cost, WIP, cashflow forecasting) on top; revisit full replacement once those prove out. Confirm direction.
2. **Field Ops Viewer:** build now or after the project-record backbone exists? Recommendation: after, since it's a read-only filtered view of the same data.
3. **Build order / priority** across phases.
4. **Source of truth:** need access to the "PF Project Master" (and its "PF Dashboard" tab) to model the project record + dashboard accurately.
5. **Requirements owners:** Jonathan for workflow/testing/as-built/SOP details; Derek for BD + Communications import; Brad for financials/accounting + PF Admin.

## JONATHAN (LJ) — RESOLVED 2026-06-17
- Definition: **WIP = awarded but not yet completed** (= "pipeline value"); on completion it moves to **Completed Projects** (total to date + by year). See DATA-SOURCES.md "Financials: WIP, Completed".
- **Placement (Brad's call):** track completed value vs pipeline value in **BOTH** the estimating side (Preconstruction / Bid Pipeline) **AND** Project Management → Active Projects. Both surfaces show pipeline (awarded-not-completed) and completed value; keep the numbers driven from one source (Bid Log award status + auto-progress completion) so they agree.

---

## PROJECT LIFECYCLE — Preconstruction → Project (Brad 2026-06-17)
A job flows through one lifecycle:
1. **Preconstruction pipeline**: the job moves through the stages (Actively Bidding → Budget Pricing → Feasibility Review → Submitted Bids → Awarded / Not Awarded), bucketed by the Bid Log's column-A section.
2. **On AWARD it graduates OUT of Preconstruction and INTO the Project section** (Project Management → Projects → the project record). The "Awarded" stage is the handoff point.
3. **Documents come with it**: when it lands in the Project section, its documents populate the record — subcontract / contract, the contract drawings, any drawings in the folder, geotech, submittals — "all of them." (This is the document-sourced population workflow in PROJECT-RECORD-SCHEMA.md.)
4. **The Project section is where the execution WORKFLOW gets built out** to complete the project: submittal management, mobilization prep, install, QA/QC, testing, as-builts, closeout — the Peter Workflow automations operate here.
So: Preconstruction = win the work; Project section = do the work, document-fed and workflow-driven. (Already reflected: Awarded pipeline + Awarded Projects index link into the project record; POET is the first built record.)

## PROPOSED PHASING (for confirmation)
- **Phase 1 — Nav skeleton:** the reconciled 8-header collapsible IA with nested subcategories + placeholders. Concrete, low-risk, already asked for.
- **Phase 2 — Project Record backbone:** PM → Projects → per-project 10 subsections; start read-only pulling existing BD/estimating/subcontract data, then make editable. Everything else hangs on this.
- **Phase 3 — Projects Schedule:** awarded → schedule two-way sync.
- **Phase 4 — Subcontract Award automation:** clickable risk dashboard + new-contract task list + project-info/scope extraction (extends our existing subcontract review).
- **Phase 5 — Peter Workflow engine:** project log of all comms, submittal-management tracking + reminders, as-built workflow, operations/equipment automations — each backed by an SOP.
- **Phase 6 — Company Financials / accounting:** scope per decision #1; the largest and most sensitive.
- **Separate track — PF Field Operations Viewer** (read-only).
- **Cross-cutting — SOPs/training ingestion for Peter.**

## Brad's to-do (he is building these)
- PF Admin subcategories.
- Company Financials build-out (with Peter).
