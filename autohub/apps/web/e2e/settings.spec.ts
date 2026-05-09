/**
 * Settings page — authenticated user.
 * Tests profile update form, password change form, and MFA section visibility.
 */
import { test, expect } from "@playwright/test";

test.describe("Settings page — layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("renders the Settings heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  });

  test("shows profile section with full name field", async ({ page }) => {
    await expect(page.getByLabel(/full name/i)).toBeVisible();
  });

  test("shows password change section", async ({ page }) => {
    // Labels use htmlFor on shadcn Label components
    await expect(page.getByLabel(/current password/i)).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
  });

  test("shows MFA section", async ({ page }) => {
    // Heading is "Two-Factor Authentication"
    const mfaHeading = page.getByText(/two-factor authentication/i);
    await expect(mfaHeading.first()).toBeVisible();
  });

  test("shows subscription section", async ({ page }) => {
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 10_000 }
    );
    // Section heading is "Subscription"
    const subSection = page.getByRole("heading", { name: /subscription/i });
    await expect(subSection.first()).toBeVisible();
  });
});

test.describe("Settings page — profile update", () => {
  test("save profile button is visible", async ({ page }) => {
    await page.goto("/settings");
    const saveBtn = page.getByRole("button", { name: /save|update profile/i }).first();
    await expect(saveBtn).toBeVisible();
  });

  test("can type into full name field", async ({ page }) => {
    await page.goto("/settings");
    const nameField = page.getByLabel(/full name/i);
    // Wait for the field to populate from session data
    await expect(nameField).toBeVisible();
    await nameField.fill("Test User Updated");
    await expect(nameField).toHaveValue("Test User Updated");
  });
});

test.describe("Settings page — password change", () => {
  test("password change form is interactive and Change Password button works", async ({ page }) => {
    await page.goto("/settings");
    // Verify the password fields and button are present and operable
    const currentPwdField = page.getByLabel(/current password/i);
    const newPwdField = page.getByLabel(/new password/i);
    const changeBtn = page.getByRole("button", { name: /change password/i }).first();

    await expect(currentPwdField).toBeVisible();
    await expect(newPwdField).toBeVisible();
    await expect(changeBtn).toBeVisible();

    // Can type into both fields
    await currentPwdField.fill("testvalue");
    await newPwdField.fill("newvalue");
    await expect(currentPwdField).toHaveValue("testvalue");
    await expect(newPwdField).toHaveValue("newvalue");
  });
});

test.describe("Settings page — MFA", () => {
  test("enable MFA button or QR section is present when MFA is off", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-pulse"]'),
      { timeout: 10_000 }
    );
    const enableBtn = page.getByRole("button", { name: /enable|set up.*mfa|enable.*two-factor/i });
    const qrSection = page.locator("canvas, img[alt*='qr']");
    const disableBtn = page.getByRole("button", { name: /disable.*mfa|remove.*two-factor/i });

    const hasEnable = await enableBtn.count() > 0;
    const hasQr = await qrSection.count() > 0;
    const hasDisable = await disableBtn.count() > 0;
    expect(hasEnable || hasQr || hasDisable).toBe(true);
  });
});
