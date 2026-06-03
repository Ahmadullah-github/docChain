import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 180_000,
    include: ["server/src/**/*.integration.test.ts"],
    testTimeout: 120_000
  }
});
