'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type Balance = { product_id: string; sku: string; demand: number; on_hand: number; reserved_other: number; reserved_for_order: number };

export function OrderReservation({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<Balance[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void createClient().rpc('order_reservation_status', { p_order: orderId }).abortSignal(controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setRows(response.data ?? undefined);
      setError(response.error?.message ?? '');
    });
    return () => controller.abort();
  }, [orderId, revision]);

  async function update(reserve: boolean) {
    setBusy(true);
    const { error: failure } = await createClient().rpc('set_order_reservation', { p_order: orderId, p_reserve: reserve });
    if (failure) toast.error(failure.message);
    else {
      toast.success(reserve ? 'Order stock reserved' : 'Reservation released');
      setRevision(value => value + 1);
    }
    setBusy(false);
  }

  return (
    <section className="space-y-2 rounded border p-3" aria-label="Order stock reservation">
      <h2 className="font-semibold">Order stock reservation</h2>
      {error ? <p role="alert" className="text-sm">{error}</p> : rows ? (
        <ul className="space-y-1 text-sm">
          {rows.map(row => <li key={row.product_id} className="break-words">
            <strong>{row.sku}</strong> · {row.demand} needed · {row.on_hand} eligible on hand · {row.reserved_for_order} reserved here · {row.reserved_other} reserved elsewhere · {Math.max(0, row.on_hand - row.reserved_other - row.reserved_for_order)} unreserved
          </li>)}
        </ul>
      ) : <p role="status" className="text-sm">Checking available stock…</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !rows?.length} onClick={() => void update(true)}>Reserve order stock</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !rows?.some(row => row.reserved_for_order)}
          onClick={() => void update(false)}>Release reservation</Button>
        <Button asChild size="sm" variant="ghost"><Link href={`/warehouse-followups?order=${orderId}`}>Open customer follow-up</Link></Button>
      </div>
    </section>
  );
}
