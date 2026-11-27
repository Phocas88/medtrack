import { test, expect } from '@playwright/test';

test('anonymous buyers can view the complete page and reach the pilot form', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Know what’s in stock and where to find it.');
  await expect(page.locator('body')).not.toContainText(/\b(?:free trial|14.day trial|start (?:a |your )?trial)\b/i);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Contact', 'Features', 'Integrations', 'Live demo', 'Pricing', 'Sign in', 'Solutions', 'Warehouse AI']);
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await nav.getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/#pricing$/);
  const pricing = page.locator('#pricing');
  for (const heading of ['Per warehouse', 'Order-volume tiers', 'Team seats included']) {
    await expect(pricing.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(pricing).toContainText('Rates will be announced closer to launch.');
  await page.getByRole('banner').getByRole('link', { name: 'Request a pilot' }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.getByLabel('Work email')).toBeVisible();
});

test('demo roles are available and marketing makes no compliance guarantee', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'See Invexiqs in action' })).toBeVisible();
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
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(nav).toBeHidden();
  await menu.click();
  await nav.getByRole('link', { name: 'Warehouse AI' }).click();
  await expect(page).toHaveURL(/#warehouse-ai$/);
  await expect(nav).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Ask your warehouse AI assistant' })).toBeInViewport();
  await menu.click();
  await nav.getByRole('link', { name: 'Integrations' }).click();
  await expect(page).toHaveURL(/#integrations$/);
  await expect(page.getByRole('heading', { name: 'Integrations planned for June 2027' })).toBeInViewport();
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await nav.getByRole('link', { name: 'Live demo' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('homepage links visitors to signup and the interactive order desk', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From signup to your first receipt' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
  await expect(page.getByLabel(/company.*organization/i)).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: 'Open the interactive order desk' }).click();
  await expect(page).toHaveURL(/\/demo\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Order desk' })).toBeVisible();
});
