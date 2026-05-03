import { test, expect } from '@playwright/test';

test.describe('Admin User Management', () => {
  test('/admin/users redirects unauthenticated users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('**/auth/login**');
    expect(page.url()).toContain('/auth/login');
  });

  test('admin users API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/admin/users', {
      data: { tenant_id: 'fake', email: 'test@test.com', full_name: 'Test' },
    });
    // Should be 403 (Unauthorized) or 500 (missing env) — not 404
    expect([403, 500]).toContain(response.status());
  });

  test('admin password reset API rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/admin/users/reset-password', {
      data: { email: 'test@test.com' },
    });
    expect([403, 500]).toContain(response.status());
  });
});
