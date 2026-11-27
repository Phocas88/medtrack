import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';

export const metadata = {
  title: 'Warehouse workflow guide | Invexiqs WMS',
  description: 'Find the Invexiqs screens for products, bins, receiving, picking, stock counts, and reporting.',
  alternates: { canonical: '/guide' },
};

const workflows = [
  { title: 'Set up products and bins', location: 'Inventory › Products and Warehouse › Bins', detail: 'Give each item a distinct SKU and name. Set up warehouse locations and bin codes that match the labels your team sees on the floor.' },
  { title: 'Receive and put away inventory', location: 'Orders & Fulfillment › Receive and Put-Away', detail: 'Review inbound quantities and any lot or expiration details before recording a receipt. Use the putaway workflow to record the destination bin.' },
  { title: 'Find stock and count bins', location: 'Warehouse › Bins and Cycle Counts', detail: 'Check where stock is stored, record the physical count, and investigate differences before making an adjustment.' },
  { title: 'Pick and ship orders', location: 'Orders & Fulfillment › Ship', detail: 'Use the order and bin information to guide picking. Review picked quantities and the destination before recording a shipment.' },
  { title: 'Use a mobile scanner', location: 'Warehouse › Scanner', detail: 'Open the scanner on a mobile device. Use Find item for a stock lookup and Tasks for assigned work.' },
  { title: 'Review stock movement history', location: 'Inventory › Stock Movements', detail: 'Review movement types, dates, and references when investigating a receipt or an inventory difference.' },
] as const;

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-14">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Warehouse workflow guide</h1>
          <p className="text-slate-700">Find common warehouse tools in the header. On a phone, open Menu. Your role and warehouse settings determine which items are visible.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {workflows.map(({ title, location, detail }) => (
            <section key={title} className="space-y-2 rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm font-medium text-emerald-900">{location}</p>
              <p className="text-sm text-slate-700">{detail}</p>
            </section>
          ))}
        </div>
        <section id="setup" className="space-y-4 rounded-lg border bg-white p-5">
          <h2 className="text-xl font-semibold">Prepare for self-serve setup</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Create a prelaunch account and confirm your email.</li>
            <li>Prepare a product catalog with unique SKUs and opening stock by bin and lot. <Link className="underline" href="/tools#templates">Download the CSV templates.</Link></li>
            <li>When warehouse access opens, create your warehouse. Review your CSV before importing it.</li>
            <li>Print a test label on 4 × 2 inch stock and scan it using the setup hardware check. A USB or Bluetooth scanner can type into the manual scan field.</li>
          </ol>
        </section>
        <nav aria-label="More help" className="flex flex-wrap gap-5 text-sm font-medium text-emerald-900">
          <Link href="/demo" className="underline">Explore the live demo</Link>
          <Link href="/support" className="underline">Contact support</Link>
        </nav>
      </main>
      <PublicFooter />
    </div>
  );
}
