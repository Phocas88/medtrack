import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyShopifyHmac, findTenantByShopDomain } from '@/lib/shopify-webhooks';
import { routeError, HttpError } from '@/lib/server-auth';
import { loadShopifyConnection } from '@/lib/shopify-connection';

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!verifyShopifyHmac(raw, request.headers.get('x-shopify-hmac-sha256'))) throw new HttpError(401, 'Invalid signature');
    const topic = request.headers.get('x-shopify-topic');
    const domain = request.headers.get('x-shopify-shop-domain');
    const eventId = request.headers.get('x-shopify-webhook-id');
    if (!domain || !eventId) throw new HttpError(400, 'Missing event headers');
    if (!['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled'].includes(topic || '')) return NextResponse.json({ received: true, ignored: true });
    const db = createServiceClient();
    const tenant = await findTenantByShopDomain(db, domain);
    if (!tenant) throw new HttpError(404, 'Store not found');
    const body = JSON.parse(raw);
    if (!/^\d+$/.test(String(body.id))) throw new HttpError(400, 'Invalid order ID');
    // Read current provider state to avoid applying out-of-order notification snapshots.
    const client = await loadShopifyConnection(tenant.id);
    const { order } = await client.getOrder(String(body.id));
    const { data, error } = await db.rpc('import_shopify_order', { p_tenant_id: tenant.id, p_order: order, p_event_id: `${domain}:${eventId}` });
    if (error) throw error;
    return NextResponse.json({ received: true, order_id: data });
  } catch (error) { return routeError(error); }
}
