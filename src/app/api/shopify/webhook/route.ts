import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request) {
  try {
    const topic = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');
    const body = await request.json();

    if (!topic || !shopDomain) {
      return NextResponse.json({ error: 'Missing Shopify headers' }, { status: 400 });
    }

    const supabase = svc();

    // Find the tenant by Shopify domain in settings
    const { data: tenants } = await supabase.from('tenants').select('id, settings');
    const tenant = (tenants || []).find((t) => {
      const s = (t.settings as Record<string, unknown>) || {};
      const shopify = (s.shopify as Record<string, unknown>) || {};
      const storeUrl = (shopify.store_url as string) || '';
      return storeUrl.includes(shopDomain) || shopDomain.includes(storeUrl.replace('.myshopify.com', ''));
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found for this shop' }, { status: 404 });
    }

    const tenantId = tenant.id;

    // ── Handle: orders/create ──
    if (topic === 'orders/create' || topic === 'orders/paid') {
      const order = body;
      const refNum = `SHOPIFY-${order.id}`;

      // Check if already exists
      const { data: existing } = await supabase
        .from('sales_orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('order_number', refNum)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({ status: 'already_imported' });
      }

      // Get admin user for created_by
      const { data: adminUser } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .limit(1);

      const createdBy = adminUser?.[0]?.id;
      if (!createdBy) {
        return NextResponse.json({ error: 'No admin user found' }, { status: 500 });
      }

      const orderId = crypto.randomUUID();
      await supabase.from('sales_orders').insert({
        id: orderId,
        tenant_id: tenantId,
        order_number: refNum,
        status: 'confirmed',
        created_by: createdBy,
        notes: `Auto-imported from Shopify ${order.name || ''}`,
      });

      // Add line items
      for (const li of order.line_items || []) {
        if (!li.sku) continue;
        const { data: prod } = await supabase
          .from('products')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('sku', li.sku)
          .limit(1);

        if (prod?.[0]) {
          await supabase.from('sales_order_lines').insert({
            tenant_id: tenantId,
            order_id: orderId,
            product_id: prod[0].id,
            quantity_ordered: li.quantity,
            quantity_shipped: 0,
            unit_price: parseFloat(li.price) || 0,
          });

          // Decrement stock
          await supabase.from('stock_movements').insert({
            tenant_id: tenantId,
            product_id: prod[0].id,
            user_id: createdBy,
            quantity: -li.quantity,
            movement_type: 'ship',
            reason: `Shopify order ${order.name || refNum}`,
            reference_number: refNum,
            metadata: { channel: 'online', shopify_order_id: order.id, webhook: true },
          });
        }
      }

      return NextResponse.json({ status: 'order_imported', order_id: orderId });
    }

    // ── Handle: inventory_levels/update ──
    if (topic === 'inventory_levels/update') {
      // Shopify sends: { inventory_item_id, location_id, available }
      // We'd need to map inventory_item_id back to a product — requires a mapping table
      // For now, log it
      console.log(`Shopify inventory update for item ${body.inventory_item_id}: ${body.available}`);
      return NextResponse.json({ status: 'inventory_noted' });
    }

    return NextResponse.json({ status: 'unhandled_topic', topic });
  } catch (err) {
    console.error('Shopify webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
