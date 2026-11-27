'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Unit = { id: string; uom_name: string; conversion_factor: number };

export function PackQuantity({ tenantId, productId, usage, max, onApply }: {
  tenantId: string;
  productId: string;
  usage: 'purchase' | 'ship';
  max?: number;
  onApply: (stockQuantity: number) => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversion, setConversion] = useState('');
  const [count, setCount] = useState('1');

  useEffect(() => {
    const controller = new AbortController();
    const flag = usage === 'purchase' ? 'is_orderable' : 'is_sellable';
    void createClient().from('product_uom_conversions').select('id,uom_name,conversion_factor')
      .eq('tenant_id', tenantId).eq('product_id', productId).eq(flag, true)
      .gt('conversion_factor', 0).neq('conversion_factor', 1).order('uom_name')
      .abortSignal(controller.signal).then(({ data }) => {
        if (!controller.signal.aborted) setUnits(data ?? []);
      });
    return () => controller.abort();
  }, [tenantId, productId, usage]);

  if (!units.length) return null;
  const unit = units.find(row => row.id === conversion) ?? units[0];
  const factorTicks = Math.round(Number(unit.conversion_factor) * 10000);
  const scaled = factorTicks * Number(count);
  const quantity = scaled / 10000;
  const valid = /^\d+$/.test(count) && Number.isSafeInteger(scaled) && Number.isInteger(quantity)
    && quantity > 0 && quantity <= (max ?? 2147483647);

  return <details className="mt-2 min-w-28 text-xs">
    <summary className="cursor-pointer font-medium underline">Enter packs</summary>
    <div className="mt-2 grid gap-2">
      <label>Pack size<select className="block w-full rounded border bg-background p-1" value={unit.id}
        onChange={event => setConversion(event.target.value)}>
        {units.map(option => <option key={option.id} value={option.id}>{option.uom_name} ({option.conversion_factor})</option>)}
      </select></label>
      <label>Number of packs<input className="block w-full rounded border bg-background p-1" type="number"
        min={1} step={1} value={count} onChange={event => setCount(event.target.value)} /></label>
      <p>{valid ? `${quantity.toLocaleString()} stock units` : 'Enter a pack count that converts to a valid whole quantity.'}</p>
      <button type="button" disabled={!valid} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => onApply(quantity)}>
        Apply stock quantity
      </button>
    </div>
  </details>;
}
