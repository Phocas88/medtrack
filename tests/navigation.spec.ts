import { test, expect } from '@playwright/test';

const publicRoutes = ['/auth/login', '/auth/signup', '/portal/login'];

for (const route of publicRoutes) {
  test(`${route} renders without error`, async ({ page }) => {
    await page.goto(route);
    // Page should not show a Next.js error overlay or a generic error
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('404');
  });
}
