import { expect, test } from '@playwright/test';

test('brand metadata and icon assets are public', async ({ request }) => {
  for (const path of ['/manifest.webmanifest', '/manifest.json']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe('Invexiqs WMS');
    expect(manifest.start_url).toBe('/scanner');
    for (const icon of manifest.icons) {
      const asset = await request.get(icon.src, { maxRedirects: 0 });
      expect(asset.ok()).toBe(true);
      expect(asset.headers()['content-type']).toContain(icon.type);
    }
  }

  for (const path of ['/opengraph-image', '/branding/invexiqs-apple.png', '/favicon.ico', '/branding/invexiqs-logo.png', '/branding/invexiqs-logo-white.png']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/');
  }
});

for (const width of [390, 768, 1440]) {
  test(`brand and product images fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Invexiqs WMS home' })).toBeVisible();
    await expect(page.getByText('Intelligence in Every Movement.', { exact: true })).toBeVisible();
    const logo = page.getByRole('link', { name: 'Invexiqs WMS home' }).getByRole('img', { name: 'Invexiqs WMS' });
    await expect(logo).toHaveAttribute('src', '/branding/invexiqs-logo.png');
    await expect.poll(() => logo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1530);
    for (const image of await page.locator('main figure img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
