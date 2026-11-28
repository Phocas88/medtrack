'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Exception = { id: string; label: string; date: string; href: string };
type Section = { label: string; total: number; items: Exception[]; href: string };
type State = { sections?: Section[]; error?: boolean };

export function DailyExceptions({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<State>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const db = createClient();
    const controller = new AbortController();
    const today = new Date().toISOString().slice(0, 10);
    const orderCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    async function load() {
      try {
        const [purchases, counts, orders] = await Promise.all([
          db.from('purchase_orders').select('id,po_number,expected_date', { count: 'exact' })
            .eq('tenant_id',tenantId).in('status',['approved','sent','partial'])
            .lt('expected_date',today).order('expected_date').limit(8).abortSignal(controller.signal),
          db.from('cycle_counts').select('id,count_number,planned_date', { count: 'exact' })
            .eq('tenant_id',tenantId).in('status',['planned','in_progress','pending_review'])
            .lt('planned_date',today).order('planned_date').limit(8).abortSignal(controller.signal),
          db.from('sales_orders').select('id,order_number,created_at', { count: 'exact' })
            .eq('tenant_id',tenantId).in('status',['confirmed','picking'])
            .lt('created_at',orderCutoff).order('created_at').limit(8).abortSignal(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (purchases.error || counts.error || orders.error) {
          setState({ error: true });
          return;
        }
        setState({ sections: [
          {
            label:'Late Purchase Orders', total:purchases.count ?? 0, href:'/purchase-orders',
            items:(purchases.data ?? []).map(row=>({ id:row.id,label:row.po_number,date:row.expected_date,href:'/purchase-orders' })),
          },
          {
            label:'Overdue Count Documents', total:counts.count ?? 0, href:'/cycle-counts',
            items:(counts.data ?? []).map(row=>({ id:row.id,label:row.count_number,date:row.planned_date,href:'/cycle-counts' })),
          },
          {
            label:'Open Orders Older Than 48 Hours', total:orders.count ?? 0, href:'/dashboard',
            items:(orders.data ?? []).map(row=>({ id:row.id,label:row.order_number,date:row.created_at.slice(0,10),href:`/ship?order=${row.id}` })),
          },
        ] });
      } catch {
        if (!controller.signal.aborted) setState({ error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [tenantId, attempt]);

  return <section aria-labelledby="daily-exceptions-title" className="space-y-3 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="daily-exceptions-title" className="font-semibold">Daily Warehouse Exceptions</h2>
      <button className="text-sm font-semibold text-primary underline" type="button" onClick={() => {
        setState({});
        setAttempt(value => value + 1);
      }}>Refresh</button>
    </div>
    {state.error && <p role="alert" className="text-sm text-destructive">Could not load warehouse exceptions. Use Refresh to retry.</p>}
    {!state.sections && !state.error && <p role="status" className="text-sm text-muted-foreground">Loading warehouse exceptions…</p>}
    {state.sections && <div className="grid gap-3 lg:grid-cols-3">
      {state.sections.map(section => <div key={section.label} className="min-w-0 space-y-2 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{section.label}</h3>
          <span className="font-semibold tabular-nums">{section.total}</span>
        </div>
        {section.items.length === 0 ? <p className="text-sm text-muted-foreground">No matching records.</p> : <ul className="divide-y text-sm">
          {section.items.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-x-2 py-1">
            <Link href={item.href} className="break-all text-primary underline">{item.label}</Link>
            <time dateTime={item.date} className="whitespace-nowrap tabular-nums text-muted-foreground">{item.date}</time>
          </li>)}
        </ul>}
        {section.total > section.items.length && <Link href={section.href} className="text-sm text-primary underline">Open Full List</Link>}
      </div>)}
    </div>}
  </section>;
}
