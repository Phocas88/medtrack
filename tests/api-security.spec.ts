import { test, expect } from '@playwright/test';
for (const endpoint of ['/api/auth/signup','/api/admin/users','/api/admin/users/reset-password','/api/portal/invite','/api/stripe/checkout','/api/stripe/portal','/api/pos/charge','/api/shipping/rates','/api/shipping/buy','/api/shipping/pickup','/api/po/send','/api/shopify/save-connection','/api/shopify/sync-orders']) {
  test(`${endpoint} rejects unauthenticated requests`, async ({request}) => {
    const response=await request.post(endpoint,{data:{}});
    expect([401,403]).toContain(response.status());
  });
}
test('Shopify rejects unsigned orders',async({request})=>{
  const response=await request.post('/api/shopify/webhook',{headers:{'x-shopify-topic':'orders/create','x-shopify-shop-domain':'fixture.myshopify.com'},data:{id:1}});
  expect(response.status()).toBe(401);
});
