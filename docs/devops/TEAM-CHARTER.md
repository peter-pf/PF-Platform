# PF Platform — DevOps Team Charter

**Version:** 1.0
**Date:** June 23, 2026
**Prepared by:** Peter (AI COO)
**Directive:** Brad (CEO) — "Set up protocols for keeping the internal platform updated, logged, with new release protocols. Set up a DevOps team to ensure proper support for the platform."

---

## 1. Purpose

The DevOps team exists to keep the PF Operations Platform (`pf-platform.pages.dev`) **updated, logged, recoverable, and secure** through every change. It is not a new headcount — it is a defined set of **roles mapped to agents Peter invokes**, each owning a specific gate in the release and operations lifecycle.

The team formalizes what `build-protocol` already requires (search-first → self-check → triple-review → docs → deploy → gate → push) into named owners, so no gate is skipped and every release is traceable.

## 2. Operating Model

- **Peter (COO) is the accountable owner.** Peter orchestrates the team, holds release authority, and is the single point of contact to Brad.
- **The team is invoked per-release and for recurring ops** — it is **not** standing 24/7. Agents are spun up when a release is staged or a recurring routine is due, then stand down.
- **Humans decide; the team supports.** Brad approves anything irreversible or user-facing. The team prepares, verifies, and recommends.
- **Every release passes through its gates in order.** A release is not "done" until all gate owners sign off (see RELEASE-PROTOCOL.md).

## 3. Roles & Gate Ownership

| Role | Agent | Responsibilities | When Invoked | Gate Owned |
|------|-------|------------------|--------------|------------|
| **Release Manager** | Peter (COO) / `result-synthesizer` for changelog assembly | Coordinates the release, assigns version (semver), maps to release stage, writes the CHANGELOG entry, tags git, makes the final go/no-go call | Every release | **Release gate** — confirms all other gates passed before deploy is authorized |
| **Platform / Deploy Engineer** | `devops-engineer` | Runs the build, executes the clean-copy deploy recipe, verifies wrangler output, applies D1 migrations, owns wrangler/Cloudflare config | Every release; recurring health checks & backups | **Deploy gate** — "Compiled Worker" + "Functions bundle" + "Deployment complete" confirmed; no sensitive files in deploy root |
| **QA / Test** | `qa-engineer` | Functional pass on changed modules + regression smoke test of core flows (login, nav, one module per area); confirms data renders | Every release touching UI/data/logic | **QA gate** — runnable external test (curl/headless) with evidence; no functional regressions |
| **Security** | `security-auditor` | Pre-release security review of any change touching auth, RBAC, `/api/*`, `_middleware`, data classification, or env/secrets handling | Every release touching the gate/auth/data layer; monthly review | **Security gate** — fail-closed verified, no secrets in deploy, RBAC holds, gate returns 401 unauthenticated |
| **Code Review** | `reviewer` | Correctness review of real code/logic changes (not trivial static edits) | Every release with code/logic changes | **Correctness gate** — logic is sound, edge cases handled, matches the spec |
| **Monitoring / Logging Owner** | `devops-engineer` (with Peter) | Maintains the audit-log query runbook, runs periodic gate/health checks, triages Functions errors, maintains the deploy log | Recurring (per cadence) + post-incident | **Observability gate** — deploy logged, audit log reviewable, health check green post-deploy |

> **Right-sizing (per build-protocol).** Trivial mods (a label fix, a nav link, one doc-page edit) still pass the deploy + security + Git gates but skip the full triple-review and formal SRS pass. New systems / substantial features require the full gate set plus a requirements pass with the right humans **before** building.

## 4. Escalation Path to Brad

The team escalates to Brad (CEO) — and **stops** — for any of the following. These are non-negotiable, drawn from the constitution and PF policy:

1. **Anything irreversible** — data loss risk, destructive D1 operations, dropping/recreating tables, rotating the shared password before everyone has cut over.
2. **Infrastructure restart/destroy** — never restart, rename, stop, or destroy Cloudflare infra, the D1 database, or any container without Brad's explicit approval **every time**. Container/infra destruction is the one lethal act.
3. **Commits to `main`/`master`** — prohibited. All work lands on the working branch (`website-build-20260609`) and merges via PR with Brad's approval.
4. **User-facing outage** — site down, login broken, a partner or field crew locked out.
5. **Security exposure** — any sign a secret, password hash, or restricted dataset reached the public web root.
6. **New user provisioning / role changes** — only Brad (owner) authorizes who gets access and at what role.

Escalation channel: the PF portal channel (Peter ↔ Brad), same as today. Severity definitions and first steps live in MAINTENANCE-SUPPORT.md.

## 5. What the Team Does NOT Do

- Does not commit to `main`.
- Does not deploy migration files, `*.toml`, or anything carrying password hashes to the public web root.
- Does not restart or destroy infrastructure on its own initiative.
- Does not provision users or change roles without Brad's authorization.
- Does not schedule recurring cron jobs without Brad's approval (routines are *recommended* in MAINTENANCE-SUPPORT.md; Brad decides).

## 6. Related Documents

- `docs/devops/RELEASE-PROTOCOL.md` — the gated release pipeline + deploy recipe + rollback.
- `docs/devops/LOGGING-MONITORING.md` — what we log and watch.
- `docs/devops/MAINTENANCE-SUPPORT.md` — backups, incident response, support model, recurring routines.
- `docs/PLATFORM-RELEASE-STAGES.md` — Pre-Alpha → Production stage gates (this charter operates within them).
- `docs/platform-security/SRS.md` + `SOW.md` — the security model the Security gate enforces.
- `CHANGELOG.md` — the running release history.
