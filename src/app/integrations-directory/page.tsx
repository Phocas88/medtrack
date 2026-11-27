import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export const metadata = { title: 'Integration roadmap | Invexiqs' };
export default function DirectoryPage() {
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-6 px-5 py-12">
    <h1 className="text-4xl font-bold text-brand-deep-plum">Integration roadmap</h1>
    <p>Planned for June 2027. Pilot availability depends on connector testing and setup.</p>
    <ul className="grid gap-4 sm:grid-cols-2">
      {[
        ['Shopify','Bring in orders and send shipment tracking back.'],
        ['WooCommerce','Connect online orders to warehouse fulfillment.'],
        ['EasyPost','Get carrier rates, buy labels, and track shipments.'],
        ['QuickBooks Online','Export eligible shipped orders as invoices.'],
        ['Square','Bring retail sales into inventory workflows.'],
        ['Zapier','Connect warehouse events through Webhooks by Zapier.'],
      ].map(([name, detail]) => <li className="rounded-xl border p-5" key={name}><h2 className="text-xl font-semibold">{name}</h2><p className="mt-2">{detail}</p></li>)}
    </ul>
  </main><PublicFooter /></>;
}
