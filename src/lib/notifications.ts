import { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType, NotificationPriority } from '@/types/database';

interface CreateNotificationParams {
  tenantId: string;
  userId?: string | null;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Creates a single notification record in the database.
 */
export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams
) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId ?? null,
      notification_type: params.type,
      priority: params.priority ?? 'medium',
      title: params.title,
      message: params.message ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      is_read: false,
      is_email_sent: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }

  return data;
}

/**
 * Checks whether a notification with the same entity_type, entity_id, and type
 * was already created in the last 24 hours for this tenant.
 */
async function isDuplicate(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: string,
  entityId: string,
  type: NotificationType
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('notification_type', type)
    .gte('created_at', twentyFourHoursAgo);

  if (error) {
    console.error('Dedup check failed:', error);
    return false; // Allow creation if check fails
  }

  return (count ?? 0) > 0;
}

/**
 * Scans for conditions that warrant notifications and creates them.
 * Returns the count of new notifications created.
 */
export async function checkAndNotify(
  supabase: SupabaseClient,
  tenantId: string
): Promise<number> {
  let created = 0;

  // ── 1. Low stock: products where total lot quantity < low_stock_threshold ──
  const { data: lowStockProducts, error: lsErr } = await supabase
    .from('products')
    .select('id, name, sku, low_stock_threshold')
    .eq('tenant_id', tenantId)
    .eq('is_archived', false)
    .gt('low_stock_threshold', 0);

  if (lsErr) {
    console.error('Low stock query error:', lsErr);
  } else if (lowStockProducts) {
    for (const product of lowStockProducts) {
      // Sum active lot quantities for this product
      const { data: lotAgg, error: lotErr } = await supabase
        .from('lots')
        .select('quantity_on_hand')
        .eq('tenant_id', tenantId)
        .eq('product_id', product.id)
        .eq('status', 'active');

      if (lotErr) {
        console.error(`Lot query error for product ${product.id}:`, lotErr);
        continue;
      }

      const totalQty = (lotAgg ?? []).reduce(
        (sum, lot) => sum + (lot.quantity_on_hand ?? 0),
        0
      );

      if (totalQty < product.low_stock_threshold) {
        const dup = await isDuplicate(
          supabase,
          tenantId,
          'product',
          product.id,
          'low_stock'
        );
        if (!dup) {
          await createNotification(supabase, {
            tenantId,
            type: 'low_stock',
            priority: totalQty === 0 ? 'critical' : 'high',
            title: `Low stock: ${product.name} (${product.sku})`,
            message: `Current quantity ${totalQty} is below threshold of ${product.low_stock_threshold}.`,
            entityType: 'product',
            entityId: product.id,
          });
          created++;
        }
      }
    }
  }

  // ── 2. Expiring lots: lots expiring within their product's expiry_alert_days ──
  const { data: trackedProducts, error: tpErr } = await supabase
    .from('products')
    .select('id, name, sku, expiry_alert_days')
    .eq('tenant_id', tenantId)
    .eq('is_archived', false)
    .gt('expiry_alert_days', 0);

  if (tpErr) {
    console.error('Tracked products query error:', tpErr);
  } else if (trackedProducts) {
    for (const product of trackedProducts) {
      const alertDate = new Date();
      alertDate.setDate(alertDate.getDate() + product.expiry_alert_days);
      const alertDateStr = alertDate.toISOString().split('T')[0];

      const { data: expiringLots, error: elErr } = await supabase
        .from('lots')
        .select('id, lot_number, expiration_date, quantity_on_hand')
        .eq('tenant_id', tenantId)
        .eq('product_id', product.id)
        .eq('status', 'active')
        .gt('quantity_on_hand', 0)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', alertDateStr);

      if (elErr) {
        console.error(`Expiring lots query error for ${product.id}:`, elErr);
        continue;
      }

      for (const lot of expiringLots ?? []) {
        const dup = await isDuplicate(
          supabase,
          tenantId,
          'lot',
          lot.id,
          'expiring_lot'
        );
        if (!dup) {
          const daysLeft = Math.ceil(
            (new Date(lot.expiration_date!).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          );
          await createNotification(supabase, {
            tenantId,
            type: 'expiring_lot',
            priority: daysLeft <= 0 ? 'critical' : daysLeft <= 7 ? 'high' : 'medium',
            title: `Expiring lot: ${lot.lot_number} (${product.name})`,
            message: daysLeft <= 0
              ? `Lot ${lot.lot_number} has expired. Qty: ${lot.quantity_on_hand}.`
              : `Lot ${lot.lot_number} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Qty: ${lot.quantity_on_hand}.`,
            entityType: 'lot',
            entityId: lot.id,
          });
          created++;
        }
      }
    }
  }

  // ── 3. PO overdue: purchase_orders past expected_date, not received/cancelled ──
  const today = new Date().toISOString().split('T')[0];

  const { data: overduePOs, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, po_number, expected_date, supplier:suppliers(name)')
    .eq('tenant_id', tenantId)
    .lt('expected_date', today)
    .not('status', 'in', '("received","cancelled")');

  if (poErr) {
    console.error('PO overdue query error:', poErr);
  } else if (overduePOs) {
    for (const po of overduePOs) {
      const dup = await isDuplicate(
        supabase,
        tenantId,
        'purchase_order',
        po.id,
        'po_overdue'
      );
      if (!dup) {
        const daysOverdue = Math.ceil(
          (Date.now() - new Date(po.expected_date!).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const supplierName =
          (po.supplier as unknown as { name: string })?.name ?? 'Unknown supplier';
        await createNotification(supabase, {
          tenantId,
          type: 'po_overdue',
          priority: daysOverdue > 7 ? 'high' : 'medium',
          title: `PO overdue: ${po.po_number}`,
          message: `PO ${po.po_number} from ${supplierName} is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
          entityType: 'purchase_order',
          entityId: po.id,
        });
        created++;
      }
    }
  }

  return created;
}
