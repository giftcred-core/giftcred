import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load env: repo root `.env` wins; fall back to `backend-python/.env` (same vars as Python backend)
const root = process.cwd();
const backendPythonEnv = resolve(root, "backend-python/.env");
const rootEnv = resolve(root, ".env");
if (existsSync(backendPythonEnv)) dotenv.config({ path: backendPythonEnv });
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const baseUrl = optionalEnv("WOOHOO_BASE_URL", "https://sandbox.woohoo.in").replace(/\/$/, "");

export const config = {
  woohooConsumerKey: () => requireEnv("WOOHOO_CONSUMER_KEY"),
  woohooConsumerSecret: () => requireEnv("WOOHOO_CONSUMER_SECRET"),
  woohooUsername: () => requireEnv("WOOHOO_USERNAME"),
  woohooPassword: () => requireEnv("WOOHOO_PASSWORD"),
  woohooBaseUrl: baseUrl,
  oauth2VerifyUrl: () =>
    optionalEnv("WOOHOO_OAUTH2_VERIFY_URL", `${baseUrl}/oauth2/verify`),
  oauth2TokenUrl: () =>
    optionalEnv("WOOHOO_OAUTH2_TOKEN_URL", `${baseUrl}/oauth2/token`).replace(
      "/oauth/token",
      "/oauth2/token"
    ),
  signatureHeader: optionalEnv("WOOHOO_REQUEST_SIGNATURE_HEADER", "signature"),
  signatureJsonPretty: process.env.WOOHOO_SIGNATURE_JSON_PRETTY === "true",
  requestTimeoutMs: Number(process.env.WOOHOO_REQUEST_TIMEOUT || 60) * 1000,
  databaseUrl: () => requireEnv("DATABASE_URL"),
  corsOrigins: () => {
    const raw = process.env.CORS_ORIGINS?.trim();
    if (!raw) return ["*"];
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
  },
};
