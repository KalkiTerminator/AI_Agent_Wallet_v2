import { defineConfig, devices } from "@playwright/test";

/**
 * AutoHub E2E tests.
 *
 * Requires both apps running:
 *   - Next.js web:  http://localhost:3000
 *   - Hono API:     http://localhost:4000
 *
 * In CI set:
 *   PLAYWRIGHT_BASE_URL  (defaults to http://localhost:3000)
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD — seeded test user credentials
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["line"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    // Setup project: authenticate once and save storage state
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // Tests that require a logged-in session
    {
      name: "authenticated",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      testIgnore: /.*\.setup\.ts/,
    },
    // Tests that work without authentication (login page, signup page)
    {
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.anon\.spec\.ts/,
    },
  ],

  // Start Next.js dev server when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
