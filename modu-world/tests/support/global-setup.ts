import { execFileSync } from "node:child_process";
import { Client } from "pg";

/** Fresh schema + catalogue in the test database before the run. */
export default async function setup() {
  const admin = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://modu:modu@localhost:5432/modu_test";
  const app = process.env.TEST_DATABASE_URL ?? "postgres://modu_app:modu_app_dev@localhost:5432/modu_test";
  const env = { ...process.env, DATABASE_ADMIN_URL: admin, DATABASE_URL: app, NODE_ENV: "test" as const };
  execFileSync("npx", ["tsx", "scripts/migrate.ts", "--reset"], { env, stdio: "inherit" });
  const c = new Client({ connectionString: admin });
  await c.connect();
  const { characters } = await import("../../db/seed/catalog");
  for (const ch of characters) {
    await c.query(
      `insert into characters (slug, name, serial_prefix, series, min_age, rarity, content, accessories, image_path)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ch.slug, ch.name, ch.serial_prefix, ch.series, ch.min_age, ch.rarity, ch.content, JSON.stringify(ch.accessories), ch.image_path],
    );
  }
  await c.end();
}
