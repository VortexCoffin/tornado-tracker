# Canada Tornado Tracker

Live tornado and severe thunderstorm alerts for Canada, with radar, weather conditions, recent tornado history, and a community storm photo feed.

## Features

- **Live alerts** — Environment Canada tornado and severe thunderstorm warnings/watches
- **Live radar** — RainViewer precipitation overlay (free, auto-refreshes every 2 min)
- **Current weather** — Temperature, humidity, wind, pressure, and 12-hour forecast (Open-Meteo)
- **Safety tips** — Plain-language guidance for warnings vs watches
- **Guest alert areas** — Browser notifications filtered to your communities (e.g. Oxbow, SK)
- **Accounts** — SMS/in-app alerts, subscription tiers, map overlays
- **Recent tornadoes** — Last 30 days from Northern Tornadoes Project + news
- **Storm feed** — Share storm photos, like, comment, report
- **PWA** — Installable on mobile/desktop

## Stack

- **Frontend:** React + Vite + Leaflet
- **Backend:** Node.js (built-in HTTP, zero npm dependencies)

## Quick start (development)

```bash
cd /path/to/tornado-tracker
chmod +x start.sh
./start.sh
```

Open http://localhost:5173

### Manual start

```bash
npm run install:all

# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

## Deploy on Vercel (recommended for free hosting)

This repo is set up for Vercel: Vite frontend + serverless `/api/*` backend.

1. Push this repo to GitHub (already linked if using `VortexCoffin/tornado-tracker`).
2. In [Vercel](https://vercel.com) → **Add New Project** → import the repo.
3. Leave framework detection as-is (`vercel.json` sets install/build/output).
4. Add environment variables (Project → Settings → Environment Variables):

| Name | Required | Notes |
|------|----------|--------|
| `AUTH_SECRET` | **Yes** | Long random string for login tokens |
| `PAYPAL_CLIENT_ID` | Optional | Paid subscriptions |
| `PAYPAL_CLIENT_SECRET` | Optional | Paid subscriptions |
| `PAYPAL_MODE` | Optional | `live` or `sandbox` |
| `TWILIO_ACCOUNT_SID` | Optional | SMS alerts |
| `TWILIO_AUTH_TOKEN` | Optional | SMS alerts |
| `TWILIO_PHONE_NUMBER` | Optional | SMS alerts |

5. Deploy. Your site will serve the React app and proxy `/api/*` to the serverless handler.

**Limits on Vercel:** account/storm data is stored under `/tmp` and can reset between cold starts. For permanent storage, SMS polling, and always-on reliability, use the Docker/VPS path below.

```bash
# Optional: deploy from CLI
npx vercel --prod
```

## Production (Docker)

```bash
chmod +x deploy.sh stop.sh
./deploy.sh
```

Open http://localhost:5000 — API and built frontend served together.

`./deploy.sh` uses Docker when the daemon is running. If Docker is not installed or not running, it falls back to native Node automatically. Force a mode with `./deploy.sh --docker` or `./deploy.sh --native`.

Stop:

```bash
./stop.sh
```

### Launch on the web (VPS + HTTPS)

**What you need:** a VPS (~$5–6/mo), a domain name, and ~15 minutes.

#### Step 1 — Server

Create an Ubuntu/Debian VPS (DigitalOcean, Hetzner, Linode, Vultr, etc.). Note the public IP.

On the server:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin curl git
sudo usermod -aG docker $USER
# log out and back in so docker works without sudo

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### Step 2 — DNS

At your domain registrar, add an **A record**:

| Name | Type | Value |
|------|------|-------|
| `tornado` (or `@` for root) | A | your server IP |

Wait a few minutes for DNS to propagate.

#### Step 3 — Copy the app to the server

**Recommended: `rsync` (no GitHub login on the server)**

From your local machine:

```bash
rsync -avz --exclude node_modules --exclude frontend/dist \
  /home/sam/Projects/canada-tornado-tracker/ \
  user@YOUR_SERVER_IP:~/canada-tornado-tracker/
```

`backend/.env` is not in git — this copies it from your PC. Do **not** commit secrets to GitHub.

**Alternative: `git clone` on the server** (only if the repo is on GitHub and you set up auth)

GitHub rejects password login. Use one of:

```bash
# SSH (recommended for git)
ssh-keygen -t ed25519 -C "vps-deploy"
cat ~/.ssh/id_ed25519.pub   # add this key at github.com → Settings → SSH keys
git clone git@github.com:VortexCoffin/tornado-tracker.git
# then scp backend/.env from your PC separately
```

```bash
# HTTPS with a Personal Access Token (not your GitHub password)
# Create token: github.com → Settings → Developer settings → Personal access tokens
git clone https://github.com/VortexCoffin/tornado-tracker.git
# username: your GitHub username
# password: paste the token
```

#### Step 4 — Launch

On the server:

```bash
cd ~/canada-tornado-tracker
chmod +x launch-web.sh deploy.sh stop.sh
DOMAIN=tornado.yourdomain.com ./launch-web.sh
```

Open **https://tornado.yourdomain.com**

#### Step 5 — PayPal (live)

In [PayPal Developer → Live app](https://developer.paypal.com/dashboard/applications/live), add:

- `https://tornado.yourdomain.com/subscribe`
- `https://tornado.yourdomain.com/subscribe?cancelled=1`

#### After launch

```bash
docker compose logs -f app    # logs
./stop.sh                     # stop
DOMAIN=tornado.yourdomain.com ./launch-web.sh   # redeploy
```

Back up `backend/data/` regularly (accounts, photos, notifications).

Manual alternative:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with AUTH_SECRET, Twilio, PayPal as needed
docker compose up --build -d
```

## Configuration

Copy `backend/.env.example` to `backend/.env`:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT signing (required for accounts) |
| `TWILIO_*` | SMS alerts (optional) |
| `PAYPAL_*` | Paid subscriptions (optional) |

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Service status |
| `GET /api/alerts` | Live ECCC alerts (`?refresh=true` bypasses cache) |
| `GET /api/weather/current` | Current weather (`?lat=&lng=` or `?city=&province=`) |
| `GET /api/weather/rainviewer` | Radar/cloud tile paths |
| `GET /api/past-tornadoes` | Last 30 days of tornado events |
| `GET /api/storms/posts` | Storm photo feed |
| `POST /api/auth/signup` | Create account |
| `POST /api/auth/login` | Log in |
| `GET /api/notifications` | In-app alert inbox (auth) |

## Data sources

- [Environment and Climate Change Canada](https://api.weather.gc.ca/) — live alerts
- [Northern Tornadoes Project](https://www.uwo.ca/ntp/) — recent tornado events
- [Open-Meteo](https://open-meteo.com/) — weather conditions
- [RainViewer](https://www.rainviewer.com/) — radar tiles
- CBC News / Google News — tornado news headlines

## Subscription tiers

| Plan | Price | Includes |
|------|-------|----------|
| Free | $0 | Live alerts, radar, standard map |
| Storm Tracker | $2.99/mo | Satellite, dark, terrain maps |
| Pro | $4.99/mo | Cloud cover overlay |

## Pre-deploy checklist

Before going live, confirm:

1. **`AUTH_SECRET`** — set a long random string in `backend/.env` (required in production; server refuses to start without it).
2. **HTTPS** — put the app behind nginx, Caddy, or a cloud load balancer with TLS. Do not expose port 5000 directly on the public internet.
3. **PayPal** — switch `PAYPAL_MODE=live` and use live API credentials when you want real subscriptions.
4. **Twilio** — configure for SMS if you want text alerts; optional otherwise.
5. **Data volume** — Docker mounts `backend/data`; back it up regularly (accounts, storm photos, notifications).
6. **PayPal app URLs** — in the PayPal developer dashboard, allow your production domain in return/cancel URLs.
7. **Revoke old keys** — if sandbox PayPal credentials were ever committed or shared, rotate them in the PayPal dashboard.

## Notes

- User data is stored in `backend/data/` as JSON files (fine for personal/small use; migrate to SQLite/Postgres before high traffic).
- Restart the backend after code changes.