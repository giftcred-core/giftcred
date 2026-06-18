# Giftcred

Gift credits that turn into real gift cards from top brands — React storefront + FastAPI backend + Woohoo/Qwikcilver catalog & orders.

## Repository layout

```
giftcred/
├── frontend/          # React + Vite (deploy to Vercel)
├── backend/           # FastAPI + PostgreSQL (deploy separately)
├── DEPLOYMENT.md      # ← Start here for production setup
└── README.md
```

## Quick start (local)

**Backend** (port 8000):

```bash
cd backend
python -m venv .venv && .\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # set DATABASE_URL + Woohoo credentials
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

## Production deployment

**Read [DEPLOYMENT.md](./DEPLOYMENT.md)** — it covers:

- Vercel frontend setup (`VITE_API_URL`, root directory, build fixes)
- Backend hosting (Railway/Render/VPS)
- Remote PostgreSQL (`DATABASE_URL` only — no local DB)
- Sandbox → production Woohoo credential changes
- CORS, pinned SKUs, and pre-deploy checklist

### TL;DR

| Piece | Host | Key config |
|-------|------|------------|
| Frontend | **Vercel** | Root: `frontend`, env: `VITE_API_URL=https://your-api.com/api` |
| Backend | **Railway / Render / VPS** | `backend/.env` from `.env.example` |
| Database | **Managed Postgres** | `DATABASE_URL` |

The Python API **cannot** run on Vercel.
