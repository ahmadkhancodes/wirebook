import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/*.test.ts", "packages/*/test/**/*.test.ts"],
    env: { NODE_ENV: "test", DB_DRIVER: "memory", APP_NAME: "wirebook", MAIL_PROVIDER: "console" },
  },
});
