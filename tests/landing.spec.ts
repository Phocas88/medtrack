import { test, expect } from '@playwright/test';

test('anonymous buyers can view the complete page and reach the pilot form', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Know what’s in stock and where to find it.');
  await expect(page.locator('body')).not.toContainText(/free trial|14.day trial|start.*trial/i);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Contact', 'Features', 'Live demo', 'Pricing', 'Sign in', 'Solutions']);
  await nav.getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/#pricing$/);
  for (const price of [49, 99, 199]) await expect(page.locator('#pricing')).toContainText('$' + price);
  await nav.getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.getByLabel('Work email')).toBeVisible();
});

test('demo roles are available and marketing makes no compliance guarantee', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'See Stokora in action' })).toBeVisible();
  await expect(page.locator('[aria-label="Demo roles"] button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /Management Desktop/ })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText(/100%.*compliant|free trial/i);
});

test('contact reports provider failure and acknowledges only accepted submissions', async ({ page }) => {
  await page.goto('/#contact');
  await page.getByLabel('Contact name').fill('Fixture Name');
  await page.getByLabel('Business name').fill('Sample Wholesale');
  await page.getByLabel('Work email').fill('fixture@example.test');
  await page.getByLabel('What workflow would you like to improve?').fill('We want to organize our inventory counts.');
  let attempts = 0;
  await page.route('**/api/contact', async (route) => {
    attempts++;
    await route.fulfill(attempts === 1
      ? { status: 503, json: { error: 'Try again later' } }
      : { status: 202, json: { status: 'accepted' } });
  });
  const send = page.getByRole('button', { name: 'Send inquiry' });
  await send.click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Try again later');
  await send.click();
  await expect(page.getByRole('status')).toContainText('Your inquiry was received.');
});

test('mobile navigation stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Live demo' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
