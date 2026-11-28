export const SUITE_ADD_ON_STATUS = 'Invexiqs WMS add-on';

export const suiteProducts = [
  {
    slug: 'purchasing', name: 'Purchasing', href: '/purchase-orders',
    description: 'Compare supplier fill and on-time completion, then open late purchase orders for follow-up.',
    included: ['Purchase orders and replenishment recommendations', 'Supplier confirmation links and supplier-submitted shipment notices', 'Partial receiving and discrepancy review', 'Supplier scorecards with CSV export'],
    expansion: ['Supplier accounts with purchase order history', 'Purchase approval thresholds and separate approvers'],
  },
  {
    slug: 'analytics', name: 'Analytics', href: '/analytics',
    description: 'Compare warehouse stock and open work, and schedule a daily or weekly digest of exceptions.',
    included: ['Daily exception view, operational dashboards, and inventory reporting', 'Cycle-count progress and CSV exports', 'Warehouse comparison and scheduled in-app exception digests'],
    expansion: ['Personal dashboards with warehouse metrics', 'Scheduled email reports and recurring CSV exports'],
  },
  {
    slug: 'commerce', name: 'Commerce', href: '/customer-portal',
    description: 'Give wholesale customers a place to order and follow their shipments.',
    included: ['Customer order portal and order history', 'Shopify order import and tracking updates'],
    expansion: ['Wholesale storefront and customer volume pricing', 'WooCommerce order import with SKU review'],
  },
  {
    slug: 'pos', name: 'POS', href: '/pos',
    description: 'Sell from the counter using the same stock your warehouse manages.',
    included: ['Cash checkout and inventory posting', 'Counter-sale receipts'],
    expansion: ['Stripe Terminal card payments', 'Store-linked registers, shifts, and cash closeouts'],
  },
  {
    slug: 'shipping', name: 'Shipping', href: '/ship',
    description: 'Track shipments and open follow-ups for failed deliveries, pickup holds, or returns to sender.',
    included: ['Verified packing and tracked split shipments', 'Carrier labels and outbound pallet lookup', 'Order and carton delivery exception queue'],
    expansion: ['Carrier rate recommendations by destination, weight, and delivery speed', 'Freight loads, shipment manifests, and dispatch tracking'],
  },
  {
    slug: 'manufacturing', name: 'Manufacturing', href: '/kitting',
    description: 'Assemble kits from stocked components and record the finished inventory.',
    included: ['Kit definitions and component stock checks', 'Assembly posting and lot records'],
    expansion: ['Production work orders with component snapshots', 'Material requirements, lot consumption, and job costing'],
  },
] as const;

export type SuiteProduct = (typeof suiteProducts)[number];
export type SuiteProductId = SuiteProduct['slug'];

export function getSuiteProduct(slug: string): SuiteProduct | undefined {
  return suiteProducts.find(product => product.slug === slug);
}
