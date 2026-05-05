import { test, expect } from '@playwright/test';

test.describe('SEO & Meta', () => {
  test('landing page has proper meta tags', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toContain('Stokora WMS');

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(20);
  });

  test('PWA manifest is accessible', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons).toBeTruthy();
  });

  test('landing page has theme-color meta', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();
  });

  test('landing page has viewport meta', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('login page has meaningful title', async ({ page }) => {
    await page.goto('/auth/login');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
