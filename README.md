# Giftcred

Gift credits that turn into real gift cards from top brands — React storefront + Express API + Woohoo/Qwikcilver catalog & orders.

**Everything deploys on Vercel** (frontend static build + Express serverless API).

## Repository layout

```
giftcred/
├── api/                 # Express API (deployed on Vercel serverless)
├── frontend/            # React + Vite storefront
├── backend-python/      # Original FastAPI code (reference only)
├── vercel.json          # Monorepo deploy config
└── DEPLOYMENT.md
```

## Quick start (local)

**Terminal 1 — API** (port 8000):

```bash
npm install
copy .env.example .env    # set DATABASE_URL + Woohoo credentials
npm run dev:api
```

**Terminal 2 — Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` → `http://127.0.0.1:8000`.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com) — **root directory = repo root** (not `frontend/`).
3. Add environment variables from `.env.example` in **Vercel → Settings → Environment Variables**.
4. Deploy.

No `VITE_API_URL` needed when frontend and API share the same Vercel domain — the app calls `/api` on the same host.

You still need a **remote PostgreSQL** database (`DATABASE_URL`). Use [Neon](https://neon.tech), [Supabase](https://supabase.com), or Vercel Postgres.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full checklist.

## Python reference

The original FastAPI backend lives in `backend-python/` and is not used in production. See `backend-python/README.md`.
