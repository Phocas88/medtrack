import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadShopifyConnection } from '@/lib/shopify-connection';

export async function POST() {
  try {
    const user = await requireUser(['admin', 'manager'], true);
    const client = await loadShopifyConnection(user.tenant_id);
    const { orders } = await client.getOrders('open', 250);
    const db = createServiceClient();
    let imported = 0;
    for (const order of orders) {
      const { error } = await db.rpc('import_shopify_order', { p_tenant_id: user.tenant_id, p_order: order, p_event_id: `manual:${user.tenant_id}:${order.id}:${randomUUID()}` });
      if (error) throw error;
      imported++;
    }
    return NextResponse.json({ imported, total: orders.length });
  } catch (error) { return routeError(error); }
}
