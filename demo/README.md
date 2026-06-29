# GiftCred Admin Dashboard (Demo)

Production-quality Next.js 14 admin dashboard — **all data comes from the live backend API** (no mocks).

## Prerequisites

- Backend API running at `http://localhost:3001`
- Admin credentials (default: `admin@giftcred.com` / `Giftcred@123`)

## Run

```bash
cd demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

- **API proxy**: Requests go to `/api/backend/*` → rewritten to `http://localhost:3001/*` (see `next.config.mjs`)
- **Auth**: JWT stored in `localStorage` (`gc_access`, `gc_refresh`) with automatic token refresh
- **Styling**: Pure vanilla CSS design system in `src/app/globals.css`

## Pages

| Route | API Sources |
|-------|-------------|
| `/dashboard` | `/api/auth/me`, `/api/ledger/wallets/me`, `/api/auth/sessions`, `/api/audit/logs` |
| `/dashboard/users` | `/api/users`, `/api/users/roles`, `POST /api/users/invites` |
| `/dashboard/roles` | `/api/users/roles` |
| `/dashboard/ledger` | `/api/ledger/wallets/me` |
| `/dashboard/holds` | `/api/ledger/wallets/me`, hold CRUD endpoints |
| `/dashboard/sessions` | `/api/auth/sessions` |
| `/dashboard/api-keys` | `/api/keys` |
| `/dashboard/audit` | `/api/audit/logs` |
| `/dashboard/security` | `/api/accounts/:id`, MFA endpoints |

## Build

```bash
npm run build
npm start
```
