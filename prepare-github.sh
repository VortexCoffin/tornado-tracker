#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$ROOT/../tornado-tracker-github}"

log() {
  echo "$*"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

command -v rsync >/dev/null 2>&1 || fail "rsync is required"

rm -rf "$OUT"
mkdir -p "$OUT"

log "Building GitHub-ready folder at:"
log "  $OUT"
log ""

rsync -a \
  --exclude '.git/' \
  --exclude 'tornado-tracker/' \
  --exclude 'node_modules/' \
  --exclude 'frontend/node_modules/' \
  --exclude 'frontend/dist/' \
  --exclude 'backend/.env' \
  --exclude 'backend/deploy.log' \
  --exclude 'backend/deploy.pid' \
  --exclude 'Caddyfile' \
  --exclude '*.log' \
  --exclude 'backend/data/users.json' \
  --exclude 'backend/data/notifications.json' \
  --exclude 'backend/data/paypal-plans.json' \
  --exclude 'backend/data/paypal-pending.json' \
  --exclude 'backend/data/recent-tornadoes-cache.json' \
  --exclude 'backend/data/past-tornadoes.json' \
  --exclude 'backend/data/accounts/' \
  --exclude 'backend/data/storms/' \
  "$ROOT/" "$OUT/"

mkdir -p "$OUT/backend/data/accounts" "$OUT/backend/data/storms"
touch "$OUT/backend/data/.gitkeep" \
  "$OUT/backend/data/accounts/.gitkeep" \
  "$OUT/backend/data/storms/.gitkeep"

chmod +x "$OUT/deploy.sh" "$OUT/stop.sh" "$OUT/launch-web.sh" "$OUT/start.sh" "$OUT/prepare-github.sh" 2>/dev/null || true

log "Done. Safe to upload:"
log ""
find "$OUT" -maxdepth 2 -type d | sort | sed 's/^/  /'
log ""
log "NOT included (keep these private):"
log "  backend/.env"
log "  backend/data/* (user accounts, photos, cache)"
log "  node_modules / frontend/dist"
log ""
log "Upload to GitHub:"
log "  cd $OUT"
log "  git init"
log "  git add ."
log "  git commit -m \"Initial commit\""
log "  git branch -M main"
log "  git remote add origin git@github.com:VortexCoffin/tornado-tracker.git"
log "  git push -u origin main"