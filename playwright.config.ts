import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "elderly",
      use: {
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
        // 3G throttling — handled in fixture
      },
    },
    {
      name: "young-fast",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Don't start webserver in CI — assumes app is already running
  ...(process.env.CI ? {} : {
    webServer: {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
    },
  }),
  snapshotDir: "./tests/e2e/__screenshots__",
});
