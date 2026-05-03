import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase service role env vars');
  return createClient(url, serviceKey);
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: dbUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return dbUser;
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Use Supabase to generate a password reset link
    const { error } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

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
  } catch (err) {
    console.error('Password reset error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
