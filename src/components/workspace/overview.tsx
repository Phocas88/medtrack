import Link from 'next/link';
import { Plus, ScanLine } from 'lucide-react';

export function WorkspaceOverview() {
  return (
    <section aria-labelledby="workspace-heading" className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div><h2 id="workspace-heading" className="text-2xl font-semibold tracking-tight">Operations</h2><p className="mt-1 text-sm text-muted-foreground">Inventory, inbound and fulfillment.</p></div>
      <nav aria-label="Warehouse actions" className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/scan" className="inline-flex min-h-10 items-center gap-2 border bg-card px-3 hover:bg-accent"><ScanLine className="h-4 w-4" /> Scanner</Link>
        <Link href="/receive" className="inline-flex min-h-10 items-center gap-2 border bg-card px-3 hover:bg-accent">Receive stock</Link>
        <Link href="/ship" className="inline-flex min-h-10 items-center gap-2 bg-primary px-3 text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> Ship order</Link>
      </nav>
    </section>
  );
}
