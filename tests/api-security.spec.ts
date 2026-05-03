import { test, expect } from '@playwright/test';

test.describe('API Security', () => {
  test('signup API rejects empty body', async ({ request }) => {
    const response = await request.post('/api/auth/signup', {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('signup API rejects partial body', async ({ request }) => {
    const response = await request.post('/api/auth/signup', {
      data: { userId: '123' },
    });
    expect(response.status()).toBe(400);
  });

  test('signup API rejects missing companyName', async ({ request }) => {
    const response = await request.post('/api/auth/signup', {
      data: { userId: '123', email: 'test@test.com', fullName: 'Test' },
    });
    expect(response.status()).toBe(400);
  });

  test('notification check API exists', async ({ request }) => {
    const response = await request.post('/api/notifications/check');
    expect(response.status()).not.toBe(404);
  });

  test('admin user creation requires authentication', async ({ request }) => {
    const response = await request.post('/api/admin/users', {
      data: {
        tenant_id: 'test',
        email: 'new@test.com',
        full_name: 'New User',
        role: 'staff',
      },
    });
    expect([403, 500]).toContain(response.status());
  });

  test('admin password reset requires authentication', async ({ request }) => {
    const response = await request.post('/api/admin/users/reset-password', {
      data: { email: 'user@test.com' },
    });
    expect([403, 500]).toContain(response.status());
  });
});
