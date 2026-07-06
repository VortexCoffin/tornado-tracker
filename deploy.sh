#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

USE_HTTPS=false
DEPLOY_MODE="${DEPLOY_MODE:-auto}"
DOMAIN="${DOMAIN:-}"

for arg in "$@"; do
  case "$arg" in
    --https) USE_HTTPS=true ;;
    --native) DEPLOY_MODE=native ;;
    --docker) DEPLOY_MODE=docker ;;
    -h|--help)
      cat <<'EOF'
Canada Tornado Tracker — production deploy

Usage:
  ./deploy.sh                 Auto: Docker if available, otherwise native Node
  ./deploy.sh --docker        Force Docker deploy (http://localhost:5000)
  ./deploy.sh --native        Build frontend + run Node (no Docker)
  ./deploy.sh --https         Docker + Caddy TLS (set DOMAIN first)

Examples:
  ./deploy.sh
  DEPLOY_MODE=native ./deploy.sh
  DOMAIN=tornado.yourdomain.com ./deploy.sh --https
EOF
      exit 0
      ;;
  esac
done

log() {
  echo "$*"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_env() {
  if [ ! -f "$ROOT/backend/.env" ]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    fail "Created backend/.env — edit it, then run ./deploy.sh again"
  fi

  if ! grep -qE '^AUTH_SECRET=.{16,}' "$ROOT/backend/.env"; then
    fail "Set a long AUTH_SECRET in backend/.env before production deploy"
  fi

  mkdir -p "$ROOT/backend/data"
}

docker_compose_cmd() {
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      echo "docker compose"
      return 0
    fi
    if command -v docker-compose >/dev/null 2>&1; then
      echo "docker-compose"
      return 0
    fi
  fi
  return 1
}

docker_ready() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1
}

port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -q ":${port} "
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

wait_for_health() {
  local url="http://127.0.0.1:5000/api/health"
  log "Waiting for health check..."

  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if command -v curl >/dev/null 2>&1 && curl -fsS "$url" >/dev/null 2>&1; then
      curl -fsS "$url" || true
      echo ""
      log "Health check passed."
      return 0
    fi
    if node --input-type=module -e "
      fetch('$url')
        .then((r) => process.exit(r.ok ? 0 : 1))
        .catch(() => process.exit(1));
    " >/dev/null 2>&1; then
      node --input-type=module -e "
        const r = await fetch('$url');
        console.log(await r.text());
      " || true
      echo ""
      log "Health check passed."
      return 0
    fi
    sleep 2
  done

  log "Warning: health check did not pass yet."
  return 1
}

deploy_docker() {
  local compose
  compose="$(docker_compose_cmd)" || fail "Docker Compose not found. Install Docker or run: ./deploy.sh --native"

  if ! docker_ready; then
    fail "Docker is installed but the daemon is not running. Start Docker, or run: ./deploy.sh --native"
  fi

  if port_busy 5000; then
    log "Port 5000 is already in use."
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'canada-tornado-tracker'; then
      log "Stopping existing compose stack..."
      $compose down || true
      sleep 2
    elif pgrep -f "node .*backend/server.js" >/dev/null 2>&1; then
      fail "Stop the running backend first (Ctrl+C or kill the node process), then retry"
    else
      fail "Free port 5000 or change APP_PUBLISH in docker-compose.yml"
    fi
  fi

  log "Building production image..."
  $compose build

  if [ "$USE_HTTPS" = true ]; then
    [ -n "$DOMAIN" ] || fail "Set DOMAIN for HTTPS deploy, e.g. DOMAIN=tornado.yourdomain.com ./deploy.sh --https"

    if [ ! -f "$ROOT/Caddyfile" ]; then
      sed -e "s/__DOMAIN__/$DOMAIN/g" -e '/__EMAIL__/d' "$ROOT/Caddyfile.example" > "$ROOT/Caddyfile"
      log "Created Caddyfile for $DOMAIN"
    fi

    log "Starting app + Caddy (HTTPS)..."
    APP_PUBLISH=127.0.0.1:5000:5000 $compose --profile https up -d
    log "Deployed: https://$DOMAIN"
  else
    log "Starting app..."
    $compose up -d
    log "Deployed: http://localhost:5000"
  fi

  wait_for_health || log "Check logs with: $compose logs -f app"
}

deploy_native() {
  command -v node >/dev/null 2>&1 || fail "Node.js is required for native deploy"
  command -v npm >/dev/null 2>&1 || fail "npm is required for native deploy"

  if port_busy 5000; then
    fail "Port 5000 is in use. Stop ./start.sh or any node backend/server.js process first"
  fi

  log "Building frontend..."
  npm install --prefix "$ROOT/frontend"
  npm run build --prefix "$ROOT/frontend"

  log "Starting production server on http://localhost:5000"
  export NODE_ENV=production
  export PORT=5000

  nohup node "$ROOT/backend/server.js" > "$ROOT/backend/deploy.log" 2>&1 &
  echo $! > "$ROOT/backend/deploy.pid"
  log "PID $(cat "$ROOT/backend/deploy.pid") — logs: backend/deploy.log"

  wait_for_health || {
    log "Startup failed. Tail logs:"
    tail -n 40 "$ROOT/backend/deploy.log" || true
    exit 1
  }
}

require_env

if [ "$DEPLOY_MODE" = "native" ]; then
  deploy_native
elif [ "$DEPLOY_MODE" = "docker" ]; then
  deploy_docker
elif docker_ready && docker_compose_cmd >/dev/null 2>&1; then
  deploy_docker
else
  log "Docker not available — using native Node deploy"
  deploy_native
fi