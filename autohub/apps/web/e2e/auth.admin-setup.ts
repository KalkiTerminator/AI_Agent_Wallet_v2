/**
 * Admin auth setup — logs in as the admin test user and saves storage state.
 * All "authenticated-admin" tests depend on this project.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/admin.json");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@autohub.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2epassword123";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/auth/login");

  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: AUTH_FILE });
});
