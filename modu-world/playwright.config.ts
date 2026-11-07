import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://modu_app:modu_app_dev@localhost:5432/modu_e2e",
  DATABASE_ADMIN_URL: process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://modu:modu@localhost:5432/modu_e2e",
  APP_URL: `http://localhost:${PORT}`,
  SECRET_PEPPER: "e2e-pepper-0123456789abcdef0123456789abcdef",
  SECURE_COOKIES: "false",
  STORAGE_LOCAL_DIR: ".data/e2e-uploads",
};
Object.assign(process.env, env);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: env.APP_URL, locale: "en-US", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${env.APP_URL}/api/health`,
    reuseExistingServer: false,
    env,
    timeout: 120_000,
  },
});
