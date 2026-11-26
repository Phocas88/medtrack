import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { stripeClient, planKeys, priceForPlan } from '@/lib/billing';
import { createServiceClient } from '@/lib/supabase/service';
import { appOrigin } from '@/lib/security';

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true, true);
    const { plan } = z.object({ plan: z.enum(planKeys) }).parse(await request.json());
    const stripe = stripeClient();
    const price = priceForPlan(plan);
    const db = createServiceClient();
    const { data: billing, error } = await db.from('tenant_billing').select('*').eq('tenant_id', user.tenant_id).maybeSingle();
    if (error) throw error;
    if (billing?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(billing.status)) {
      throw new HttpError(409, 'Manage your existing subscription using the billing portal');
    }
    let customerId = billing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { tenantId: user.tenant_id } }, { idempotencyKey: `tenant-customer-${user.tenant_id}` });
      customerId = customer.id;
      const { error: saveError } = await db.from('tenant_billing').upsert({ tenant_id: user.tenant_id, stripe_customer_id: customerId }, { onConflict: 'tenant_id' });
      if (saveError) throw saveError;
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appOrigin()}/billing?checkout=success`, cancel_url: `${appOrigin()}/billing?checkout=cancelled`,
      client_reference_id: user.tenant_id, metadata: { tenantId: user.tenant_id },
      subscription_data: { metadata: { tenantId: user.tenant_id } },
    }, { idempotencyKey: `checkout-${user.tenant_id}-${plan}-${Math.floor(Date.now() / 1800000)}` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return routeError(error); }
}
