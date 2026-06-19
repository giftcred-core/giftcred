import "./src/config.js";
import { getPool, initDb } from "./src/db.js";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const masked = url.replace(/:([^:@/]+)@/, ":****@");
  console.log("DATABASE_URL host:", masked.split("@")[1] ?? "(not set)");

  try {
    const pool = getPool();
    const client = await pool.connect();
    const res = await client.query("SELECT NOW() as now, current_database() as db");
    console.log("OK — connected:", res.rows[0]);
    client.release();

    await initDb();
    console.log("OK — initDb() completed");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    if (err instanceof Error && "code" in err) {
      console.error("code:", (err as NodeJS.ErrnoException).code);
    }
    process.exit(1);
  }
}

main();
