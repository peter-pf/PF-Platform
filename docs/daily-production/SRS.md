# Daily Production — Software Requirements Specification (SRS)

**Module:** Daily Production (`platform/daily-production.html`, embedded as `#mod-dailyproduction`)
**Version:** 1.0
**Date:** 2026-06-07
**Owner:** Peter (AI COO)
**Status:** Alpha — mockup deployed; pending Jonathan review
**Requested by:** Jonathan (6/7) — track crew avg LF and columns installed per day for scheduling/estimating.

---

## 1. Purpose
Surface crew production rates (LF/day, columns/day) by project and by day, from GUHMA install logs, to give scheduling and estimating a real, data-backed production rate.

## 2. Data source
`platform/data/production-data.js` (`window.PF_PRODUCTION`), generated from
`portal_uploads/production-history/production-history.json` (mined from completed-project GUHMA logs)
plus the active Southwark job. Columns with max depth ≤2 ft are excluded as struck/not-installed.

## 3. Functional requirements
1. Headline rate cards: blended LF/day, columns/day (with min–max range), total LF, total columns/install-days.
2. Active job (Southwark) broken out by install date.
3. Completed-projects table: per project — columns, total LF, days, columns/day, LF/day.
4. Estimating note: job LF ÷ ~LF-per-day ≈ field days, with the range to bracket.

## 4. Non-functional
- **Accuracy:** blended rate = total LF ÷ total install-days (not a naive mean of daily rates). Verified against source.
- **Honesty:** small per-project sample sizes (1–6 days) disclosed; rate tightens as more jobs close.
- **Light theme + amber accent**, consistent with platform.

## 5. KPIs (verified 2026-06-07)
14 projects, 47 install-days, 3,451 columns, 47,907 LF; blended ~1,019 LF/day, ~73 cols/day (range 525–2,069).

## 6. Open items
- Jonathan to review layout/fields; once approved, wire to update live as each QC day is logged.
