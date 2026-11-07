import { execSync } from "node:child_process";

/** Fresh e2e database with catalogue + demo accounts. Requires `npm run build` first. */
export default async function setup() {
  const env = { ...process.env, NODE_ENV: "development" as const };
  execSync("npx tsx scripts/migrate.ts --reset", { env, stdio: "inherit" });
  execSync("npx tsx --conditions=react-server scripts/seed.ts", { env, stdio: "ignore" });
}
