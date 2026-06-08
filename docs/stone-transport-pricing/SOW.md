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

## Update 2026-06-08 — Transport gap closed
Parsed 1,004 Outlook .msg vendor emails via `extract-msg` (isolated venv) → recovered **711 transport records** (Stephan 386, Paddacks 239, others 86). Merged into pricing-database.json (840 total).
**Key finding:** Stephan/Paddacks quote **flat equipment-mobilization fees per rig** from the Monroeville yard (vibro/98k setup, 80k excavator, gooseneck, predrill, fall-off, step-deck) — NOT per-ton hauling. Module now shows an equipment-mob rate summary (e.g., vibro setup median ~$2,690) + searchable transport table. Per-ton hauling captured for other carriers (50 records).
