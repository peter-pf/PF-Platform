# Stone & Transport Pricing — SRS

**Module:** Stone & Transport Pricing (`platform/pricing.html`, `#mod-pricing`)
**Version:** 1.0 · **Date:** 2026-06-08 · **Owner:** Peter (AI COO)
**Status:** Alpha — stone pricing live; transport pending .msg parser
**Requested by:** Jonathan (6/8) — track stone + transport pricing by geography for regional delivered-cost estimating.

## Purpose
Regional delivered-cost reference (stone $/ton + hauling) from real vendor quotes, to price material accurately in any market. Haul distance is the dominant delivered-cost driver.

## Data source
`platform/data/pricing-data.js` (`window.PF_PRICING`), from `portal_uploads/pricing-history/pricing-database.json` — mined from "Vendor Quotes" folders across "02 - Bid Sent" + Projects. Fields per record: project, city/state/county, vendor, plant, material/gradation, washed, fob, haul, delivered, unit, quoteDate, sourceFile.

## Functional requirements
- Headline (stone quotes, states, transport quotes) + known-gap banner.
- Regional rollup: delivered $/ton low–high, vendor/city counts by state.
- Searchable all-quotes table (state/city/vendor/material).
- Transport table (carrier/origin/dest/rate) — currently sparse (see gap).

## Coverage / gaps (2026-06-08)
129 records (126 stone, 3 transport), 10 states. FOB 126/126, delivered 114/126.
**Gap:** 340 of 568 vendor files are Outlook .msg emails (incl. 58 Stephan + 51 Paddacks) not yet parsed → transport rate sheets under-represented. Fix: parse .msg (extract-msg in a venv) and targeted re-mine of Stephan/Paddacks.

## Automation
Weekly BOOP Saturdays 05:00 UTC (1am ET) scans "02 - Bid Sent" for new projects and ingests new quotes (`tools/bidsent_weekly_daemon.sh`).

## Open items
- Close the .msg transport gap. Image-only quotes flagged for manual look. Fold into estimating tool alongside production rates + project history.
