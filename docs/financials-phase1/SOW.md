# Statement of Work: Financials Phase 1 (Per-Project Budget vs Actual)

**Module:** Project Record -- Financials (Section 10), Budget vs Actual
**Version:** 1.0
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** COMPLETE -- deployed to production. Office-only.

> Pairs with `docs/financials-phase1/SRS.md`. House style follows `docs/portal-rebuild/SOW.md`.

---

## Scope delivered (file-path first)

1. **Per-project Budget vs Actual in the record** -- `platform/index.html` (office project-record renderer, Financials card / Section 10)
   - A Budget vs Actual grid inside each project record's Financials section.
   - Seeded with the roughly 69 standard POET cost codes as the starting chart of costs.
   - Editable budget values, saved as office-wide overrides through the existing per-section override channel.
   - Office-only; the field project view carries no financials.

## Work performed
1. Seeded the standard POET cost-code set (about 69 lines) as the default Budget vs Actual lines so a project record opens with a real chart of costs.
2. Wired budget editing through the same fail-closed, server-gated override path used elsewhere in the project record (the `financials` area).
3. Kept the Financials section out of the field project renderer so no dollar figure can reach the crew.

## Verification
- Financials card present in the office renderer and untouched by the same-cycle tracked-items fold and collapse-all changes.
- Override path is the one already proven fail-closed and server-gated in `docs/project-record-overrides/`.
- Field isolation: the field project renderer references no financials data.

## Honest caveats
- Actuals reflect the maintained source, not a live QuickBooks feed yet.
- This is Phase 1: seeded cost codes and editable budgets. Company-level roll-up is not part of this scope.

## Out of scope / next phases
- Live QuickBooks job-cost actuals by cost code.
- Company Financials roll-up of per-project budgets.
