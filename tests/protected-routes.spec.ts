import { test, expect } from '@playwright/test';

const protectedRoutes = [
  '/dashboard',
  '/products',
  '/lots',
  '/movements',
  '/purchase-orders',
  '/receive',
  '/ship',
  '/returns',
  '/locations',
  '/transfers',
  '/cycle-counts',
  '/quarantine',
  '/bins',
  '/scanner',
  '/customers',
  '/suppliers',
  '/settings',
  '/reports',
  '/analytics',
  '/audit',
  '/notifications',
  '/pricing',
  '/documents',
  '/kitting',
  '/reorder',
  '/consignment',
  '/expiration',
  '/controlled-substances',
  '/dscsa',
  '/compliance',
  '/wave-picking',
  '/cross-dock',
  '/dock-scheduling',
  '/labor',
  '/slotting',
  '/abc-analysis',
  '/admin/users',
  '/scan',
];

for (const route of protectedRoutes) {
  test(`${route} redirects unauthenticated to login`, async ({ page }) => {
    await page.goto(route);
    await page.waitForURL('**/auth/login**', { timeout: 5000 });
    expect(page.url()).toContain('/auth/login');
  });
}
