import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/server';

type Purchase = {
  supplier_id: string; supplier_name: string; workspace: string; po_number: string | null; status: string | null;
  order_date: string | null; expected_date: string | null;
  lines: { sku: string; name: string; ordered: number; received: number; unit_cost: number }[];
};

export default async function SupplierPortalPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/supplier-portal/login');
  const { data, error } = await db.rpc('supplier_purchase_history');
  const suppliers = new Map<string, Purchase[]>();
  for (const row of (data ?? []) as Purchase[]) {
    const existing = suppliers.get(row.supplier_id);
    if (existing) existing.push(row);
    else suppliers.set(row.supplier_id, [row]);
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6">
    <PageHeader title="Supplier Portal" product="purchasing" description="View purchase orders and receiving progress across your accounts." actions={
      <form action={async () => {
        'use server';
        const currentDb = await createClient();
        await currentDb.auth.signOut();
        redirect('/supplier-portal/login');
      }}><button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">Sign Out</button></form>
    } />
    {error && <p role="alert" className="text-sm text-destructive">Could not load your purchase orders. Refresh to try again.</p>}
    {!error && !suppliers.size && <p className="rounded-lg border p-4">No supplier accounts are available. Ask your buying contact to verify your invitation.</p>}
    {[...suppliers].map(([supplierId, purchases]) => <section key={supplierId} className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">{purchases[0].workspace} · {purchases[0].supplier_name}</h2>
      {!purchases[0].po_number && <p className="text-sm text-muted-foreground">Sent purchase orders will appear here.</p>}
      {purchases.filter(purchase => purchase.po_number).map(purchase => <details key={purchase.po_number} className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium"><span className="mr-2">{purchase.po_number}</span>
          <span className="text-sm capitalize text-muted-foreground">{purchase.status} {purchase.expected_date ? `· Expected ${purchase.expected_date}` : ''}</span>
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Products and receipts for {purchase.po_number}</caption>
            <thead><tr className="border-b">{['SKU', 'Item', 'Ordered', 'Received', 'Unit Cost'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
            <tbody>{purchase.lines.map((line, index) => <tr key={`${line.sku}-${index}`}>
              <td className="p-2">{line.sku}</td><td className="p-2">{line.name}</td><td className="p-2">{line.ordered}</td>
              <td className="p-2">{line.received}</td><td className="p-2">{Number(line.unit_cost).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>)}
    </section>)}
  </main>;
}
