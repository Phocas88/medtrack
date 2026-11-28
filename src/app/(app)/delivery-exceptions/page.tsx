'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const statuses: Record<string, string> = {
  return_to_sender: 'Return to Sender',
  failure: 'Delivery Failed',
  cancelled: 'Tracking Cancelled',
  error: 'Tracking Error',
  available_for_pickup: 'Available for Pickup',
};

type DeliveryRow = {
  source_kind: 'order' | 'carton'; source_id: string; order_id: string; order_number: string;
  carton_number: string | null; tracking_number: string | null; delivery_status: string;
  updated_at: string | null; followup_id: string | null; followup_resolved_at: string | null; total: number;
};

export default function DeliveryExceptionsPage() {
  const { tenantId } = useAuth();
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ tenantId: string; status: string; rows: DeliveryRow[] }>();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState('');
  const rows = result?.tenantId === tenantId && result?.status === status ? result.rows : undefined;

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await createClient().rpc('delivery_exception_queue', {
          p_status: status || null,
        }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setResult({ tenantId: tenantId!, status, rows: data ?? [] });
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [tenantId, status, revision]);

  function refresh() {
    setError(false);
    setResult(undefined);
    setRevision(previous => previous + 1);
  }

  return <div className="space-y-5">
    <PageHeader product="shipping" title="Delivery Exceptions"
      description="Review the latest reported carrier issues for orders and cartons."
      actions={<Button type="button" variant="outline" onClick={refresh}>Refresh</Button>} />
    <label className="block max-w-xs text-sm">Carrier Status
      <select value={status} className="block min-h-10 w-full rounded-md border bg-background px-3" onChange={event => {
        setError(false);
        setStatus(event.target.value);
      }}>
        <option value="">All Exceptions</option>
        {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="text-sm text-destructive">Could not load the exception queue. Use Refresh to retry.</p>}
    {!rows && !error && <p role="status" className="text-sm text-muted-foreground">Loading carrier exceptions…</p>}
    {rows?.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No reported carrier exceptions match this filter.</p>}
    {!!rows?.length && <>
      <p className="text-sm text-muted-foreground">{rows[0].total} reported records{rows[0].total > rows.length ? ` · Showing the latest ${rows.length}` : ''}.</p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b bg-muted/50">{['Order / Carton', 'Tracking', 'Carrier Status', 'Last Update', 'Follow-up'].map(label => (
            <th className="p-3" key={label} scope="col">{label}</th>
          ))}</tr></thead>
          <tbody>{rows.map(row => {
            const key = `${row.source_kind}:${row.source_id}`;
            return <tr key={key} className="border-b last:border-b-0">
              <th className="p-3" scope="row">
                <Link href={`/dashboard?q=${encodeURIComponent(row.order_number)}`} className="text-primary underline">{row.order_number}</Link>
                {row.carton_number && <span className="block font-normal text-muted-foreground">Carton {row.carton_number}</span>}
              </th>
              <td className="break-all p-3 font-mono">{row.tracking_number || '—'}</td>
              <td className="p-3 font-medium">{statuses[row.delivery_status]}</td>
              <td className="p-3">{row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
              <td className="p-3">
                {row.followup_id ? <Link href={`/warehouse-followups?order=${row.order_id}${row.followup_resolved_at ? "&filter=resolved" : ""}`} className="text-primary underline">
                  {row.followup_resolved_at ? 'Resolved Follow-up' : 'Open Follow-ups'}
                </Link> : <Button type="button" size="sm" variant="outline" disabled={!!pending} onClick={async () => {
                  setPending(key);
                  try {
                    const { data, error } = await createClient().rpc('create_delivery_exception_followup', {
                      p_kind: row.source_kind, p_source: row.source_id, p_status: row.delivery_status,
                    });
                    if (error) throw error;
                    setResult(current => current && ({
                      ...current, rows: current.rows.map(item => item.source_kind === row.source_kind &&
                        item.source_id === row.source_id && item.delivery_status === row.delivery_status
                        ? { ...item, followup_id: data } : item),
                    }));
                    toast.success('Warehouse follow-up created.');
                  } catch (error) {
                    toast.error(error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not create a follow-up.');
                  } finally { setPending(''); }
                }}>{pending === key ? 'Creating…' : 'Create Follow-up'}</Button>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </>}
  </div>;
}
