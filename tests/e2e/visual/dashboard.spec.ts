import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";
import { seedPatientStore } from "../fixtures/seed-store";

const VIEWPORTS = [
  { width: 375, height: 812, name: "375" },
  { width: 393, height: 852, name: "393" },
  { width: 768, height: 1024, name: "768" },
  { width: 1280, height: 900, name: "1280" },
];

for (const vp of VIEWPORTS) {
  test(`dashboard screenshot at ${vp.name}px`, async ({ page }) => {
    await loginWithDevToken(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dashboard");
    await seedPatientStore(page);
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot(`dashboard-${vp.name}.png`, {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });
}
