# Equipment Tracker -- Nav Promotion (Addendum)

**Parent docs:** `docs/equipment-tracker/SRS.md` + `SOW.md`
**Version:** 1.3 (addendum to v1.2)
**Date:** July 28, 2026
**Owner:** Peter (AI COO)
**Status:** COMPLETE -- deployed to production.

> This addendum records the 2026-07-28 nav change only. The Equipment module's own requirements (registry, maintenance, calibration) are unchanged and remain in the parent SRS/SOW.

---

## Change

Equipment was promoted from a sub-item to its own **top-level nav section**, placed directly beneath Field Operations in the sidebar. It remains **office-only** and continues to carry cost data (daily rates and service-history costs).

## Requirements

| # | Requirement | Status |
|---|-------------|--------|
| FR-1 | Equipment appears as its own top-level nav section, directly under Field Operations | DONE |
| FR-2 | Equipment stays office-only; the field_ops role cannot see the section or its item | DONE |
| FR-3 | The Equipment view, its route (`showModule('equipment')`), title, and data are unchanged | DONE |

## Why it stays office-only

The Equipment view exposes daily rates and service-history costs, so it must not reach the field crew. Two guards apply:
- The office-only top-level rule hides any top-level nav section that is not marked field-safe or field-mixed. The new Equipment section is neither, so it is hidden from field_ops.
- A belt-and-suspenders `data-fo-hide` marker is on both the section and its item.

The server auth boundary in `functions/lib/auth.js` remains the real wall; the nav hide keeps the UI honest.

## Verification

- Deploy `a1e5c3ac` (Dead Projects + Equipment move in the same cycle).
- node --check passed, div balance 1723/1723.
- Committed-source confirms the new top-level section, the office-only rule coverage, and the unchanged view/route/data.

## Note

An earlier step in the same cycle moved Equipment out of Project Management into Field Operations as a hidden sub-item; this addendum reflects the final state, promoted to its own top-level section directly beneath Field Operations.
