export const availableConnectors = [
  ['EasyPost', 'Get carrier rates, buy shipping labels, and track shipments.'],
  ['QuickBooks Online', 'Export eligible shipped orders as invoices.'],
  ['Shopify', 'Import orders, publish available stock, and send shipment tracking back.'],
  ['Zapier', 'Connect warehouse events through Webhooks by Zapier.'],
] as const;

export const requestedConnectors = [
  ['Accounting', ['Xero']],
  ['Commerce and Payments', ['Amazon', 'eBay', 'Etsy', 'Square', 'Stripe', 'WooCommerce']],
  ['Messaging', ['Slack', 'Twilio']],
  ['Shipping', ['Easyship', 'FedEx', 'UPS', 'USPS']],
] as const;

export const invexiqsSuite = [
  'Invexiqs Analytics', 'Invexiqs Books', 'Invexiqs Cliq', 'Invexiqs Commerce', 'Invexiqs CRM', 'Invexiqs Desk', 'Invexiqs Payments',
] as const;
