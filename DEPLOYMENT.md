# Giftcred — Deployment Guide

Step-by-step instructions to deploy Giftcred in production.

**Architecture:** React frontend on **Vercel** + Node.js API on a **VPS with a Woohoo-whitelisted IP**.

```
Browser
   │
   ▼
Vercel (frontend)  ──HTTPS──►  VPS (Node.js backend)  ──►  PostgreSQL
                                      │
                                      └──►  Woohoo API (IP-restricted)
```

| What | Where |
|------|--------|
| Frontend | Vercel |
| Backend (Node.js + Express) | Your VPS |
| Database | Postgres (`DATABASE_URL`) |
| `backend-python/` | Not deployed — reference only |

---

## Prerequisites

Complete these **before** deploying:

1. **VPS** with a **static public IP** that Woohoo has whitelisted.
2. **PostgreSQL** running and reachable from the VPS.
3. **Woohoo sandbox credentials** (or production credentials when ready).
4. **Domain names** (recommended):
   - `your-app.vercel.app` (automatic from Vercel)
   - `api.yourdomain.com` → points to your VPS
5. **Docker** installed on the VPS (recommended), or **Node.js 20+** for manual/PM2 deploy.
6. Repo pushed to **GitHub**.

---

## Part 1 — Deploy the backend (VPS)

### Step 1: SSH into your VPS

```bash
ssh user@YOUR_VPS_IP
```

### Step 2: Clone the repo

```bash
git clone https://github.com/YOUR_ORG/giftcred1.git
cd giftcred1
```

### Step 3: Create environment file

```bash
cp .env.example .env
nano .env
```

Fill in these values:

```env
# Woohoo
WOOHOO_CONSUMER_KEY=your_key
WOOHOO_CONSUMER_SECRET=your_secret
WOOHOO_USERNAME=your_username
WOOHOO_PASSWORD=your_password
WOOHOO_BASE_URL=https://sandbox.woohoo.in

# Database
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE

# Auth (use a long random string — e.g. openssl rand -base64 32)
AUTH_SECRET=your-long-random-secret

# Frontend URL(s) — exact match, comma-separated, no trailing slash
CORS_ORIGINS=https://your-app.vercel.app

# Optional
PORT=8000
```

| Variable | Required | Notes |
|----------|----------|-------|
| `WOOHOO_*` | Yes | From Woohoo dashboard |
| `DATABASE_URL` | Yes | Postgres connection string |
| `AUTH_SECRET` | Yes | Signs login tokens |
| `CORS_ORIGINS` | Yes | Your Vercel URL (add custom domain later if needed) |
| `PORT` | No | Default `8000` |

**Database SSL:** If Postgres requires SSL, add `?sslmode=require` to `DATABASE_URL` or set `DATABASE_SSL=true`.

**Database on the same VPS:** If Postgres runs on the host (not in Docker), use the host IP from inside the container:

```env
# Linux — reach host Postgres from Docker container
DATABASE_URL=postgres://USER:PASSWORD@host.docker.internal:5432/DATABASE
```

On Linux Docker, add to `docker-compose.yml` under `api`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

---

### Step 4A: Run with Docker (recommended)

Requires [Docker](https://docs.docker.com/engine/install/) and Docker Compose on the VPS.

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f api
curl http://localhost:8000/api/health
```

Update after code changes:

```bash
git pull
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

---

### Step 4B: Run without Docker (Node.js + PM2)

```bash
npm install
```

**Quick test:**

```bash
npm start
```

**Production (PM2):**

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

### Step 5: Verify the API

From your laptop:

```bash
curl http://YOUR_VPS_IP:8000/api/health
```

Expected response:

```json
{"status":"ok","database":"connected","db":"postgres","timestamp":"..."}
```

Also test catalog (may take a few seconds on first load):

```bash
curl http://YOUR_VPS_IP:8000/api/catalog
```

### Step 6: Add HTTPS with nginx (recommended)

Point DNS `api.yourdomain.com` → your VPS IP, then:

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Edit nginx site config:

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
curl https://api.yourdomain.com/api/health
```

### Step 7: Open firewall ports

Allow HTTP/HTTPS (and optionally 8000 for direct testing):

```bash
sudo ufw allow 80
sudo ufw allow 443
```

---

## Part 2 — Deploy the frontend (Vercel)

### Step 1: Import project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import your GitHub repo.
3. **Root Directory:** leave as **`.`** (repo root — not `frontend/`).
4. Vercel reads `vercel.json` automatically — no extra build settings needed.

### Step 2: Set environment variable

In **Vercel → Project → Settings → Environment Variables**, add:

| Name | Value | Environments |
|------|-------|--------------|
| `VITE_API_URL` | `https://api.yourdomain.com/api` | Production, Preview, Development |

**Important:**

- Must include the **`/api` suffix**.
- Use **HTTPS** if nginx is set up.
- This is baked in at **build time** — you must **redeploy** after changing it.

You do **not** put Woohoo or database variables on Vercel.

### Step 3: Deploy

Click **Deploy** (or push to `main` if auto-deploy is on).

### Step 4: Update CORS on VPS

After you know your Vercel URL, update `.env` on the VPS:

```env
CORS_ORIGINS=https://your-app.vercel.app
```

If you add a custom domain later:

```env
CORS_ORIGINS=https://your-app.vercel.app,https://www.yourdomain.com
```

Restart the API:

```bash
pm2 restart giftcred-api
```

---

## Part 3 — Verify end-to-end

Run through this checklist after both parts are deployed:

| # | Test | How |
|---|------|-----|
| 1 | API health | `curl https://api.yourdomain.com/api/health` |
| 2 | Catalog loads | Open `https://your-app.vercel.app` — gift cards appear |
| 3 | Register / login | Create account or sign in |
| 4 | Cart + checkout | Add item → sign in → place order |
| 5 | Orders page | Past orders visible when logged in |

---

## Local development

**Terminal 1 — backend:**

```bash
npm install
copy .env.example .env    # Windows
# cp .env.example .env    # Mac/Linux
npm run dev
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`).

