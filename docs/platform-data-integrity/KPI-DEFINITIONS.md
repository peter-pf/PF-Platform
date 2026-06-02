# Canonical KPI Definitions — PF Operations Platform

**Version:** 1.0
**Date:** June 2, 2026
**Prepared by:** Peter (AI COO)
**Status:** PROPOSED — defaults chosen by Peter; pending Brad's confirmation. Implemented consistently across all modules so every screen agrees; definitions can be adjusted in ONE place.

---

## Why this exists

The June 2 triple-check found the same KPI showing different numbers on different tabs (win rate 42% vs 18%, FY revenue 37% vs 49%, active projects 16 vs 5, POET paid $130,837 vs $186,612). Root cause: each module carried its own formula and its own data copy. This document fixes the definitions; the code centralizes them into shared helpers (`window.kpi.*`) that every module calls. No module computes these inline anymore.

---

## Status taxonomy (bids)

A bid's `bid_status` falls into one of these buckets:

| Bucket | Statuses included | Meaning |
|--------|-------------------|---------|
| **Won** | `Awarded`, `Completed` | We got the job (Completed = won work now finished) |
| **Lost** | `Not Awarded` | We submitted and lost competitively |
| **No-bid** | `Didn't Bid to Awarded GC` | We chose not to bid; GC was awarded elsewhere |
| **In pipeline** | `Submitted`, `Submitted - Edging`, anything pending | Not yet decided |
| **Junk** | header rows (`Bid Status`) | Removed at the data layer |

## KPI definitions (as implemented)

### 1. Win Rate
**`winRate = Won / (Won + Lost)`** where Won = Awarded+Completed, Lost = Not Awarded.
- **"Didn't Bid to Awarded GC" is EXCLUDED** from the denominator — it's not a competitive loss; we didn't submit. Win rate measures: *of the bids we actually submitted and that were decided, what share did we win.*
- In-pipeline bids are excluded (not yet decided).
- **Decision point for Brad:** if you'd rather "Didn't Bid" count as a loss (i.e., win rate = competitiveness including opportunities we passed on), say so and it flips in one place.

### 2. FY26 Booked Revenue
**`fyBookedRevenue = sum(bid_value) where status in {Awarded, Completed}`**, measured against the $6.0M goal.
- **Completed IS counted** — finished jobs are still revenue booked this fiscal year. (The old dashboard counted Awarded only, understating progress.)
- **Decision point for Brad:** confirm Completed should count toward the FY goal. (Standard for a revenue-to-goal view; flag if you track booked vs recognized differently.)

### 3. Active Projects
**`activeProjects = count(projects where contract executed AND 0 ≤ work_pct_complete < 1)`**
- Includes contracted jobs not yet started (pct = 0, mobilizing) — they're active commitments.
- Excludes finished jobs (pct = 1) and anything without an executed contract.
- **Decision point for Brad:** if "active" should mean only *physically in progress* (pct > 0), that's a one-line change.

### 4. Project Financials (paid / unpaid / retainage)
**Always from `LIVE_PROJECTS`** (the SharePoint sync). No module hardcodes a project's financials. Company-wide totals = sum across all live projects; per-project = that project's live record.
- This kills the POET discrepancy ($130,837 live vs $186,612 hardcoded). Live data is the single source of truth.

### 5. Pipeline Value
**`pipelineValue = sum(bid_value) over in-pipeline bids`**, with unpriced bids (null `bid_value`) reported separately so the count and the dollar value aren't conflated.
- Label shows "N priced / M total" rather than implying all M are valued.

---

## Implementation rule
Every number above is computed by exactly one shared helper. Any module displaying it imports the helper — it never recomputes. Adding a new module that shows these KPIs MUST use the helpers. This is enforced by the self-check: a Node script computes each KPI once and asserts every display site matches.
