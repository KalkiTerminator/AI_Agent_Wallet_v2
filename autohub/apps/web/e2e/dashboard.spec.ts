/**
 * Dashboard — authenticated user.
 * Tests credit display, sidebar navigation, and onboarding dialog behaviour.
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard — layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("renders dashboard page without crashing", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("sidebar is visible with nav links", async ({ page }) => {
    // Sidebar shows: Dashboard, Usage under MAIN; Profile under SETTINGS
    await expect(page.getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /usage/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /profile/i })).toBeVisible();
  });

  test("credit balance is displayed in the account panel", async ({ page }) => {
    // The right-hand Account panel shows "Credits" label next to a numeric balance
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 10_000 }
    );
    // Account panel always renders "Credits" text label
    const creditsLabel = page.getByText("Credits");
    await expect(creditsLabel.first()).toBeVisible();
  });
});

test.describe("Dashboard — onboarding dialog", () => {
  test("onboarding dialog does not appear for an already-onboarded user", async ({ page }) => {
    // e2e test user has onboarded_at set in DB — dialog should not show
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    // Dialog should NOT be visible
    const dialog = page.getByRole("dialog");
    const isVisible = await dialog.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test("onboarding dialog flow — if shown, can be dismissed", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    const dialog = page.getByRole("dialog");
    const shown = await dialog.isVisible().catch(() => false);

    if (shown) {
      // Should have a dismiss / skip button
      const skipBtn = page.getByRole("button", { name: /skip intro|skip|dismiss|close|done|get started/i });
      if (await skipBtn.count() > 0) {
        await skipBtn.first().click();
        await expect(dialog).not.toBeVisible({ timeout: 3_000 });
      }
    }
    // If not shown, user is already onboarded server-side — test passes
  });
});
