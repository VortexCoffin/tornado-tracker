#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

usage() {
  cat <<'EOF'
Launch Canada Tornado Tracker on the public web (Docker + Caddy + HTTPS)

Usage:
  DOMAIN=tornado.yourdomain.com ./launch-web.sh

Optional:
  EMAIL=you@example.com ./launch-web.sh    # Let's Encrypt account email for Caddy

Before running:
  1. Rent a VPS (Ubuntu/Debian recommended, 1 GB RAM+)
  2. Point your domain A record at the server IP
  3. Open ports 80 and 443 on the server firewall
  4. Copy this project + backend/.env to the server
  5. Add https://YOUR_DOMAIN/subscribe to PayPal Live app return URLs

On the server (first time):
  sudo apt update && sudo apt install -y docker.io docker-compose-plugin curl
  sudo usermod -aG docker "$USER"    # then log out and back in
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ -z "$DOMAIN" ]; then
  echo "Error: Set your public domain first." >&2
  echo "  DOMAIN=tornado.yourdomain.com ./launch-web.sh" >&2
  exit 1
fi

if [ ! -f "$ROOT/backend/.env" ]; then
  echo "Error: backend/.env is missing. Copy it from your local machine." >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  SERVER_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || curl -fsS ifconfig.me 2>/dev/null || true)"
  if [ -n "$SERVER_IP" ] && command -v getent >/dev/null 2>&1; then
    DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')"
    if [ -n "$DNS_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
      echo "Warning: $DOMAIN resolves to $DNS_IP but this server is $SERVER_IP"
      echo "DNS may still be propagating. Caddy needs the A record pointed here."
      echo ""
    elif [ -n "$DNS_IP" ]; then
      echo "DNS OK: $DOMAIN -> $DNS_IP"
    else
      echo "Warning: could not resolve $DOMAIN yet. Wait for DNS, then retry if HTTPS fails."
    fi
  fi
fi

if [ -f "$ROOT/Caddyfile" ]; then
  rm -f "$ROOT/Caddyfile"
fi

if [ -n "$EMAIL" ]; then
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__EMAIL__/$EMAIL/g" "$ROOT/Caddyfile.example" > "$ROOT/Caddyfile"
else
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e '/__EMAIL__/d' "$ROOT/Caddyfile.example" > "$ROOT/Caddyfile"
fi

echo ""
echo "Launching https://$DOMAIN"
echo ""
echo "PayPal: add these Live app return URLs if you have not already:"
echo "  https://$DOMAIN/subscribe"
echo "  https://$DOMAIN/subscribe?cancelled=1"
echo ""

DEPLOY_MODE=docker DOMAIN="$DOMAIN" "$ROOT/deploy.sh" --https

echo ""
echo "Live at: https://$DOMAIN"
echo "Logs:    docker compose logs -f app"
echo "Stop:    ./stop.sh"