Vite proxies `/api` → `http://127.0.0.1:8000` — no `VITE_API_URL` needed locally.

To test against the live VPS API from your machine, create `frontend/.env`:

```env
VITE_API_URL=https://api.yourdomain.com/api
```

---

## Environment variables reference

### VPS `.env` (backend)

| Variable | Required |
|----------|----------|
| `WOOHOO_CONSUMER_KEY` | Yes |
| `WOOHOO_CONSUMER_SECRET` | Yes |
| `WOOHOO_USERNAME` | Yes |
| `WOOHOO_PASSWORD` | Yes |
| `WOOHOO_BASE_URL` | Yes |
| `DATABASE_URL` | Yes |
| `AUTH_SECRET` | Yes |
| `CORS_ORIGINS` | Yes (production) |
| `WOOHOO_OAUTH2_VERIFY_URL` | No (auto from base URL) |
| `WOOHOO_OAUTH2_TOKEN_URL` | No (auto from base URL) |
| `CATALOG_CACHE_TTL_HOURS` | No (default 720 ≈ 30 days) |
| `PORT` | No (default 8000) |

### Vercel (frontend)

| Variable | Required |
|----------|----------|
| `VITE_API_URL` | Yes |

---

## API routes

| Method | Path | Auth required |
|--------|------|---------------|
| `GET` | `/api/health` | No |
| `POST` | `/api/auth/register` | No |
| `POST` | `/api/auth/login` | No |
| `GET` | `/api/auth/me` | Yes |
| `GET` | `/api/catalog` | No |
| `GET` | `/api/catalog/:sku` | No |
| `POST` | `/api/purchase` | Yes |
| `GET` | `/api/orders` | Yes |
| `POST` | `/api/orders/:orderId/refresh` | Yes |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank catalog on Vercel site | Wrong or missing `VITE_API_URL` | Set `https://api.yourdomain.com/api`, redeploy Vercel |
| CORS error in browser console | `CORS_ORIGINS` mismatch | Add exact Vercel URL to VPS `.env`, restart API |
| Woohoo 403 / 502 | VPS IP not whitelisted | Confirm public IP with Woohoo support |
| `database: disconnected` | Bad `DATABASE_URL` or firewall | Test Postgres from VPS; check SSL settings |
| Login works locally, not on Vercel | `AUTH_SECRET` differs between envs | Use one consistent secret on VPS |
| Vercel build fails | TypeScript errors | Run `npm run typecheck` and `cd frontend && npm run build` locally |
| API works via curl, not browser | HTTP vs HTTPS mixed content | Use `https://` in `VITE_API_URL` |

---

## Quick command reference

```bash
# VPS — Docker (recommended)
docker compose up -d --build
docker compose logs -f api
docker compose down

# VPS — PM2 (no Docker)
npm start
pm2 start ecosystem.config.cjs
pm2 restart giftcred-api
pm2 logs giftcred-api

# Local — verify before deploy
npm run typecheck
cd frontend && npm run build

# Smoke tests
curl https://api.yourdomain.com/api/health
curl https://api.yourdomain.com/api/catalog
```

---

## Security reminders

- Never commit `.env` files to git.
- Use a strong `AUTH_SECRET` in production.
- Restrict `CORS_ORIGINS` to your real frontend domains.
- Switch Woohoo from sandbox to production URLs when going live.
