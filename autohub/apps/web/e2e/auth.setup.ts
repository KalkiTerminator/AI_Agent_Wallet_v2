/**
 * Auth setup — logs in once as the test user and saves browser storage state.
 * All "authenticated" tests depend on this project.
 *
 * Required env vars:
 *   E2E_TEST_EMAIL    — email of a seeded test user (default: e2e@autohub.test)
 *   E2E_TEST_PASSWORD — password (default: e2epassword)
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e@autohub.test";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "e2epassword";

setup("authenticate", async ({ page }) => {
  await page.goto("/auth/login");

  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect to dashboard after successful login
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Save storage state (cookies + localStorage) for reuse in all tests
  await page.context().storageState({ path: AUTH_FILE });
});
