/**
 * Auth flows — unauthenticated browser.
 * Tests login page UI, validation, signup page, and redirect-to-login guard.
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------
test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test("renders the sign-in form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /sign in to autohub/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows validation error for invalid email", async ({ page }) => {
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.getByLabel("Email").fill("user@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("shows server error for wrong credentials", async ({ page }) => {
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
  });

  test("has link to sign-up page", async ({ page }) => {
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/auth/signup");
  });
});

// ---------------------------------------------------------------------------
// Sign-up page
// ---------------------------------------------------------------------------
test.describe("Sign-up page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/signup");
  });

  test("renders the create-account form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("shows validation error when passwords do not match", async ({ page }) => {
    await page.getByLabel("Full name").fill("Jane Smith");
    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByLabel("Confirm password").fill("different999");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("has link back to login page", async ({ page }) => {
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/auth/login");
  });
});

// ---------------------------------------------------------------------------
// Auth guard: unauthenticated access to protected routes
// ---------------------------------------------------------------------------
test.describe("Auth guard", () => {
  test("redirects /dashboard to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });

  test("redirects /billing to login when unauthenticated", async ({ page }) => {
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });

  test("redirects /settings to login when unauthenticated", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });
});
