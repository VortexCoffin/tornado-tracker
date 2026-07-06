#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

stopped=false

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose down && stopped=true
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose down && stopped=true
  fi
fi

if [ -f "$ROOT/backend/deploy.pid" ]; then
  pid="$(cat "$ROOT/backend/deploy.pid")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped native deploy (PID $pid)"
    stopped=true
  fi
  rm -f "$ROOT/backend/deploy.pid"
fi

if [ "$stopped" = false ]; then
  echo "Nothing to stop."
fi