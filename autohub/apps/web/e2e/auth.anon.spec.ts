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
    // noValidate on the form means Zod runs client-side; no type override needed
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("email-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("email-error")).toContainText(/invalid email address/i);
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.getByLabel("Email").fill("user@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("password-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("password-error")).toContainText(/at least 8 characters/i);
  });

  test("shows server error for wrong credentials", async ({ page }) => {
    // Use credentials that don't exist — API returns 401, NextAuth sets result.error
    await page.getByLabel("Email").fill("nobody@autohub.test");
    await page.getByLabel("Password").fill("wrongpassword99");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("server-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("server-error")).toContainText(/invalid email or password/i);
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
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("shows validation error when passwords do not match", async ({ page }) => {
    // Zod refine runs client-side before any network call
    await page.getByLabel("Full name").fill("Jane Smith");
    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm password").fill("different999");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("confirm-password-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("confirm-password-error")).toContainText(/passwords do not match/i);
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
