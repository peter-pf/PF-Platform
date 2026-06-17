# Auto Percent-Complete from Column Logs — Design (for sign-off)

**Prepared by:** Peter | **Date:** 2026-06-18 | **Status:** DRAFT for Brad sign-off (no code yet)
**Requested by:** Brad (vision) + Jonathan (operational answers, 2026-06-17)

## Purpose
Replace the hand-entered `work_pct_complete` (goes stale: Southwark read 0% while done, Madison 0% while ~80%) with a value computed automatically from the GUHMA column logs, so every project reports actual work in place on its own and a finished job can never read 0%.

## Confirmed requirements
- Track and display BOTH columns installed and linear feet installed, each with a quantity-complete and a percent-complete.
- TRUE project completion is gauged off TOTAL LF INSTALLED (a deep column is more work than a shallow one). Show count too, but LF drives the active-vs-complete flip and the headline gauge.
- Baseline / denominator = the APPROVED SUBMITTAL design totals (latest approved Garbin revision).
- Installed LF = sum of per-column max depth from the .guh (Tiefe m x 3.28084). Installed columns = count of unique column numbers.
- Redrills COUNT: a re-drilled column adds its footage again to the LF total.
- Run the mislabel number-fit check before counting (Jonathan's 283/383 rule). Count a false-start (0.0 then full install) once.
- Roll ALL mobilizations / all days into the one project total (e.g. Madison mob1 + mob2).

## How it works
1. **Source:** SharePoint `02 - Projects / {project} / QAQC / {daily folders} / *.guh` (per Jonathan).
2. **New sync step** `sync/build-progress.py`, run by the existing daily daemon alongside the SharePoint data sync: for each active project, pull its QAQC .guh logs, parse per-column (Info1 = column #, idx1 = depth m -> ft, idx6 = buckets), apply the rules above, and compute installed columns + installed LF.
3. **Baseline (the one real design decision — see below):** per-project approved-submittal totals (design columns + design LF).
4. **Output:** `data/progress-data.js` with per project: installed_columns, design_columns, pct_columns, installed_lf, design_lf, pct_lf, last_log_date.
5. **Dashboard:** the main dashboard active-vs-completed split and the % shown read from progress-data (LF % drives the completion flip), replacing the stale `work_pct_complete`. Both count and LF percentages are shown. The CEO dashboard and the schedule read the same single source.
6. **Cadence:** recompute daily (the daemon) and on demand.
7. **Validation:** Madison must compute to ~80% (Jonathan's stated check).

## Decisions for Brad to confirm
1. **Where the approved-submittal baseline lives.** Parsing design totals out of each submittal PDF is fragile and error-prone. Proposal: a small per-project baseline config (design columns + design LF), which I seed from each project's approved submittal and update whenever a new revision is approved. One clean, auditable source instead of brittle PDF reads. OK?
2. **Over-100% handling.** When installed LF exceeds design LF (deeper-than-design columns, redrills), show it as complete but surface the overage, e.g. "100% complete (installed LF 4% over design)", same as the Southwark closeout. OK?
3. **Scope.** Run it on all active/in-field projects (those with a QAQC log folder); completed projects already sit at 100%. OK?

## After sign-off
Build `build-progress.py` + `progress-data.js` + wire the dashboards/schedule, run the full review + gate + deploy + Git, then write the formal SRS/SOW. Validate against Madison ~80% before calling it done.
