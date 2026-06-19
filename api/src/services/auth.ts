import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import { config } from "../config.js";

const scryptAsync = promisify(scrypt);

export interface AuthUser {
  id: number;
  email: string;
}

export interface TokenPayload extends AuthUser {
  exp: number;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function fromBase64url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const key = Buffer.from(keyHex, "hex");
  if (derived.length !== key.length) return false;
  return timingSafeEqual(derived, key);
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", config.authSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): AuthUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", config.authSecret()).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(fromBase64url(body)) as TokenPayload;
    if (!payload.id || !payload.email || !payload.exp || payload.exp < Date.now()) return null;
    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export async function registerUser(
  client: PoolClient,
  email: string,
  password: string
): Promise<AuthUser> {
  const normalized = normalizeEmail(email);
  if (!validateEmail(normalized)) {
    throw new AuthValidationError("Please enter a valid email address.");
  }
  const pwdErr = validatePassword(password);
  if (pwdErr) throw new AuthValidationError(pwdErr);

  const existing = await client.query<{ id: number }>(
    `SELECT id FROM app_users WHERE email = $1`,
    [normalized]
  );
  if (existing.rows[0]) {
    throw new AuthValidationError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(password);
  const result = await client.query<{ id: number; email: string }>(
    `INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
    [normalized, passwordHash]
  );
  const row = result.rows[0];
  return { id: row.id, email: row.email };
}

export async function loginUser(
  client: PoolClient,
  email: string,
  password: string
): Promise<AuthUser> {
  const normalized = normalizeEmail(email);
  const result = await client.query<{ id: number; email: string; password_hash: string }>(
    `SELECT id, email, password_hash FROM app_users WHERE email = $1`,
    [normalized]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthValidationError("Invalid email or password.");
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw new AuthValidationError("Invalid email or password.");
  }
  return { id: row.id, email: row.email };
}

export async function getUserById(client: PoolClient, id: number): Promise<AuthUser | null> {
  const result = await client.query<{ id: number; email: string }>(
    `SELECT id, email FROM app_users WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email } : null;
}

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}
