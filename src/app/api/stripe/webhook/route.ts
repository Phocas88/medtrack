import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripeClient, planForPrice } from '@/lib/billing';
import { createServiceClient } from '@/lib/supabase/service';
import { routeError, HttpError } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const stripe = stripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'Webhook verification is not configured');
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new HttpError(400, 'Missing signature');
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
    catch { throw new HttpError(400, 'Invalid signature'); }
    let subscriptionId: string | null = null;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
    } else if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (['invoice.payment_failed', 'invoice.paid'].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription;
      subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id || null;
    }
    if (!subscriptionId) return NextResponse.json({ received: true });
    // Retrieve current provider state rather than applying an old event snapshot.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const db = createServiceClient();
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const { data: billing, error: lookupError } = await db.from('tenant_billing').select('tenant_id').eq('stripe_customer_id', customerId).single();
    if (lookupError || !billing) throw new Error('Billing customer not found');
    if (subscription.metadata.tenantId && subscription.metadata.tenantId !== billing.tenant_id) throw new Error('Tenant metadata mismatch');
    const item = subscription.items.data[0];
    const priceId = item?.price.id;
    const plan = priceId ? planForPrice(priceId) : null;
    if (!plan) throw new Error('Unrecognized subscription price');
    const { error } = await db.rpc('apply_billing_event', {
      p_event_id: event.id, p_created: event.created, p_tenant_id: billing.tenant_id,
      p_billing: {
        plan, status: subscription.status, stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id, stripe_price_id: priceId,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
      },
    });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) { return routeError(error); }
}
