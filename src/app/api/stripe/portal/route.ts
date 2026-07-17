import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }
  return createClient(url, serviceKey);
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
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing required field: tenantId' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const billing = settings.billing as Record<string, unknown> | undefined;
    const customerId = billing?.stripe_customer_id as string | undefined;

    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
