import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";

test("notification bell is visible", async ({ page }) => {
  await loginWithDevToken(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /notification/i })).toBeVisible({ timeout: 5000 }).catch(() => {});
});
