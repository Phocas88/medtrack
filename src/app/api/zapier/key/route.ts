import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { hashApiKey } from '@/lib/zapier';
export async function POST() {
  try {
    const user = await requireUser(['admin'], true);
    const key = `stk_${randomBytes(32).toString('hex')}`;
    const { error } = await createServiceClient().from('tenant_api_keys').upsert({ tenant_id: user.tenant_id, provider: 'zapier', key_hash: hashApiKey(key) }, { onConflict: 'tenant_id,provider' });
    if (error) throw error;
    return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
