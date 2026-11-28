import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export const metadata = { title: 'Warehouse Academy | Invexiqs' };

export default function WarehouseAcademy() {
  return <><PublicHeader /><main className="mx-auto max-w-4xl space-y-8 px-5 py-12">
    <div className="space-y-3">
      <h1 className="text-4xl font-bold text-brand-deep-plum">Warehouse Academy</h1>
      <p>Practical guides for receiving, replenishment, and shipping.</p>
      <Link href="/guide" className="font-semibold underline">Read the Warehouse Setup Guide</Link>
    </div>
    <section id="advance-shipment-notice" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-2xl font-semibold">Advance Shipment Notice (ASN)</h2>
      <p>An ASN tells the receiving team what a supplier has shipped before the truck arrives. It typically lists the purchase order, expected arrival, item quantities, and carton or pallet identifiers.</p>
      <p>Use the notice to schedule a dock, check expected quantities, and prepare space. At receiving, scan or count the actual goods and record discrepancies before posting inventory.</p>
    </section>
    <section id="stock-rotation" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-2xl font-semibold">Stock Rotation and Replenishment</h2>
      <ul className="list-inside list-disc space-y-2">
        <li><strong>FIFO</strong> picks the oldest receipts first.</li>
        <li><strong>FEFO</strong> picks lots with the earliest expiry first and places undated lots last.</li>
        <li><strong>LIFO</strong> picks the newest receipts first.</li>
      </ul>
      <p>Use bin min/max quantities for pick-face replenishment. Use total stock min/max to set the reorder trigger and target across the workspace.</p>
    </section>
    <section id="automation" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-2xl font-semibold">Warehouse Automation</h2>
      <p>Invexiqs supports reorder recommendations, reviewed purchase order drafts, and assigned warehouse follow-ups. Teams can use the Zapier connector to send supported warehouse events to other applications.</p>
      <Link className="font-semibold underline" href="/integrations-directory">Explore Connectors</Link>
    </section>
    <section id="windows" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-2xl font-semibold">Use Invexiqs on Windows</h2>
      <p>Open Invexiqs in your Windows browser. If your browser offers an install option, use it to open the web app in its own window and pin it to the taskbar.</p>
      <Link className="font-semibold underline" href="/auth/login">Sign In</Link>
    </section>
  </main><PublicFooter /></>;
}
