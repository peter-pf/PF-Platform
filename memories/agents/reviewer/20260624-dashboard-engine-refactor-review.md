# Review: PFDashboard engine refactor + Precon/BD dashboards (commit cd07f67)
Date: 2026-06-24 | Verdict: NEEDS-FIX (1 blocking, sent back to web-dev)

Key findings:
1. default-opts back-compat pattern (`opts={}; ids = opts.ids || DEFAULT_IDS`; `finStart` via `'finStart' in opts`) correctly preserves the company dashboard. Verify on any future engine arg additions.
2. showModule wrapper chain (index.html 2518 base -> 6710 -> 12573) works because top-level `function showModule` is hoisted onto window; each wrapper calls prev first.
3. BLOCKER: disclosures in JS comments / `_omitted` array are NOT user-visible; engine banner only fires on isTemplateData or week, so real-data proxy feeds (Awarded dated by Date Submitted; BD status omitted) show nothing. ALWAYS require a persistent note path -> fixed via opts.note.
4. rollup() averages monthly pct (Win Rate, margins) rather than pooling -> misreadable on quarter/annual. Fixing Win Rate via opt-in basisNum/basisDen; company margins left as-is.
5. Snapshot metrics (BD totals) summed in rollup -> would double-count if >1 month populated (today only April, so correct). Companies Contacted rollup = sum-of-monthly-distinct (139) vs true period distinct (127) -> labeled "per month" in the note.
6. isTemplateData hardcoded False in new builders -> porting sig() detection from build-pf-dashboard.py.
