# Software Requirements Specification: Financials Phase 1 (Per-Project Budget vs Actual)

**Module:** Project Record -- Financials (Section 10), Budget vs Actual
**Version:** 1.0
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** Complete -- deployed to production. Office-only.

> House style follows `docs/portal-rebuild/SRS.md`. This is the per-project Budget vs Actual that lives inside each project record's Financials section. It builds on the earlier POET-only Budget vs Actual view documented in `docs/portal-rebuild/SOW.md` item 7, and generalizes the concept into every project record with editable budgets.

---

## 1. Purpose

Every awarded project needs a running budget-versus-actual so the office can see planned cost against spend by cost code. Phase 1 puts a Budget vs Actual grid inside each project record's Financials section (Section 10), pre-seeded with the standard PF cost codes so a new project starts with a real chart of costs rather than a blank page. Budgets are editable by the office.

## 2. Scope

### In scope
- A per-project Budget vs Actual grid in the project record Financials section (Section 10).
- Seeded with the standard POET cost codes (about 69 lines) as the starting chart of accounts.
- Editable budget values, saved as office-wide overrides.
- Office-only visibility.

### Out of scope
- Field visibility of any kind (the field project view has no financials).
- Live QuickBooks actuals wiring (a future phase; actuals reflect the maintained source until then).
- Company-level financial roll-ups (Company Financials is a separate section).

## 3. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| FR-1 | Each project record shows a Budget vs Actual grid inside Financials (Section 10) | DONE |
| FR-2 | The grid is seeded with the roughly 69 standard POET cost codes as the starting lines | DONE |
| FR-3 | Budget values are editable by the office and persist for the whole office | DONE |
| FR-4 | The Financials section is office-only; field_ops never sees it | DONE |
| FR-5 | Missing or unentered values render honestly (blank / em-dash), never fabricated | DONE |

## 4. Non-Functional / Security

- Office-only. The Financials section and its Budget vs Actual grid are never rendered in the field project view.
- Edits are saved server-side through the same override channel used by the rest of the project record (the `financials` area: admin, partner, business_dev). field_ops and unauth are 403 by direct URL, not just hidden in the UI.
- Fail closed: if a save fails, the UI shows an honest error and keeps the user's input; it never reports "saved" when it was not.
- No automatic pricing or summing of user-typed money beyond the displayed budget-vs-actual arithmetic; values a user types are stored as entered.

## 5. Acceptance Criteria

- Opening any project record's Financials section shows a Budget vs Actual grid pre-seeded with the standard cost codes.
- An office user can edit a budget value and it persists across reload and future sync.
- A field_ops user opening the same project (field view) sees no financials at all.

## 6. Verification Evidence

- Financials card (Section 10) present in the office project-record renderer; untouched by the tracked-items fold and the collapse-all changes shipped the same cycle.
- Edit/override path is the per-section override mechanism already proven in `docs/project-record-overrides/` (server-side `financials` area gate, fail-closed save).
- Field isolation confirmed: the field project renderer references no financials data.

## 7. Open Items / Phase 2

1. Wire live actuals from a QuickBooks job-cost export by cost code, replacing the maintained source.
2. Generalize any per-project seed beyond the POET standard cost-code set if projects diverge.
3. Decide whether budget edits roll up into a company-level financial view.
