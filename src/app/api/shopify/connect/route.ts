import { requireUser, routeError } from '@/lib/server-auth';
import { NextResponse } from 'next/server';
import { createShopifyClient } from '@/lib/shopify';

export async function POST(request: Request) {
  try {
    await requireUser(['admin'], true);
    const { store_url, access_token } = await request.json();
    if (!store_url || !access_token) {
      return NextResponse.json({ error: 'Store URL and access token required' }, { status: 400 });
    }

    const client = createShopifyClient({ store_url, access_token });

    // Test connection by fetching shop info
    const { shop } = await client.getShop();
    const { count: productCount } = await client.getProductCount();
    const { count: orderCount } = await client.getOrderCount();

    return NextResponse.json({
      success: true,
      shop_name: shop.name,
      shop_domain: shop.domain,
      plan: shop.plan_name,
      product_count: productCount,
      order_count: orderCount,
    });
  } catch (err) {
    return routeError(err);
  }
}
