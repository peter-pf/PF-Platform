# PF Platform — Maintenance & Support

**Version:** 1.0
**Date:** June 23, 2026
**Prepared by:** Peter (AI COO)

Keeping the platform healthy: updates, backups, incident response, and how users get help. Runbook style. Owner: Peter (COO), executed via the DevOps team (TEAM-CHARTER.md).

---

## 1. Update Cadence

| Area | Cadence | Notes |
|------|---------|-------|
| **Live data refresh** (Bid Log, Project Master, Estimating, BD from SharePoint) | Weekly (or when Jonathan/Derek update source files) | Two-phase flow: Excel → portal now; portal → Excel backfill later. Runs as a small mod (self-check + gate + Git). |
| **Dependency review** | Monthly | The platform is dependency-light (vanilla JS SPA + Cloudflare Functions). Review `wrangler` major version and any added libs before bumping. |
| **Security review** | Monthly | `security-auditor` re-checks auth/RBAC/data classification + the SRS backlog (CSP, token revocation). |
| **Content/docs** | With each feature | SRS/SOW + manual.html/training.html ship with the change (docs are a gate). |

## 2. Backup Routine (D1 + KV)

> **This is the single most important safeguard to stand up first — there is no backup routine today.** The platform's per-user logins, roles, and audit history all live only in D1. One bad migration or accidental destructive command with no backup = unrecoverable.

### D1 export (the backup)

```bash
cd /home/aiciv/PF-Platform/platform

# Dated full SQL export of the live database
npx -y wrangler@3 d1 export pf-platform-db --remote \
  --output "/home/aiciv/PF-Platform/backups/pf-platform-db-$(date -u +%Y%m%d).sql"
```

- **Cadence (recommended):** **weekly**, and **always immediately before any D1 schema migration** (forward-only migrations can't be auto-reverted — RELEASE-PROTOCOL §7).
- **Where:** `/home/aiciv/PF-Platform/backups/` (dated files). This directory is **excluded from the public deploy** by the recipe (it sits at repo root, outside `platform/`, and `*.sql` is excluded anyway). **Never** deploy a backup file to the web root — it contains password hashes.
- **Retention:** keep the last ~8 weekly exports + every pre-migration export. Clean-and-sweep older ones.
- **Restore stance:** restoring is a destructive, irreversible operation against live auth data → **escalate to Brad before any restore.** Restore by applying the dated `.sql` to a fresh/empty D1, verify, then cut over — do not blind-overwrite live.

### KV (`PF_SCHEDULE`)

KV holds schedule/rate-limit state — transient, low value, self-rebuilds. No formal backup needed. If a key list is ever needed: `npx wrangler@3 kv:key list --namespace-id 6c8bd3b9bf3a464ca8d1a5d939231858`.

## 3. Incident Response

### Severity levels

| Sev | Definition | Examples | Notify |
|-----|------------|----------|--------|
| **SEV-1** | User-facing down OR data-loss / data-exposure risk | Site down, login broken, gate returns 200 unauthenticated, restricted data reachable | **Brad immediately** (portal channel) |
| **SEV-2** | Degraded — works but wrong/broken for some users | A module errors, one role wrongly denied/allowed, data stale/incorrect | Brad same-day; fix via release pipeline |
| **SEV-3** | Minor — cosmetic or non-blocking | Label typo, layout glitch, slow panel | Batch into next release |

### First steps (any incident)

1. **Confirm scope** — reproduce with `curl`/browser; check is it everyone or one user/role.
2. **Check the gate first** — `curl -o /dev/null -w "%{http_code}" https://pf-platform.pages.dev/` must be 401. If it's 200, treat as SEV-1 data exposure immediately.
3. **Triage Functions errors** — `wrangler pages deployment tail` + dashboard logs (LOGGING-MONITORING §4). Most 500s are a missing D1 binding or env var.
4. **Contain, don't destroy** — if a recent deploy caused it, **roll back the Pages deployment** (RELEASE-PROTOCOL §7), which is instant and non-destructive. Do NOT touch D1 destructively.
5. **Escalate per severity** before any irreversible action.

### Hard rule (constitution)

**Never restart, rename, stop, or destroy infrastructure** — the D1 database, the Pages project, or any container — **without Brad's explicit approval, every time, with a confirmed backup.** This is irreversible and requires human sign-off. There is no "I'll just quickly..." exception.

## 4. Support Model

How Brad, the partners (Jonathan, Derek), and the field crew get help:

1. **Report channel:** issues go to **Peter via the PF portal channel** (same channel used today). For Alpha/UAT, the platform's "Send Answers to Peter" feedback button (alpha-review page) also routes structured feedback to Peter.
2. **Triage:** Peter assigns a severity and routes to the right specialist:
   - Bug / broken behavior → `reviewer` + `qa-engineer` (then a fix release).
   - Auth / access / "I can't log in" / wrong data visible → `security-auditor` + Peter (RBAC/auth).
   - Deploy / site-down → `devops-engineer` (rollback + redeploy).
   - Wrong business data → confirm against the SharePoint source, then data refresh.
3. **Close the loop:** every fix goes through the release pipeline (so it's tested, logged, documented, and pushed) and the reporter is told what changed.

## 5. Recommended Recurring Routines — NEED BRAD'S APPROVAL TO SCHEDULE

These are **proposals**, not active jobs. **No cron jobs are created here** — scheduling is Brad's call.

| Routine | Suggested cadence | What it does | Owner |
|---------|-------------------|--------------|-------|
| **Platform health check** | Weekly | Run the §3 gate + `/api/me` smoke test; log result to the deploy log | devops-engineer |
| **D1 backup** | Weekly + before every migration | `wrangler d1 export` to a dated file in `backups/` | devops-engineer |
| **Pre-release full gate** | Every release (event-driven) | Run all 9 release gates (RELEASE-PROTOCOL §3) | Release Manager (Peter) |
| **Monthly security review** | Monthly | `security-auditor` re-checks auth/RBAC/data classification + SRS backlog | security-auditor |
| **Data refresh** | Weekly (or on source change) | Pull latest SharePoint files into platform data layer | Peter / web-dev |

> **First concrete safeguard to stand up: the weekly D1 backup.** It's the cheapest insurance against the highest-impact failure (loss of auth/user/audit data) and unblocks safe schema migrations.

---

## Related
- `docs/devops/TEAM-CHARTER.md`, `docs/devops/RELEASE-PROTOCOL.md`, `docs/devops/LOGGING-MONITORING.md`
- `docs/PLATFORM-RELEASE-STAGES.md`, `docs/platform-security/SRS.md`
