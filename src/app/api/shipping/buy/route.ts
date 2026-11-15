import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { buyLabel, isShippingConfigured } from '@/lib/shipping';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(['admin', 'manager', 'staff'], true);
    if (!isShippingConfigured()) {
      return NextResponse.json({ error: 'Shipping not configured' }, { status: 400 });
    }

    const authUser = authorizedUser;

    const { shipment_id, rate_id, order_id } = await request.json();

    if (!shipment_id || !rate_id) {
      return NextResponse.json({ error: 'shipment_id and rate_id required' }, { status: 400 });
    }

    const db = createServiceClient();
    const { data: quote, error: quoteError } = await db.from('shipping_quotes').select('*').eq('shipment_id', shipment_id).eq('tenant_id', authorizedUser.tenant_id).single();
    if (quoteError || !quote || !quote.rates.some((rate: { id: string }) => rate.id === rate_id)) return NextResponse.json({ error: 'Shipping quote not found' }, { status: 404 });
    if (!order_id) return NextResponse.json({ error: 'An order is required' }, { status: 400 });
    const { data: order, error: orderError } = await db.from('sales_orders').select('id,status').eq('id', order_id).eq('tenant_id', authorizedUser.tenant_id).single();
    if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!['draft', 'confirmed', 'picking'].includes(order.status)) return NextResponse.json({ error: 'Order is not available for shipping' }, { status: 409 });
    const result = quote.purchased || await buyLabel(shipment_id, rate_id);
    const { error: saveError } = await db.from('shipping_quotes').update({ purchased: result }).eq('shipment_id', shipment_id).eq('tenant_id', authorizedUser.tenant_id);
    if (saveError) throw saveError;

    // Update the sales order with tracking info
    if (order_id) {
      const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await svc.from('sales_orders').update({
        tracking_number: result.tracking_code,
        carrier: result.rate.carrier,
        shipping_label_url: result.label_url,
        shipping_rate: parseFloat(result.rate.rate),
        status: 'picking', // ready to pick and ship
      }).eq('id', order_id).eq('tenant_id', authorizedUser.tenant_id);

      // Audit log
      await svc.from('stock_movements').insert({
        tenant_id: authUser.tenant_id,
        product_id: null,
        user_id: authUser.id,
        quantity: 0,
        movement_type: 'adjust',
        reason: `Shipping label purchased — ${result.rate.carrier} ${result.rate.service} — Tracking: ${result.tracking_code}`,
        reference_number: result.tracking_code,
        metadata: {
          action: 'shipping_label',
          carrier: result.rate.carrier,
          service: result.rate.service,
          rate: result.rate.rate,
          label_url: result.label_url,
          order_id,
        },
      });
    }

    return NextResponse.json({
      tracking_code: result.tracking_code,
      label_url: result.label_url,
      carrier: result.rate.carrier,
      service: result.rate.service,
      rate: result.rate.rate,
    });
  } catch (err) {
    return routeError(err);
  }
}
