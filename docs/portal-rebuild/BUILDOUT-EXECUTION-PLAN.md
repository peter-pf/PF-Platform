# PF Platform Build-Out — Execution Plan (for Melanie + Brad review)

**Prepared by:** Peter (AI COO) · **Date:** 2026-06-24 · **Status:** FOR REVIEW before build
**Source:** Brad's "Platform Build Out Items" spec ([[platform-buildout-spec-full]])

## Organizing principle
The platform is one **assembly line** — Dashboard → Business Development → Preconstruction → Project Management → Field Operations → Financials — and **data flows DOWN**: a job entered in BD carries its history through Precon, into PM on award, and is mirrored (financials stripped) into Field Ops. Nobody re-enters anything. Every section is fed by ingesting the matching **master spreadsheet**, then built into live, role-gated views.

## What's already done (foundation in place)
- **Access tiers (E)** — admin / partner / business_dev / field_ops, with project-vs-company-wide financial split. LIVE, security-audited. *Every section below inherits this — financials never leak to field ops.*
- **Bid-resolution fork + Dead Set (A, slice 1)** — Awarded/Not-Awarded/Reactivate, persisted. LIVE.
- **Persistence pattern proven** (KV/Functions, the crew-schedule + pipeline-state model) — reused for all editable/write-back features.

## Build sequence (phased, each phase shipped in reviewable slices)

**Phase 0 — Data ingestion layer (foundation, do first).**
Ingest the 7 master sheets into clean, structured data the platform reads, ADD net-new only, no duplicates: PF Project Master, PF BD Master, PF Prequal Log, Project Bid Log, PF Timesheet, PF Project Financials, PF Financials Budget. This underpins every section, so it's first.

**Phase 1 — Build cross-cutting components ONCE, reuse everywhere:**
- **Dashboard engine** with week/month/quarter/annual toggle (used by PF, BD, Precon, PM, Financials dashboards — same component, different feeds)
- **Action-item / follow-up engine** with date-based reminders (used by BD and Precon)
- **Per-record activity log** (interactions for CRM; change/comm/file log for projects)
- **Document-template + auto-send** (intro email + attach docs)
- **Site/section search** (owners on PF Dashboard; crew on Field Ops, financials-stripped)

**Phase 2 — Business Development (CRM):** GC's to Contact → Companies & Contacts (+ interactions) → Opportunities (feasibility analysis → email Ray/Jonathan/Derek + notify → prelim/pass logging) → Prequal & Credit App Info (+ Prequal Log) → BD Dashboard → Document Templates.

**Phase 3 — Preconstruction:** ingest Agg Pier + Helical bid logs into the existing buckets → full PF Bid Log (all columns + live SharePoint link) → per-project info/files/change log → Historical Bid Log by year → Precon Dashboard → drag-and-drop between sub-sections + summary rows + action-item calendar. Award (LOI/subcontract) → hands off to PM with full history.

**Phase 4 — Project Management:** auto-number on award ("Project # - Name") → ingest PF Project Master, track Project Dashboard col-C items per project → Project Dashboard (phase/status) → Current → Completed (archived by year) → PF Project Schedule. POET as the template (after Brad finalizes). Budget vs costs (pending Brad's specifics).

**Phase 5 — Field Operations:** mirror PM with ZERO financials → search bar → Project Dashboard + schedule → Current/Completed → Daily Reports (foreman form) → Timesheets (→ Sun 5pm approval → HR/payroll) → Safety.

**Phase 6 — Financials:** Project Financials Dashboard → WIP & Completed (2025/2026) → Projections/Budget/Weekly Cashflow → Historical Job Costs → PF Cost Codes.

**Later:** "Ask Peter" walled-off search/voice; proactive margin flagging.

## Cadence & quality gates (every slice)
Build a slice → self-check (runnable test + evidence) → review (correctness + **security audit on anything touching financials/access**) → docs updated → deploy → verify the gate holds → commit/push → show Melanie/Brad for sign-off → next slice. Nothing ships that leaks a dollar to field ops.

## Dependencies / what I need
- From Brad: project cost-tracking specifics (budget vs costs), Daily Report field list, POET finalization, his per-subsection PM comments, and the new-user emails (Deb, Kendall, Ray) for the role map.
- Formatting/visual direction from Melanie (the materials Brad referenced).

## Proposed first move on approval
Phase 0 (ingest the master sheets) + the Dashboard engine, starting with the **PF Dashboard** (mirrors PF Project Master "PF Dashboard" tab) as the first visible, reviewable slice — it proves the ingestion + dashboard pattern we then reuse across all six sections.
