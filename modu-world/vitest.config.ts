import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://modu_app:modu_app_dev@localhost:5432/modu_test",
      DATABASE_ADMIN_URL: process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://modu:modu@localhost:5432/modu_test",
      SECRET_PEPPER: "test-pepper-0123456789abcdef0123456789abcdef",
      APP_URL: "http://localhost:3000",
      STORAGE_LOCAL_DIR: ".data/test-uploads",
      WEB3_CHAIN_ID: "11155111",
      NODE_ENV: "test",
    },
  },
});
