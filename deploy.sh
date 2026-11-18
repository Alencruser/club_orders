#!/usr/bin/env bash
# Build the site and publish it to the folder Caddy serves for commandes.tsumo.dev.
# On the VPS:  git pull && ./deploy.sh      (another folder: TARGET=/path ./deploy.sh)
set -euo pipefail
cd "$(dirname "$0")"
TARGET="${TARGET:-/var/www/commandes}"
OUT=dist/club-orders/browser

npm ci --no-audit --no-fund
npx ng build
test -f "$OUT/index.html"

# --delay-updates: the new files all appear at the end, never half a site
rsync -a --delete --delay-updates "$OUT"/ "${TARGET:?}"/
echo "Site publié dans $TARGET"
