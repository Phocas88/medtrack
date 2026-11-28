import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePortalCustomer } from '@/lib/portal-auth';
import { HttpError, routeError } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { membership, session } = await requirePortalCustomer(params.get('customer') || undefined);
    const offset = z.coerce.number().int().min(0).max(1000000).parse(params.get('offset') ?? 0);
    const search = z.string().trim().max(120).parse(params.get('search') ?? '');
    const { data, error } = await session.rpc('portal_storefront', {
      p_customer: membership.customer_id, p_search: search, p_offset: offset,
    });
    if (error?.code === '42501') throw new HttpError(403, error.message);
    if (error) throw error;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
