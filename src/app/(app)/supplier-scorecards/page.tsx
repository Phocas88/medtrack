'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';
import { exportToCSV } from '@/lib/csv';

type Scorecard = {
  supplier_id: string; supplier_name: string; po_count: number; ordered_units: number;
  delivered_units: number; usable_units: number; damaged_units: number;
  overdue_pos: number; overdue_units: number; timed_completions: number;
  on_time_completions: number; unknown_completions: number; shortage_reports: number;
  late_orders: { id: string; number: string; due: string; open: number }[];
};

const number = new Intl.NumberFormat();
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const rate = (numerator: number, denominator: number) => denominator > 0 ? percent.format(numerator / denominator) : '—';
const date = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

export default function SupplierScorecardsPage() {
  const { tenantId } = useAuth();
  const [range, setRange] = useState(() => ({ start: date(89), end: date(0) }));
  const [selection, setSelection] = useState<{ range: typeof range; rows: Scorecard[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true);
      setError('');
      setSelection(undefined);
      try {
        const { data, error } = await createClient().rpc('supplier_scorecards', {
          p_start: range.start,
          p_end: range.end,
        }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setSelection({ range, rows: data ?? [] });
      } catch {
        if (!controller.signal.aborted) setError('Could not load scorecards. Check the date range and retry.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [tenantId, range]);

  const rows = selection?.rows.filter(row => row.supplier_name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  return <div className="space-y-5">
    <PageHeader product="purchasing" title="Supplier Scorecards" description="Compare receipt performance and follow up on overdue purchase orders." />
    <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const start = String(fields.get('start'));
      const end = String(fields.get('end'));
      if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
        setError('Choose a due-date period of up to one year.');
        return;
      }
      setRange({ start, end });
    }}>
      <label className="text-sm">POs Due From<Input name="start" defaultValue={range.start} type="date" required /></label>
      <label className="text-sm">POs Due Through<Input name="end" defaultValue={range.end} type="date" required /></label>
      <Button type="submit" disabled={busy}>{busy ? 'Loading…' : 'Run Scorecards'}</Button>
      <Button type="button" variant="outline" disabled={busy || !rows.length} onClick={() => exportToCSV(rows.map(row => ({
        Supplier: row.supplier_name, 'Due from': selection?.range.start, 'Due through': selection?.range.end,
        POs: row.po_count, Ordered: row.ordered_units, Delivered: row.delivered_units,
        'Usable Fill Rate': rate(row.usable_units, row.ordered_units), Damaged: row.damaged_units,
        'Overdue POs': row.overdue_pos, 'Overdue Units': row.overdue_units,
        'On-Time Rate': rate(row.on_time_completions, row.timed_completions),
        'Completions With Dates': row.timed_completions, 'Completions Without Dates': row.unknown_completions,
        'Confirmed Shortage Reports': row.shortage_reports,
      })), 'supplier_scorecards')}>Export CSV</Button>
    </form>
    <p className="text-sm text-muted-foreground">This report shows current receipt totals for POs due in the selected period. Usable fill excludes recorded damage. On-time completion uses the last posted receipt date for completed POs with receipt history.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Loading supplier performance…</p>}
    {selection && <>
      <label className="block max-w-xs text-sm">Find Supplier<Input value={query} onChange={event => setQuery(event.target.value)} /></label>
      {rows.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No matching supplier POs are due in this period.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b bg-muted/50">
              {['Supplier', 'POs', 'Usable Fill', 'On-Time Completion', 'Damage', 'Overdue', 'Late Orders'].map(heading => (
                <th className="p-3" key={heading} scope="col">{heading}</th>
              ))}
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.supplier_id} className="border-b align-top last:border-b-0">
              <th className="p-3 font-semibold" scope="row">{row.supplier_name}</th>
              <td className="p-3 tabular-nums">{number.format(row.po_count)}</td>
              <td className="p-3 tabular-nums">{rate(row.usable_units, row.ordered_units)}
                <span className="block text-xs text-muted-foreground">{number.format(row.usable_units)}/{number.format(row.ordered_units)} units</span>
              </td>
              <td className="p-3 tabular-nums">{rate(row.on_time_completions, row.timed_completions)}
                <span className="block text-xs text-muted-foreground">{row.on_time_completions}/{row.timed_completions} dated</span>
                {row.unknown_completions > 0 && <span className="block text-xs text-muted-foreground">{number.format(row.unknown_completions)} without receipt dates</span>}
              </td>
              <td className="p-3 tabular-nums">{number.format(row.damaged_units)} units</td>
              <td className="p-3 tabular-nums">{number.format(row.overdue_pos)} POs
                <span className="block text-xs text-muted-foreground">{number.format(row.overdue_units)} open units</span>
              </td>
              <td className="p-3">
                {row.late_orders.length === 0 ? '—' : <ul className="space-y-1">
                  {row.late_orders.map(po => <li key={po.id}>
                    <Link href={`/purchase-orders?po=${po.id}`} className="text-primary underline">{po.number}</Link>
                    <span className="block text-xs text-muted-foreground">{po.due} · {number.format(po.open)} open</span>
                  </li>)}
                </ul>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </>}
  </div>;
}
