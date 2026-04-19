#!/usr/bin/env bash
# deploy.sh – pull latest code and rebuild containers.
# Called by the webhook server. Expects:
#   APP_REPO_DIR  – path to the checked-out repo (mounted from host)
#   REPO_BRANCH   – branch to deploy (default: main)
set -euo pipefail

REPO="${APP_REPO_DIR:?APP_REPO_DIR not set}"
BRANCH="${REPO_BRANCH:-main}"

echo "=== Deploy started at $(date -u +%FT%TZ) ==="

# Verify the repo exists
if [ ! -d "$REPO/.git" ]; then
  echo "ERROR: $REPO is not a git repository." >&2
  exit 1
fi

cd "$REPO"

echo "--- git fetch --all ---"
git fetch --all

echo "--- git checkout $BRANCH ---"
git checkout "$BRANCH"

echo "--- git pull origin $BRANCH ---"
git pull origin "$BRANCH"

# Rebuild and restart. `docker compose up --build` recreates only containers
# whose images or config changed, so an explicit `down` is unnecessary and
# would cause avoidable downtime.
echo "--- docker compose up -d --build --remove-orphans ---"
docker compose up -d --build --remove-orphans

echo "=== Deploy finished at $(date -u +%FT%TZ) ==="

