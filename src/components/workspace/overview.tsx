import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, ScanLine } from 'lucide-react';

const actions = [
  { title: 'Receive stock', description: 'Bring incoming inventory into your warehouse.', href: '/receive', icon: ArrowDownLeft },
  { title: 'Ship an order', description: 'Allocate stock and record a shipment.', href: '/ship', icon: ArrowUpRight },
  { title: 'Count inventory', description: 'Check physical stock against your records.', href: '/cycle-counts', icon: ClipboardCheck },
];

export function WorkspaceOverview() {
  return (
    <section aria-labelledby="workspace-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your warehouse, in focus</p>
          <h2 id="workspace-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">Let’s keep things moving.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">From the first delivery to the last shipment. Your daily operations start here.</p>
        </div>
        <Link href="/scan" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <ScanLine className="h-4 w-4" /> Open scanner
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {actions.map(({ title, description, href, icon: Icon }) => (
          <Link key={href} href={href} className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50">
            <span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </section>
  );
}
