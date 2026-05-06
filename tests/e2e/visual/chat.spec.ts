import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";

const VIEWPORTS = [
  { width: 375, height: 812, name: "375" },
  { width: 1280, height: 900, name: "1280" },
];

for (const vp of VIEWPORTS) {
  test(`chat screenshot at ${vp.name}px`, async ({ page }) => {
    await loginWithDevToken(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/chat");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot(`chat-${vp.name}.png`, {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });
}
