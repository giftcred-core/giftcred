const BASE = process.env.NEXT_PUBLIC_API_URL || "/api/backend";

export function getTokens() {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem("gc_access"),
    refreshToken: localStorage.getItem("gc_refresh"),
  };
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("gc_access", access);
  localStorage.setItem("gc_refresh", refresh);
}

export function clearTokens() {
  localStorage.removeItem("gc_access");
  localStorage.removeItem("gc_refresh");
  localStorage.removeItem("gc_user");
  localStorage.removeItem("gc_mfa_token");
}

export function getUser<T = Record<string, unknown>>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("gc_user") || "null") as T | null;
  } catch {
    return null;
  }
}

export function setUser(user: unknown) {
  localStorage.setItem("gc_user", JSON.stringify(user));
}

export function getMfaToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("gc_mfa_token");
}

export function setMfaToken(token: string) {
  localStorage.setItem("gc_mfa_token", token);
}

export function clearMfaToken() {
  localStorage.removeItem("gc_mfa_token");
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const { refreshToken } = getTokens();
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setTokens(data.tokens.accessToken, data.tokens.refreshToken);
        headers.Authorization = `Bearer ${data.tokens.accessToken}`;
        res = await fetch(`${BASE}${path}`, { ...options, headers });
      } else {
        clearTokens();
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    } else {
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
  }

  return res;
}

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body: unknown) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) =>
    apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};
