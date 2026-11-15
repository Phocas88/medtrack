import { requireUser, routeError } from '@/lib/server-auth';
import { loadShopifyConnection } from '@/lib/shopify-connection';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    const authUser = await requireUser(['admin', 'manager'], true);
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const client = await loadShopifyConnection(authUser.tenant_id);
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
          const { error: writeError } = await svc.from('products').update({
            price: parseFloat(variant.price) || 0,
            image_url: sp.images[0]?.src || null,
          }).eq('id', existing[0].id);
          if (writeError) throw writeError;
          updated++;
        } else {
          // Create new product
          const { error: writeError } = await svc.from('products').insert({
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
          if (writeError) throw writeError;
          created++;
        }
      }
    }

    return NextResponse.json({ synced: created + updated, created, updated });
  } catch (error) { return routeError(error); }
}
