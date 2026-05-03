import { test, expect } from '@playwright/test';

const iPhone = { width: 375, height: 812 };

test.describe('Mobile Responsiveness', () => {
  test('landing page is mobile-friendly', async ({ page }) => {
    await page.setViewportSize(iPhone);
    await page.goto('/');

    // Hero text should be visible on mobile
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Inventory management');

    // CTA button should be visible
    await expect(page.getByRole('link', { name: /Start Free/i }).first()).toBeVisible();

    // Page should not have horizontal overflow (basic mobile check)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('login page works on mobile', async ({ page }) => {
    await page.setViewportSize(iPhone);
    await page.goto('/auth/login');

    // Email input should be visible and usable
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Password input should be visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Sign in button should be visible
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();

    // Form inputs should be interactable
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('portal login works on mobile', async ({ page }) => {
    await page.setViewportSize(iPhone);
    await page.goto('/portal/login');

    // Customer Portal heading should be visible
    await expect(page.getByText('Customer Portal')).toBeVisible();

    // Email input should be visible and usable
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Password input should be visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Sign in button should be visible
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();

    // Form inputs should be interactable
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });
});
