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
    await expect(
      page.getByRole("heading", { name: "Concerning items" }),
    ).toBeVisible();
  });

  test("BMI tile shows in-range status for healthy BMI (175cm/76kg)", async ({ page }) => {
    const section = page.getByTestId("concerning-items-section");
    await expect(section.getByText("Body Mass Index (BMI)")).toBeVisible();
    await expect(section.getByText(/In range/i)).toBeVisible();
  });

  test("Flagged LDL lab appears in section", async ({ page }) => {
    const section = page.getByTestId("concerning-items-section");
    await expect(section.getByText("Bad Cholesterol")).toBeVisible();
    await expect(section.getByText(/Above range/i).first()).toBeVisible();
  });

  test("section spans most of the viewport at 375px width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const section = page.getByTestId("concerning-items-section");
    await expect(section).toBeVisible();
    const box = await section.boundingBox();
    // Card padding + layout chrome — expect most of the 375px content column
    expect(box?.width).toBeGreaterThan(300);
  });
});
