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

    const { data: tenant } = await svc.from('tenants').select('settings').eq('id', authUser.tenant_id).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const shopify = settings.shopify as Record<string, string> | undefined;

    if (!shopify?.store_url || !shopify?.access_token) {
      return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 });
    }

    const client = createShopifyClient({ store_url: shopify.store_url, access_token: shopify.access_token });
    const { orders: shopifyOrders } = await client.getOrders('open', 50);

    let imported = 0;
    let skipped = 0;

    for (const so of shopifyOrders) {
      // Check if already imported by reference number
      const refNum = `SHOPIFY-${so.id}`;
      const { data: existing } = await svc
        .from('sales_orders')
        .select('id')
        .eq('tenant_id', authUser.tenant_id)
        .eq('order_number', refNum)
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      // Match or create customer
      let customerId: string | null = null;
      if (so.customer?.email) {
        const { data: cust } = await svc
          .from('customers')
          .select('id')
          .eq('tenant_id', authUser.tenant_id)
          .eq('email', so.customer.email)
          .limit(1);

        if (cust && cust.length > 0) {
          customerId = cust[0].id;
        } else {
          const { data: newCust } = await svc
            .from('customers')
            .insert({
              tenant_id: authUser.tenant_id,
              name: `${so.customer.first_name} ${so.customer.last_name}`.trim(),
              email: so.customer.email,
              ship_to_address: so.shipping_address
                ? `${so.shipping_address.address1}, ${so.shipping_address.city}, ${so.shipping_address.province} ${so.shipping_address.zip}`
                : null,
            })
            .select('id')
            .single();
          customerId = newCust?.id || null;
        }
      }

      // Create sales order
      const status = so.fulfillment_status === 'fulfilled' ? 'shipped' : so.financial_status === 'paid' ? 'confirmed' : 'draft';
      const orderId = crypto.randomUUID();

      await svc.from('sales_orders').insert({
        id: orderId,
        tenant_id: authUser.tenant_id,
        order_number: refNum,
        customer_id: customerId,
        status,
        created_by: authUser.id,
        notes: `Imported from Shopify order ${so.name}`,
      });

      // Add line items — match products by SKU
      for (const li of so.line_items) {
        let productId: string | null = null;
        if (li.sku) {
          const { data: prod } = await svc
            .from('products')
            .select('id')
            .eq('tenant_id', authUser.tenant_id)
            .eq('sku', li.sku)
            .limit(1);
          productId = prod?.[0]?.id || null;
        }

        if (productId) {
          await svc.from('sales_order_lines').insert({
            tenant_id: authUser.tenant_id,
            order_id: orderId,
            product_id: productId,
            quantity_ordered: li.quantity,
            quantity_shipped: status === 'shipped' ? li.quantity : 0,
            unit_price: parseFloat(li.price) || 0,
          });
        }
      }

      // Record stock movements for fulfilled orders
      if (status === 'shipped') {
        for (const li of so.line_items) {
          if (!li.sku) continue;
          const { data: prod } = await svc.from('products').select('id').eq('tenant_id', authUser.tenant_id).eq('sku', li.sku).limit(1);
          if (prod?.[0]) {
            await svc.from('stock_movements').insert({
              tenant_id: authUser.tenant_id,
              product_id: prod[0].id,
              user_id: authUser.id,
              quantity: -li.quantity,
              movement_type: 'ship',
              reason: `Shopify order ${so.name}`,
              reference_number: refNum,
              metadata: { channel: 'online', shopify_order_id: so.id },
            });
          }
        }
      }

      imported++;
    }

    // Update order count
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    const currentShopify = (currentSettings.shopify as Record<string, unknown>) || {};
    const { count: orderCount } = await client.getOrderCount();
    currentShopify.order_count = orderCount;
    await svc.from('tenants').update({ settings: { ...currentSettings, shopify: currentShopify } }).eq('id', authUser.tenant_id);

    return NextResponse.json({ imported, skipped, total: shopifyOrders.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
  }
}
