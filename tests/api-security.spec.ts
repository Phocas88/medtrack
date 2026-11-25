import { test, expect } from '@playwright/test';

test.describe('API Security', () => {
  test('old signup requests cannot provision an administrator', async ({ request }) => {
    const response = await request.post('/api/auth/signup', {
      data: { userId: 'fixture', email: 'fixture@example.test', fullName: 'Fixture', companyName: 'Fixture' },
    });
    expect(response.status()).toBe(503);
  });

  test('card charging, billing, and demo seed routes fail closed', async ({ request }) => {
    for (const path of ['/api/pos/charge', '/api/stripe/checkout', '/api/stripe/portal']) {
      const response = await request.post(path, {data: {}});
      expect(response.status()).toBe(503);
      expect(await response.json()).not.toHaveProperty('success');
    }
    const seed = await request.post('/api/demo/seed');
    expect(seed.status()).toBe(410);
    const demoSession = await request.post('/api/demo/session', {data: {role: 'not-a-role', email: 'fixture@example.test'}});
    expect(demoSession.status()).toBe(400);
  });

  test('public pages and warehouse routes enforce different access rules', async ({ request }) => {
    for (const path of ['/', '/demo', '/support', '/guide', '/legal/privacy', '/legal/terms', '/robots.txt', '/sitemap.xml']) {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200);
    }
    for (const path of ['/dashboard', '/billing', '/pos', '/scan', '/portal']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()['location']).toContain(path === '/portal' ? '/portal/login' : '/auth/login');
    }
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
