# Main Dashboard — Statement of Work (SOW)

**Module:** Main Dashboard
**Version:** 2.0
**Date:** 2026-06-05
**Owner:** Peter (AI COO)
**Status:** Complete — verified & deployed (Alpha)

---

## Scope delivered

Rebuilt the main dashboard to read directly from the three master spreadsheets,
to Jonathan's finalized spec.

### Work performed
1. **Data pipeline** — `platform/sync/extract-projects.py`: pulls WIP + Completed
   projects and the Agg Pier Bid Log; computes all dashboard KPIs in Python;
   writes `platform/data/projects-data.js` (`window.PF_PROJECTS`). Designed to run
   in the daily 5pm SharePoint sync (`PF_ASOF` / `PF_BID_WINDOW_DAYS` overridable).
2. **Frontend** — rewrote `renderDashboard()` and the `#mod-dashboard` markup:
   summary bar, 4 KPI tiles, and 5 tables (Upcoming Bids, Active Projects, Recent
   Bids, Upcoming Projects, Completed) with empty states.
3. **Security hardening** — fail-closed `E()` escaper; `</`/U+2028/9/`<!--`
   defanging in both `extract-projects.py` and the sibling `embed-data.py`.

## Verification (self-check + independent triple-check)

- **Self-check:** headless Chromium render — 0 JS errors; all values + tables correct.
- **qa-engineer:** 11/11 KPIs PASS, each tied to the master's own total rows
  (Total WIP, Total Completed, Total Awarded 2026, AR to Date). Phase
  classification and date windows verified.
- **reviewer:** APPROVED, no CRITICAL/HIGH. Applied M1 (id-based subtitle selector),
  M2 (sort-key hardening), L1 (subtitle money simplify).
- **security-auditor:** render path clean (full `esc` coverage, no secrets).
  Applied the HIGH json.dumps `</script>` breakout fix to both generators and the
  fail-closed `E()` fallback.

### Verified numbers (tie to master)
| KPI | Value |
|-----|-------|
| Total FY26 Sales | $2,993,750 |
| Pipeline Value | $2,216,172 (11 awarded) |
| FY26 Revenue | $777,578 (6 completed) |
| AR Outstanding | $299,526 (retainage due $210,459) |
| Outstanding Bids | 30 live / $5,690,000 (51 / $10,380,705 all) |
| Upcoming Bids (≤7d) | 4 |

## Deployment
- Live at `pf-platform.pages.dev` (Cloudflare Pages; "Compiled Worker successfully"
  + Functions bundle confirmed).

## Out of scope / follow-ups
- CSP header at the Cloudflare middleware layer (security LOW, defense-in-depth).
- Two-way edit/write-back of Completed status (per Visuals-First: backend wired
  only after Brad + Jonathan green-light the visuals).
- Resolve stale `% complete` values in the master (data-entry, owner side).
