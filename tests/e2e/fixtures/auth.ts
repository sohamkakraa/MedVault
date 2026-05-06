import { test as base, type Page } from "@playwright/test";

export const DEV_TOKEN = "dev-token"; // matches the dev auth cookie set by the login route
export const DEV_SESSION_COOKIE = "mv_session";

export async function loginWithDevToken(page: Page): Promise<void> {
  await page.context().addCookies([{
    name: DEV_SESSION_COOKIE,
    value: DEV_TOKEN,
    domain: "localhost",
    path: "/",
    httpOnly: false,
  }]);
}

export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await loginWithDevToken(page);
    await use(page);
  },
});
