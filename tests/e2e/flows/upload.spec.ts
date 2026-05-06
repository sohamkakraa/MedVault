import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";

test("upload page redirects to dashboard", async ({ page }) => {
  await loginWithDevToken(page);
  await page.goto("/upload");
  await expect(page).toHaveURL(/dashboard/);
});
