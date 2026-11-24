import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('404 page for unknown routes', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-xyz');
    // Should return 404 or redirect, but not crash
    expect(response?.status()).toBeLessThan(500);
  });

  test('invalid API route returns 404 or 405', async ({ request }) => {
    const response = await request.get('/api/nonexistent-endpoint');
    expect([404, 405]).toContain(response.status());
  });

  test('API endpoints reject GET when POST expected', async ({ request }) => {
    const response = await request.get('/api/auth/signup');
    expect([404, 405]).toContain(response.status());
  });

  test('malformed JSON body returns 400', async ({ request }) => {
    const response = await request.post('/api/contact', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not json',
    });
    expect(response.status()).toBe(400);
  });
});
