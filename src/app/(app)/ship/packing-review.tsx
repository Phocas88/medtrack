'use client';

import { useState } from 'react';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type Carton = { id: string; number: string; tracking: string; scans: string[] };

export function PackingReview({ demand, cartons, setCartons, tracking, disabled }: {
  demand: Map<string, number>;
  cartons: Carton[];
  setCartons: (cartons: Carton[]) => void;
  tracking: string;
  disabled: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const counts = new Map<string, number>();
  for (const carton of cartons) for (const value of carton.scans) counts.set(value, (counts.get(value) ?? 0) + 1);

  function scan(value: string, cartonId: string) {
    const sku = (value.match(/(?:^|\|)SKU:([^|]+)/)?.[1] ?? value).trim().toLowerCase();
    const expected = demand.get(sku);
    const count = counts.get(sku) ?? 0;
    if (!expected || count >= expected) {
      setMessage(!expected ? 'That SKU is not on the shipment.' : 'The required quantity for this SKU is already packed.');
      return;
    }
    setCartons(cartons.map(carton => carton.id === cartonId ? { ...carton, scans: [...carton.scans, sku] } : carton));
    setMessage(`Packed ${sku} · ${count + 1} of ${expected}`);
    setActive(null);
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border p-4">
      <legend className="px-1 font-semibold">Scan to pack</legend>
      <p className="text-sm text-muted-foreground">Add cartons to verify every SKU before posting the shipment.</p>
      {cartons.length > 0 && <ul className="flex flex-wrap gap-3 text-sm">
        {[...demand].map(([sku, quantity]) => <li key={sku} className="break-all">{sku} · {counts.get(sku) ?? 0}/{quantity}</li>)}
      </ul>}
      {cartons.map((carton, index) => (
        <div className="space-y-2 rounded border p-3" key={carton.id}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Carton identifier
              <Input value={carton.number} maxLength={80} onChange={event => setCartons(cartons.map(row =>
                row.id === carton.id ? { ...row, number: event.target.value } : row))} />
            </label>
            <label className="text-sm">Carton tracking
              <Input value={carton.tracking} maxLength={200} placeholder={tracking || 'Tracking number'}
                onChange={event => setCartons(cartons.map(row =>
                  row.id === carton.id ? { ...row, tracking: event.target.value } : row))} />
            </label>
          </div>
          <p className="text-sm">{carton.scans.length} scanned</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" variant="outline" onClick={() => setActive(carton.id)}>Scan item</Button>
            <Button size="sm" type="button" variant="outline" disabled={!carton.scans.length}
              onClick={() => setCartons(cartons.map(row => row.id === carton.id ? { ...row, scans: row.scans.slice(0, -1) } : row))}>Undo last scan</Button>
            <Button size="sm" type="button" variant="ghost" aria-label={`Remove carton ${index + 1}`}
              onClick={() => setCartons(cartons.filter(row => row.id !== carton.id))}>Remove carton</Button>
          </div>
          {active === carton.id && <BarcodeScanner onScan={value => scan(value, carton.id)} onClose={() => setActive(null)} />}
        </div>
      ))}
      <p className="text-sm" role="status">{message}</p>
      <Button size="sm" type="button" variant="outline" disabled={!demand.size || cartons.length >= 100} onClick={() => {
        const used = new Set(cartons.map(carton => carton.number));
        let next = 1;
        while (used.has(String(next))) next += 1;
        setCartons([...cartons, { id: crypto.randomUUID(), number: String(next), tracking: '', scans: [] }]);
      }}>Add carton</Button>
    </fieldset>
  );
}
