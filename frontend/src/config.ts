/**
 * API base URL from env. Set in `frontend/.env` or Vercel project settings.
 *
 * - Local (default): unset → `/api` (Vite proxy → http://127.0.0.1:8000)
 * - Production / remote API: `VITE_API_URL=https://api.yourdomain.com/api`
 *
 * When set, must include the `/api` path prefix.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
