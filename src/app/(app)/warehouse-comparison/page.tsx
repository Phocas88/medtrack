'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';
import { exportToCSV } from '@/lib/csv';
import { formatNumber } from '@/lib/format';

type WarehouseRow = {
  warehouse_id: string | null; warehouse_name: string; stock_units: number; stock_value: number; currency: string;
  unavailable_units: number; stocked_skus: number; open_picks: number; overdue_counts: number;
};

export default function WarehouseComparisonPage() {
  const { tenantId } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ tenantId: string; rows: WarehouseRow[] }>();
  const rows = result?.tenantId === tenantId ? result.rows : undefined;
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await createClient().rpc('warehouse_operations_comparison').abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setResult({ tenantId: tenantId!, rows: data ?? [] });
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [tenantId, revision]);

  return <div className="space-y-5">
    <PageHeader product="analytics" title="Warehouse Comparison"
      description="Compare inventory and open work at each active warehouse."
      actions={<>
        <Button type="button" variant="outline" onClick={() => {
          setResult(undefined);
          setError(false);
          setRevision(previous => previous + 1);
        }}>Refresh</Button>
        <Button type="button" variant="outline" disabled={!rows?.length} onClick={() => exportToCSV((rows ?? []).map(row => ({
          Warehouse: row.warehouse_name, 'Stock Units': row.stock_units, 'Stock Value at Receipt Cost': row.stock_value, Currency: row.currency,
          'Unavailable or Needs Review': row.unavailable_units, 'Stocked SKUs': row.stocked_skus,
          'Open Assigned-Site Picks': row.warehouse_id ? row.open_picks : '', 'Overdue Counts': row.warehouse_id ? row.overdue_counts : '',
        })), 'warehouse_comparison')}>Export CSV</Button>
      </>}
    />
    <p className="max-w-3xl text-sm text-muted-foreground">Value uses recorded receipt costs. Held, expired, or otherwise restricted stock appears in unavailable units. Stock with missing locations or conflicting bin balances appears under Needs Location Review.</p>
    {error && <p role="alert" className="text-sm text-destructive">Could not load warehouse totals. Use Refresh to retry.</p>}
    {!error && !rows && <p role="status" className="text-sm text-muted-foreground">Loading warehouse totals…</p>}
    {rows?.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No active warehouses or stock balances to compare.</p>}
    {!!rows?.length && <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b bg-muted/50">
          {['Warehouse', 'Stock Units', 'Stock Value', 'Unavailable Units', 'Stocked SKUs', 'Open Picks', 'Overdue Counts'].map(label => (
            <th className="p-3" key={label} scope="col">{label}</th>
          ))}
        </tr></thead>
        <tbody>{rows.map(row => <tr className="border-b align-top last:border-b-0" key={row.warehouse_id ?? 'unmapped'}>
          <th className="p-3 font-semibold" scope="row">{row.warehouse_name}</th>
          <td className="p-3 tabular-nums">{formatNumber(row.stock_units)}</td>
          <td className="p-3 tabular-nums">{new Intl.NumberFormat(undefined, { style: 'currency', currency: row.currency }).format(row.stock_value)}</td>
          <td className="p-3 tabular-nums">{formatNumber(row.unavailable_units)}</td>
          <td className="p-3 tabular-nums">{formatNumber(row.stocked_skus)}</td>
          <td className="p-3 tabular-nums">{row.warehouse_id ? formatNumber(row.open_picks) : '—'}</td>
          <td className="p-3 tabular-nums">{row.warehouse_id ? formatNumber(row.overdue_counts) : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
