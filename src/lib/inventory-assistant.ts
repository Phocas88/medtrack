import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function inventorySession() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await db.from('users')
    .select('tenant_id, role, is_active, access_level').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile?.is_active || profile.access_level === 'scanner_only' || !['admin', 'manager'].includes(profile.role)) return null;
  return { db, tenant: profile.tenant_id as string, userId: user.id };
}

type Session = NonNullable<Awaited<ReturnType<typeof inventorySession>>>;

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; from < 20000; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
  throw new Error('Inventory scan exceeds its current query limit.');
}

export async function inventoryAlerts({ db, tenant }: Session) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [products, lots, orders] = await Promise.all([
    allRows((from, to) => db.from('products')
      .select('id, sku, name, reorder_point, low_stock_threshold, expiry_alert_days')
      .eq('tenant_id', tenant).eq('is_archived', false).order('id').range(from, to)),
    allRows((from, to) => db.from('lots')
      .select('id, product_id, lot_number, expiration_date, quantity_on_hand')
      .eq('tenant_id', tenant).eq('status', 'active').gt('quantity_on_hand', 0)
      .order('id').range(from, to)),
    allRows((from, to) => db.from('sales_orders').select('id, order_number, status, updated_at')
      .eq('tenant_id', tenant).in('status', ['confirmed', 'picking']).lt('updated_at', staleBefore)
      .order('id').range(from, to)),
  ]);
  const stock = new Map<string, number>();
  const productById = new Map(products.map(product => [product.id, product]));
  const expiring = [];
  for (const lot of lots) {
    stock.set(lot.product_id, (stock.get(lot.product_id) ?? 0) + lot.quantity_on_hand);
    const product = productById.get(lot.product_id);
    if (!product?.expiry_alert_days || !lot.expiration_date) continue;
    const cutoff = new Date(now.getTime() + product.expiry_alert_days * 86400000).toISOString().slice(0, 10);
    if (lot.expiration_date <= cutoff) expiring.push({
      id: lot.id, sku: product.sku, lot: lot.lot_number, expires: lot.expiration_date,
      expired: lot.expiration_date < today, onHand: lot.quantity_on_hand,
    });
  }
  const lowStock = products.flatMap(product => {
    const threshold = product.reorder_point ?? product.low_stock_threshold;
    const onHand = stock.get(product.id) ?? 0;
    return threshold > 0 && onHand < threshold
      ? [{ id: product.id, sku: product.sku, name: product.name, onHand, threshold }]
      : [];
  }).sort((a, b) => a.onHand - b.onHand);
  expiring.sort((a, b) => a.expires.localeCompare(b.expires));
  orders.sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  return {
    lowStock: { count: lowStock.length, records: lowStock.slice(0, 15) },
    expiring: { count: expiring.length, records: expiring.slice(0, 15) },
    fulfillment: { count: orders.length, records: orders.slice(0, 15) },
  };
}

export async function lookupInventory({ db, tenant }: Session, sku: string) {
  const { data: product, error } = await db.from('products').select('id, sku, name')
    .eq('tenant_id', tenant).eq('is_archived', false)
    .ilike('sku', sku.replace(/[\\%_]/g, '\\$&')).maybeSingle();
  if (error) throw error;
  if (!product) return null;
  const [lots, bins] = await Promise.all([
    allRows((from, to) => db.from('lots').select('id, lot_number, location, quantity_on_hand')
      .eq('tenant_id', tenant).eq('product_id', product.id).eq('status', 'active')
      .gt('quantity_on_hand', 0).order('id').range(from, to)),
    allRows((from, to) => db.from('bin_inventory').select('id, quantity, bin:bins(bin_code)')
      .eq('tenant_id', tenant).eq('product_id', product.id).gt('quantity', 0)
      .order('id').range(from, to)),
  ]);
  return {
    ...product, activeLotOnHand: lots.reduce((sum, lot) => sum + lot.quantity_on_hand, 0),
    lotCount: lots.length, binRecordCount: bins.length, lots: lots.slice(0, 15), bins: bins.slice(0, 15),
  };
}
