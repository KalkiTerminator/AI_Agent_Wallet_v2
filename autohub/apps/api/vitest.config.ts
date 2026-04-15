import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Use dynamic imports in tests so vi.mock hoisting works with ESM
    pool: "forks",
    testTimeout: 10000,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
    },
  },
});
