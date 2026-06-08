# Stone & Transport Pricing — SOW

**Module:** Stone & Transport Pricing · v1.0 · 2026-06-08 · Peter (AI COO)
**Status:** Complete (stone) — deployed; transport gap flagged.

## Delivered
1. Mined 73 Vendor Quotes folders (568 files; 219 PDFs extracted) → pricing-database.json (129 records, 10 states).
2. Built data/pricing-data.js (regional rollup + per-quote rows) and pricing.html (headline, regional table, searchable quotes, transport, gap banner).
3. Wired into nav, #mod-pricing, moduleTitles.
4. Stood up weekly Saturday-1am-ET Bid-Sent scan (bidsent_weekly_daemon.sh + bidsent_weekly_boop.sh).

## Verification
- Spot-checked delivered values ($17.50–$55/ton by region, sensible); fob 126/126 populated; field names confirmed (fob/haul/delivered).
- Lightweight self-check: node eval of data + inline-JS parse; wiring grep-confirmed. No browser (per Brad).
- Coverage notes written; .msg gap explicit (not silently skipped).

## Deployment
Live at pf-platform.pages.dev → "Stone & Transport Pricing". Committed/pushed.

## Out of scope / follow-ups
- .msg parser (extract-msg in venv) → targeted Stephan/Paddacks transport re-mine.
- Image-only quotes manual review. Estimating-tool integration.
