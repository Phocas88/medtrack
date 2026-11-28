export type DigestSnapshot = {
  report_date: string;
  late_purchase_orders: number;
  overdue_counts: number;
  aging_orders: number;
  carrier_exceptions: number;
};

export function digestCsv(snapshot: DigestSnapshot): string {
  return [
    'Report Date (UTC),Late Purchase Orders,Overdue Counts,Aging Orders,Carrier Exceptions',
    [snapshot.report_date, snapshot.late_purchase_orders, snapshot.overdue_counts, snapshot.aging_orders, snapshot.carrier_exceptions].join(','),
  ].join('\r\n') + '\r\n';
}

export const dashboardMetrics = [
  { id: 'late_purchase_orders', label: 'Late Purchase Orders', href: '/purchase-orders' },
  { id: 'overdue_counts', label: 'Overdue Counts', href: '/cycle-counts' },
  { id: 'aging_orders', label: 'Orders Older Than 48 Hours', href: '/ship' },
  { id: 'carrier_exceptions', label: 'Carrier Exceptions', href: '/delivery-exceptions' },
  { id: 'units_in_stock', label: 'Units in Active Lots', href: '/inventory-overview' },
  { id: 'active_products', label: 'Active Products', href: '/products' },
] as const;
