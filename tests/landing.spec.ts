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
  await expect(pricing).toContainText('$89');
  await expect(pricing).toContainText('$948 billed annually');
  await expect(pricing.getByRole('link', { name: 'Compare pricing and features' })).toHaveAttribute('href', '/plans');
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
  await page.getByRole('main').getByRole('link', { name: 'Create a prelaunch account' }).click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
  await expect(page.getByText(/scheduled to launch in June 2027/i)).toBeVisible();
  await expect(page.getByLabel(/company.*organization/i)).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: 'Open the interactive order desk' }).click();
  await expect(page).toHaveURL(/\/demo\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Order desk' })).toBeVisible();
});

test.describe('signup submission against a mocked Auth provider', () => {
  test.use({ bypassCSP: true });

  test('prelaunch signup checks both passwords and submits only after review', async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route('**/auth/v1/signup**', async route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, headers, json: { id: '10000000-0000-4000-8000-000000000079', email: 'signup@example.test' } });
    });
    await page.goto('/auth/signup');
    await page.getByLabel('Full name').fill('Test Buyer');
    await page.getByLabel('Work email').fill('signup@example.test');
    await page.getByLabel('Password (at least 8 characters)', { exact: true }).fill('FixturePass123!');
    await page.getByLabel('Confirm password').fill('WrongPass123!');
    await page.getByLabel('Company / Organization Name').fill('Test Distributor');
    await page.getByLabel('Business phone (optional)').fill('+1 202 555 0180');
    await page.getByLabel('Business street address').fill('12 Example Road');
    await page.getByLabel('City', { exact: true }).fill('Washington');
    await page.getByLabel('Country', { exact: true }).fill('United States');
    await page.getByRole('button', { name: 'Review details' }).click();
    await expect(page.getByText('The passwords must match.')).toBeVisible();
    expect(sent).toHaveLength(0);
    await page.getByLabel('Confirm password').fill('FixturePass123!');
    await page.getByRole('button', { name: 'Review details' }).click();
    await expect(page.getByRole('heading', { name: 'Review your account details' })).toBeFocused();
    await expect(page.getByText('12 Example Road, Washington, United States')).toBeVisible();
    await expect(page.getByText('FixturePass123!')).toHaveCount(0);
    const submit = page.getByRole('button', { name: 'Confirm and create account' });
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Test Buyer');
    await page.getByRole('button', { name: 'Review details' }).click();
    await page.getByRole('checkbox', { name: /I confirm/ }).check();
    await submit.click();
    await expect(page.getByText('Check Your Email')).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toEqual({
      full_name: 'Test Buyer', company_name: 'Test Distributor',
      organization_profile: { address: '12 Example Road, Washington, United States', business_phone: '+1 202 555 0180' },
    });
  });
});

test('public resources and help work before signup', async ({ page }) => {
  await page.route('**/api/public-help', route => route.fulfill({ json: { topic: 'pricing' } }));
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: 'Ask Invexiqs' }).click();
  const chat = page.getByRole('dialog');
  await chat.getByRole('button', { name: 'Launch and signup' }).click();
  await expect(chat.getByText(/scheduled for June 2027/)).toBeVisible();
  await chat.getByRole('textbox', { name: 'Your question' }).fill('Can I pay yearly?');
  await chat.getByRole('button', { name: 'Ask', exact: true }).click();
  await chat.getByRole('link', { name: 'Compare pricing and features' }).click();
  await expect(page.getByRole('columnheader', { name: /Growth/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Annual', exact: true }).check();
  await expect(page.getByText(/\$948 billed annually/)).toBeVisible();
  await expect(page.getByRole('row', { name: /Stock by bin and lot/ })).toHaveText(/Included.*Included.*Included/);
  await page.getByRole('searchbox', { name: 'Search features' }).fill('replenishment');
  await expect(page.getByRole('row', { name: /Pick-bin replenishment/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Stock by bin and lot/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Barcode and bin labels' }).click();
  await page.getByLabel('Bin code or SKU').fill('A-01-03');
  await page.getByRole('button', { name: 'Generate Code 128' }).click();
  await expect(page.getByRole('link', { name: 'Download barcode for printing' })).toBeVisible();
  await page.getByLabel('Average daily demand (units)').fill('12');
  await page.getByLabel('Supplier lead time (days)').fill('5');
  await page.getByLabel('Safety stock (units)').fill('20');
  await page.getByRole('button', { name: 'Calculate reorder point' }).click();
  await expect(page.getByText('Reorder at 80 units.')).toBeVisible();
});
