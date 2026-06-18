#!/usr/bin/env bash
# One-shot D1 setup for the PF Platform per-user auth backbone.
# Run AFTER the Cloudflare API token has D1 permission (see comments below).
#
# Prereqs:
#   - /home/aiciv/.env contains CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID,
#     and the token has the "D1 Edit" permission (Account scope).
#   - Run from the repo root: bash platform/migrations/SETUP-D1.sh
#
# What it does:
#   1) Creates the D1 database `pf-platform-db` (prints the database_id).
#   2) Reminds you to paste the database_id into platform/wrangler.toml and to
#      bind it on the Pages project (dashboard OR REST — see step 4).
#   3) Applies schema migration 0001 + the generated seed 0002 to the DB.
#   4) Prints the REST command to bind DB -> the pf-platform Pages project
#      (the same headless method used for the KV binding).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Load credentials.
set -a; . ./.env; set +a
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
WR="npx --yes wrangler@3"

echo "==> [1/4] Creating D1 database pf-platform-db ..."
echo "    (If this fails with 'Authentication error [10000]', the token lacks D1"
echo "     permission. In the Cloudflare dashboard: My Profile > API Tokens >"
echo "     edit the token used here > add permission 'Account > D1 > Edit' > save."
echo "     Then re-run this script.)"
$WR d1 create pf-platform-db || {
  echo "!! D1 create failed. See the note above about adding D1 Edit permission."
  exit 1
}

echo
echo "==> [2/4] IMPORTANT: copy the database_id printed above into:"
echo "      platform/wrangler.toml  ->  [[d1_databases]] database_id = \"...\""
echo "    Press ENTER once you've pasted it (needed for execute/bind)."
read -r _

echo "==> [3/4] Applying schema migration 0001_init.sql to D1 (remote) ..."
$WR d1 execute pf-platform-db --remote --file=platform/migrations/0001_init.sql

if [ -f platform/migrations/0002_seed_users.sql ]; then
  echo "==> Applying seed 0002_seed_users.sql ..."
  $WR d1 execute pf-platform-db --remote --file=platform/migrations/0002_seed_users.sql
else
  echo "!! 0002_seed_users.sql not found. Generate it first:"
  echo "     node platform/migrations/seed-users.mjs"
  echo "   (it prints the temp passwords). Then re-run this script or apply manually."
fi

echo
echo "==> [4/4] Bind D1 to the Pages project (pf-platform), binding name DB."
echo "    Option A (dashboard): Pages > pf-platform > Settings > Functions >"
echo "      D1 database bindings > Add: Variable name = DB, Database = pf-platform-db"
echo "      (add to BOTH Production and Preview)."
echo
echo "    Option B (REST, headless — matches how KV was bound). Replace DBID:"
cat <<'EOF'
      DBID="<paste database_id>"
      curl -s -X PATCH \
        "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/pf-platform" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "{\"deployment_configs\":{\"production\":{\"d1_databases\":{\"DB\":{\"id\":\"${DBID}\"}}},\"preview\":{\"d1_databases\":{\"DB\":{\"id\":\"${DBID}\"}}}}}" \
        | python3 -m json.tool
EOF
echo
echo "    The binding activates on the NEXT deploy. (Do NOT deploy here — Brad/Peter"
echo "    handle cutover deploys after the security review.)"
echo
echo "DONE. Verify: npx wrangler@3 d1 execute pf-platform-db --remote \\"
echo "      --command \"SELECT email, role, active, must_reset FROM users;\""
