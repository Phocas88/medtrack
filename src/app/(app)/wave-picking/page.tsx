'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

type Choice = { id: string; name: string };
type Order = { id: string; order_number: string; status: string };
type Task = { pick_batch_id: string; pick_order_id: string; pick_tote_code: string; title: string; status: string; requested_quantity: number; scanned_quantity: number | null };
type Batch = { id: string; created_at: string; cancelled_at: string | null; assigned_to: string };
type Snapshot = { locations: Choice[]; pickers: Choice[]; orders: Order[]; tasks: Task[]; batches: Batch[] };

export default function WavePickingPage() {
  const { tenantId, role, loading } = useAuth();
  const allowed = role === 'admin' || role === 'manager';
  const [data, setData] = useState<Snapshot>();
  const [location, setLocation] = useState('');
  const [picker, setPicker] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId || !allowed) return;
    const db = createClient();
    const [locations, pickers, orders, tasks, batches] = await Promise.all([
      db.from('locations').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      db.from('users').select('id,full_name').eq('tenant_id', tenantId).eq('is_active', true).order('full_name'),
      db.from('sales_orders').select('id,order_number,status').eq('tenant_id', tenantId)
        .in('status', ['confirmed','picking']).order('ship_date', { ascending: true, nullsFirst: false }).limit(100),
      db.from('scan_tasks').select('pick_batch_id,pick_order_id,pick_tote_code,title,status,requested_quantity,scanned_quantity')
        .eq('tenant_id', tenantId).not('pick_batch_id', 'is', null).order('created_at', { ascending: false }).limit(1000),
      db.from('pick_batches').select('id,created_at,cancelled_at,assigned_to').eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(30),
    ]);
    const failure = [locations, pickers, orders, tasks, batches].find(result => result.error)?.error;
    if (failure) { setError(failure.message); return; }
    setData({ locations: locations.data ?? [], pickers: (pickers.data ?? []).map(row => ({ id: row.id, name: row.full_name })),
      orders: orders.data ?? [], tasks: (tasks.data ?? []) as Task[], batches: batches.data ?? [] });
  }, [allowed, tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function update(batchId?: string) {
    if (busy) return;
    if (batchId && !window.confirm('Cancel the remaining picks and release reservations? Return any picked stock to its original bins first.')) return;
    setBusy(true); setError('');
    try {
      const db = createClient();
      const { error } = batchId
        ? await db.rpc('cancel_pick_batch', { p_batch: batchId })
        : await db.rpc('create_pick_batch', { p_location: location, p_orders: selected, p_assignee: picker });
      if (error) setError(error.message);
      else { setSelected([]); await refresh(); }
    } catch { setError('Could not confirm the update. Refresh the batch list before retrying.'); }
    finally { setBusy(false); }
  }

  if (loading) return <p role="status">Loading batch picking…</p>;
  if (!allowed) return <p>Warehouse manager access is required.</p>;
  const assigned = new Set(data?.tasks.filter(task => task.status !== 'cancelled').map(task => task.pick_order_id));

  return <main className="space-y-5">
    <PageHeader title="Batch picking" description="Reserve stock and assign a shared set of orders. Operators verify each order’s tote in the scanner." />
    <p className="text-sm text-muted-foreground">Use this workflow for non-serialized, non-lot-tracked items that can be picked from one bin per line. Each order ships as one verified shipment.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy}>Refresh batches</Button>
    {data && <>
      <fieldset disabled={busy} className="space-y-4 rounded-lg border bg-card p-4">
        <legend className="px-1 font-semibold">Create a batch</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Warehouse<select className="mt-1 block w-full rounded border bg-background p-2" value={location} onChange={event => setLocation(event.target.value)}>
            <option value="">Choose a warehouse</option>{data.locations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label className="text-sm">Picker<select className="mt-1 block w-full rounded border bg-background p-2" value={picker} onChange={event => setPicker(event.target.value)}>
            <option value="">Choose a picker</option>{data.pickers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
        </div>
        <div className="grid max-h-60 gap-2 overflow-auto sm:grid-cols-3" aria-label="Open orders">
          {data.orders.filter(order => !assigned.has(order.id)).map(order => <label key={order.id} className="flex items-center gap-2 rounded border p-2 text-sm">
            <input type="checkbox" checked={selected.includes(order.id)} disabled={selected.length >= 20 && !selected.includes(order.id)}
              onChange={event => setSelected(prev => event.target.checked ? [...prev, order.id] : prev.filter(id => id !== order.id))} />
            {order.order_number}
          </label>)}
        </div>
        <Button type="button" disabled={!location || !picker || selected.length < 2 || busy} onClick={() => void update()}>
          Create batch ({selected.length} orders)
        </Button>
      </fieldset>
      {data.batches.map(batch => {
        const tasks = data.tasks.filter(task => task.pick_batch_id === batch.id);
        const active = tasks.some(task => data.orders.some(order => order.id === task.pick_order_id));
        return <section key={batch.id} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div><h2 className="font-semibold">Batch {batch.id.slice(0,8).toUpperCase()}</h2>
              <p className="text-sm text-muted-foreground">{data.pickers.find(p => p.id === batch.assigned_to)?.name ?? 'Picker'} · {batch.cancelled_at ? 'Cancelled' : `${tasks.filter(task => task.status === 'completed').length} of ${tasks.length} picks recorded`}</p></div>
            {!batch.cancelled_at && active && <Button type="button" variant="outline" disabled={busy} onClick={() => void update(batch.id)}>Cancel remaining picks</Button>}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tasks.map((task,index) => <li key={index} className="rounded border p-2 text-sm">
              <p>{task.title}</p><p className="font-mono">{task.pick_tote_code}</p>
              <p className="text-muted-foreground">{task.status === 'completed' ? `${task.scanned_quantity} of ${task.requested_quantity} picked` : task.status}</p>
              {task.status === 'completed' && task.scanned_quantity !== task.requested_quantity
                ? <Link href={`/warehouse-followups?order=${task.pick_order_id}`} className="underline">Review short pick</Link>
                : <Link href={`/ship?order=${task.pick_order_id}`} className="underline">View order</Link>}
            </li>)}
          </ul>
        </section>;
      })}
    </>}
  </main>;
}
