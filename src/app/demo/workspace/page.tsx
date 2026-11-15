import Link from 'next/link';
import { LayoutDashboard, Package, Truck, ArrowLeftRight, Users, Settings, ChevronRight, Box } from 'lucide-react';
import { WorkspaceOverview } from '@/components/workspace/overview';
import { StokoraLogo } from '@/components/ui/stokora-logo';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Inventory', icon: Package, href: '/products' },
  { label: 'Orders & shipping', icon: Truck, href: '/ship' },
  { label: 'Stock movements', icon: ArrowLeftRight, href: '/movements' },
  { label: 'Customers', icon: Users, href: '/customers' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];
const orders = [
  { number: 'SO-1048', customer: 'Oak & Field', items: '12 units', status: 'Ready to pick' },
  { number: 'SO-1047', customer: 'Northline Goods', items: '8 units', status: 'Packing' },
  { number: 'SO-1046', customer: 'Everyday Supply', items: '24 units', status: 'Shipped' },
];

export default function WorkspacePreview() {
  return (
    <div className="workspace-theme min-h-screen md:flex">
      <aside className="workspace-nav hidden w-64 shrink-0 flex-col md:flex">
        <div className="flex h-20 items-center border-b px-5"><StokoraLogo theme="dark" size="sm" /></div>
        <div className="p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground">Workspace preview</p><p className="mt-2 text-sm font-medium">North warehouse</p></div>
        <nav aria-label="Preview navigation" className="space-y-1 px-3">{navigation.map(({ label, icon: Icon, href }, i) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${i === 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
        <p className="mt-auto p-6 text-xs leading-relaxed text-muted-foreground">Design preview · Sample data<br />App links require sign-in.</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-20 items-center justify-between gap-3 border-b bg-card px-5 md:px-10"><span className="text-sm text-muted-foreground">Workspace <ChevronRight className="mx-2 inline h-3 w-3" /><span className="font-medium text-foreground">Overview</span></span><Link href="/demo" className="text-sm font-medium text-primary">Back to demo</Link></header>
        <main className="mx-auto max-w-[1600px] space-y-8 p-5 md:p-10">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-primary">UI preview with illustrative data. These figures and orders are samples, not live warehouse activity.</div>
          <WorkspaceOverview />
          <section aria-label="Sample warehouse metrics" className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[['Active products', '248', 'Across your catalog'], ['Orders to fulfill', '18', 'Awaiting shipment'], ['Low stock', '7', 'Products to review'], ['Inbound deliveries', '4', 'Expected this week']].map(([label, value, detail]) => <div key={label} className="rounded-2xl border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="my-3 text-3xl font-semibold tracking-tight">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>)}</section>
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="flex items-center justify-between border-b p-5"><h2 className="font-semibold">Fulfillment queue</h2><span className="text-xs text-muted-foreground">Sample orders</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{['Order', 'Customer', 'Quantity', 'Status'].map(label => <th key={label} scope="col" className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{orders.map(order => <tr key={order.number} className="border-t"><td className="whitespace-nowrap px-5 py-5 font-medium">{order.number}</td><td className="whitespace-nowrap px-5 py-5 text-muted-foreground">{order.customer}</td><td className="whitespace-nowrap px-5 py-5 text-muted-foreground">{order.items}</td><td className="whitespace-nowrap px-5 py-5"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{order.status}</span></td></tr>)}</tbody></table></div></section>
            <section className="rounded-2xl border bg-card p-6 shadow-sm"><span className="inline-flex rounded-xl bg-amber-500/10 p-3 text-amber-600"><Box className="h-5 w-5" /></span><h2 className="mt-5 text-lg font-semibold">Stay ahead of low stock.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Review reorder levels before your next busy day. Keep your most important products moving.</p><Link href="/reorder" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">Review inventory <ChevronRight className="h-4 w-4" /></Link></section>
          </div>
        </main>
      </div>
    </div>
  );
}
