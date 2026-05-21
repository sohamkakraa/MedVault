import { test as base, type Page } from "@playwright/test";

const E2E_USER_ID = "e2e-dev-user";
const E2E_EMAIL = "e2e-dev@uma.local";

/**
 * Signs in via POST /api/auth/test-session (dev only), which creates the User row
 * and sets a valid signed mv_session cookie — required for chat/threads DB APIs.
 */
export async function loginWithDevToken(page: Page): Promise<void> {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const res = await page.request.post(`${baseUrl}/api/auth/test-session`, {
    data: { sub: E2E_USER_ID, email: E2E_EMAIL },
  });
  if (!res.ok()) {
    throw new Error(
      `test-session failed (${res.status()}). Is the dev server running with DATABASE_URL set?`,
    );
  }
}

export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await loginWithDevToken(page);
    await use(page);
  },
});
