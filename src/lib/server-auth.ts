import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@/types/database';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(roles?: User['role'][], external = false, allowUnpaid = false): Promise<User> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Sign in required');
  const { data: profile, error: profileError } = await supabase.from('users').select('*').eq('id', user.id).single();
  if (profileError || !profile || !profile.is_active) throw new HttpError(403, 'Active warehouse account required');
  if (profile.access_level === 'scanner_only' || (roles && !roles.includes(profile.role))) throw new HttpError(403, 'Insufficient permissions');
  if (external && (profile.email.endsWith('.wms.local') || profile.email.endsWith('@stokora-wms.com'))) {
    throw new HttpError(403, 'External operations are disabled for demo accounts');
  }
  if (external) {
    const { data: tenant, error: tenantError } = await supabase.from('tenants').select('settings').eq('id', profile.tenant_id).single();
    if (tenantError || !tenant || tenant.settings?.is_demo) throw new HttpError(403, 'External operations unavailable');
    if (!allowUnpaid) {
      const { data: entitled, error: entitlementError } = await supabase.rpc('tenant_has_access');
      if (entitlementError || !entitled) throw new HttpError(402, 'An active subscription or trial is required');
    }
  }
  return profile as User;
}

export function routeError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  console.error('Request failed', { type: error instanceof Error ? error.name : 'UnknownError' });
  return NextResponse.json({ error: 'Operation failed. Please retry or contact support.' }, { status: 500 });
}
