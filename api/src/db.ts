import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";

let pool: Pool | null = null;
let initialized = false;

function resolveSsl(connectionString: string): boolean | { rejectUnauthorized: boolean } | undefined {
  const lower = connectionString.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) return undefined;
  if (lower.includes("sslmode=disable") || lower.includes("ssl=false")) return undefined;
  if (
    process.env.DATABASE_SSL === "true" ||
    lower.includes("sslmode=require") ||
    lower.includes("neon.tech") ||
    lower.includes("supabase.co")
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = config.databaseUrl();
    pool = new Pool({
      connectionString,
      ssl: resolveSsl(connectionString),
    });
  }
  return pool;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  if (initialized) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id SERIAL PRIMARY KEY,
        access_token VARCHAR(512) NOT NULL,
        access_token_secret VARCHAR(512),
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(64) NOT NULL UNIQUE,
        refno VARCHAR(64) NOT NULL UNIQUE,
        items JSONB,
        mobile_number VARCHAR(32) NOT NULL,
        email VARCHAR(255),
        status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
        cards JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE oauth_tokens ALTER COLUMN access_token_secret DROP NOT NULL`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'PROCESSING'`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cards JSONB`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_cache (
        id INTEGER PRIMARY KEY,
        category_name VARCHAR(255) NOT NULL DEFAULT 'Gift Card',
        products JSONB NOT NULL DEFAULT '[]',
        detail_skus JSONB NOT NULL DEFAULT '[]',
        loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("COMMIT");
    initialized = true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureDb(): Promise<void> {
  await initDb();
}
