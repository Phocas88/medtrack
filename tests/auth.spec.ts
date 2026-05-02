import { test, expect } from '@playwright/test';

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Phocas IMS')).toBeVisible();
});

test('login page loads', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('signup page loads', async ({ page }) => {
  await page.goto('/auth/signup');
  await expect(page.getByLabel(/company name/i)).toBeVisible();
});

test('portal login page loads', async ({ page }) => {
  await page.goto('/portal/login');
  await expect(page.getByText('Customer Portal')).toBeVisible();
});

test('redirects unauthenticated to login', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL('**/auth/login**');
  expect(page.url()).toContain('/auth/login');
});
