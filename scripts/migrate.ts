/**
 * Spustenie migrácií. Volá sa automaticky pri každom nasadení (railway.json).
 * Je idempotentné – už aplikované migrácie preskočí.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Chýba DATABASE_URL.");

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log("Spúšťam migrácie…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrácie hotové.");

  await sql.end();
}

main().catch((e) => {
  console.error("Migrácie zlyhali:", e);
  process.exit(1);
});
