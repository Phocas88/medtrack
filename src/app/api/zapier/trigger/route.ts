import { NextResponse } from 'next/server';
import { z } from 'zod';
import { routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { zapierTenant } from '@/lib/zapier';
export async function GET(request: Request) {
  try {
    const tenant = await zapierTenant(request.headers.get('x-api-key'));
    const params = new URL(request.url).searchParams;
    const type = z.enum(['all', 'movement', 'order', 'po']).parse(params.get('type') || 'all');
    const since = z.string().datetime({ offset: true }).parse(params.get('since') || new Date(Date.now() - 86400000).toISOString());
    const before = z.string().datetime({ offset: true }).optional().parse(params.get('before') || undefined);
    const db = createServiceClient();
    const collections = [['movement', 'stock_movements'], ['order', 'sales_orders'], ['po', 'purchase_orders']];
    const batches = await Promise.all(collections.filter(([key]) => type === 'all' || type === key).map(async ([key, table]) => {
      let query = db.from(table).select('*').eq('tenant_id', tenant).gte('created_at', since).order('created_at', { ascending: false }).limit(100);
      if (before) query = query.lt('created_at', before);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(row => ({ id: `${key}:${row.id}`, type: key, timestamp: row.created_at, data: row }));
    }));
    return NextResponse.json(batches.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  } catch (error) { return routeError(error); }
}
