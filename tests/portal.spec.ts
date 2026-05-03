import { test, expect } from '@playwright/test';

test.describe('Customer Portal', () => {
  test('portal login page loads', async ({ page }) => {
    await page.goto('/portal/login');

    // Check for "Customer Portal" text
    await expect(page.getByText('Customer Portal')).toBeVisible();

    // Check for email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Check for password input
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Check for sign in button
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('portal login shows error on invalid credentials', async ({ page }) => {
    await page.goto('/portal/login');

    // Fill in invalid credentials
    await page.locator('input[type="email"]').fill('fake@nonexistent.com');
    await page.locator('input[type="password"]').fill('wrongpassword123');

    // Submit the form
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Wait for error message to appear (Supabase returns an auth error)
    const errorMessage = page.locator('[class*="destructive"]');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('portal redirects unauthenticated', async ({ page }) => {
    // Navigate to portal main page (should redirect to login)
    await page.goto('/portal');

    // Should either redirect to /portal/login or show login UI
    // Wait a moment for any client-side redirect
    await page.waitForTimeout(2000);

    // The page should show the login page or redirect
    const url = page.url();
    const hasLoginContent = await page.getByText('Customer Portal').isVisible().catch(() => false);

    // Either redirected to login URL or showing login content
    expect(url.includes('/portal/login') || hasLoginContent).toBeTruthy();
  });
});
