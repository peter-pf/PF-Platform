# Auto Percent-Complete from Column Logs — SOW

**Status:** COMPLETE / SHIPPED 2026-06-17 | **Owner:** Peter

## Work performed
1. **Requirements & sign-off** — wrote DESIGN.md; Brad + Jonathan approved all 3 decisions (baseline source, over-100% display, scope) 2026-06-17.
2. **Build** (web-dev):
   - `platform/sync/build-progress.py` — parses GUHMA `.guh` logs from SharePoint, computes installed columns + LF per project per spec rules.
   - `platform/sync/progress-baselines.json` — per-project approved-design baselines (editable; audit trail in `source_note`).
   - `platform/data/progress-data.js` — generated `window.PF_PROGRESS` consumed by the app.
   - `platform/index.html` — `window.progress` helper + wired main dashboard, CEO dashboard, KPIs to the auto LF %, replacing stale `work_pct_complete`.
3. **Triple-check review** — reviewer (correctness), security-auditor (XSS/secrets), qa-engineer (edge cases). Two minor fixes applied post-review: over-100% label keeps one decimal (`index.html` overPct); `subcontracts.html` `esc()` hardened to escape quotes. Madison baseline note aligned to parser output and marked provisional.
4. **Self-check** — Madison validated at 78.3% LF / 82.7% cols against live `.guh` data (evidence in review logs).
5. **Deploy + gate** — Cloudflare Pages; "Compiled Worker successfully" + "Functions bundle"; 401 confirmed on `/`, `/subcontracts.html`, `/data/progress-data.js`.
6. **Git** — committed + pushed to `peter-pf/PF-Platform` branch `website-build-20260609`.
7. **Docs** — DESIGN.md, this SRS.md + SOW.md.

## Outstanding (see SRS §5)
- Jonathan: approved Garbin per-column design-depth table for Madison Mob1 (flip provisional→confirmed) and POET design totals + sub-project split.
- Follow-up: wire `build-progress.py` into the daily sync daemon; wire Crew Schedule once job→project mapping confirmed.
