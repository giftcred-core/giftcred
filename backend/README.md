# Node.js backend (Express)

Production API for Giftcred — runs on your **whitelisted-IP VPS**.

| Stack | |
|-------|---|
| Runtime | Node.js 20+ |
| Framework | Express |
| Database | PostgreSQL (`pg`) |
| External API | Woohoo / Qwikcilver |

## Run locally

From the **repo root**:

```bash
npm install
copy .env.example .env   # Woohoo + DATABASE_URL + AUTH_SECRET
npm run dev
```

Listens on `http://127.0.0.1:8000`. Routes are under `/api/*`.

## Run on VPS with Docker

```bash
cp .env.example .env   # fill in credentials
docker compose up -d --build
docker compose logs -f api
```

See [DEPLOYMENT.md](../DEPLOYMENT.md) for full instructions.

## Run without Docker

```bash
npm install
cp .env.example .env     # set CORS_ORIGINS to your Vercel URL
npm start
# or: pm2 start ecosystem.config.cjs
```

## Environment variables

Copy from repo root [`.env.example`](../.env.example):

- `WOOHOO_*` — Woohoo API credentials
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — JWT signing secret (required in production)
- `CORS_ORIGINS` — Vercel frontend URL(s), comma-separated
- `PORT` — default `8000`

## API routes

| Method | Path |
|--------|------|
| `GET` | `/api/health` |
| `POST` | `/api/auth/register` |
| `POST` | `/api/auth/login` |
| `GET` | `/api/auth/me` |
| `GET` | `/api/catalog` |
| `GET` | `/api/catalog/:sku` |
| `POST` | `/api/purchase` |
| `GET` | `/api/orders` |
| `POST` | `/api/orders/:orderId/refresh` |

See [DEPLOYMENT.md](../DEPLOYMENT.md) for nginx, PM2, and Vercel frontend setup.
