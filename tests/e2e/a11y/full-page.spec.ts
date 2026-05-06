import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";

// NOTE: @axe-core/playwright is not yet installed — these tests are stubs
// that should be activated once `npm install --save-dev @axe-core/playwright` runs.
// For now, just verify the routes load without console errors.

const ROUTES = ["/dashboard", "/chat", "/profile"];

for (const route of ROUTES) {
  test(`${route} loads without console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loginWithDevToken(page);
    await page.goto(route);
    await page.waitForTimeout(1500);
    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("hydration")
    );
    expect(criticalErrors).toHaveLength(0);
  });
}
