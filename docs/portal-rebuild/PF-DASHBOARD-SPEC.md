# PF Dashboard — Spec (Phase: PF Dashboard build)

**Source:** PF Project Master.xlsx → "PF Dashboard" tab. Brad (2026-06-17): "all of the categories in this tab are what I want to show in the PF Project Dashboard." Tracked with a **weekly / monthly / annual toggle** so we can see how each metric is tracking across weeks, months, or annually.

## Structure
Each metric row shows: **Quantity** (Actual vs Goal), **$ Amount** (Actual vs Budget), and a **Delta** (actual − goal/budget). Periods run across columns (the sheet is laid out month-by-month for 2026). The portal version adds a period toggle: **Weekly · Monthly · Annual**.

## The 16 metrics (in order)
| # | Metric | Qty (Actual/Goal) | $ (Actual/Budget) | Likely source |
|---|--------|:--:|:--:|---|
| 1 | Bid Invites Received | ✓ | — | Bid Log (Invite Date) |
| 2 | Garbin Prelims Completed | ✓ | — | Bid Log (Design Completed Date) / project Eng folder |
| 3 | Bids Sent | ✓ | ✓ | Bid Log (Date Submitted + Bid Total Value) |
| 4 | Projects Awarded (LOI) | ✓ | ✓ | Bid Log (Bid Status=Awarded; LOI date) + value |
| 5 | Contracts Fully Executed | ✓ | ✓ | Project record (executed contract date) + subcontract value |
| 6 | Projects Completed | ✓ | ✓ | Auto-progress (LF=100%) + project value |
| 7 | Projects Billed | ✓ | ✓ | **Financials** (invoicing) |
| 8 | Monthly Income | — | ✓ | **Financials** (cashflow) |
| 9 | Project Expenses | — | ✓ | **Financials** (job cost / cashflow) |
| 10 | Avg Project Profit Margin | — | % | derived (income − project expenses) |
| 11 | Non Project Expenses | — | ✓ | **Financials** (overhead) |
| 12 | Net Monthly Income | — | ✓ | derived |
| 13 | Net Monthly Margin | — | % | derived |
| 14 | Month End Chase Balance | — | ✓ | **Financials** (Chase Cking Cashflow tab) |
| 15 | Month End State Bank Balance | — | ✓ | **Financials** (State Bank Cashflow tab) |
| 16 | Total PF Cash @ Month End | — | ✓ | derived (14 + 15) |

## What Peter can already source (no help needed)
Metrics 1–6: derivable from the **Bid Log** (invite/submit/award/design dates, status, value), the **project records** (executed date), and the **auto-progress engine** (completion). These can be computed per period directly.

## What needs Brad's walkthrough (he offered to show where)
Metrics 7–16 (the financial side): Projects Billed, Monthly Income, Project/Non-Project Expenses, margins, and the Chase/State Bank/Total cash balances. Sources are the **PF Financials Budget** workbook (Chase Cking Cashflow + State Bank Cashflow tabs) and invoicing — need Brad to show exactly which cells/tabs feed each, and whether to read them live or have them entered.

## Open questions for Brad
1. **Goals/Budgets:** where do the per-metric Goal and Budget targets come from (the sheet has them filled per month) — a config we maintain, or pulled from a planning tab?
2. **Weekly granularity:** the sheet tracks monthly. For the Weekly view, do bid/award/completion counts roll up by week from their dates (yes, derivable), and do the financial/cash metrics simply show the latest or a weekly snapshot?
3. **Annual:** sum the quantities + dollars across the year, with annual goals/budgets — confirm.

## Build notes
- New panel `pf-dashboard` (currently a placeholder). Render the 16 metrics as a scorecard (Actual vs Goal/Budget + Delta, color the delta only — Brad's pref), with a Weekly/Monthly/Annual toggle.
- Sync step computes per-period values from the sources above → `data/pf-dashboard.js`.
- Queue: build after the in-flight nav batch (Field Ops / Awarded index / Insurance), since it edits the same nav file.
