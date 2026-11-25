import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const respond = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function GET() {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return respond({ error: 'Sign in to your workspace.' }, 401);

    const { data: profile, error } = await client.from('users').select('*')
      .eq('id', user.id).maybeSingle();
    const email = user.email ?? null;
    if (error) return respond({ email, error: 'Could not read your workspace profile.' }, 502);
    if (!profile?.tenant_id) return respond({ email, error: 'No workspace is assigned to this account.' }, 404);

    const { data: tenant } = await client.from('tenants').select('name, settings')
      .eq('id', profile.tenant_id).maybeSingle();
    return respond({ email, user: profile, tenant });
  } catch {
    return respond({ error: 'Could not load your workspace.' }, 502);
  }
}
