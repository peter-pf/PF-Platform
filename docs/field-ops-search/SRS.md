# Software Requirements Specification: Field Operations Smart Search

**Project:** Pier Foundations -- Field Operations Smart Search (Phase 1)
**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: v1.0 -- Built and deployed (commit 2172b98). LIVE in production.

## 1. Overview

Field Operations Smart Search lets a field user ask a plain-language question in the "Projects - Field" search box and get a direct answer, including answers that live inside a project's Field Detail record. Before Phase 1 the search only matched the project list (number, name, city, scope) so a question like "who is my stone vendor for POET?" returned nothing, because the stone vendor lives inside the per-project detail, not in the list row.

Phase 1 runs entirely in the browser with no AI model. It reads a field-safe, money-scrubbed index of detail content, resolves project aliases and intent synonyms, and returns an answer card with the vendor and contact. It never returns any pricing.

## 2. Functional Requirements

### 2.1 Detail Content Index

| Item | Specification |
|------|---------------|
| Index file | `data/fo-detail-index.js` |
| Generator | `sync/build-fo-detail-index.js` |
| Contents | Vendors, contacts, materials labels, schedule milestones, safety links, QA/QC counts per project |
| Excluded | All financials. No pricing, no rates, no dollar values |
| Build behavior | Money is scrubbed at build time by the generator before the index is written |

### 2.2 Search Behavior

| Capability | Description |
|------------|-------------|
| List match | Continues to match project number, name, city, and scope |
| Detail match | Reads inside `fo-detail-index.js` for vendors, contacts, materials, milestones, safety, QA/QC |
| Synonym / intent map | stone / rock / aggregate, fuel, trucking, equipment resolve to the same intent |
| Project alias resolution | Friendly names resolve to project numbers (example: POET -> 26-002) |
| Answer cards | Returns a direct answer card with vendor plus contact |
| Pricing guard | Never returns any pricing, at build time or render time |

### 2.3 Example Resolution

```
Question: "who is my stone vendor for POET?"
  alias:  POET -> 26-002
  intent: stone / rock / aggregate -> material vendor (stone)
  lookup: fo-detail-index[26-002].vendors.stone
  result: answer card with stone vendor + contact, zero pricing
```

## 3. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Execution | In-browser, no AI model, no network round trip for Phase 1 |
| Latency | Instant, reads a pre-built local index |
| Data classification | field_ops role only, zero financials |
| Browser Support | Chrome, Edge, Safari (latest 2 versions) |
| Mobile | Responsive, field users search on a phone |

## 4. Security and RBAC

| Control | Specification |
|---------|---------------|
| Role | field_ops |
| Financials | Zero. None reachable through this feature |
| Build-time scrub | Generator strips money before writing the index |
| Render-time scrub | Render path strips money as a second guard |
| Known landmine | The `$22.50/TN` value in a vendor note is stripped |
| RBAC classification | Declared in `functions/lib/auth.js` |
| Data-classification guard | SEC-15 passes, 6/6 clean |
| RBAC suite | 778 passed, 0 failed |

## 5. Verification Evidence

| Claim | Evidence |
|-------|----------|
| Built and deployed | Commit 2172b98, LIVE in production |
| Money scrubbed both layers | SEC-15 data-classification guard 6/6 clean |
| RBAC correct | rbac suite 778/0 |
| Triple-check passed | security-auditor, reviewer, and qa-engineer all reviewed and approved |

## 6. Phase 2 (Planned / Approach Decided)

A natural-language "AI companion" that fires only when Phase 1 cannot resolve a question. Per Melanie's meeting with Corey and Brad on 2026-06-30, the companion will run on Corey's own inference layer, HERMES (model M2.7), not PureBrain and not Claude. The driver is cost and reducing Anthropic dependency. The model never touches raw data, answers are retrieval-grounded, and output stays field-safe (no financials).

PureBrain is not the field-ops companion. PureBrain stays as the full-access tool for the ADMIN tier only (Brad, Derek, Jonathan).

Work split for Phase 2:

| Owner | Responsibility |
|-------|----------------|
| Corey (with True Bearing) | Owns and builds the Hermes back end |
| Peter | Builds the field-ops front end |
| Melanie and Corey | Meld the front end and Hermes back end together |

Design sketch is published at `platform/field-ops-phase2-sketch.html`. The front-end sample (login plus field home with the companion search box) is in progress now for the State of Pier Foundations meeting.

Status: Planned. Approach decided. Not built.

## 7. Integration Points

| System | Integration | Priority |
|--------|-------------|----------|
| Projects - Field list | Existing search box, extended | Required |
| Field Detail records | Source for `fo-detail-index.js` | Required |
| `functions/lib/auth.js` | RBAC classification | Required |
| Hermes (M2.7, Corey's inference layer) | Phase 2 field-ops companion back end | Phase 2 |
| PureBrain | ADMIN tier full-access tool, not the field-ops companion | Admin only |

## 8. Open Questions (For Brad/Jonathan)

1. Which additional detail fields should the index expose next (subcontractors, permits, inspection dates)?
2. Should the answer card link straight into the Field Detail record for that project?
3. When the Hermes back end is ready to meld with the front end, who approves the Phase 2 cutover?
4. Are there project alias names beyond the current set we should pre-load (nicknames crews actually use)?
