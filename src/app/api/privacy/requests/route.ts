import { NextResponse } from 'next/server';
import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
export async function GET() {
  try {
    const user = await requireUser(['admin']);
    const { data, error } = await createServiceClient().from('gdpr_requests').select('id,request_type,status,created_at,payload').eq('tenant_id', user.tenant_id).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ requests: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
