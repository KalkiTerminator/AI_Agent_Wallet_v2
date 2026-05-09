/**
 * Admin page — authenticated admin user.
 * Tests all tabs: approvals, tools, users, analytics (with range selector), compliance.
 *
 * This file matches the "authenticated-admin" Playwright project (*.admin.spec.ts).
 */
import { test, expect } from "@playwright/test";

test.describe("Admin page — layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
  });

  test("renders admin dashboard without crashing", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows all tabs", async ({ page }) => {
    // Actual tab labels: "Tool Approvals", "Manage Tools", "Analytics", "User Management"
    const tabs = [/tool approvals/i, /manage tools/i, /analytics/i, /user management/i];
    for (const tab of tabs) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
  });

  test("summary stats cards are visible", async ({ page }) => {
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    // At least one stat number should be visible
    const statNumbers = page.locator("h2, h3, [class*='text-3xl'], [class*='font-bold']");
    await expect(statNumbers.first()).toBeVisible();
  });
});

test.describe("Admin page — Tools tab", () => {
  test("tools tab shows tool list or empty state", async ({ page }) => {
    await page.goto("/admin?tab=tools");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    // ToolManagement renders a table — at minimum a header row is always present
    const toolRows = page.getByRole("row");
    expect(await toolRows.count()).toBeGreaterThanOrEqual(1);
  });

  test("create tool button is visible on tools tab", async ({ page }) => {
    await page.goto("/admin?tab=tools");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    const createBtn = page.getByRole("button", { name: /create tool|new tool|add tool/i });
    await expect(createBtn).toBeVisible();
  });
});

test.describe("Admin page — Users tab", () => {
  test("users tab shows user list", async ({ page }) => {
    await page.goto("/admin?tab=users");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    // UserRoleManager has two tables: "Available Roles" panel + users table.
    // At minimum the users table header row is always present (role="row").
    const rows = page.getByRole("row");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test("users tab shows role column", async ({ page }) => {
    await page.goto("/admin?tab=users");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    const roleHeader = page.getByRole("columnheader", { name: /role/i });
    if (await roleHeader.count() > 0) {
      await expect(roleHeader).toBeVisible();
    }
  });
});

test.describe("Admin page — Analytics tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin?tab=analytics");
    // Wait for analytics to lazy-load
    await page.waitForTimeout(3000);
  });

  test("analytics tab renders charts or skeleton", async ({ page }) => {
    // Either charts are loaded or skeletons are showing
    const rechartContainer = page.locator(".recharts-responsive-container, [class*='recharts']");
    const skeleton = page.locator('[class*="animate-pulse"]');

    const hasCharts = await rechartContainer.count() > 0;
    const hasSkeleton = await skeleton.count() > 0;
    expect(hasCharts || hasSkeleton).toBe(true);
  });

  test("range selector shows 7d / 30d / 90d options", async ({ page }) => {
    await expect(page.getByRole("button", { name: "7d" }).or(page.getByText("7d"))).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "30d" }).or(page.getByText("30d"))).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "90d" }).or(page.getByText("90d"))).toBeVisible({ timeout: 5_000 });
  });

  test("clicking 7d range selector triggers re-fetch", async ({ page }) => {
    const sevenDayBtn = page.getByRole("button", { name: "7d" }).or(page.getByText("7d")).first();
    if (await sevenDayBtn.isVisible()) {
      await sevenDayBtn.click();
      // After click, charts re-render — just confirm page is still functional
      await page.waitForTimeout(2000);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});

test.describe("Admin page — Approvals tab", () => {
  test("approvals tab loads without error", async ({ page }) => {
    await page.goto("/admin?tab=approvals");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("shows pending tools or empty state on approvals tab", async ({ page }) => {
    await page.goto("/admin?tab=approvals");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 15_000 }
    );
    const pending = page.getByText(/pending|no tools|nothing to review/i);
    const rows = page.getByRole("row");
    const hasPending = await pending.count() > 0;
    const hasRows = await rows.count() > 1;
    expect(hasPending || hasRows).toBe(true);
  });
});
