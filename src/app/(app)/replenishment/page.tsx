'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';

type Proposal = { assignment_id: string; sku: string; target_code: string; source_code: string;
  pick_quantity: number; open_demand: number; suggested_quantity: number };
type Member = { id: string; full_name: string };

export default function ReplenishmentPage() {
  const { user, tenantId } = useAuth();
  const allowed = user?.is_active && user.access_level !== 'scanner_only' && ['manager', 'admin'].includes(user.role);
  const [data, setData] = useState<{ tenant: string; proposals: Proposal[]; people: Member[]; error?: string }>();
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!allowed || !tenantId) return;
    const controller = new AbortController();
    const db = createClient();
    void Promise.all([
      db.rpc('pick_bin_replenishment').abortSignal(controller.signal),
      db.from('users').select('id,full_name').eq('tenant_id', tenantId).eq('is_active', true).order('full_name')
        .abortSignal(controller.signal),
    ]).then(([proposals, people]) => {
      if (controller.signal.aborted) return;
      setData({ tenant: tenantId, proposals: proposals.data ?? [], people: people.data ?? [],
        error: proposals.error?.message ?? people.error?.message });
    });
    return () => controller.abort();
  }, [allowed, tenantId, revision]);

  async function approve(row: Proposal) {
    setBusy(row.assignment_id);
    const { error } = await createClient().rpc('approve_pick_bin_replenishment', {
      p_assignment: row.assignment_id, p_owner: owners[row.assignment_id] || null,
    });
    if (error) toast.error(error.message);
    else toast.success('Replenishment task is in the scanner queue');
    setBusy(undefined);
    setRevision(value => value + 1);
  }

  if (!allowed) return <p>Warehouse manager access is required.</p>;
  const current = data?.tenant === tenantId ? data : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Pick-bin replenishment" description="Compare open order demand with stock in assigned primary pick bins."
        actions={<Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh</Button>} />
      <Link className="inline-block text-sm underline" href="/task-board">Open scanner task board</Link>
      <p className="text-sm text-muted-foreground">Suggestions use stock in other bins at the same location. Approval creates a scanner task and the confirmed move updates the bin counts.</p>
      {current?.error ? <p role="alert">{current.error}</p> : !current ? <p role="status">Checking pick bins…</p> :
        current.proposals.length === 0 ? <p>No replenishment suggestions with an available source bin.</p> :
        <div className="grid gap-3 xl:grid-cols-2">
          {current.proposals.map(row => (
            <article key={row.assignment_id} className="min-w-0 space-y-2 rounded border bg-card p-4">
              <h2 className="break-words font-semibold">{row.sku}</h2>
              <p className="text-sm">{row.pick_quantity} in {row.target_code} · {row.open_demand} needed across open orders</p>
              <p className="text-sm">Move {row.suggested_quantity} from <strong>{row.source_code}</strong> to <strong>{row.target_code}</strong></p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">Assign to
                  <select className="mt-1 block max-w-full rounded border bg-background p-2"
                    value={owners[row.assignment_id] ?? ''}
                    onChange={event => setOwners(current => ({ ...current, [row.assignment_id]: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {current.people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                </label>
                <Button size="sm" type="button" disabled={!!busy} onClick={() => void approve(row)}>Approve task</Button>
              </div>
            </article>
          ))}
        </div>}
    </div>
  );
}
