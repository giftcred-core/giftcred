# Giftcred — Deployment Guide

This document explains **exactly what to change** before deploying Giftcred to production.

## Architecture

```
┌─────────────────┐      HTTPS       ┌──────────────────┐      HTTPS      ┌─────────────────┐
│  Vercel         │  ──────────────► │  Backend API     │ ──────────────► │  Woohoo API     │
│  (React/Vite)   │   VITE_API_URL   │  (FastAPI)       │   OAuth2+HMAC   │  (catalog/orders)│
└─────────────────┘                  └────────┬─────────┘                 └─────────────────┘
                                              │
                                              │ DATABASE_URL
                                              ▼
                                     ┌──────────────────┐
                                     │  PostgreSQL      │
                                     │  (remote only)   │
                                     └──────────────────┘
```

| Component | Where it runs | Notes |
|-----------|---------------|-------|
| **Frontend** | Vercel (or any static host) | Build from `frontend/` |
| **Backend** | Railway, Render, Fly.io, VPS, etc. | **Cannot** run on Vercel (needs a long-lived Python server) |
| **Database** | Managed PostgreSQL | **Remote only** — no local SQLite |
| **Catalog** | In-memory on backend | Fetched from Woohoo on startup; not stored in Postgres |

---

## What is stored where

### PostgreSQL (via `DATABASE_URL`)

- `orders` — order history, status, cached gift-card details
- `oauth_tokens` — Woohoo OAuth2 bearer tokens (reused until expiry)

Tables are created automatically on backend startup (`init_db()`).

### Not in the database

- **Product catalog** — loaded from Woohoo API into an in-memory cache
- **`woohoo_catalog.db`** — legacy file, **not used** by the app (safe to delete locally)

---

## Before you deploy — checklist

Use this list every time you promote an environment (sandbox → production).

- [ ] Woohoo **production** credentials (not sandbox)
- [ ] `WOOHOO_BASE_URL` points to production Woohoo host
- [ ] `DATABASE_URL` points to a **managed** Postgres instance (not a dev laptop IP)
- [ ] Backend deployed and reachable over **HTTPS**
- [ ] `VITE_API_URL` set in Vercel to your backend URL (build-time)
- [ ] CORS on backend allows your Vercel domain (see below)
- [ ] `PINNED_SKUS` updated for production brands (see below)
- [ ] `.env` files are **never** committed to git
- [ ] Frontend branch merged to `main` and `npm run build` passes locally

---

## 1. Backend deployment

### Requirements

- Python **3.11+**
- PostgreSQL **14+**
- Outbound HTTPS to Woohoo API

### Install & run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Production:** run behind a reverse proxy (nginx, Caddy, Railway, Render) with HTTPS. Example with multiple workers:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Backend environment variables

Copy `backend/.env.example` → `backend/.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `WOOHOO_CONSUMER_KEY` | Yes | Woohoo `clientId` (also used for HMAC signing) |
| `WOOHOO_CONSUMER_SECRET` | Yes | Woohoo `clientSecret` |
| `WOOHOO_USERNAME` | Yes | Woohoo account username for `/oauth2/verify` |
| `WOOHOO_PASSWORD` | Yes | Woohoo account password |
| `DATABASE_URL` | Yes | `postgres://user:pass@host:5432/dbname` |
| `WOOHOO_BASE_URL` | Yes | Woohoo API base (see sandbox vs production below) |
| `WOOHOO_AUTH_MODE` | No | Default: `oauth2` |
| `WOOHOO_OAUTH2_VERIFY_URL` | No | Defaults to `{WOOHOO_BASE_URL}/oauth2/verify` |
| `WOOHOO_OAUTH2_TOKEN_URL` | No | Defaults to `{WOOHOO_BASE_URL}/oauth2/token` |
| `WOOHOO_REQUEST_TIMEOUT` | No | Default: `60` (seconds) |
| `WOOHOO_MAX_RETRIES` | No | Default: `3` |
| `LOG_LEVEL` | No | Default: `INFO` |

**Important:** `DATABASE_URL` is the **only** database config. The app does not use SQLite or multiple DB env vars.

### Sandbox vs production (Woohoo)

**Current defaults are sandbox (UAT):**

```env
WOOHOO_BASE_URL=https://sandbox.woohoo.in
WOOHOO_OAUTH2_VERIFY_URL=https://sandbox.woohoo.in/oauth2/verify
WOOHOO_OAUTH2_TOKEN_URL=https://sandbox.woohoo.in/oauth2/token
```

**For real customers**, replace with production values from Woohoo/Qwikcilver (exact host depends on your contract). Example pattern:

```env
WOOHOO_BASE_URL=https://<production-woohoo-host>
WOOHOO_OAUTH2_VERIFY_URL=https://<production-woohoo-host>/oauth2/verify
WOOHOO_OAUTH2_TOKEN_URL=https://<production-woohoo-host>/oauth2/token
```

Also use **production** `WOOHOO_CONSUMER_KEY`, `WOOHOO_CONSUMER_SECRET`, `WOOHOO_USERNAME`, and `WOOHOO_PASSWORD`.

### CORS — required change for production

`backend/main.py` currently allows all origins:

```python
allow_origins=["*"],
```

**Before production**, restrict this to your frontend domain(s):

```python
allow_origins=[
    "https://your-app.vercel.app",
    "https://giftcred.com",
    "https://www.giftcred.com",
],
```

Or read allowed origins from an env var (recommended):

```env
CORS_ORIGINS=https://your-app.vercel.app,https://giftcred.com
```

