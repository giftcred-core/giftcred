import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "giftcred-token";

export interface AuthUser {
  id: number;
  email: string;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function registerAccount(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const response = await apiClient.post("/auth/register", { email, password });
  return response.data;
}

export async function loginAccount(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const response = await apiClient.post("/auth/login", { email, password });
  return response.data;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get("/auth/me");
  return response.data.user;
}
