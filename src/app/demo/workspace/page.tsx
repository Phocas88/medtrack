'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Search, ScanLine, ArrowDown, Package, X } from 'lucide-react';

type Order = { id: string; customer: string; channel: string; units: number; stage: 'To pick' | 'Packing' | 'On hold' | 'Shipped'; time: string; product: string; bin: string };
const orders: Order[] = [
  { id: '1048', customer: 'Oak & Field', channel: 'Shopify', units: 12, stage: 'To pick', time: '09:42', product: 'Canvas tote / Natural', bin: 'A-02-04' },
  { id: '1047', customer: 'Northline Goods', channel: 'Wholesale', units: 8, stage: 'Packing', time: '09:36', product: 'Utility pouch / Black', bin: 'B-01-02' },
  { id: '1046', customer: 'Everyday Supply', channel: 'Shopify', units: 24, stage: 'On hold', time: '09:18', product: 'Steel bottle / 750ml', bin: 'C-03-01' },
  { id: '1045', customer: 'Mira Studio', channel: 'Wholesale', units: 6, stage: 'To pick', time: '08:54', product: 'Desk tray / Charcoal', bin: 'A-04-03' },
  { id: '1044', customer: 'West & Co.', channel: 'Shopify', units: 3, stage: 'Packing', time: '08:41', product: 'Canvas tote / Olive', bin: 'A-02-05' },
  { id: '1043', customer: 'The Good Store', channel: 'Shopify', units: 16, stage: 'Shipped', time: '08:32', product: 'Utility pouch / Sand', bin: 'B-01-03' },
  { id: '1042', customer: 'Common Ground', channel: 'Wholesale', units: 32, stage: 'To pick', time: '08:16', product: 'Steel bottle / 500ml', bin: 'C-02-01' },
  { id: '1041', customer: 'Sunday Market', channel: 'Shopify', units: 4, stage: 'Shipped', time: '08:05', product: 'Desk tray / Stone', bin: 'A-04-01' },
];
const stages = ['All orders', 'To pick', 'Packing', 'On hold', 'Shipped'] as const;

