import { test, expect } from '@playwright/test';

test.describe('Page Stability', () => {
  test('landing page loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (e.g., third-party scripts, favicon)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('404') &&
        !err.includes('net::ERR') &&
        !err.includes('Failed to load resource')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
