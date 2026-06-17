# Auto Percent-Complete from Column Logs — SRS

**Status:** SHIPPED 2026-06-17 (live on pf-platform.pages.dev) | **Owner:** Peter
**Approved by:** Brad + Jonathan (all 3 decisions, 2026-06-17) | **Spec:** see DESIGN.md

## 1. Purpose
Replace the hand-entered `work_pct_complete` (went stale: Southwark read 0% when done, Madison 0% when ~80%) with a value computed automatically from the GUHMA column logs, so each project reports actual work in place and a finished job can never read 0%.

## 2. Functional requirements
- FR1 — For each active in-field project, pull its GUHMA `.guh` logs from SharePoint `02 - Projects/{project}/QAQC/{daily folders}/*.guh`.
- FR2 — Parse per-column: `.guh` is latin-1/CRLF; `[Header] Info1` = column number; `[DATA]` semicolon rows, idx1 = depth (m) ×3.28084 = ft, idx6 = buckets.
- FR3 — Installed columns = count of UNIQUE column numbers. Installed LF = sum of per-column MAX depth (ft).
- FR4 — Field rules: redrills add footage again; mislabel number-fit check (283/383) runs before counting and only flags (never auto-corrects); false-start (0.0 then full) counts once; all mobilizations/daily folders roll into one project total; test/probe labels excluded.
- FR5 — Baseline (denominator) = approved Garbin submittal design totals, held in `sync/progress-baselines.json` (decision #1). Updated when a new revision is approved.
- FR6 — Show BOTH a column count and an LF figure, each with its own %. LF % drives true completion and the active→complete flip.
- FR7 — Over-100% displays "100% (installed X% over design)" (decision #2).
- FR8 — Scope = all active in-field projects with a QAQC log folder (decision #3). No fabricated baselines: unconfirmed projects show installed quantities with % withheld.
- FR9 — Main dashboard, CEO dashboard, and the schedule read one source (`data/progress-data.js`), replacing stale `work_pct_complete`.

## 3. Non-functional / safety
- NFR1 — Graceful fallback: a project whose key matches no baseline falls back to its existing `work_pct_complete`; no NaN/crash (verified, QA #2/#5).
- NFR2 — XSS: all rendered values escaped via `window.esc`/`esc()` or numeric-coerced (verified, security review). subcontracts.html `esc()` hardened to escape quotes.
- NFR3 — No secrets in repo; sync script reads creds from `~/.env` at runtime.
- NFR4 — Division-by-zero guarded (`pct()` returns null for 0/None denominator).

## 4. Acceptance criteria & verification
- AC1 — Madison computes ~80% LF: **PASS** — 78.3% LF / 82.7% cols against live logs (Jonathan's check).
- AC2 — Over-100% handling: **PASS** — Intl School 100.4% flips to complete and surfaces the overage.
- AC3 — Pending baseline withholds %: **PASS** — POET shows installed qty, no fabricated %.
- AC4 — Triple-check: reviewer (correctness, ship-ready), security-auditor (safe to deploy), qa-engineer (ship-ready) — all 2026-06-17.

## 5. Known limitations / follow-ups (tracked)
- L1 — Madison baseline is PROVISIONAL (`baseline_status: provisional`): denominator is part installed-actual until Jonathan confirms a single approved Garbin per-column design-depth table for Mob1. Flip to `confirmed` once provided. Headline reproduces Jonathan's check regardless.
- L2 — POET (26-002): baseline pending; needs Jonathan's approved design totals + sub-project split decision.
- L3 — `build-progress.py` is run on demand; wiring it into the daily sync daemon is a follow-up.
- L4 — Crew Schedule (schedule.html) not wired: its `job.done` model isn't keyed to project numbers; needs Jonathan's job→project mapping first.
- L5 — Southwark 26-005 mis-flagged active in master data (pre-existing staleness, outside this build).
