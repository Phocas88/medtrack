'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/components/providers/auth-provider';
import { ShiftPriorities } from '@/components/workspace/shift-priorities';
import { createClient } from '@/lib/supabase/client';

type Member = { id: string; full_name: string };
type HistoryEvent = { id: string; actor_id: string | null; detail: string; created_at: string };
type Followup = {
  id: string; title: string; kind: string; owner_id: string | null; due_date: string | null;
  resolved_at: string | null; source_type: 'sales_order' | 'purchase_order' | 'transfer' | null;
  source_id: string | null; events: HistoryEvent[];
};
type Source = { type: NonNullable<Followup['source_type']>; id: string };
const sourceOptions = [['order', 'sales_order'], ['po', 'purchase_order'], ['transfer', 'transfer']] as const;
const sourcePaths = { sales_order: '/ship?order=', purchase_order: '/purchase-orders?po=', transfer: '/transfers?transfer=' };

function OwnerSelect({ members, value, onChange }: { members: Member[]; value: string; onChange: (value: string) => void }) {
  return <select className="block w-full rounded border bg-background p-2" value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Unassigned</option>
    {value && !members.some(member => member.id === value) && <option value={value}>Inactive member</option>}
    {members.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
  </select>;
}

function FollowupCard({ row, members, onSaved }: { row: Followup; members: Member[]; onSaved: () => void }) {
  const [owner, setOwner] = useState(row.owner_id ?? '');
  const [due, setDue] = useState(row.due_date ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(resolve: boolean) {
    if (resolve && !note.trim()) { toast.error('Enter a resolution note'); return; }
    setBusy(true);
    const { error } = await createClient().rpc('save_warehouse_followup', {
      p_id: row.id, p_kind: row.kind, p_title: row.title, p_source_type: null, p_source_id: null,
      p_owner: owner || null, p_due: due || null, p_detail: note, p_resolve: resolve,
    });
    if (error) toast.error(error.message);
    else {
      setNote('');
      toast.success(resolve ? 'Follow-up resolved' : 'Follow-up updated');
      onSaved();
    }
    setBusy(false);
  }

  return <article className="min-w-0 space-y-3 rounded border bg-card p-4">
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="break-words font-semibold">{row.title}</h2>
      <span className="text-sm capitalize text-muted-foreground">{row.kind} · {row.resolved_at ? 'Resolved' : 'Open'}</span>
    </div>
    {row.source_id && row.source_type &&
      <Link className="inline-block text-sm underline" href={sourcePaths[row.source_type] + row.source_id}>Open source record</Link>}
    {row.resolved_at ? <p className="text-sm">Owner: {members.find(member => member.id === row.owner_id)?.full_name ?? 'Unassigned'} · Due {row.due_date ?? '—'}</p> :
      <fieldset className="space-y-2" disabled={busy}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Owner<OwnerSelect members={members} value={owner} onChange={setOwner} /></label>
          <label className="text-sm">Due date<Input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
        </div>
        <label className="block text-sm">Progress or resolution note
          <Textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" onClick={() => void save(false)}>Save update</Button>
          <Button size="sm" type="button" variant="outline" onClick={() => void save(true)}>Resolve</Button>
        </div>
      </fieldset>}
    <details className="text-sm">
      <summary className="cursor-pointer">History ({row.events.length})</summary>
      <ol className="mt-2 space-y-2">
        {[...row.events].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(event => <li key={event.id} className="break-words">
          <p>{event.detail}</p>
          <p className="text-muted-foreground">{event.created_at.slice(0, 10)} · {members.find(member => member.id === event.actor_id)?.full_name ?? 'Warehouse record'}</p>
        </li>)}
      </ol>
    </details>
  </article>;
}

export default function WarehouseFollowupsPage() {
  const { user, tenantId } = useAuth();
  const allowed = user?.is_active && user.access_level !== 'scanner_only' && ['manager', 'admin'].includes(user.role);
  const [source, setSource] = useState<Source>();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('customer');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ tenant: string; rows: Followup[]; members: Member[]; error?: string }>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [param,type] of sourceOptions) {
      const id = params.get(param);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) {
        setSource({ id, type });
        if (type === 'sales_order' && params.get('draft') === 'shortage') {
          setTitle('Review order stock shortage');
          setNote('Confirm eligible stock and reservations for this order. Check incoming receipts or pick-bin replenishment before releasing the order.');
        }
        setKind(type === 'sales_order' ? 'customer' : type === 'purchase_order' ? 'supplier' : 'transfer');
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (!allowed || !tenantId) return;
    const controller = new AbortController();
    const db = createClient();
    let query = db.from('warehouse_followups')
      .select('id,title,kind,owner_id,due_date,resolved_at,source_type,source_id,events:warehouse_followup_events(id,actor_id,detail,created_at)')
      .eq('tenant_id', tenantId).order('due_date', { nullsFirst: false }).order('created_at', { ascending: false }).limit(100);
    if (filter === 'open') query = query.is('resolved_at', null);
    if (filter === 'resolved') query = query.not('resolved_at', 'is', null);
    if (source) query = query.eq('source_type', source.type).eq('source_id', source.id);
    void Promise.all([query.abortSignal(controller.signal),
      db.from('users').select('id,full_name,is_active').eq('tenant_id', tenantId).order('full_name').abortSignal(controller.signal),
    ]).then(([cases, members]) => {
      if (controller.signal.aborted) return;
      setData({ tenant: tenantId, rows: (cases.data ?? []) as Followup[], members: members.data ?? [],
        error: cases.error?.message ?? members.error?.message });
    });
    return () => controller.abort();
  }, [allowed, tenantId, filter, revision, source]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const { error } = await createClient().rpc('save_warehouse_followup', {
      p_id: null, p_kind: kind, p_title: title, p_source_type: source?.type ?? null, p_source_id: source?.id ?? null,
      p_owner: owner || null, p_due: due || null, p_detail: note, p_resolve: false,
    });
    if (error) toast.error(error.message);
    else {
      setTitle(''); setNote(''); setOwner(''); setDue(''); setFilter('open');
      setRevision(value => value + 1);
      toast.success('Follow-up added');
    }
    setBusy(false);
  }

  if (!allowed) return <p>Warehouse manager access is required.</p>;
  const current = data?.tenant === tenantId ? data : undefined;
  return <div className="space-y-4">
    <PageHeader title="Warehouse follow-ups" description="Assign and resolve shortages, damage, and shipment issues." />
    {!source && <>
      <ShiftPriorities />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/expiration">Expiring lots</Link>
        <Link className="underline" href="/replenishment">Pick-bin shortages</Link>
        <Link className="underline" href="/integrations/shopify">Shopify sync activity</Link>
        <Link className="underline" href="/integrations/quickbooks">QuickBooks invoice exports</Link>
      </div>
    </>}
    {source && <Button type="button" size="sm" variant="outline" onClick={() => setSource(undefined)}>Show all follow-ups</Button>}
    <details className="space-y-3 rounded border bg-card p-4" open={source?.type === 'sales_order' ? true : undefined}>
      <summary className="cursor-pointer font-semibold">New follow-up</summary>
      <form className="space-y-2" onSubmit={create}>
        <fieldset className="space-y-2" disabled={busy}>
          <label className="block text-sm">Issue<Input value={title} required maxLength={250} onChange={event => setTitle(event.target.value)} placeholder="Shipment delayed or stock damaged" /></label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">Type
              <select className="block w-full rounded border bg-background p-2" value={kind} onChange={event => setKind(event.target.value)}>
                <option value="customer">Customer</option><option value="supplier">Supplier</option><option value="transfer">Transfer</option>
              </select>
            </label>
            <label className="text-sm">Owner<OwnerSelect members={current?.members ?? []} value={owner} onChange={setOwner} /></label>
            <label className="text-sm">Due date<Input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
          </div>
          <label className="block text-sm">Note<Textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /></label>
          <Button type="submit" size="sm">Add follow-up</Button>
        </fieldset>
      </form>
    </details>
    <label className="block text-sm">Show
      <select className="mt-1 block rounded border bg-background p-2" value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option>
      </select>
    </label>
    {current?.error ? <p role="alert">{current.error}</p> : !current ? <p role="status">Loading follow-ups…</p> :
      !current.rows.length ? <p>No follow-ups in this view.</p> :
      <div className="grid gap-3 xl:grid-cols-2">
        {current.rows.map(row => <FollowupCard key={row.id} row={row} members={current.members} onSaved={() => setRevision(value => value + 1)} />)}
      </div>}
    {current?.rows.length === 100 && <p className="text-sm text-muted-foreground">Showing the first 100 records in this view.</p>}
  </div>;
}
