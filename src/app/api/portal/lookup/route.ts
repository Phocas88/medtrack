import { NextResponse } from 'next/server';
import { requirePortalCustomer } from '@/lib/portal-auth';
import { routeError } from '@/lib/server-auth';
export async function GET(request: Request) {
  try {
    const { membership } = await requirePortalCustomer(new URL(request.url).searchParams.get('customer') || undefined);
    return NextResponse.json({ customer: membership.customer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
