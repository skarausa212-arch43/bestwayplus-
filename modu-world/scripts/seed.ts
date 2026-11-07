import { Client } from "pg";
import { loadEnv } from "./env";
import { DEMO_PASSWORD, DEMO_USERS, seedCatalog, seedDemo } from "../db/seed/seed";

loadEnv();

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  const withDemo = !process.argv.includes("--catalog-only");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    // all-or-nothing: a failed seed must not leave half-created demo accounts behind
    await c.query("begin");
    await seedCatalog(c);
    console.log("✓ catalogue (characters)");
    if (withDemo) {
      const res = await seedDemo(c, process.env.APP_URL ?? "http://localhost:3000");
      if (res) {
        console.log("✓ demo data (is_demo = true)");
        console.log("\nDemo accounts (password: " + DEMO_PASSWORD + "):");
        for (const [role, email] of Object.entries(DEMO_USERS)) console.log(`  ${role.padEnd(10)} ${email}`);
        console.log("\nDemo NFC tags (also written to .data/demo-tags.csv):");
        for (const t of res.issued) console.log(`  ${t.serial}  ${t.code.padEnd(10)} ${t.url}  — ${t.note}`);
      }
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
