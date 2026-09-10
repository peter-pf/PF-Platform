#!/usr/bin/env bash
#
# PF Platform deploy gate. The ONE way to deploy the platform.
#
# Why this exists: the build protocol says docs ship WITH the feature (SRS/SOW/
# MANUAL), but under fast iteration that step gets skipped because nothing forces
# it. This wrapper makes the docs step mechanical: if you changed platform
# FEATURE code (functions/ or index.html or a new top-level .html page) but did
# not touch docs/, it BLOCKS the deploy until you either update the docs or pass
# --docs-done to make the skip a conscious, logged choice (trivial mod / data sync).
#
# Usage:
#   ./deploy.sh                 # deploy, with the docs gate enforced
#   ./deploy.sh --docs-done     # acknowledge no docs needed (trivial mod / data sync)
#   ./deploy.sh --dry-run       # run the gate + clean-copy, but DO NOT deploy
#   ./deploy.sh --branch main   # branch override (default: main = PRODUCTION)
#
# Always deploys to --branch main (production) unless overridden. Verifies the
# canonical deployment is env=production after deploy, then checks the auth gate.

set -euo pipefail

REPO="/home/aiciv/PF-Platform"
PLATFORM="$REPO/platform"
ENV_FILE="/home/aiciv/.env"
BRANCH="main"
DOCS_DONE=0
DRYRUN=0

# Recognized deploy targets. A --branch value MUST match one of these or the
# deploy FAILS LOUDLY (see the branch-trap fix below). 'main' = PRODUCTION.
is_recognized_branch() {
  case "$1" in
    main|website-build-*) return 0 ;;
    *) return 1 ;;
  esac
}

# BRANCH-TRAP FIX (2026-09-10): the previous loop treated `--branch` as a no-op
# and swallowed any unrecognized branch VALUE via `*) ;;`, leaving BRANCH="main"
# (PRODUCTION). That is exactly how the budget_actuals daemon's staging branch
# deployed to prod (July incident). Now we CAPTURE the value after --branch and
# VALIDATE it; an unrecognized branch aborts the deploy instead of silently
# publishing to production.
EXPECT_BRANCH_VALUE=0
BRANCH_EXPLICIT=""
for a in "$@"; do
  if [ "$EXPECT_BRANCH_VALUE" -eq 1 ]; then
    BRANCH_EXPLICIT="$a"
    EXPECT_BRANCH_VALUE=0
    continue
  fi
  case "$a" in
    --docs-done) DOCS_DONE=1 ;;
    --dry-run)   DRYRUN=1 ;;
    --branch)    EXPECT_BRANCH_VALUE=1 ;;   # the NEXT arg is the branch value
    main|website-build-*) BRANCH="$a" ;;    # bare positional target (back-compat)
    -*)
      echo "  X DEPLOY BLOCKED: unknown flag '$a'." >&2
      exit 4 ;;
    *)
      echo "  X DEPLOY BLOCKED: unrecognized argument '$a'." >&2
      echo "     A stray argument will NOT be silently deployed to production." >&2
      exit 4 ;;
  esac
done

# If --branch was given without a following value, abort (do NOT default to prod).
if [ "$EXPECT_BRANCH_VALUE" -eq 1 ]; then
  echo "  X DEPLOY BLOCKED: --branch given with no branch value." >&2
  exit 4
fi

# Validate an explicit --branch value. Unrecognized => FAIL LOUDLY (no prod deploy).
if [ -n "$BRANCH_EXPLICIT" ]; then
  if is_recognized_branch "$BRANCH_EXPLICIT"; then
    BRANCH="$BRANCH_EXPLICIT"
  else
    echo "  X DEPLOY BLOCKED: unrecognized --branch '$BRANCH_EXPLICIT'." >&2
    echo "     Recognized targets: main | website-build-*" >&2
    echo "     (This guard replaces the old silent fall-through that deployed" >&2
    echo "      any unknown branch straight to PRODUCTION main — the July incident.)" >&2
    exit 4
  fi
fi

# Final belt-and-suspenders: whatever BRANCH ended up as, it must be recognized.
if ! is_recognized_branch "$BRANCH"; then
  echo "  X DEPLOY BLOCKED: resolved branch '$BRANCH' is not a recognized target." >&2
  exit 4
fi

cd "$REPO"

# SAFETY GUARD (2026-07-30): the budget_actuals_daemon was accidentally auto-started
# by the watchdog and deployed STAGED code to production, because deploy.sh silently
# maps any non-'main|website-build-*' --branch to main. The (still-running, cannot-be-
# killed) daemon invokes deploy.sh with '--branch budget-actuals-sync-20260730'. We
# block ONLY that invocation while the STOP sentinel exists, so the daemon can no
# longer publish, while normal deploys to main are unaffected.
for _a in "$@"; do
  case "$_a" in
    budget-actuals-*)
      if [ -f "/home/aiciv/tools/.budget-actuals-daemon-STOP" ]; then
        echo "  X DEPLOY BLOCKED: budget-actuals staging hold (STOP sentinel present)." >&2
        exit 3
      fi ;;
  esac
