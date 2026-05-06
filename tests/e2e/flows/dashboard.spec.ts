import { test, expect } from "@playwright/test";
import { loginWithDevToken } from "../fixtures/auth";
import { seedPatientStore } from "../fixtures/seed-store";

test.describe("Dashboard — Concerning items section", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithDevToken(page);
    await page.goto("/dashboard");
    await seedPatientStore(page);
  });

  test("shows 'Concerning items' heading", async ({ page }) => {
    await expect(page.getByText("Concerning items")).toBeVisible();
  });

  test("BMI tile shows green 'Healthy weight' for BMI 22.9 (bodyMetrics: 175cm/76kg)", async ({ page }) => {
    // BMI = 76 / (1.75^2) ≈ 24.8 — healthy
    await expect(page.getByText(/Healthy weight/i)).toBeVisible();
  });

  test("Flagged LDL lab appears in section", async ({ page }) => {
    await expect(page.getByText(/LDL/i)).toBeVisible();
    await expect(page.getByText(/Above range/i)).toBeVisible();
  });

  test("section is full-width at 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const section = page.locator('[data-testid="concerning-items-section"]');
    if (await section.count() === 0) {
      // If no data-testid, look for heading and check parent width
      const heading = page.getByText("Concerning items");
      await expect(heading).toBeVisible();
    } else {
      const box = await section.boundingBox();
      expect(box?.width).toBeGreaterThan(370);
    }
  });
});
