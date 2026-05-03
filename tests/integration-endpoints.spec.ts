import { test, expect } from '@playwright/test';

test.describe('Integration Endpoints', () => {
  test('Zapier trigger endpoint exists', async ({ request }) => {
    const response = await request.get('/api/zapier/trigger');
    // Should return 401 (unauthorized) not 404 (missing)
    expect(response.status()).not.toBe(404);
  });

  test('Zapier action endpoint exists', async ({ request }) => {
    const response = await request.post('/api/zapier/action', {
      data: { action: 'test' },
    });
    expect(response.status()).not.toBe(404);
  });

  test('Stripe webhook endpoint exists', async ({ request }) => {
    const response = await request.post('/api/stripe/webhook', {
      data: { type: 'test' },
    });
    // Should be 400 (bad signature) not 404
    expect(response.status()).not.toBe(404);
  });

  test('notification email endpoint exists', async ({ request }) => {
    const response = await request.post('/api/notifications/send-email', {
      data: {},
    });
    expect(response.status()).not.toBe(404);
  });
});
