import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createShopifyClient } from '@/lib/shopify';
import { encryptToken } from '@/lib/shopify-crypto';

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
  return data;
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { store_url, access_token } = await request.json();
    if (!store_url || !access_token) {
      return NextResponse.json({ error: 'Store URL and access token required' }, { status: 400 });
    }

    // Test connection
    const client = createShopifyClient({ store_url, access_token });
    const { shop } = await client.getShop();
    const { count: productCount } = await client.getProductCount();
    const { count: orderCount } = await client.getOrderCount();

    // Encrypt token before storing
    const encryptedToken = encryptToken(access_token);

    // Save to tenant settings
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: tenant } = await svc.from('tenants').select('settings').eq('id', authUser.tenant_id).single();
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

    await svc.from('tenants').update({
      settings: {
        ...currentSettings,
        shopify: {
          store_url,
          access_token: encryptedToken,
          shop_name: shop.name,
          shop_domain: shop.domain,
          connected: true,
          auto_sync_orders: true,
          auto_sync_inventory: true,
          connected_at: new Date().toISOString(),
          product_count: productCount,
          order_count: orderCount,
        },
      },
    }).eq('id', authUser.tenant_id);

    // Register webhooks for real-time events
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stokora.vercel.app';
    const webhookTopics = [
      { topic: 'orders/create', address: `${baseUrl}/api/shopify/webhook` },
      { topic: 'app/uninstalled', address: `${baseUrl}/api/shopify/webhooks/app-uninstalled` },
    ];

    for (const wh of webhookTopics) {
      try { await client.createWebhook(wh.topic, wh.address); } catch { /* may already exist */ }
    }

    return NextResponse.json({
      success: true,
      shop_name: shop.name,
      shop_domain: shop.domain,
      product_count: productCount,
      order_count: orderCount,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Connection failed' }, { status: 400 });
  }
}
