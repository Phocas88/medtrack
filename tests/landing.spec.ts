import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the launch date, warehouse workflow, and proposed pricing', async ({ page }) => {
  await expect(page.getByText('Stokora launches June 2027')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Keep orders moving');

  await page.getByRole('link', { name: 'Workflow' }).click();
  await expect(page.getByRole('heading', { name: 'From receiving to shipping' })).toBeInViewport();

  await page.getByRole('link', { name: 'Pricing' }).click();
  await expect(page.getByRole('heading', { name: 'Priced by warehouse' })).toBeInViewport();
  await expect(page.getByText('Team seats included', { exact: false })).toBeVisible();
});

test('waitlist submits through the existing contact endpoint', async ({ page }) => {
  await page.route('**/api/contact', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      email: 'warehouse@example.com',
      interest: 'June 2027 launch',
    });
    await route.fulfill({ json: { success: true } });
  });

  await page.getByRole('link', { name: 'Get launch updates' }).click();
  await page.getByLabel('Work email').fill('warehouse@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toContainText('You’re on the waitlist');
});
