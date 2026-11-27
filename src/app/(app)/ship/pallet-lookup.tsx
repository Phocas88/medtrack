'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

type CartonHit = {
  id: string;
  carton_number: string;
  tracking_number: string;
  delivery_status: string | null;
  shipment: { order: { order_number: string } | null } | null;
};

export function PalletLookup({ tenantId }: { tenantId: string }) {
  const [code, setCode] = useState('');
  const [data, setData] = useState<CartonHit[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <details className="rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Find an outbound pallet</summary>
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={async event => {
      event.preventDefault();
      if (!code.trim() || busy) return;
      setBusy(true); setData(undefined); setError('');
      try {
        const result = await createClient().from('shipment_cartons')
          .select('id,carton_number,tracking_number,delivery_status,shipment:shipments(order:sales_orders(order_number))')
          .eq('tenant_id', tenantId).eq('pallet_code', code.trim().toUpperCase()).limit(100).order('id');
        if (result.error) throw result.error;
        setData(result.data as unknown as CartonHit[]);
      } catch { setError('Could not look up this pallet. Try again.'); }
      finally { setBusy(false); }
    }}>
      <label className="text-sm">Pallet ID<Input value={code} onChange={event => setCode(event.target.value)} maxLength={80} required /></label>
      <Button type="submit" variant="outline" disabled={busy}>{busy ? 'Looking up…' : 'Find cartons'}</Button>
    </form>
    {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    {data && <div aria-live="polite" className="mt-3 text-sm">
      {data.length ? <ul className="space-y-2">{data.map(carton =>
        <li key={carton.id} className="break-words">{carton.shipment?.order?.order_number ?? 'Shipment'} · Carton {carton.carton_number} · {carton.tracking_number || 'Label pending'}
          {carton.delivery_status && ` · ${carton.delivery_status.replaceAll('_', ' ')}`}</li>)}</ul> : <p>No cartons found for this pallet.</p>}
      {data.length === 100 && <p>Showing the first 100 cartons.</p>}
    </div>}
  </details>;
}
