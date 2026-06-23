# PF Platform — Logging & Monitoring

**Version:** 1.0
**Date:** June 23, 2026
**Prepared by:** Peter (AI COO)

What we log, what we watch, and how to triage. Runbook style. Owner: Monitoring/Logging role (`devops-engineer` + Peter) — see TEAM-CHARTER.md.

---

## 1. Application Audit Log (D1 `audit_log`)

Auth and (future) edit events are written to the `audit_log` table in D1 (`pf-platform-db`, id `cf66893b-9b5c-4731-9046-880e25728a4e`).

**Schema** (from `platform/migrations/0001_init.sql`):

| Column | Meaning |
|--------|---------|
| `id` | autoincrement |
| `user_id` | FK to `users.id` (NULL for failed/anon events) |
| `action` | `login` \| `logout` \| `edit` \| ... |
| `detail` | free-form context (e.g., failure reason) |
| `ts` | ISO timestamp (**UTC** — convert to Eastern before quoting to Brad) |

Indexed on `user_id` and `ts`.

**Query it** (read-only; run from the repo so wrangler picks up config):

```bash
cd /home/aiciv/PF-Platform/platform

# Recent activity (last 50 events, newest first)
npx -y wrangler@3 d1 execute pf-platform-db --remote \
  --command "SELECT ts, action, user_id, detail FROM audit_log ORDER BY ts DESC LIMIT 50;"

# Failed logins in the last 7 days (security watch)
npx -y wrangler@3 d1 execute pf-platform-db --remote \
  --command "SELECT ts, detail FROM audit_log WHERE action='login' AND user_id IS NULL ORDER BY ts DESC LIMIT 50;"

# Who has actually logged in per-user (cutover progress)
npx -y wrangler@3 d1 execute pf-platform-db --remote \
  --command "SELECT u.email, MAX(a.ts) AS last_login FROM audit_log a JOIN users u ON u.id=a.user_id WHERE a.action='login' GROUP BY u.email;"

# Password resets (confirm a real reset happened before re-seeding)
npx -y wrangler@3 d1 execute pf-platform-db --remote \
  --command "SELECT ts, user_id, detail FROM audit_log WHERE action LIKE '%reset%' ORDER BY ts DESC;"
```

> `--remote` hits the live D1. Omit it only for local dev. Read queries are safe; **never** run `DELETE`/`DROP`/`UPDATE` against `audit_log` or `users` without Brad's approval (escalation rule, TEAM-CHARTER §4).

## 2. Deploy Log

Every deploy is recorded so we always know what is live and can roll back to a known-good. The deploy log lives in **`CHANGELOG.md`** (versioned, human-readable) plus a quick-reference table appended at the bottom of this file.

Each deploy records: **date (UTC) · version · what changed · who ran it · gate result (curl code)**. The Release Manager adds the CHANGELOG entry at Gate 8; the Deploy Engineer appends the one-line deploy-log row below.

### Deploy Log (most recent first)

| Date (UTC) | Version | Change | By | Post-deploy gate |
|------------|---------|--------|----|------------------|
| 2026-06-18 | 0.9.0 | Per-user login + RBAC LIVE; PBKDF2 100k fix; clean-URL allow-list | Peter | root 401 PASS; per-user 200 verified |
| _(append new deploys above this line)_ | | | | |

## 3. Health / Uptime Checks

A lightweight, dependency-free check that the gate is holding and the app is up.

```bash
# Gate holding? Unauthenticated root MUST be 401 (not 200, not 5xx)
curl -sS -o /dev/null -w "%{http_code}\n" https://pf-platform.pages.dev/

# Authenticated smoke test of the API (valid signed session cookie)
curl -sS -H "Cookie: pf_session=<COOKIE>" https://pf-platform.pages.dev/api/me
```

**Interpretation:**

| Result | Meaning | Action |
|--------|---------|--------|
| root → **401** | Gate holding, site up | OK |
| root → **200** | Gate BYPASSED — data exposed | **SEV-1, escalate to Brad immediately** |
| root → **5xx** | App/Functions error or fail-closed misconfig | Triage (§5), check binding/env |
| `/api/me` → 200 + user | Auth + D1 working end to end | OK |
| `/api/me` → 401 with valid cookie | Session/secret issue | Check `PF_TOKEN_SECRET` env |
| `/api/me` → 500 | D1 binding or query error | Verify `DB` binding on Pages project |

**Recommended cadence:** automated/periodic **weekly** gate check at minimum (proposed in MAINTENANCE-SUPPORT.md — needs Brad's ok to schedule), plus a manual check as part of every post-deploy gate (RELEASE-PROTOCOL §6).

## 4. Error Capture & Triage (Cloudflare Functions)

Functions errors (login 500s, `/api/*` failures, middleware throws) surface in Cloudflare, not in the static assets.

```bash
# Live tail of Functions logs (run while reproducing the issue)
cd /home/aiciv/PF-Platform/platform
npx -y wrangler@3 pages deployment tail --project-name=pf-platform
```

Also available in the **Cloudflare dashboard → Pages → pf-platform → Functions / Logs**.

**Triage order for a Functions error:**
1. Is the **D1 `DB` binding** present on the Pages project (Settings → Functions)? A missing/broken binding throws at runtime (this was the root of the 0.9.0 login 500 — note Workers caps PBKDF2 at 100k iterations).
2. Are the **env vars** set and non-empty? `PF_TOKEN_SECRET`, `PF_AUTH_USER`/`PF_AUTH_PASS` (shared fallback). Missing → fail-closed 500 by design (this is correct behavior, not a bug).
3. Is the **KV `PF_SCHEDULE`** binding present (rate limit/schedule)?
4. Reproduce with `curl` and capture the response + the `wrangler tail` line. That pair is the evidence.
5. If it is user-facing-down or a data-exposure risk → **SEV-1, escalate to Brad** (MAINTENANCE-SUPPORT.md).

## 5. What We Deliberately Do NOT Log

- No plaintext passwords, ever (hashes only, PBKDF2). The audit `detail` field must never contain a password.
- No restricted business data (pricing, financials, GC contacts) in logs.
- Logs are reviewed by Peter; raw audit output is not surfaced to field_ops users.

---

## Related
- `docs/devops/RELEASE-PROTOCOL.md` (post-deploy gate), `docs/devops/MAINTENANCE-SUPPORT.md` (backups, incident response, cadences)
- `docs/platform-security/SRS.md` (auth/data controls), `CHANGELOG.md` (release + deploy history)
