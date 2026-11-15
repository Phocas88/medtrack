import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuid } from '@/lib/security';
import { routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { zapierTenant } from '@/lib/zapier';
const schemas = {
  create_product: z.object({ name: z.string().trim().min(1).max(200), sku: z.string().trim().min(1).max(100), price: z.number().nonnegative().optional(), cost: z.number().nonnegative().optional(), unit_of_measure: z.string().max(30).optional(), low_stock_threshold: z.number().int().nonnegative().optional() }),
  create_customer: z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().optional(), phone: z.string().max(100).optional(), ship_to_address: z.string().max(2000).optional(), notes: z.string().max(4000).optional() }),
  create_order: z.object({ customer_id: uuid, notes: z.string().max(4000).optional(), lines: z.array(z.object({ product_id: uuid, quantity: z.number().int().positive(), unit_price: z.number().nonnegative().optional() })).min(1).max(100) }),
  adjust_inventory: z.object({ lot_id: uuid, quantity: z.number().int().refine(value => value !== 0), reason: z.string().min(1).max(1000) }),
};
export async function POST(request: Request) {
  try {
    const tenant = await zapierTenant(request.headers.get('x-api-key'));
    const body = z.object({ request_id: uuid, action: z.enum(['create_product', 'create_customer', 'create_order', 'adjust_inventory']), data: z.unknown() }).parse(await request.json());
    const payload = schemas[body.action].parse(body.data);
    const { data, error } = await createServiceClient().rpc('zapier_action', { p_tenant_id: tenant, p_request_id: body.request_id, p_action: body.action, p_data: payload });
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) { return routeError(error); }
}
