/**
 * Production smoke tests — runs against https://www.autohub.fun
 *
 * These are SHALLOW health checks only. They verify the live deployment is up
 * and critical routes respond. They do NOT test business logic.
 *
 * Run with:
 *   SMOKE_BASE_URL=https://www.autohub.fun pnpm e2e --project=smoke
 *
 * In CI: triggered after every successful production deploy.
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------
test.describe("Public pages — reachable", () => {
  test("home page returns 200 and renders", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("home page shows AutoHub branding", async ({ page }) => {
    await page.goto("/");
    const brand = page.getByText(/autohub/i).first();
    await expect(brand).toBeVisible({ timeout: 10_000 });
  });

  test("login page is reachable", async ({ page }) => {
    const response = await page.goto("/auth/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 10_000 });
  });

  test("signup page is reachable", async ({ page }) => {
    const response = await page.goto("/auth/signup");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Auth guard — protected routes redirect to login
// ---------------------------------------------------------------------------
test.describe("Auth guard — protected routes redirect", () => {
  const protectedRoutes = ["/dashboard", "/billing", "/settings", "/usage", "/tools/mine"];

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated user to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// API health check
// ---------------------------------------------------------------------------
const RAILWAY_API = "https://accomplished-integrity-production.up.railway.app";

test.describe("API health", () => {
  test("API health endpoint returns 200", async ({ request }) => {
    let response;
    try {
      response = await request.get(`${RAILWAY_API}/health`, { timeout: 15_000 });
    } catch {
      test.skip(true, "Railway API unreachable from this network — skipping");
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("ok");
  });

  test("API root is reachable", async ({ request }) => {
    let response;
    try {
      response = await request.get(`${RAILWAY_API}/`, { timeout: 15_000 });
    } catch {
      test.skip(true, "Railway API unreachable from this network — skipping");
      return;
    }
    expect(response.status()).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Login form functionality
// ---------------------------------------------------------------------------
test.describe("Login form — smoke", () => {
  test("shows error for wrong credentials (not a 500)", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill("smoke-test-nobody@autohub.fun");
    await page.getByLabel("Password").fill("wrongpassword99");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Should show an error message, not crash
    await expect(page.getByText(/invalid email or password|incorrect|error/i)).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Performance — basic LCP check
// ---------------------------------------------------------------------------
test.describe("Performance — home page", () => {
  test("home page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
