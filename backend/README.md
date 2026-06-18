# Woohoo Catalog Sync Service

Production-ready Python CLI that authenticates with the **Woohoo/Qwikcilver Sandbox** using **OAuth 2.0** (verify → token → HMAC-SHA512 signed REST), downloads the complete catalog (categories + recursive subcategories), saves raw API responses for debugging, and persists everything in **PostgreSQL**.

## Features

- OAuth 2.0 flow: `POST /oauth2/verify` then `POST /oauth2/token`
- Bearer token persistence in `oauth_tokens` table (reuse until expiry)
- HMAC-SHA512 request signing (`Authorization`, `dateAtClient`, `signature` headers)
- Catalog fetch from `/rest/v3/catalog/categories`
- Recursive subcategory fetch (nested response + `/categories/{id}/subcategories`)
- Raw JSON responses saved to `responses/`
- PostgreSQL upsert (no duplicates)
- Retry logic for transient HTTP failures
- Structured logging + detailed debug output for every auth/catalog step
- 401 inspection with automatic `dateAtClient` / `signature` header retries

## Folder Structure

```
woohoo-sync/
├── .env.example
├── requirements.txt
├── schema.sql
├── config.py
├── logger.py
├── database.py
├── models.py
├── woohoo_client.py
├── sync_catalog.py
├── responses/
└── README.md
```

## Prerequisites

- Python 3.11+
- PostgreSQL 14+
- Woohoo Sandbox credentials

## Setup

### 1. Create virtual environment

```powershell
cd woohoo-sync
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```powershell
copy .env.example .env
```

Edit `.env`:

```env
WOOHOO_CONSUMER_KEY=your_consumer_key
WOOHOO_CONSUMER_SECRET=your_consumer_secret
WOOHOO_USERNAME=your_username
WOOHOO_PASSWORD=your_password

DATABASE_URL=postgres://user:password@host:5432/dbname
```

The app accepts standard `postgres://` or `postgresql://` URLs. Tables are created automatically on startup via SQLAlchemy.

## Usage

Run the sync:

```powershell
python sync_catalog.py
```

### Debug output

The CLI prints detailed debug blocks for:

1. **Request Token Response** — status, headers, body
2. **Verifier Response** — status, headers, body
3. **Access Token Response** — status, headers, body
4. **Catalog Categories API Response** — status, headers, body
5. **Subcategories API Response** — per category

Raw responses are also written to `responses/` as timestamped JSON files.

### On authentication failure

If any OAuth step fails, the exact **HTTP status code**, **headers**, and **response body** are printed before the process exits with code `1`.

### On Catalog 401

If `/rest/v3/catalog/categories` returns `401`:

1. The response body and headers are analyzed for hints
2. Request is retried with `dateAtClient` header (UTC ISO8601)
3. If still 401, retried with `dateAtClient` + `signature` header
4. Analysis hints are logged to help determine if re-authentication is needed

## OAuth Flow

| Step | Method | URL | Body |
|------|--------|-----|------|
| 1. Verify | `POST` | `/oauth2/verify` | `{clientId, username, password}` |
| 2. Token | `POST` | `/oauth2/token` | `{clientId, clientSecret, authorizationCode}` |
| 3. API calls | any | `/rest/v3/...` | Bearer + `dateAtClient` + HMAC-SHA512 `signature` |

`WOOHOO_CONSUMER_KEY` / `WOOHOO_CONSUMER_SECRET` are the API clientId/clientSecret.  
`WOOHOO_USERNAME` / `WOOHOO_PASSWORD` are the sandbox login used in step 1.

## Database Tables

| Table | Purpose |
|-------|---------|
| `oauth_tokens` | Stores access token + secret for reuse |
| `categories` | Top-level catalog categories |
| `subcategories` | Nested subcategories linked to categories |

All tables use upsert logic on unique Woohoo IDs.

## Verify Data

```sql
SELECT COUNT(*) FROM categories;
SELECT COUNT(*) FROM subcategories;
SELECT * FROM oauth_tokens WHERE is_active = TRUE;
```

## Troubleshooting

| Issue | Action |
|-------|--------|
| Missing credentials | Ensure `.env` exists with all four Woohoo variables |
| DB connection error | Verify `DATABASE_URL` is correct and the database is reachable |
| OAuth signature invalid | Confirm consumer key/secret and sandbox base URL |
| Catalog 401 | Check debug 401 analysis output; re-run sync to refresh token |
| Empty subcategories | Some categories may only expose nested data in the main categories response |

## License

MIT
