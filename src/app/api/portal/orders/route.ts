import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePortalCustomer } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { routeError } from '@/lib/server-auth';
import { uuid } from '@/lib/security';
export async function GET(request: Request) {
  try {
    const { membership } = await requirePortalCustomer(new URL(request.url).searchParams.get('customer') || undefined);
    const { data, error } = await createServiceClient().from('sales_orders').select('id,order_number,status,created_at,lines:sales_order_lines(quantity_ordered,unit_price),shipments(tracking_number,shipped_at)').eq('tenant_id', membership.tenant_id).eq('customer_id', membership.customer_id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ orders: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  try {
    const input = z.object({ customer_id: uuid, request_id: uuid, lines: z.array(z.object({ product_id: uuid, quantity: z.number().int().positive() })).min(1).max(100) }).parse(await request.json());
    const { membership, session } = await requirePortalCustomer(input.customer_id);
    const { data, error } = await session.rpc('portal_place_order', { p_request_id: input.request_id, p_customer_id: membership.customer_id, p_lines: input.lines });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) { return routeError(error); }
}