export default function WorkspacePreview() {
  const [stage, setStage] = useState<string>('All orders');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Order | null>(orders[0]);
  const shown = orders.filter(order => (stage === 'All orders' || stage === order.stage) && `${order.id} ${order.customer} ${order.channel}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="workspace-theme min-h-screen text-sm">
      <header className="flex min-h-14 flex-wrap items-center gap-x-8 gap-y-2 border-b bg-card px-4 py-2 md:px-7">
        <Link href="/demo" className="text-xl font-bold tracking-tight">stokora<span className="text-primary">.</span></Link>
        <nav aria-label="Workspace navigation" className="flex items-center gap-5 overflow-x-auto text-xs font-medium">
          <span className="border-b-2 border-primary py-3 text-primary">Operations</span>
          <Link href="/products" className="text-muted-foreground hover:text-foreground">Inventory</Link><Link href="/customers" className="text-muted-foreground hover:text-foreground">Customers</Link><Link href="/reports" className="text-muted-foreground hover:text-foreground">Reports</Link>
        </nav>
        <div className="ml-auto flex items-center gap-4 text-xs"><span className="hidden text-muted-foreground sm:inline">North warehouse</span><Link href="/demo" className="border px-2 py-1 hover:bg-accent">Exit preview</Link></div>
      </header>
      <div className="border-b bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground md:px-7">INTERACTIVE DESIGN PREVIEW <span className="mx-2">/</span> Sample orders only. App links require sign-in.</div>
      <main className="mx-auto max-w-[1800px]">
        <div className="flex flex-wrap items-end justify-between gap-5 px-4 pb-6 pt-8 md:px-7">
          <div><p className="mb-2 text-xs text-muted-foreground">Workspace / Operations</p><h1 id="workspace-heading" className="text-3xl font-semibold tracking-tight">Order desk</h1></div>
          <div className="flex flex-wrap gap-2"><Link href="/scan" className="flex min-h-9 items-center gap-2 border bg-card px-3 text-xs hover:bg-accent"><ScanLine className="h-3.5 w-3.5" />Scanner</Link><Link href="/receive" className="flex min-h-9 items-center gap-2 border bg-card px-3 text-xs hover:bg-accent"><ArrowDown className="h-3.5 w-3.5" />Receive stock</Link><Link href="/ship" className="flex min-h-9 items-center gap-2 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90">Ship order<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
        </div>
        <div className="grid border-y bg-card lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Order worklist" className="min-w-0">
            <div className="flex overflow-x-auto border-b px-4 md:px-7" role="tablist" aria-label="Order status">{stages.map(item => <button key={item} type="button" role="tab" aria-selected={stage === item} onClick={() => setStage(item)} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-xs ${stage === item ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:bg-accent'}`}>{item}<span className="font-mono text-[10px] text-muted-foreground">{item === 'All orders' ? orders.length : orders.filter(order => order.stage === item).length}</span></button>)}</div>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-7"><label className="flex w-full max-w-xs items-center gap-2 border px-3"><Search className="h-3.5 w-3.5 text-muted-foreground" /><span className="sr-only">Find an order</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Order, customer or channel…" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label><span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">{shown.length} orders</span></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-muted/30 text-[11px] text-muted-foreground"><tr>{['Order', 'Customer', 'Channel', 'Units', 'Status', 'Received'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium first:pl-7">{label}</th>)}</tr></thead><tbody>{shown.map(order => <tr key={order.id} className={`border-t hover:bg-accent/50 ${selected?.id === order.id ? 'bg-primary/5' : ''}`}><td className="border-l-2 px-4 py-4 pl-6" style={{ borderLeftColor: selected?.id === order.id ? 'hsl(var(--primary))' : 'transparent' }}><button type="button" aria-pressed={selected?.id === order.id} onClick={() => setSelected(order)} className="font-mono font-medium text-primary underline-offset-4 hover:underline">SO-{order.id}</button></td><td className="whitespace-nowrap px-4 py-4 font-medium">{order.customer}</td><td className="px-4 py-4 text-muted-foreground">{order.channel}</td><td className="px-4 py-4 font-mono tabular-nums">{order.units}</td><td className="whitespace-nowrap px-4 py-4"><span className={`mr-2 inline-block h-1.5 w-1.5 ${order.stage === 'On hold' ? 'bg-amber-600' : order.stage === 'Shipped' ? 'bg-emerald-600' : order.stage === 'Packing' ? 'bg-blue-600' : 'bg-stone-400'}`} />{order.stage}</td><td className="px-4 py-4 font-mono text-muted-foreground">{order.time}</td></tr>)}</tbody></table>{shown.length === 0 && <p className="px-7 py-12 text-muted-foreground">No orders match your search.</p>}</div>
            <div className="flex items-center justify-between border-t px-7 py-3 text-[11px] text-muted-foreground"><span>Showing {shown.length} of {orders.length} sample orders</span><span>Select an order to inspect →</span></div>
          </section>
          <aside aria-label="Order details" className="border-t bg-background/60 lg:border-l lg:border-t-0">
            {selected ? <><div className="flex items-center justify-between border-b px-5 py-4"><span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Order details</span><button type="button" onClick={() => setSelected(null)} aria-label="Close order details" className="p-1 hover:bg-accent"><X className="h-3.5 w-3.5" /></button></div><div className="p-5"><div className="flex items-center justify-between"><h2 className="font-mono text-lg font-semibold">SO-{selected.id}</h2><span className="text-xs text-muted-foreground">{selected.stage}</span></div><p className="mt-1 text-muted-foreground">{selected.customer}</p><dl className="my-6 grid grid-cols-2 gap-y-3 text-xs"><dt className="text-muted-foreground">Sales channel</dt><dd>{selected.channel}</dd><dt className="text-muted-foreground">Received</dt><dd>Today, {selected.time}</dd><dt className="text-muted-foreground">Warehouse</dt><dd>North warehouse</dd></dl><h3 className="border-b pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Line item</h3><div className="flex items-start gap-3 py-4"><Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-xs font-medium">{selected.product}</p><p className="mt-2 font-mono text-[11px] text-muted-foreground">{selected.units} units · BIN {selected.bin}</p></div></div>{selected.stage === 'On hold' && <p className="border-l-2 border-amber-600 bg-amber-500/5 p-3 text-xs leading-relaxed">Stock shortage. Review available inventory before fulfillment.</p>}<Link href="/ship" className="mt-5 flex min-h-10 items-center justify-between border bg-card px-3 text-xs font-medium hover:bg-accent">Open fulfillment<ArrowUpRight className="h-3.5 w-3.5" /></Link><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Sample record. Open fulfillment takes you to the app sign-in.</p></div></> : <p className="p-5 text-xs text-muted-foreground">Select an order to view its details.</p>}
          </aside>
        </div>
        <section aria-labelledby="exceptions-heading" className="px-4 py-7 md:px-7"><div className="mb-3 flex items-center gap-3"><h2 id="exceptions-heading" className="text-sm font-semibold">Needs attention</h2><span className="text-[11px] text-muted-foreground">Sample exceptions</span></div><div className="grid border-t md:grid-cols-3">{[{ title: '7 products below reorder point', detail: 'Review purchasing requirements', href: '/reorder' }, { title: '1 order held for stock', detail: 'SO-1046 · Steel bottle / 750ml', href: '/ship' }, { title: '4 inbound deliveries expected', detail: 'Review purchase orders', href: '/purchase-orders' }].map(item => <Link key={item.href} href={item.href} className="flex items-center justify-between gap-3 border-b py-4 md:mr-7 hover:text-primary"><div><p className="text-xs font-medium">{item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p></div><ChevronRight className="h-3.5 w-3.5 shrink-0" /></Link>)}</div></section>
      </main>
    </div>
  );
}
