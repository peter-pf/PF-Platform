# QA: PF Dashboard Cross-Year Actual vs Budget (commits 14f3ab4, f91182a)

VERDICT: PASS (read-only review, no browser automation)

## How verified
- Builder flag: `--local <xlsx>`. Run: OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python3 platform/sync/build-pf-dashboard.py --local platform/sync/downloads/PF_Project_Master.xlsx
- Deterministic: 2 runs differ ONLY in syncedAt + comment timestamp.
- Logic verified by extracting compare branch (index.html ~12961-13106) + rollup (12796) into Node harness /tmp/qa_compare.mjs run against the REAL generated feed.

## Key facts about the feed
- years map: 2024 EMPTY, 2025 EMPTY, 2026 populated (all 12 months). Top-level monthHasData etc intact (point at 2026).
- 2026 is isTemplateData=TRUE: all 12 months identical seed values (Bids Sent 12/$1M per month; Net Income $80K/mo). So Annual = 12x month. Real distinct monthly actuals not yet entered. Banner discloses this in single-year views (template banner). NOTE: compare view does NOT show the template banner (banner hidden in compare branch) - minor disclosure gap, LOW severity.

## Numbers confirmed
- {2026}x{Annual}: Bids Sent 144 / $12,000,000 ; Net Income $960,000 = 12-mo manual sum. PASS
- {2024,2025,2026}x{June}: ONLY "June 2026" column; 12 / $1,000,000 (own value, NOT summed). PASS
- {2024,2025,2026}x{Annual}: ONLY "2026 Annual". PASS
- {2026}x{Jan,Feb,Mar}: 3 per-month cols, each own value. PASS
- Order: year asc -> months calendar -> Annual last. {Mar,Jan,Annual,Feb}->[Jan,Feb,Mar,Annual]. PASS
- No delta in compare branch (grep). mstart on group header + Actual cell; budget on Budget cell. PASS
- Empty combos (2024/2025 x month or Annual) -> [] columns -> "No data for the selected years and periods." No NaN/crash. PASS

## Toggle/regression
- Exactly 1 data-period="compare" + 1 cmpMode:true (line 13329, PF mount only).
- Precon/BD mounts (mount() at 13265) pass NO cmpMode; their toggles have only week/month/quarter/annual. Cannot reach compare branch. PASS
- Single-year regression: Month=June Bids Sent 12/$1M Net $80K; Annual 144/$12M Net $960K. PASS

## Other
- Deployed gate: curl / and /data/pf-dashboard.js -> 401. PASS
- RBAC: node platform/migrations/test-rbac.mjs -> 661 passed, 0 failed. PASS
- Working tree restored: md5 789c0e46... matches original; no dashboard git changes.

## Gotcha for future
- "nothing selected" via initial scopeKey (years=;periods=) REVERTS to defaults (current year + populated months) rather than empty message - but the UI checkbox path builds an explicit scopeKey via reread(), so user-cleared-all yields years=<empties> -> defaults. A user CANNOT produce a truly-empty selYears through checkboxes that shows the prompt msg unless all selected years/periods are empty-data. The "Select one or more years..." prompt is effectively dead for the checkbox flow. LOW severity (cosmetic).
