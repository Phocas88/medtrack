'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';

export function SetupChecklist() {
  const { role, tenantId } = useAuth();
  const allowed = role === 'admin' || role === 'manager';
  const [progress, setProgress] = useState<{ tenant: string; products: boolean; stock: boolean; receipt: boolean }>();
  useEffect(() => {
    if (!allowed || !tenantId) return;
    const controller = new AbortController();
    const db = createClient();
    void Promise.all([
      db.from('products').select('id').eq('tenant_id', tenantId).eq('is_archived', false).limit(1).abortSignal(controller.signal),
      db.from('bin_inventory').select('id').eq('tenant_id', tenantId).gt('quantity', 0).limit(1).abortSignal(controller.signal),
      db.from('stock_movements').select('id').eq('tenant_id', tenantId).eq('movement_type', 'receive').limit(1).abortSignal(controller.signal),
    ]).then(([products, stock, receipts]) => {
      if (controller.signal.aborted || products.error || stock.error || receipts.error) return;
      setProgress({ tenant: tenantId, products: !!products.data?.length, stock: !!stock.data?.length, receipt: !!receipts.data?.length });
    });
    return () => controller.abort();
  }, [allowed, tenantId]);

  if (!allowed || progress?.tenant !== tenantId || !progress || (progress.products && progress.stock && progress.receipt)) return null;
  const link = 'font-medium text-primary underline underline-offset-2';
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Warehouse setup checklist">
      <h2 className="text-lg font-semibold text-heading">Get your warehouse ready</h2>
      <ol className="space-y-2 text-sm">
        <li><strong>{progress.products ? 'Done' : '1.'} Add products.</strong> <Link className={link} href="/products">Add a SKU</Link> or <Link className={link} href="/onboarding/import">import a CSV</Link>.</li>
        <li><strong>{progress.stock ? 'Done' : '2.'} Put stock in bins.</strong> <Link className={link} href="/onboarding/import?kind=opening">Import opening balances</Link> or start at zero and receive your first item.</li>
        <li><strong>{progress.receipt ? 'Done' : '3.'} Record a receipt.</strong> <Link className={link} href="/receive">Receive into a bin</Link>, print the label, then <Link className={link} href="/bins">find it in Bin Management</Link>.</li>
      </ol>
      <div className="flex flex-wrap gap-3 text-sm">
        {role === 'admin' && <Link className={link} href="/admin/users">Add teammates</Link>}
        <Link className={link} href="/onboarding/import#hardware-test">Test scanner and printer</Link>
        <Link className={link} href="/integrations/shopify">Connect Shopify later</Link>
      </div>
    </section>
  );
}
