#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed. Install it from https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed."
  exit 1
fi

echo "Installing frontend dependencies..."
npm install --prefix "$ROOT/frontend"
if [ ! -f "$ROOT/frontend/node_modules/vite/package.json" ]; then
  echo "Error: vite did not install. Try: cd frontend && npm install"
  exit 1
fi

if ss -tln 2>/dev/null | grep -q ':5000 '; then
  echo "Port 5000 is already in use. Stop the other process or change PORT in backend/.env"
  exit 1
fi

if ss -tln 2>/dev/null | grep -q ':5173 '; then
  echo "Port 5173 is already in use. Stop the other process first."
  exit 1
fi

echo "Starting backend on http://localhost:5000"
npm run dev --prefix "$ROOT/backend" &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:5000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:5000/api/health" >/dev/null 2>&1; then
  echo "Error: Backend failed to start. Check the output above."
  exit 1
fi

echo "Backend is up."
echo "Starting frontend on http://localhost:5173"
echo "Open http://localhost:5173 in your browser"
npm run dev --prefix "$ROOT/frontend"