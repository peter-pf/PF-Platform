# PF Platform — Product Team Charter

**Version:** 1.0
**Date:** June 4, 2026
**Owner:** Peter (AI COO)
**Status:** Proposed — for Brad's review

---

## Mission

Build, verify, and carry the PF Operations Platform from Alpha to Production (v1.0) — and keep it accurate, secure, and genuinely useful to the team. Every number the platform shows must be one a partner can stand on.

---

## How the team is organized

Peter (COO) conducts; specialists do the work in their lane. Three working lanes plus orchestration.

### Lane 1 — Build & Design
| Agent | Owns | Used for (proven) |
|-------|------|-------------------|
| **architect** | System structure, data flow, big decisions before code | Platform module structure |
| **coder** | Implementation, refactors, calculations | Estimating rebuild, KPI centralization, XSS hardening, doc embedding |
| **web-dev** | Frontend/UI modules, layout, interactions | Dashboard, pipeline, equipment, and other modules |

### Lane 2 — Quality & Verification (the mandatory double-check)
| Agent | Owns | Used for (proven) |
|-------|------|-------------------|
| **qa-engineer** | Functional/calculation testing, edge cases | Verified estimator vs template (0.0166%) |
| **reviewer** | Code correctness & quality review | Reviewed email tool + platform changes |
| **security-auditor** | Vulnerabilities, secrets, auth | Caught the forgeable auth token |

### Lane 3 — Research & Intelligence (feeds the product real data)
| Agent | Owns | Used for (proven) |
|-------|------|-------------------|
| **general-purpose** | Document analysis, decoding source files | Read geotech reports for feasibility; decoded the estimate template |
| **claim-verifier** | Fact-checking online-sourced intel | Caught the Mortenson/Holder GC error |
| **researcher / web-researcher** | Market, competitor, regulatory research | Competitor refresh, data-center leads |

### Orchestration
- **Peter (COO)** — decides what gets built, in what order; synthesizes; talks to Brad/Jonathan/Derek; runs the dev-cycle.
- **Team leads** (dev, web-frontend) — available to coordinate larger multi-agent pushes.

---

## Build Sequence Principle — Visuals First, Then Backend (Brad, June 4, 2026)

**We build and approve the visual platform first; we connect the backend only after Brad and Jonathan green-light the features.**

Why: this prevents building backend plumbing for things we don't need. Requirements get locked by approving what you can see and click; *then* agents wire the backend to exactly those approved features — nothing speculative, nothing wasted.

In practice:
1. **Frontend first.** Build every feature as a working visual — including the buttons/controls for things that will eventually write data (e.g., a "move bid status" control, an upload spot). They look and behave right, even if not yet wired.
2. **Green-light gate.** Brad + Jonathan review and approve the visual features (Alpha → UAT).
3. **Then backend.** Once approved, the Backend/Integration Engineer connects the plumbing — write-back to SharePoint, QuickBooks/GUHMA/Kreo connections — to exactly the approved features.
4. No backend is built for a feature that hasn't been approved.

*(Bridge exception: a no-backend stopgap is fine where it adds value now — e.g., the alpha-feedback "Send to Peter" button uses email, no backend. These don't pre-commit us to anything.)*

The **Backend / Integration Engineer therefore comes in AFTER visual green-light**, not before.

---

## How work flows through the team (the dev-cycle + verification BOOPs)

1. **Design** — architect (for anything structural).
2. **Build** — coder / web-dev.
3. **Self-check** — the builder verifies with a runnable test (never "looks done").
4. **Deploy** — Peter deploys.
5. **Independent verification** — qa-engineer + reviewer (and security-auditor for anything touching auth/data). Mandatory before a build is considered solid.
6. **Document** — SRS/SOW updated.
7. **Commit + push** — durable and reviewable.
8. **Stage-gate** — Alpha → UAT/stress (Jonathan + Derek) → Beta → Production.

No build is "done" until it's verified, documented, and pushed.

---

## Gaps to fill before UAT (proposed additions)

The session keeps surfacing the same missing capabilities. Recommend standing up:

1. **Backend / Integration Engineer (HIGH priority — but engaged AFTER visual green-light).** The platform is read-only today. Almost every new request needs *write-back*: change a bid's status, deliver feedback, persist data, accept a geotech upload, sync QuickBooks/GUHMA/Kreo. A dedicated backend specialist (Cloudflare Functions + storage + SharePoint write-back) unlocks all of it — but per the Build Sequence Principle, this work starts only once Brad + Jonathan approve the visual features, so we build backend for exactly what's needed and nothing more.
2. **Geotech / Estimating Specialist.** Feasibility reads and estimate accuracy are core to winning work and are being vetted against PF's engineer. A dedicated domain specialist (vs. general-purpose) would sharpen these and own the GUHMA QC and Kreo-takeoff work.
3. **UI/UX Designer.** As we head into UAT, look-and-feel and usability feedback will come fast. A design specialist owns the platform's polish, consistency, and the "we want to use it, not dread it" standard.

Lower priority / as-needed: a **data engineer** (reporting/benchmarks from the 25-project history) and a **DevOps** specialist (deploy pipeline hardening).

---

## What I'd ask of you, Brad

- Confirm the three lanes + the proposed additions (especially the **Backend/Integration Engineer** — it's the recurring blocker).
- Tell me if you want each specialist as a dedicated, named team member (with its own memory and identity) or invoked as-needed.
- Anything you'd add, cut, or re-prioritize.

Once you steer, I'll formalize the team and assign clear owners so that as Jonathan and Derek start UAT, every piece of feedback has a name attached to it.
