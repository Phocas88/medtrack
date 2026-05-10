import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createShopifyClient } from '@/lib/shopify';

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

export async function POST() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get Shopify config from tenant settings
    const { data: tenant } = await svc.from('tenants').select('settings').eq('id', authUser.tenant_id).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const shopify = settings.shopify as Record<string, string> | undefined;

    if (!shopify?.store_url || !shopify?.access_token) {
      return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 });
    }

    const client = createShopifyClient({ store_url: shopify.store_url, access_token: shopify.access_token });
    const { products: shopifyProducts } = await client.getProducts(250);

    let created = 0;
    let updated = 0;

    for (const sp of shopifyProducts) {
      for (const variant of sp.variants) {
        if (!variant.sku) continue; // skip variants without SKU

        // Check if product exists by SKU
        const { data: existing } = await svc
          .from('products')
          .select('id')
          .eq('tenant_id', authUser.tenant_id)
          .eq('sku', variant.sku)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update price
          await svc.from('products').update({
            price: parseFloat(variant.price) || 0,
            image_url: sp.images[0]?.src || null,
          }).eq('id', existing[0].id);
          updated++;
        } else {
          // Create new product
          await svc.from('products').insert({
            tenant_id: authUser.tenant_id,
            name: sp.variants.length > 1 ? `${sp.title} - ${variant.title}` : sp.title,
            sku: variant.sku,
            category: sp.product_type || null,
            cost: 0,
            price: parseFloat(variant.price) || 0,
            unit_of_measure: 'each',
            low_stock_threshold: 10,
            is_lot_tracked: false,
            is_serial_tracked: false,
            storage_requirement: 'room_temp',
            expiry_alert_days: 60,
            lead_time_days: 7,
            image_url: sp.images[0]?.src || null,
          });
          created++;
        }
      }
    }

    // Update last sync time
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    const currentShopify = (currentSettings.shopify as Record<string, unknown>) || {};
    currentShopify.last_sync = new Date().toISOString();
    currentShopify.product_count = shopifyProducts.length;
    await svc.from('tenants').update({ settings: { ...currentSettings, shopify: currentShopify } }).eq('id', authUser.tenant_id);

    return NextResponse.json({ synced: created + updated, created, updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
  }
}
