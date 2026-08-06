# PF Platform Changelog

Honest, dated record of shipped platform changes. Newest first.

## 2026-08-06
- **PM section pages now full-width / responsive** — removed the 1100px (and 1180px TimeSheets) max-width cap on the four render-target wrapper classes (`.pf-index-root`, `.ts-root`, `.pr-root`, `.ba-wrap`), all set to `max-width: none`, so Project Management, Preconstruction, Project Record, Budget-vs-Actual, and TimeSheets pages use the full screen width and auto-adjust like the Dashboard instead of leaving right-side dead space. CSS/layout only; no JS, data, or table overflow guards touched. Branch `pm-fullwidth-20260806` (commit `1bca735`), Brad-approved off preview.
