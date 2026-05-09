import { defineConfig, devices } from "@playwright/test";

/**
 * AutoHub E2E + Smoke tests.
 *
 * Local — requires both apps running:
 *   Next.js web:  http://localhost:3000
 *   Hono API:     http://localhost:4000
 *
 * Env vars (set in .env.e2e or CI secrets):
 *   PLAYWRIGHT_BASE_URL   — local app base URL (default: http://localhost:3000)
 *   SMOKE_BASE_URL        — production URL for smoke tests (default: https://www.autohub.fun)
 *   E2E_TEST_EMAIL        — regular test user email
 *   E2E_TEST_PASSWORD     — regular test user password
 *   E2E_ADMIN_EMAIL       — admin test user email
 *   E2E_ADMIN_PASSWORD    — admin test user password
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SMOKE_URL = process.env.SMOKE_BASE_URL ?? "https://www.autohub.fun";

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
    // ── Setup ──────────────────────────────────────────────────────────────
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "setup-admin",
      testMatch: /.*\.admin-setup\.ts/,
    },

    // ── Authenticated (regular user) ───────────────────────────────────────
    {
      name: "authenticated",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      testIgnore: [/.*\.setup\.ts/, /.*\.anon\.spec\.ts/, /.*\.admin\.spec\.ts/, /.*\.smoke\.spec\.ts/],
    },

    // ── Authenticated (admin user) ─────────────────────────────────────────
    {
      name: "authenticated-admin",
      dependencies: ["setup-admin"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      testMatch: /.*\.admin\.spec\.ts/,
    },

    // ── Unauthenticated ────────────────────────────────────────────────────
    {
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.anon\.spec\.ts/,
    },

    // ── Production smoke ───────────────────────────────────────────────────
    {
      name: "smoke",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: SMOKE_URL,
      },
      testMatch: /.*\.smoke\.spec\.ts/,
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
