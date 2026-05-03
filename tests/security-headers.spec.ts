import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('landing page has security headers', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
  });

  test('CSP header is present', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('stripe.com');
  });

  test('permissions policy is set', async ({ request }) => {
    const response = await request.get('/');
    const pp = response.headers()['permissions-policy'];
    expect(pp).toContain('camera=(self)');
    expect(pp).toContain('microphone=()');
  });

  test('auth pages have security headers', async ({ request }) => {
    const response = await request.get('/auth/login');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  });
});
