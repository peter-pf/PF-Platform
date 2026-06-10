# Daily Production — Statement of Work (SOW)

**Module:** Daily Production
**Version:** 1.1
**Date:** 2026-06-07
**Owner:** Peter (AI COO)
**Status:** Complete — deployed. v1.1 (2026-06-10) adds all-time top-5 production days.

---

## Scope delivered
1. Mined GUHMA install logs from 14 completed projects (47 install-days) → `production-history.json`.
2. Built `data/production-data.js` (per-project rates + active Southwark, blended headline).
3. Built `daily-production.html` — headline cards, active-job-by-day, completed-projects table, estimating note.
4. Wired into platform nav, `#mod-dailyproduction`, and moduleTitles.

## Verification
- Headline ties to source (total LF ÷ total days = 1,019 LF/day); column total = 3,451 confirmed.
- Lightweight self-check: `node` eval of data file + inline-JS syntax parse; wiring grep-confirmed. No browser (per Brad — compute).

## Deployment
- Live at pf-platform.pages.dev → "Daily Production". Committed/pushed (commit 732524a).

## Out of scope / follow-ups
- Live write-back as each QC day logs (after Jonathan approves the view — Visuals-First).
- Field-pier vs perimeter split refinement if requested.


---

## v1.1 — All-time Top 5 Production Days (2026-06-10, Jonathan request)
**Ask:** "Add an all-time ranking of highest-LF production install days... top 5, highest first."

**Delivered:**
- `topDays` array in `data/production-data.js`, built from the 47 per-day records in `production-history.json` PLUS the current 5 Southwark days (computed from the authoritative closeout parse, `portal_uploads/southwark-closeout/closeout-final.json`). Southwark was not in history (no double-count).
- New "Top 5 Production Days" table in `daily-production.html` (after the headline cards), ranked by LF, active-job rows tinted + tagged.
- Refreshed `southwark.byday` to the full 5 days (was stale at 3, missing the record 6/8). Fixed `headline.maxLfDay` to the true best single day (2,786) since the prior value (2,069) was actually the best project-average, not a single day. Kept curated `minLfDay` 525 (raw min was a 12-LF partial-day outlier).

**Result (verified):** #1 Terre Haute 2,786 LF (6/12/25); #2 Southwark 6/8 = 2,646 LF (active, near-record); #3 Terre Haute 2,593; #4 Southwark 6/9 = 2,280; #5 The Canopy 2,206.

**Self-check (no browser, per standing rule):** ran the page's exact render logic in `node` against the real data — confirmed 5 rows, strictly descending, correct values, 2 active-job rows flagged, #1 styled. All passed.

**Deploy:** `wrangler pages deploy .` from inside a clean copy of `platform/` → pf-platform (Compiled Worker + Functions bundle OK). Pushed to repo branch `website-build-20260609`.