done

echo "============================================================"
echo " PF DEPLOY GATE"
echo "============================================================"

# ---- 1) DOCS GATE -------------------------------------------------------------
# Feature code = functions/, index.html, or a NEW top-level platform/*.html page.
# Data-only changes (data/*.js, data/*.json) and memories/ do NOT require docs.
FEATURE_CHANGES="$(git status --porcelain -- \
    platform/functions platform/index.html 2>/dev/null | grep -E 'functions/|index\.html' || true)"
# New/changed top-level platform html pages (e.g. field-sample.html)
HTML_CHANGES="$(git status --porcelain -- platform 2>/dev/null \
    | grep -E ' platform/[^/]+\.html$|^\?\? platform/[^/]+\.html$' || true)"
FEATURE_CHANGES="$(printf '%s\n%s\n' "$FEATURE_CHANGES" "$HTML_CHANGES" | sed '/^$/d' | sort -u || true)"
DOCS_CHANGES="$(git status --porcelain -- docs 2>/dev/null || true)"

if [ -n "$FEATURE_CHANGES" ] && [ -z "$DOCS_CHANGES" ] && [ "$DOCS_DONE" -eq 0 ]; then
  echo ""
  echo "  X  DOCS GATE: platform feature code changed but no docs/ updates are staged."
  echo "  ---------------------------------------------------------------"
  echo "$FEATURE_CHANGES" | sed 's/^/      /'
  echo "  ---------------------------------------------------------------"
  echo "  A build is NOT done until its docs track reality. Either:"
  echo "    1) Update docs/{module}/SRS.md + SOW.md + MANUAL.md to match, then re-run, OR"
  echo "    2) Re-run with --docs-done if docs are genuinely not needed"
  echo "       (a trivial mod, a label fix, or a pure data sync)."
  echo ""
  exit 2
fi

if [ -n "$FEATURE_CHANGES" ] && [ "$DOCS_DONE" -eq 1 ] && [ -z "$DOCS_CHANGES" ]; then
  echo "  !  Docs gate OVERRIDDEN (--docs-done). Logging the conscious skip."
fi
echo "  ok docs gate passed"

# ---- 2) CLEAN COPY + DEPLOY ---------------------------------------------------
set -a; . "$ENV_FILE"; set +a
: "${CLOUDFLARE_API_TOKEN:?missing in .env}"; : "${CLOUDFLARE_ACCOUNT_ID:?missing in .env}"

STAGE="$(mktemp -d /tmp/pf-deploy.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
rsync -a \
  --exclude 'sync' --exclude '.wrangler' --exclude 'downloads' \
  --exclude 'migrations' --exclude '*.toml' --exclude 'memories' \
  --exclude '.claude' \
  "$PLATFORM/" "$STAGE/"

if [ "$DRYRUN" -eq 1 ]; then
  echo "  ok dry-run: clean copy staged at $STAGE (NOT deployed). Files: $(find "$STAGE" -type f | wc -l)"
  exit 0
fi

echo "  -> deploying to --branch $BRANCH ..."
( cd "$STAGE" && npx wrangler pages deploy . --project-name pf-platform --branch "$BRANCH" ) \
  | tail -4

# ---- 3) VERIFY CANONICAL (production) -----------------------------------------
echo "  -> verifying canonical deployment ..."
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/pf-platform" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['result']['canonical_deployment']; t=d['deployment_trigger']['metadata']['branch']; e=d['environment']; print('     canonical: env=%s branch=%s created=%s' % (e,t,d['created_on'])); sys.exit(0 if e=='production' else 1)" \
  || { echo "  X  canonical is NOT production. Investigate."; exit 3; }

# ---- 4) AUTH GATE CHECK -------------------------------------------------------
CODE="$(curl -s -o /dev/null -w '%{http_code}' https://pf-platform.pages.dev/)"
echo "     auth gate on root: HTTP $CODE (expect 401)"

# ---- 5) DEFINITION OF DONE REMINDER ------------------------------------------
echo ""
echo "  DEPLOYED. Definition of Done remaining:"
echo "    [ ] commit + push the feature files (git add ...; git commit; git push origin website-build-20260609)"
echo "    [ ] docs/{module}/ SRS + SOW + MANUAL updated (the gate checked this)"
echo "    [ ] log the build to memory (handoff commit ref + spec)"
echo "============================================================"
