# PF Platform — Release Protocol

**Version:** 1.0
**Date:** June 23, 2026
**Prepared by:** Peter (AI COO)

Formalizes how changes ship to the PF Operations Platform. Operates **inside** the stage gates in `docs/PLATFORM-RELEASE-STAGES.md` and the `build-protocol` rules. A release is **not done** until every gate below passes.

---

## 1. Versioning (SemVer)

The platform carries a SemVer version: **MAJOR.MINOR.PATCH**, recorded in `CHANGELOG.md`.

| Bump | When |
|------|------|
| **MAJOR** | Breaking change to how users work or to the data/auth model (e.g., shared-gate → per-user cutover complete, a module family redesign) |
| **MINOR** | New module, new panel, new capability — backward compatible |
| **PATCH** | Bug fix, copy/label change, data refresh, security patch |

**Tie to release stages.** The current platform is **Alpha, entering UAT** per PLATFORM-RELEASE-STAGES.md. Until Production v1.0, versions stay in the `0.x` line and carry a stage suffix in the changelog header (e.g., `0.9.0 — Alpha/UAT`). The **first Production release is v1.0.0** and only happens after Beta completes (2 weeks daily use, no critical issues) and the manual is written.

## 2. Branch Strategy

- **Working branch:** `website-build-20260609`. All feature and fix work lands here.
- **Pull requests:** changes merge via PR. Brad approves merges that go toward `main`.
- **`main` is protected — NEVER commit directly to `main`.** (Constitution, Article VII.)
- Tag each released version on the working branch: `git tag v0.9.0` (lightweight tags are fine until Production).

## 3. The Release Pipeline (Gates — in order)

Each gate has an owner (see TEAM-CHARTER.md). The Release Manager confirms each before the next.

```
1. SEARCH-FIRST   → check memory/docs; don't rediscover or duplicate            [Peter]
2. BUILD          → implement the change on the working branch                  [devops-engineer / web-dev]
3. SELF-CHECK     → runnable EXTERNAL test + evidence (curl / headless / node)  [QA gate: qa-engineer]
4. TRIPLE-REVIEW  → reviewer (correctness) + security-auditor + qa-engineer     [Correctness/Security/QA gates]
                    (right-sized: trivial static edits skip full review but
                     still verify security properties)
5. DOCS UPDATED   → SRS/SOW for new capability; manual.html / training.html /   [Peter]
                    onboarding.html for user-facing change; MEMORY index
6. DEPLOY         → run the deploy recipe (§5); confirm wrangler success lines  [Deploy gate: devops-engineer]
7. POST-DEPLOY    → gate verification: curl 401 unauthenticated on root + new   [Observability/Security gates]
                    routes; authenticated smoke test of /api/me + one module
8. CHANGELOG      → add the entry (Keep-a-Changelog format) with version + date [Release Manager]
9. GIT            → commit + push to working branch with Co-Authored-By trailer;[Release Manager]
                    tag the version; confirm origin updated
```

**No gate may be skipped.** If a gate fails, the release stops and returns to the relevant owner. Docs ship **with** the feature in the same work block (docs are a gate, not a follow-up).

## 4. Self-Check Requirement (Gate 3)

Per `self-check-mandate`: never report a change done without a **runnable external test and its evidence**. For this platform that means at minimum:

- `curl -sS -o /dev/null -w "%{http_code}" https://pf-platform.pages.dev/` → **401** (gate holds with no creds)
- Authenticated request (valid signed cookie or Basic Auth) to the changed page/endpoint → **200** + expected content
- For RBAC changes: re-run `platform/migrations/test-rbac.mjs` and `platform/migrations/check-data-classification.mjs`

Paste the command + output as evidence. "Should work" is not evidence.

## 5. Deploy Recipe (verbatim)

The platform is a Cloudflare Pages project (`pf-platform`) whose build output dir is the **repo root** (`wrangler.toml: pages_build_output_dir = "."`). Because the repo root contains files that must **never** be public (migrations with password hashes, `*.toml` with the D1 id, `*.xlsx`/`*.xlsm` source data, `.py` tools, `memories/`, `.claude/`), we deploy from a **clean copy**, not the repo directly.

