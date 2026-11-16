import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyShopifyHmac, findTenantByShopDomain } from '@/lib/shopify-webhooks';
import { routeError, HttpError } from '@/lib/server-auth';
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!verifyShopifyHmac(raw, request.headers.get('x-shopify-hmac-sha256'))) throw new HttpError(401, 'Invalid signature');
    const domain = request.headers.get('x-shopify-shop-domain');
    const topic = request.headers.get('x-shopify-topic');
    const eventId = request.headers.get('x-shopify-webhook-id');
    if (!domain || !eventId || !['customers/data_request', 'customers/redact', 'shop/redact'].includes(topic || '')) throw new HttpError(400, 'Invalid privacy event');
    const db = createServiceClient();
    const tenant = await findTenantByShopDomain(db, domain);
    if (!tenant) return NextResponse.json({ received: true });
    const body = JSON.parse(raw);
    const { error } = await db.rpc('process_shopify_privacy', {
      p_tenant_id: tenant.id, p_domain: domain, p_topic: topic,
      p_event_id: `${domain}:${eventId}`, p_email: body.customer?.email || null,
    });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) { return routeError(error); }
}
