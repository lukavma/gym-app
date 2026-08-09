import { test, expect } from "@playwright/test";

// Precondition: a running local Postgres with Phase 0 migrations applied
// (docker compose up db && pnpm db:migrate). Uses fixed credentials so the
// spec is repeatable against the same dev DB: the first run creates the one
// allowed account via setup, later runs log into it (ADR-004: single
// account, first-run setup only).
const TEST_EMAIL = "e2e-smoke@example.com";
const TEST_PASSWORD = "e2e-smoke-password";

test("setup-or-login reaches an authenticated Today shell", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");

  // Middleware is Edge-only and can't know whether an account exists yet,
  // so unauthenticated requests always land on /login first; LoginForm then
  // does a client-side availability check and replaces to /setup if the
  // account doesn't exist. Branch on whichever form actually renders rather
  // than an early page.url() snapshot, which races that client redirect.
  const confirmPassword = page.getByLabel("Confirm password");
  const loginButton = page.getByRole("button", { name: "Log in" });
  const isSetup = await Promise.race([
    confirmPassword.waitFor().then(() => true),
    loginButton.waitFor().then(() => false),
  ]);

  if (isSetup) {
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await confirmPassword.fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
  } else {
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await loginButton.click();
  }

  await page.waitForURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});
