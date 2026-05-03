import { test, expect } from '@playwright/test';

const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/portal/login',
];

for (const route of publicRoutes) {
  test(`${route} renders without crashing`, async ({ page }) => {
    const response = await page.goto(route);

    // Page should return a successful HTTP status
    expect(response?.status()).toBeLessThan(500);

    // Page should not show error text
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('500');

    // Page should have a meaningful title (not empty)
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
}
