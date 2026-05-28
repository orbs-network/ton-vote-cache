#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${PM2_APP_NAME:-ton-vote-cache}"
BRANCH="${DEPLOY_BRANCH:-main}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --only "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --only "$APP_NAME" --update-env
fi

pm2 save
pm2 status "$APP_NAME"
