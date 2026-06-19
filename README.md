# Giftcred

Gift credits that turn into real gift cards from top brands.

| Part | Tech | Deploy |
|------|------|--------|
| **Frontend** | React + Vite | Vercel |
| **Backend** | **Node.js + Express** | VPS (Woohoo whitelisted IP) |

## Repository layout

```
giftcred/
├── backend/             # Node.js Express API (production)
├── frontend/            # React storefront (Vercel)
├── backend-python/      # Legacy FastAPI — reference only, not deployed
├── vercel.json          # Frontend-only Vercel config
├── ecosystem.config.cjs # PM2 config for VPS
└── DEPLOYMENT.md
```

## Quick start (local)

**Terminal 1 — Node.js backend** (port 8000):

```bash
npm install
copy .env.example .env    # Woohoo + DATABASE_URL + AUTH_SECRET
npm run dev
```

**Terminal 2 — Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` → `http://127.0.0.1:8000`.

## Deploy

| Part | Where |
|------|--------|
| **Backend (Node.js)** | VPS — `npm start` or `pm2 start ecosystem.config.cjs` |
| **Frontend** | Vercel — set `VITE_API_URL=https://api.yourdomain.com/api` |

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** and **[backend/README.md](./backend/README.md)**.

## Python reference

`backend-python/` is the old FastAPI code, kept for reference only. Production uses **Node.js** in `backend/`.
