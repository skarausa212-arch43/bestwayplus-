/**
 * Applies SQL migrations from supabase/migrations in order and records them in schema_migrations.
 * Uses DATABASE_ADMIN_URL (owner role). With --reset the public/app schemas are dropped first (dev only).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  const reset = process.argv.includes("--reset");
  if (reset && process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (reset) {
      await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
      await client.query("drop type if exists app_role cascade");
      console.log("✓ schemas reset");
    }
    await client.query(
      "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ name: string }>("select name from public.schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`✓ ${file}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    // Local convenience: give the runtime role a login matching DATABASE_URL.
    const appUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (appUrl && appUrl.username === "modu_app" && process.env.NODE_ENV !== "production") {
      const pw = decodeURIComponent(appUrl.password).replace(/'/g, "''");
      await client.query(`alter role modu_app with login password '${pw}'`);
    }
    await client.query("revoke all on public.schema_migrations from modu_app");
    console.log("Migrations complete.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
