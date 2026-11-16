import { NextResponse } from 'next/server';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { stripeClient } from '@/lib/billing';
import { createServiceClient } from '@/lib/supabase/service';
import { appOrigin } from '@/lib/security';

export async function POST() {
  try {
    const user = await requireUser(['admin'], true, true);
    const { data, error } = await createServiceClient().from('tenant_billing').select('stripe_customer_id').eq('tenant_id', user.tenant_id).single();
    if (error || !data?.stripe_customer_id) throw new HttpError(404, 'No subscription account found');
    const session = await stripeClient().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${appOrigin()}/billing` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return routeError(error); }
}
