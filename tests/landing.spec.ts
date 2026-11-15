import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('hero section displays', async ({ page }) => {
    // Check for h1
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Inventory management');

    // Check for CTA buttons
    await expect(page.getByRole('link', { name: 'Start Free — No Credit Card', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /See All Features/i })).toBeVisible();
  });

  test('features describe the core warehouse workflows', async ({ page }) => {
    const featuresSection = page.locator('#features');
    await featuresSection.scrollIntoViewIfNeeded();

    await expect(featuresSection.getByRole('heading', { name: 'Product & Lot Tracking', exact: true })).toBeVisible();
    await expect(featuresSection.getByRole('heading', { name: 'Mobile Scanner', exact: true })).toBeVisible();
    await expect(featuresSection.getByRole('heading', { name: 'Receive & Ship', exact: true })).toBeVisible();
  });

  test('pricing section shows 3 plans', async ({ page }) => {
    const pricingSection = page.locator('#pricing');
    await pricingSection.scrollIntoViewIfNeeded();

    // Verify the three price points
    await expect(pricingSection.getByText('$49')).toBeVisible();
    await expect(pricingSection.getByText('$99')).toBeVisible();
    await expect(pricingSection.getByText('$199')).toBeVisible();

    // Verify three plan names
    await expect(pricingSection.getByText('Starter')).toBeVisible();
    await expect(pricingSection.getByText('Professional')).toBeVisible();
    await expect(pricingSection.getByText('Enterprise')).toBeVisible();
  });

  test('industries section shows verticals', async ({ page }) => {
    const industriesSection = page.locator('#industries');
    await industriesSection.scrollIntoViewIfNeeded();

    // Check for some specific industry items
    await expect(industriesSection.getByText('Medical Supply')).toBeVisible();
    await expect(industriesSection.getByText('Pharmaceutical')).toBeVisible();
    await expect(industriesSection.getByText('Food & Beverage')).toBeVisible();
    await expect(industriesSection.getByText('Auto Parts', { exact: true })).toBeVisible();


  });

  test('navigation links work', async ({ page }) => {
    // Click Features nav link and verify scroll target is in view
    await page.locator('nav a[href="#features"]').click();
    await expect(page.locator('#features')).toBeInViewport();

    // Click Pricing nav link and verify scroll target is in view
    await page.locator('nav a[href="#pricing"]').click();
    await expect(page.locator('#pricing')).toBeInViewport();
  });

  test('CTA buttons link to signup', async ({ page }) => {
    // Click the nav "Start Free Trial" button
    const ctaButton = page.locator('nav').getByRole('link', { name: /Start Free Trial/i });
    await expect(ctaButton).toHaveAttribute('href', '/auth/signup');

    await ctaButton.click();
    await page.waitForURL('**/auth/signup');
    expect(page.url()).toContain('/auth/signup');
  });
});
