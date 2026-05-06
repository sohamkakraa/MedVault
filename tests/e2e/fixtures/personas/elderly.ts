import { test as base } from "@playwright/test";

export const elderly = {
  viewport: { width: 393, height: 852 },
  reducedMotion: "reduce" as const,
};

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject 200% font scale (16px → 32px root font)
    await page.addInitScript(() => {
      document.documentElement.style.fontSize = "32px";
    });
    // Emulate prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await use(page);
  },
});
