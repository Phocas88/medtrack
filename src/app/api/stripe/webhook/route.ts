import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripe: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch {
  /* stripe not installed */
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }
  return createClient(url, serviceKey);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateTenantBilling(tenantId: string, billingData: Record<string, any>) {
  const supabase = createServiceClient();

  // Fetch current settings
  const { data: tenant, error: fetchError } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  if (fetchError) {
    console.error('Failed to fetch tenant:', fetchError);
    throw fetchError;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentSettings = (tenant?.settings as Record<string, any>) || {};
  const updatedSettings = {
    ...currentSettings,
    billing: {
      ...(currentSettings.billing || {}),
      ...billingData,
      updated_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('tenants')
    .update({ settings: updatedSettings })
    .eq('id', tenantId);

  if (updateError) {
    console.error('Failed to update tenant billing:', updateError);
    throw updateError;
  }
}

// Map Stripe price IDs to plan names
function getPlanFromPrice(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER || 'price_starter']: 'starter',
    [process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional']: 'professional',
    [process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise']: 'enterprise',
  };
  return priceMap[priceId] || 'unknown';
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 503 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenantId || session.client_reference_id;

        if (tenantId && session.subscription) {
          // Retrieve subscription to get price info
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = subscription.items.data[0]?.price?.id;

          await updateTenantBilling(tenantId, {
            plan: getPlanFromPrice(priceId),
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            stripe_price_id: priceId,
            status: 'active',
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenantId;

        if (tenantId) {
          const priceId = subscription.items.data[0]?.price?.id;
          const status = subscription.cancel_at_period_end ? 'cancelling' : subscription.status;

          await updateTenantBilling(tenantId, {
            plan: getPlanFromPrice(priceId),
            stripe_price_id: priceId,
            status: status === 'active' ? 'active' : status,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenantId;

        if (tenantId) {
          await updateTenantBilling(tenantId, {
            status: 'cancelled',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          // Look up the subscription to get tenant metadata
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const tenantId = subscription.metadata?.tenantId;

          if (tenantId) {
            await updateTenantBilling(tenantId, {
              status: 'past_due',
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Still return 200 so Stripe doesn't retry
  }

  return NextResponse.json({ received: true });
}
