import "./src/config.js";
import { withClient } from "./src/db.js";
import { WoohooClient } from "./src/woohoo/client.js";

async function main() {
  console.log("1) Testing database...");
  await withClient(async (client) => {
    const r = await client.query("SELECT current_database() AS db, NOW() AS now");
    console.log("   DB OK:", r.rows[0]);
  });

  console.log("2) Testing Woohoo OAuth...");
  try {
    await withClient(async (client) => {
      const woohoo = new WoohooClient();
      await woohoo.authenticate(client);
      console.log("   Woohoo OK: token obtained");
    });
  } catch (err) {
    console.error("   Woohoo FAILED:", err instanceof Error ? err.message : err);
  }
}

main();
