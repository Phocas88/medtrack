import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // Get the authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service role to bypass RLS and find customer by email
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: customers, error } = await svc
      .from('customers')
      .select('id, tenant_id, name, email, phone, ship_to_address, price_tier_id, notes')
      .eq('email', user.email)
      .limit(1);

    if (error || !customers || customers.length === 0) {
      return NextResponse.json({ error: 'No customer account found' }, { status: 404 });
    }

    return NextResponse.json({ customer: customers[0] });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
