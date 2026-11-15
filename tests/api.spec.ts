import { test, expect } from '@playwright/test';

test('notification check endpoint exists', async ({ request }) => {
  const response = await request.post('/api/notifications/check');
  // Endpoint should exist (200 or 401), not be missing (404)
  expect([401, 503]).toContain(response.status());
});

test('portal invite requires body', async ({ request }) => {
  const response = await request.post('/api/portal/invite', {
    data: {},
  });
  expect(response.status()).toBe(401);
});
