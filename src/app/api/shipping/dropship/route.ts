import { requireUser, routeError } from '@/lib/server-auth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(['admin', 'manager'], true);
    const authUser = authorizedUser;

    const { order_id } = await request.json();
    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get the order with lines and customer
    const { data: order } = await svc
      .from('sales_orders')
      .select('*, customer:customers(*), lines:sales_order_lines(*, product:products(*))')
      .eq('id', order_id)
      .eq('tenant_id', authUser.tenant_id)
      .single();

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Group lines by supplier
    const bySupplier = new Map<string, { supplier_id: string; supplier_name: string; lines: { product_id: string; product_name: string; sku: string; quantity: number; cost: number }[] }>();

    for (const line of order.lines || []) {
      const product = line.product as Record<string, unknown> | null;
      if (!product?.supplier_id) continue;

      const sid = product.supplier_id as string;
      if (!bySupplier.has(sid)) {
        bySupplier.set(sid, { supplier_id: sid, supplier_name: '', lines: [] });
      }
      bySupplier.get(sid)!.lines.push({
        product_id: line.product_id,
        product_name: (product.name as string) || '',
        sku: (product.sku as string) || '',
        quantity: line.quantity_ordered,
        cost: (product.cost as number) || 0,
      });
    }

    // Get supplier names
    const supplierIds = Array.from(bySupplier.keys());
    const { data: suppliers } = await svc.from('suppliers').select('id, name, email').in('id', supplierIds);
    for (const s of suppliers || []) {
      if (bySupplier.has(s.id)) bySupplier.get(s.id)!.supplier_name = s.name;
    }

    // Create POs for each supplier with customer's ship-to
    const customer = order.customer as Record<string, string> | null;
    const shipTo = order.ship_to_address || customer?.ship_to_address || '';
    const shipToName = order.ship_to_name || customer?.name || '';

    let posCreated = 0;
    const poNumbers: string[] = [];

    for (const [supplierId, group] of Array.from(bySupplier.entries())) {
      const poNum = `DS-${Date.now().toString(36).toUpperCase()}-${posCreated + 1}`;
      const totalAmount = group.lines.reduce((s, l) => s + l.cost * l.quantity, 0);

      const { data: po } = await svc
        .from('purchase_orders')
        .insert({
          tenant_id: authUser.tenant_id,
          po_number: poNum,
          supplier_id: supplierId,
          status: 'draft',
          order_date: new Date().toISOString().split('T')[0],
          total_amount: totalAmount,
          created_by: authUser.id,
          notes: `DROPSHIP — Ship directly to: ${shipToName}, ${shipTo}\nOriginal order: ${order.order_number}`,
        })
        .select()
        .single();

      if (!po) continue;

      // Add PO lines
      await svc.from('po_lines').insert(
        group.lines.map((l) => ({
          tenant_id: authUser.tenant_id,
          po_id: po.id,
          product_id: l.product_id,
          quantity_ordered: l.quantity,
          quantity_received: 0,
          unit_cost: l.cost,
        }))
      );

      // Send PO to vendor
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://stokora.vercel.app' : 'http://localhost:3000'}/api/po/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': (await cookies()).toString() },
        body: JSON.stringify({ po_id: po.id }),
      }).catch(() => {}); // best-effort send

      posCreated++;
      poNumbers.push(poNum);
    }

    // Update the sales order as dropship
    await svc.from('sales_orders').update({
      fulfillment_type: 'dropship',
      notes: `${order.notes || ''}\nDropship POs: ${poNumbers.join(', ')}`.trim(),
    }).eq('id', order_id);

    // Audit
    await svc.from('stock_movements').insert({
      tenant_id: authUser.tenant_id,
      product_id: null,
      user_id: authUser.id,
      quantity: 0,
      movement_type: 'adjust',
      reason: `Dropship order ${order.order_number} — ${posCreated} POs created to suppliers`,
      reference_number: order.order_number,
      metadata: { action: 'dropship', order_id, po_numbers: poNumbers },
    });

    return NextResponse.json({
      success: true,
      pos_created: posCreated,
      po_numbers: poNumbers,
      ship_to: `${shipToName}, ${shipTo}`,
    });
  } catch (err) {
    return routeError(err);
  }
}
