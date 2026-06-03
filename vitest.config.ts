import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/*.integration.test.ts", "**/node_modules/**", "**/dist/**", "**/client/dist/**"],
    include: ["client/src/**/*.test.ts", "server/src/**/*.test.ts"]
  }
});
