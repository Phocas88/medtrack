import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('login page has labels for inputs', async ({ page }) => {
    await page.goto('/auth/login');

    // Email input should have an associated label
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();
    await expect(emailLabel).toHaveText(/Email/i);

    // Password input should have an associated label
    const passwordLabel = page.locator('label[for="password"]');
    await expect(passwordLabel).toBeVisible();
    await expect(passwordLabel).toHaveText(/Password/i);

    // Verify the inputs exist with matching IDs
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('pilot inquiry fields have accessible labels', async ({ page }) => {
    await page.goto('/#contact');
    await expect(page.getByLabel('Contact name')).toBeVisible();
    await expect(page.getByLabel('Business name')).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeVisible();
    await expect(page.getByLabel('What workflow would you like to improve?')).toBeVisible();
  });

  test('all buttons have text or aria-label', async ({ page }) => {
    await page.goto('/');

    // Get all buttons and links styled as buttons
    const buttons = page.getByRole('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');

      // Each button should have either visible text, aria-label, or title
      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        (ariaLabel && ariaLabel.trim().length > 0) ||
        (title && title.trim().length > 0);

      expect(hasAccessibleName, `Button at index ${i} has no accessible name`).toBeTruthy();
    }

    // Also check link elements that act as CTAs
    const links = page.getByRole('link');
    const linkCount = await links.count();

    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');

      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        (ariaLabel && ariaLabel.trim().length > 0);

      expect(hasAccessibleName, `Link at index ${i} has no accessible name`).toBeTruthy();
    }
  });
});