```bash
# 1. Stage a clean copy, EXCLUDING anything that must not be public
rm -rf /tmp/pf-clean-deploy && mkdir -p /tmp/pf-clean-deploy
rsync -a \
  --exclude 'sync/' \
  --exclude 'migrations/' \
  --exclude 'memories/' \
  --exclude '.claude/' \
  --exclude '*.toml' \
  --exclude '*.xlsx' \
  --exclude '*.xlsm' \
  --exclude '*.py' \
  /home/aiciv/PF-Platform/platform/ /tmp/pf-clean-deploy/

# 2. SANITY CHECK before deploy — these MUST return nothing:
find /tmp/pf-clean-deploy -name '*.sql' -o -name '*.toml' -o -name '*.xlsx' -o -name '*.xlsm' -o -name '*.py'
ls /tmp/pf-clean-deploy/migrations 2>/dev/null && echo "STOP: migrations present — DO NOT DEPLOY" || echo "OK: no migrations dir"

# 3. Deploy from INSIDE the clean dir
cd /tmp/pf-clean-deploy
npx -y wrangler@3 pages deploy . --project-name=pf-platform --commit-dirty=true

# 4. Confirm wrangler printed ALL THREE:
#    "Compiled Worker successfully"  +  "Uploading Functions bundle"  +  "Deployment complete"
```

> **CRITICAL — never deploy password hashes.** Migration files (`platform/migrations/*.sql`, `seed-users.mjs`) contain or generate password hashes and the D1 schema. They MUST NOT reach the public web root. Step 2's sanity check is mandatory and blocking. If anything is found, STOP.

> **Bindings are NOT set by `wrangler.toml` for this Pages project.** The D1 (`DB`) and KV (`PF_SCHEDULE`) bindings are the authoritative ones on the Pages project (dashboard: Settings → Functions, or via REST in `platform/migrations/SETUP-D1.sh`). Deploying does not change bindings. If a binding breaks, fix it on the project, not by editing the toml.

## 6. Post-Deploy Gate Verification (Gate 7)

```bash
# Gate holds — unauthenticated root must be 401
curl -sS -o /dev/null -w "root unauth -> %{http_code}\n" https://pf-platform.pages.dev/

# New/changed routes also gated
curl -sS -o /dev/null -w "%{http_code}\n" https://pf-platform.pages.dev/<new-route>

# Authenticated smoke test (replace COOKIE with a valid signed session)
curl -sS -H "Cookie: pf_session=<COOKIE>" https://pf-platform.pages.dev/api/me
```

Expected: root and new routes return **401** with no creds; `/api/me` returns the logged-in user JSON with a valid cookie. Record results in the deploy log (see LOGGING-MONITORING.md).

## 7. Rollback Plan

**Cloudflare Pages (front end + Functions):** Pages keeps every prior deployment immutable. To roll back a bad release:

- **Dashboard:** Pages → `pf-platform` → Deployments → pick the last known-good deployment → **Rollback to this deployment**. This is instant and does not rebuild.
- **CLI / API:** `npx wrangler@3 pages deployment list --project-name=pf-platform` to find the good deployment id, then roll back via the dashboard (rollback is a dashboard/API action). As a fallback, re-deploy the previous clean copy using §5.
- After rollback: re-run the §6 gate checks and log the rollback in the deploy log + CHANGELOG.

**D1 (database):** **Migrations are forward-only.** There is no automatic "down" migration. Safe stance:

- **Never** roll a D1 schema change back by dropping columns/tables — that risks data loss. Instead, ship a **forward fix** migration.
- Take a D1 export **before** any schema migration (see MAINTENANCE-SUPPORT.md backup routine) so the data is recoverable if a migration corrupts it.
- A code rollback (Pages) does **not** revert D1. If a release included a migration, a code rollback may run old code against the new schema — verify compatibility, and if incompatible, escalate to Brad before any destructive D1 action.

## 8. Definition of Done

A release is done only when: all 9 gates passed, the deploy showed all three wrangler success lines, the post-deploy gate returned 401 unauthenticated, the CHANGELOG has the entry, the commit is pushed to the working branch (origin confirmed), and the version is tagged. Otherwise it is **not** done.

---

## Related
- `docs/devops/TEAM-CHARTER.md`, `docs/devops/LOGGING-MONITORING.md`, `docs/devops/MAINTENANCE-SUPPORT.md`
- `docs/PLATFORM-RELEASE-STAGES.md`, `docs/platform-security/SRS.md`, `CHANGELOG.md`
