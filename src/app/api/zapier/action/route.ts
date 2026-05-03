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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = data.find((t: any) => {
    const settings = t.settings as Record<string, unknown>;
    return settings?.zapier_api_key === apiKey;
  });

  return tenant?.id || null;
}

type ActionHandler = (
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  data: Record<string, unknown>
) => Promise<{ data: unknown; error: string | null }>;

const actionHandlers: Record<string, ActionHandler> = {
  create_product: async (supabase, tenantId, data) => {
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        tenant_id: tenantId,
        name: data.name,
        sku: data.sku,
        description: data.description || null,
        category: data.category || null,
        unit_price: data.unit_price || 0,
        cost_price: data.cost_price || 0,
        reorder_point: data.reorder_point || 0,
        reorder_qty: data.reorder_qty || 0,
        uom: data.uom || 'each',
        status: data.status || 'active',
      })
      .select()
      .single();

    return { data: product, error: error?.message || null };
  },

  create_order: async (supabase, tenantId, data) => {
    const { data: order, error: orderError } = await supabase
      .from('sales_orders')
      .insert({
        tenant_id: tenantId,
        customer_id: data.customer_id || null,
        order_number: data.order_number || `ZAP-${Date.now()}`,
        status: data.status || 'pending',
        order_date: data.order_date || new Date().toISOString(),
        notes: data.notes || null,
      })
      .select()
      .single();

    if (orderError) return { data: null, error: orderError.message };

    // Insert order lines if provided
    const lines = data.lines as Array<Record<string, unknown>> | undefined;
    if (lines && Array.isArray(lines) && lines.length > 0) {
      const lineRecords = lines.map((line, idx) => ({
        tenant_id: tenantId,
        sales_order_id: order.id,
        product_id: line.product_id,
        quantity: line.quantity || 1,
        unit_price: line.unit_price || 0,
        line_number: idx + 1,
      }));

      const { error: linesError } = await supabase
        .from('sales_order_lines')
        .insert(lineRecords);

      if (linesError) {
        return { data: order, error: `Order created but line insert failed: ${linesError.message}` };
      }
    }

    return { data: order, error: null };
  },

  create_customer: async (supabase, tenantId, data) => {
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        country: data.country || null,
        notes: data.notes || null,
        status: data.status || 'active',
      })
      .select()
      .single();

    return { data: customer, error: error?.message || null };
  },

  adjust_inventory: async (supabase, tenantId, data) => {
    const { data: movement, error } = await supabase
      .from('stock_movements')
      .insert({
        tenant_id: tenantId,
        product_id: data.product_id,
        location_id: data.location_id || null,
        quantity: data.quantity,
        movement_type: data.movement_type || 'adjustment',
        reference: data.reference || `zapier-${Date.now()}`,
        notes: data.notes || 'Created via Zapier',
      })
      .select()
      .single();

    return { data: movement, error: error?.message || null };
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data, api_key } = body;

    if (!api_key) {
      return NextResponse.json(
        { error: 'Missing api_key in request body' },
        { status: 401 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action in request body' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const tenantId = await validateApiKey(api_key, supabase);

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const handler = actionHandlers[action];
    if (!handler) {
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Supported: ${Object.keys(actionHandlers).join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid data object' },
        { status: 400 }
      );
    }

    const result = await handler(supabase, tenantId, data as Record<string, unknown>);

    if (result.error) {
      return NextResponse.json(
        { error: result.error, data: result.data },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Zapier action error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
