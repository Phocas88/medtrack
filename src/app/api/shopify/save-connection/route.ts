import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, routeError } from '@/lib/server-auth';
import { shopDomain } from '@/lib/security';
import { createShopifyClient } from '@/lib/shopify';
import { saveShopifyConnection } from '@/lib/shopify-connection';

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true);
    const input = z.object({ store_url: z.string(), access_token: z.string().min(10).max(1000) }).parse(await request.json());
    const domain = shopDomain(input.store_url);
    const client = createShopifyClient({ store_url: domain, access_token: input.access_token });
    const { shop } = await client.getShop();
    await saveShopifyConnection(user.tenant_id, domain, input.access_token, shop.name);
    return NextResponse.json({ success: true, shop_name: shop.name, shop_domain: domain });
  } catch (error) { return routeError(error); }
}
