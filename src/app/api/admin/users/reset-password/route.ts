import { requireUser, routeError } from '@/lib/server-auth';
import { appOrigin } from '@/lib/security';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase service role env vars');
  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    const authUser = await requireUser(['admin'], true);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    const { data: target } = await serviceClient.from('users').select('id').eq('email', email).eq('tenant_id', authUser.tenant_id).single();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const { error } = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo: `${appOrigin()}/auth/reset?type=recovery` });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log to audit
    await serviceClient.from('stock_movements').insert({
      tenant_id: authUser.tenant_id,
      product_id: null,
      user_id: authUser.id,
      quantity: 0,
      movement_type: 'adjust',
      reason: `IT: Password reset initiated for ${email}`,
      reference_number: `USER-RESET-${Date.now().toString(36)}`,
      metadata: {
        action: 'password_reset',
        target_email: email,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) { return routeError(error); }
}
