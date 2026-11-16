import { NextResponse } from 'next/server';
import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
export async function POST() {
  try {
    const user = await requireUser(['admin']);
    const { error } = await createServiceClient().rpc('disconnect_shopify', { p_tenant_id: user.tenant_id });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return routeError(error); }
}
