import { NextResponse } from 'next/server';
import { uuid } from '@/lib/security';
import { HttpError, routeError } from '@/lib/server-auth';
import { decryptToken } from '@/lib/shopify-crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { paidWooOrder, validWooCommerceSignature } from '@/lib/woocommerce';

export async function POST(request: Request, { params }: { params: Promise<{ connection: string }> }) {
  try {
    const connection = uuid.parse((await params).connection);
    if (Number(request.headers.get('content-length')) > 512000) throw new HttpError(413, 'Webhook body too large');
    const db = createServiceClient();
    const { data: account, error } = await db.from('woocommerce_connections').select('encrypted_secret')
      .eq('id', connection).eq('enabled', true).maybeSingle();
    if (error) throw error;
    if (!account) throw new HttpError(404, 'WooCommerce connection unavailable');
    const body = await request.text();
    if (Buffer.byteLength(body) > 512000) throw new HttpError(413, 'Webhook body too large');
    const signature = request.headers.get('x-wc-webhook-signature');
    // WooCommerce verifies the delivery URL with a form-encoded ping before sending orders.
    if (!signature && /^webhook_id=\d+$/.test(body) && request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ received: true });
    }
    if (!validWooCommerceSignature(body, signature, decryptToken(account.encrypted_secret))) throw new HttpError(401, 'Invalid webhook signature');
    if (!['order.updated', 'order.created'].includes(request.headers.get('x-wc-webhook-topic') ?? '')) {
      return NextResponse.json({ received: true });
    }
    const input = JSON.parse(body);
    if (input.status !== 'processing' || !input.date_paid_gmt) return NextResponse.json({ received: true });
    const payload = paidWooOrder.parse(input);
    const { data, error: importError } = await db.rpc('import_woocommerce_order', { p_connection: connection, p_payload: payload });
    if (importError) throw importError;
    return NextResponse.json({ received: true, orderId: data.order_id, needsReview: !!data.review });
  } catch (error) { return routeError(error); }
}
