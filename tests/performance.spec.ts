import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('landing page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });

  test('login page loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test('landing page assets load without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
  });

  test('no console errors on login page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/auth/login');
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
  });

  test('no console errors on signup page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/auth/signup');
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
  });
});
