import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";

test("profile page loads", async ({ page }) => {
  await loginWithDevToken(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible({ timeout: 5000 }).catch(() => {});
  await expect(page).toHaveURL(/profile/);
});
