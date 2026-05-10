import { NextResponse } from 'next/server';
import { buyLabel, isShippingConfigured } from '@/lib/shipping';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    if (!isShippingConfigured()) {
      return NextResponse.json({ error: 'Shipping not configured' }, { status: 400 });
    }

    const authUser = await getAuthUser();
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { shipment_id, rate_id, order_id } = await request.json();

    if (!shipment_id || !rate_id) {
      return NextResponse.json({ error: 'shipment_id and rate_id required' }, { status: 400 });
    }

    const result = await buyLabel(shipment_id, rate_id);

    // Update the sales order with tracking info
    if (order_id) {
      const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await svc.from('sales_orders').update({
        tracking_number: result.tracking_code,
        carrier: result.rate.carrier,
        shipping_label_url: result.label_url,
        shipping_rate: parseFloat(result.rate.rate),
        status: 'picking', // ready to pick and ship
      }).eq('id', order_id);

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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to buy label' }, { status: 500 });
  }
}
