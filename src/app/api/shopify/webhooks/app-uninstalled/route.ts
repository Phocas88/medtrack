import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyShopifyHmac, findTenantByShopDomain } from '@/lib/shopify-webhooks';
import { routeError, HttpError } from '@/lib/server-auth';
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!verifyShopifyHmac(raw, request.headers.get('x-shopify-hmac-sha256'))) throw new HttpError(401, 'Invalid signature');
    const domain = request.headers.get('x-shopify-shop-domain');
    if (!domain) throw new HttpError(400, 'Missing shop domain');
    const db = createServiceClient();
    const tenant = await findTenantByShopDomain(db, domain);
    if (tenant) {
      const { error } = await db.rpc('disconnect_shopify', { p_tenant_id: tenant.id });
      if (error) throw error;
    }
    return NextResponse.json({ received: true });
  } catch (error) { return routeError(error); }
}
