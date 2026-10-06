import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Integration tests share one real Postgres test database and reset it
    // in beforeEach (TRUNCATE + reseed); running test files in parallel
    // causes cross-file races against that shared state, so keep it serial.
    fileParallelism: false,
  },
});
