import { test, expect, type Page } from "@playwright/test";

/**
 * Preview simulator: visits every public route and fails on
 * uncaught page errors, console errors, or React hydration warnings.
 *
 * API-origin network failures (ERR_CONNECTION_REFUSED to :4000) are
 * tolerated — the API may not be running for anon UI checks.
 */
const ROUTES = [
  "/",
  "/features",
  "/auth/login",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/reset-password/some-token",
  "/auth/verify-pending",
  "/auth/mfa",
];

const IGNORED_PATTERNS = [
  /ERR_CONNECTION_REFUSED/i,
  /Failed to load resource.*:4000/i,
  /NetworkError|Failed to fetch/i, // API offline during anon runs
  /Sentry/i,
  /third-party cookie/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(text));
}

async function collectErrors(page: Page, path: string): Promise<string[]> {
  const errors: string[] = [];

  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (isIgnored(text)) return;
    // Hydration problems surface as errors or specific warnings
    if (msg.type() === "error" || /hydrat|did not match|Each child in a list/i.test(text)) {
      errors.push(`[console.${msg.type()}] ${text}`);
    }
  });

  await page.goto(path, { waitUntil: "networkidle" });
  // Let load-time animations and late effects settle
  await page.waitForTimeout(1500);
  return errors;
}

for (const route of ROUTES) {
  test(`no runtime errors on ${route}`, async ({ page }) => {
    const errors = await collectErrors(page, route);
    expect(errors, `Errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    // Page actually rendered something
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });
}

test("unauthenticated /dashboard redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /welcome back, operator/i })).toBeVisible();
});
