import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  return createClient(url, serviceKey);
}

async function validateApiKey(apiKey: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, settings')
    .not('settings', 'is', null)
    .limit(100);

  if (error || !data) return null;

  const tenant = data.find((t: { id: string; settings: unknown }) => {
    const settings = t.settings as Record<string, unknown>;
    return settings?.zapier_api_key === apiKey;
  });

  return tenant?.id || null;
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing x-api-key header' },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();
    const tenantId = await validateApiKey(apiKey, supabase);

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const since = searchParams.get('since');

    const events: Array<{ id: string; type: string; timestamp: string; data: unknown }> = [];

    // Fetch stock movements
    if (type === 'all' || type === 'movement') {
      let query = supabase
        .from('stock_movements')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (since) {
        query = query.gte('created_at', since);
      }

      const { data } = await query;
      if (data) {
        events.push(
          ...data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            type: 'stock_movement' as const,
            timestamp: row.created_at as string,
            data: row as unknown,
          }))
        );
      }
    }

    // Fetch sales orders
    if (type === 'all' || type === 'order') {
      let query = supabase
        .from('sales_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (since) {
        query = query.gte('created_at', since);
      }

      const { data } = await query;
      if (data) {
        events.push(
          ...data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            type: 'sales_order' as const,
            timestamp: row.created_at as string,
            data: row as unknown,
          }))
        );
      }
    }

    // Fetch purchase orders
    if (type === 'all' || type === 'po') {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (since) {
        query = query.gte('created_at', since);
      }

      const { data } = await query;
      if (data) {
        events.push(
          ...data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            type: 'purchase_order' as const,
            timestamp: row.created_at as string,
            data: row as unknown,
          }))
        );
      }
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json(events.slice(0, 50));
  } catch (error) {
    console.error('Zapier trigger error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
