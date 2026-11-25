import { test, expect } from '@playwright/test';

test('notification jobs require an authorization key', async ({ request }) => {
  const response = await request.post('/api/notifications/check');
  expect(response.status()).toBe(401);
  expect((await request.post('/api/notifications/send-email')).status()).toBe(401);
});

test('portal invite authenticates before reading the body', async ({ request }) => {
  const response = await request.post('/api/portal/invite', {
    data: {},
  });
  expect(response.status()).toBe(401);
});
