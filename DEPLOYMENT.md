# Giftcred — Deployment Guide

Deploy **frontend + API together on Vercel**. Your **PostgreSQL database stays on a separate provider** — Neon, Supabase, Railway, etc. Vercel does not host your data unless you explicitly choose Vercel Postgres.

## Three separate services

| Service | Where | Connected via |
|---------|--------|----------------|
| **Frontend + API** | Vercel (one project) | Browser → `https://your-app.vercel.app` |
| **PostgreSQL** | **Separate** remote host | `DATABASE_URL` env var in Vercel |
| **Woohoo API** | Qwikcilver/Woohoo cloud | Woohoo env vars in Vercel |

Nothing runs on your laptop in production. The Express API on Vercel connects **out** to your remote database over the internet using `DATABASE_URL` — same idea as the old Python backend on Railway/Render.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel (single project, repo root)                         │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │  React/Vite      │  /api   │  Express (serverless)    │  │
│  │  frontend/dist   │ ──────► │  api/index.ts            │  │
│  └──────────────────┘         └────────────┬─────────────┘  │
└────────────────────────────────────────────┼────────────────┘
                                             │ DATABASE_URL
                                             ▼
                                    ┌──────────────────┐
                                    │  PostgreSQL      │
                                    └──────────────────┘
                                             │
                                             ▼ HTTPS
                                    ┌──────────────────┐
                                    │  Woohoo API      │
                                    └──────────────────┘
```

| Component | Where it runs | Notes |
|-----------|---------------|-------|
| **Frontend** | Vercel static (`frontend/dist`) | Built via root `vercel.json` |
| **API** | Vercel serverless (`api/`) | Express app, same domain as frontend |
| **Database** | Managed PostgreSQL | Required — set `DATABASE_URL` in Vercel |
| **Python backend** | `backend-python/` | **Reference only** — not deployed |

---

## Before you deploy — checklist

- [ ] Woohoo credentials (start with **sandbox**)
- [ ] `DATABASE_URL` points to managed Postgres (not localhost)
- [ ] All env vars from `.env.example` set in **Vercel → Settings → Environment Variables**
- [ ] `npm run typecheck` passes at repo root
- [ ] `cd frontend && npm run build` passes
- [ ] `.env` files are **never** committed

---

## 1. Database (separate — not on Vercel)

Provision Postgres on any managed provider. The database does **not** need to be on Vercel.

**Examples:** Neon, Supabase, Railway, Render, AWS RDS, Azure PostgreSQL  
**Optional:** Vercel Postgres (if you want DB and app in one dashboard)

Copy the connection string into Vercel as `DATABASE_URL`:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Tables are created automatically on first API request.

Enable SSL if your provider requires it (`?sslmode=require`).

---

## 2. Deploy on Vercel

### Import project

1. Push repo to GitHub.
2. [Vercel](https://vercel.com) → **Add New Project** → import repo.
3. **Root Directory:** leave as **`.`** (repo root) — not `frontend/`.
4. Framework preset is auto-detected from `vercel.json`.

### Root `vercel.json` (already in repo)

| Setting | Value |
|---------|-------|
| **Build Command** | `cd frontend && npm install && npm run build` |
| **Output Directory** | `frontend/dist` |
| **Install Command** | `npm install` |

Routes:

- `/api/*` → Express serverless function
- everything else → SPA (`index.html`)

### Environment variables (Vercel dashboard)

Copy from `.env.example`:

| Variable | Required |
|----------|----------|
| `WOOHOO_CONSUMER_KEY` | Yes |
| `WOOHOO_CONSUMER_SECRET` | Yes |
| `WOOHOO_USERNAME` | Yes |
| `WOOHOO_PASSWORD` | Yes |
| `DATABASE_URL` | Yes |
| `WOOHOO_BASE_URL` | Yes (sandbox: `https://sandbox.woohoo.in`) |
| `CORS_ORIGINS` | No (defaults to `*`) |
| `CATALOG_CACHE_TTL_HOURS` | No (default `720` ≈ **once per month**) |

**Catalog caching:** Product list is stored in Postgres (`catalog_cache`). Woohoo is called only when the cache is older than 30 days (unless you override `CATALOG_CACHE_TTL_HOURS`).

**`VITE_API_URL` is not required** when frontend and API share the same Vercel domain — the app uses `/api` on the same host.

Only set `VITE_API_URL` if the API runs on a **different** domain.

### After deploy — smoke test

```bash
curl https://YOUR-APP.vercel.app/api/catalog
```

First catalog load can take **30–60 seconds** (Woohoo pagination). Vercel Hobby has a **10s function timeout** — upgrade to Pro (60s) or warm the cache if catalog requests time out.

---

## 3. Local development

**Terminal 1 — API:**

```bash
npm install
copy .env.example .env
npm run dev:api
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` → `http://127.0.0.1:8000`.

---

## 4. API routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/catalog` | List gift cards |
| `GET` | `/api/catalog/{sku}` | Product detail |
| `POST` | `/api/purchase` | Place order |
| `GET` | `/api/orders` | Order history |
| `POST` | `/api/orders/{orderId}/refresh` | Refresh card details |

---

## 5. Production hardening

- Restrict `CORS_ORIGINS` to your Vercel domain
- Switch Woohoo from sandbox to production URLs and credentials
- Update pinned SKUs in `api/src/services/catalog.ts` (`PINNED_SKUS`)
- Add API authentication before public launch (anyone can call `/api/purchase` today)

---

## 6. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Vercel build fails | TypeScript errors | `npm run typecheck` locally |
| API 500 on first request | Missing env vars or DB | Check Vercel logs + `DATABASE_URL` |
| Catalog timeout | Cold Woohoo cache + Vercel timeout | Pro plan or retry; first load is slow |
| Frontend 404 on `/catalog` | Wrong root directory | Deploy from **repo root**, not `frontend/` only |
| CORS error | Restricted origins | Add your Vercel URL to `CORS_ORIGINS` |

---

## Python reference

Original FastAPI code: `backend-python/` (not deployed). See `backend-python/README.md`.
