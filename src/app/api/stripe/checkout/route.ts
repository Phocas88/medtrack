import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

let stripe: Stripe | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeLib = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new StripeLib(process.env.STRIPE_SECRET_KEY) as Stripe;
  }
} catch {
  /* stripe not installed */
}

export async function POST(request: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { priceId, tenantId } = body;

    if (!priceId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required fields: priceId, tenantId' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancel`,
      client_reference_id: tenantId,
      metadata: {
        tenantId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
