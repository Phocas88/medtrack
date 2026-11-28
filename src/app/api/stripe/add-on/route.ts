import { NextResponse } from 'next/server';
import { z } from 'zod';
import { priceForAddOn, stripeClient } from '@/lib/billing';
import { getSuiteProduct } from '@/lib/product-suite';
import { appOrigin } from '@/lib/security';
import { HttpError, requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true);
    const { product: slug } = z.object({ product: z.string() }).parse(await request.json());
    const product = getSuiteProduct(slug);
    if (!product) throw new HttpError(400, 'Unknown Invexiqs add-on');
    const price = priceForAddOn(product.slug);
    const stripe = stripeClient();
    const db = createServiceClient();
    const { data: billing, error: billingError } = await db.from('tenant_billing')
      .select('stripe_customer_id').eq('tenant_id', user.tenant_id).maybeSingle();
    if (billingError) throw billingError;
    if (!billing?.stripe_customer_id) throw new HttpError(409, 'Set up WMS billing before adding a product.');

    const { data: checkout, error } = await db.rpc('reserve_suite_checkout', {
      p_tenant: user.tenant_id, p_product: product.slug, p_price: price,
    });
    if (error?.code === 'P0001') throw new HttpError(409, error.message);
    if (error || !checkout) throw error ?? new Error('Checkout reservation missing');
    const metadata = { tenantId: user.tenant_id, suiteProduct: product.slug, suiteCheckout: checkout.id };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: billing.stripe_customer_id,
      client_reference_id: user.tenant_id,
      line_items: [{ price: checkout.price, quantity: 1 }],
      expires_at: Math.floor(new Date(checkout.expires_at).getTime() / 1000),
      success_url: `${appOrigin()}/suite-workspace?checkout=success`,
      cancel_url: `${appOrigin()}/suite-workspace`,
      metadata,
      subscription_data: { metadata },
    }, { idempotencyKey: `suite-checkout-${checkout.id}` });
    if (!session.url) throw new HttpError(409, 'Checkout is already complete. Refresh your workspace to check access.');
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return routeError(error);
  }
}
