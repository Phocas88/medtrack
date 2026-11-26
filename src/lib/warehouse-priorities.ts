import 'server-only';
import { allRows, type InventorySession } from '@/lib/inventory-assistant';

// PostgREST returns to-one embeds as objects even on the untyped client.
function relatedRow<T>(related: T | T[] | null | undefined): T | undefined {
  return Array.isArray(related) ? related[0] : related ?? undefined;
}

export async function warehousePriorities({ db, tenant }: InventorySession) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const aging = new Date(now - 24 * 3600000).toISOString();
  const stale = new Date(now - 48 * 3600000).toISOString();
  const [receipts, putaway, orders] = await Promise.all([
    db.from('purchase_orders').select('id, po_number, expected_date', { count: 'exact' })
      .eq('tenant_id', tenant).in('status', ['sent', 'partial']).lt('expected_date', today)
      .order('expected_date').order('id').limit(5),
    db.from('scan_tasks').select('id, title, created_at, assignee:users!scan_tasks_assigned_to_fkey(full_name)', { count: 'exact' })
      .eq('tenant_id', tenant).eq('task_type', 'putaway').in('status', ['pending', 'assigned', 'in_progress'])
      .lt('created_at', aging).order('created_at').order('id').limit(5),
    db.from('sales_orders').select('id, order_number, updated_at', { count: 'exact' })
      .eq('tenant_id', tenant).in('status', ['confirmed', 'picking'])
      .lt('updated_at', stale).order('updated_at').order('id').limit(5),
  ]);
  for (const result of [receipts, putaway, orders]) {
    if (result.error) throw result.error;
  }
  return [
    { label: 'Stalled orders', href: '/ship', count: orders.count ?? 0, records: (orders.data ?? []).map(row => ({
      href: '/ship?order=' + row.id, label: row.order_number,
      detail: 'Check the remaining lines and resolve picking or stock issues. Last updated ' + row.updated_at.slice(0, 10) + '.',
    })) },
    { label: 'Overdue receipts', href: '/purchase-orders', count: receipts.count ?? 0, records: (receipts.data ?? []).map(row => ({
      href: '/purchase-orders?po=' + row.id, label: row.po_number,
      detail: 'Check with the supplier or record the receipt. Expected ' + row.expected_date + '.',
    })) },
    { label: 'Aging putaway', href: '/put-away', count: putaway.count ?? 0, records: (putaway.data ?? []).map(row => ({
      href: '/put-away?review=' + row.id, label: row.title,
      detail: 'Review the open putaway task. Created ' + row.created_at.slice(0, 10) + '. Owner: ' + (relatedRow(row.assignee)?.full_name ?? 'Unassigned') + '.',
    })) },
  ];
}

export async function orderReadiness({ db, tenant }: InventorySession, orderNumber: string) {
  const { data: order, error } = await db.from('sales_orders').select('id, order_number, status')
    .eq('tenant_id', tenant).ilike('order_number', orderNumber.replace(/[\\%_]/g, '\\$&'))
    .order('id').limit(2);
  if (error) throw error;
  if (!order || order.length !== 1) return null;
  const [record] = order;
  const href = '/ship?order=' + record.id;
  if (!['confirmed', 'picking'].includes(record.status)) {
    return { ...record, href: null, lines: [] };
  }

  const reservationRequest = db.rpc('order_reservation_status', { p_order: record.id });
  const [reservationResult, lines] = await Promise.all([reservationRequest,
    allRows((from, to) => db.from('sales_order_lines')
    .select('id, product_id, quantity_ordered, quantity_shipped, product:products(sku, is_archived, is_serial_tracked)')
    .eq('tenant_id', tenant).eq('order_id', record.id).order('id').range(from, to)),
  ]);
  if (reservationResult.error) throw reservationResult.error;
  const reservation = new Map<string, { on_hand: number; reserved_for_order: number; reserved_other: number }>(
    (reservationResult.data ?? []).map((row: { product_id: string; on_hand: number; reserved_for_order: number; reserved_other: number }) => [row.product_id, row]),
  );
  const demand = new Map<string, { sku: string; remaining: number; archived: boolean; serialTracked: boolean }>();
  for (const line of lines) {
    const remaining = Math.max(0, line.quantity_ordered - (line.quantity_shipped ?? 0));
    if (!remaining) continue;
    const product = relatedRow(line.product);
    const current = demand.get(line.product_id);
    if (current) current.remaining += remaining;
    else demand.set(line.product_id, {
      sku: product?.sku ?? 'Unknown SKU', remaining,
      archived: product?.is_archived !== false,
      serialTracked: product?.is_serial_tracked === true,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  const products = [...demand];
  for (let offset = 0; offset < products.length; offset += 10) {
    const batch = await Promise.all(products.slice(offset, offset + 10).map(async ([id, line]) => {
      if (line.archived) return { ...line, productId: id, eligibleOnHand: 0, reservedForOrder: 0, reservedElsewhere: 0, availableToOrder: 0, shortage: line.remaining, bins: [] };
      const [lots, binRows] = await Promise.all([
        allRows((from, to) => db.from('lots')
          .select('id, quantity_on_hand, holds:quarantine_holds(status)')
          .eq('tenant_id', tenant).eq('product_id', id).eq('status', 'active')
          .gt('quantity_on_hand', 0).or('expiration_date.is.null,expiration_date.gte.' + today)
          .order('id').range(from, to)),
        allRows((from, to) => db.from('bin_inventory')
          .select('lot_id, bin:bins(bin_code)')
          .eq('tenant_id', tenant).eq('product_id', id).gt('quantity', 0)
          .order('id').range(from, to)),
      ]);
      const eligible = lots.filter(lot => !lot.holds.some(hold => ['held', 'rejected'].includes(hold.status)));
      const eligibleIds = new Set(eligible.map(lot => lot.id));
      const eligibleOnHand = eligible.reduce((total, lot) => total + lot.quantity_on_hand, 0);
      const bins = [...new Set(binRows.flatMap(row => {
        const code = relatedRow(row.bin)?.bin_code;
        return eligibleIds.has(row.lot_id) && typeof code === 'string' ? [code] : [];
      }))].sort();
      const reservedForOrder = reservation.get(id)?.reserved_for_order ?? 0;
      const reservedElsewhere = reservation.get(id)?.reserved_other ?? 0;
      const availableToOrder = Math.max(0, (reservation.get(id)?.on_hand ?? eligibleOnHand) - reservedElsewhere);
      return { ...line, productId: id, eligibleOnHand, reservedForOrder, reservedElsewhere, availableToOrder,
        shortage: Math.max(0, line.remaining - availableToOrder), bins };
    }));
    results.push(...batch);
  }
  return { ...record, href, lines: results };
}