### Pinned catalog SKUs (UAT → production)

Test/certification SKUs are hardcoded at the top of the catalog in `backend/catalog_service.py`:

```python
PINNED_SKUS = [
    "CNPIN", "VOUCHERCODE", "CLAIMCODE", "UBEFLOW", ...
]
```

These are **sandbox/UAT SKUs**. For production, update this list to the real brands you want featured first, or empty the list if you don't need pinning.

### Backend API routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/catalog` | List gift cards (Woohoo catalog, cached) |
| `GET` | `/api/catalog/{sku}` | Product detail (terms, redeem steps, price) |
| `POST` | `/api/purchase` | Place order |
| `GET` | `/api/orders` | Order history (from Postgres) |
| `POST` | `/api/orders/{orderId}/refresh` | Refresh card details from Woohoo |

### First catalog load

The first request to `/api/catalog` after a cold start can take **30–60 seconds** while the backend paginates Woohoo and caches products. Subsequent requests are fast. Plan for this in health checks (don't fail deploy if the first catalog call is slow).

### Smoke test (after backend deploy)

```bash
cd backend
# Ensure API_BASE points at your deployed backend
python smoke_test.py
```

---

## 2. Frontend deployment (Vercel)

Vercel hosts the **static React build only**. It does not run the Python backend.

### Vercel project settings

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### Vercel environment variables

Set in **Vercel → Project → Settings → Environment Variables**:

| Variable | Example | When |
|----------|---------|------|
| `VITE_API_URL` | `https://api.giftcred.com/api` | **Build time** — must include `/api` suffix |

`VITE_` variables are baked into the build. If you change the backend URL, **redeploy** the frontend.

Default if unset (local dev only):

```ts
// frontend/src/api.ts
import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api"
```

### Verify build locally before pushing

```bash
cd frontend
npm install
npm run build
```

Common TypeScript failures (strict mode):

- Unused imports (`OrderItem`, `navigate`) — remove them
- Missing fields on `GiftCard` (e.g. `activationUrl`) — add to `frontend/src/api.ts`

### Branch to deploy

Deploy the branch that contains the latest UI and TypeScript fixes (e.g. merge `UI-updated-by-balram` into `main` before connecting Vercel to `main`).

### Optional: `vercel.json`

Create `frontend/vercel.json` for SPA routing (React Router):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 3. Database setup

### Create Postgres

Use any managed provider, for example:

- Neon, Supabase, Railway, Render, AWS RDS, Azure Database for PostgreSQL

### Connection string

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

The backend accepts `postgres://` or `postgresql://` and normalizes for SQLAlchemy.

### Security

- Use a dedicated DB user with least privilege
- Enable SSL if your provider supports it (`?sslmode=require` on connection string)
- Do **not** expose Postgres port `5432` to the public internet unless required; prefer private networking or provider connection pooling

### Migrations

No separate migration tool. On startup the backend:

- Creates tables via SQLAlchemy `create_all`
- Runs lightweight `ALTER TABLE ... IF NOT EXISTS` for new columns

For production at scale, consider adopting Alembic later.

---

## 4. End-to-end deployment order

1. **Provision PostgreSQL** → get `DATABASE_URL`
2. **Deploy backend** with all env vars → confirm `GET /api/catalog` returns JSON (may be slow first time)
3. **Set CORS** to your frontend domain
4. **Deploy frontend on Vercel** with `VITE_API_URL=https://<backend-host>/api`
5. **Smoke test** — browse catalog, open a product, place a test order (sandbox first)
6. **Switch Woohoo to production** credentials when ready for real orders

---

## 5. Local development

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env    # fill in credentials + DATABASE_URL
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (API defaults to `http://127.0.0.1:8000/api`).

---

## 6. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Vercel build fails on `tsc` | TypeScript strict errors | Run `npm run build` locally; fix unused imports and types in `api.ts` |
| Catalog empty or 500 | Woohoo auth failure | Check consumer key/secret, username/password, base URL |
| Frontend calls `127.0.0.1` in prod | `VITE_API_URL` not set | Set in Vercel env vars and redeploy |
| CORS error in browser | Backend allows wrong origins | Update `allow_origins` in `main.py` |
| Catalog very slow once | Cold cache | Normal on first load; wait or warm cache after deploy |
| Orders slow in history | Old code fetched Woohoo per order | Ensure latest backend (cached orders + `/refresh`) |
| `woohoo_catalog.db` in repo | Legacy artifact | Not used; add `*.db` to gitignore (already there) |

---

## 7. Security notes (production)

- Never commit `backend/.env`
- Restrict CORS to known frontend domains
- Use HTTPS everywhere
- Consider API authentication before public launch (currently anyone can call `/api/purchase`)
- Rotate Woohoo credentials if exposed
- Backend writes debug JSON to `backend/responses/` — disable or redirect logs in production if disk/noise is a concern

---

## 8. Quick reference — files to change for production

| File | What to change |
|------|----------------|
| `backend/.env` | All secrets, `DATABASE_URL`, production Woohoo URLs |
| `backend/main.py` | `allow_origins` for CORS |
| `backend/catalog_service.py` | `PINNED_SKUS` for featured brands |
| Vercel dashboard | `VITE_API_URL`, root dir `frontend` |
| Git branch | Merge latest UI/fixes into `main` before deploy |

---

## Support

- Backend API details: `backend/README.md`
- Woohoo OAuth2 flow: `backend/woohoo_client.py`, `backend/woohoo_signature.py`
