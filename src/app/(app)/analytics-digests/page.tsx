'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Digest = {
  report_date: string;
  late_purchase_orders: number;
  overdue_counts: number;
  aging_orders: number;
  carrier_exceptions: number;
};

export default function AnalyticsDigestsPage() {
  const { tenantId, user } = useAuth();
  const [cadence, setCadence] = useState('off');
  const [history, setHistory] = useState<Digest[]>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId || !userId) return;
    const db = createClient();
    let preference = db.from('analytics_digest_preferences').select('cadence')
      .eq('tenant_id', tenantId).eq('user_id', userId);
    let reports = db.from('analytics_digest_history').select('report_date,late_purchase_orders,overdue_counts,aging_orders,carrier_exceptions')
      .eq('tenant_id', tenantId).eq('user_id', userId).order('report_date', { ascending: false }).limit(30);
    if (signal) {
      preference = preference.abortSignal(signal);
      reports = reports.abortSignal(signal);
    }
    const [settings, recent] = await Promise.all([preference.maybeSingle(), reports]);
    if (signal?.aborted) return;
    if (settings.error || recent.error) {
      setError(true);
      return;
    }
    setError(false);
    setCadence(settings.data?.cadence ?? 'off');
    setHistory(recent.data ?? []);
  }, [tenantId, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <div className="space-y-5">
    <PageHeader product="analytics" title="Scheduled Exception Digests" description="Review late purchases, overdue counts, aging orders, and carrier exceptions on a schedule." />
    <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      try {
        const { error } = await createClient().rpc('set_analytics_digest', { p_cadence: cadence === 'off' ? null : cadence });
        if (error) { toast.error(error.message); return; }
        toast.success('Digest schedule saved.');
        await load();
      } finally { setBusy(false); }
    }}>
      <label className="text-sm">My Digest Schedule
        <select className="block min-h-10 w-full rounded-md border bg-background px-3" value={cadence}
          onChange={event => setCadence(event.target.value)} disabled={busy || !history}>
          <option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly on Monday</option>
        </select>
      </label>
      <Button disabled={busy || !history} type="submit">{busy ? 'Saving…' : 'Save Schedule'}</Button>
      <p className="basis-full text-sm text-muted-foreground">Reports run around 07:00 UTC. Digests appear here and in your Invexiqs notifications.</p>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">Could not load digest settings. <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
    {!error && !history && <p role="status" className="text-sm text-muted-foreground">Loading digest history…</p>}
    {history?.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No digests have been generated for you yet.</p>}
    {!!history?.length && <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b bg-muted/50">{['Report Date (UTC)', 'Late POs', 'Overdue Counts', 'Orders Older Than 48 Hours', 'Carrier Exceptions'].map(label => (
          <th key={label} scope="col" className="p-3">{label}</th>
        ))}</tr></thead>
        <tbody>{history.map(row => <tr key={row.report_date} className="border-b last:border-b-0">
          <th scope="row" className="p-3 font-medium">{row.report_date}</th>
          <td className="p-3">{row.late_purchase_orders}</td><td className="p-3">{row.overdue_counts}</td>
          <td className="p-3">{row.aging_orders}</td><td className="p-3">{row.carrier_exceptions}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <Link href="/analytics" className="text-sm font-semibold text-primary underline">Open Current Analytics</Link>
  </div>;
}
