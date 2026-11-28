'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type History = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  submitted_at: string | null;
  snapshot: { items: { id: string; sku: string }[] };
  reply: { name: string; note: string; lines: { id: string; quantity: number; delivery_date: string }[] } | null;
};

type POProgress = { id: string; sku: string; ordered: number; announced: number; received: number };
type ProgressLine = { id: string; quantity_ordered: number; quantity_received: number | null; product: { sku: string } | null };
type NoticeProgress = {
  cancelled_at: string | null;
  lines: { po_line_id: string; expected_quantity: number; delivered_quantity: number }[];
};

export function SupplierConfirmationPanel({ poId, canCreate }: { poId: string; canCreate: boolean }) {
  const [history, setHistory] = useState<History[]>([]);
  const [progress, setProgress] = useState<POProgress[]>();
  const [progressUnavailable, setProgressUnavailable] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const db = createClient();
    const [confirmations, poLines, notices] = await Promise.all([
      db.rpc('list_supplier_confirmations', { p_po: poId }),
      db.from('po_lines').select('id,quantity_ordered,quantity_received,product:products(sku)').eq('po_id', poId),
      db.from('inbound_notices').select('cancelled_at,lines:inbound_notice_lines(po_line_id,expected_quantity,delivered_quantity)').eq('po_id', poId),
    ]);
    if (confirmations.error) toast.error('Could not load supplier confirmations.');
    else setHistory(confirmations.data ?? []);
    if (poLines.error || notices.error) {
      setProgress(undefined);
      setProgressUnavailable(true);
      return;
    }
    setProgressUnavailable(false);
    const announced = new Map<string, number>();
    for (const notice of (notices.data ?? []) as unknown as NoticeProgress[]) {
      for (const line of notice.lines) {
        const quantity = notice.cancelled_at ? line.delivered_quantity : line.expected_quantity;
        announced.set(line.po_line_id, (announced.get(line.po_line_id) ?? 0) + quantity);
      }
    }
    setProgress(((poLines.data ?? []) as unknown as ProgressLine[]).map(line => ({
      id: line.id, sku: line.product?.sku ?? 'Item', ordered: line.quantity_ordered,
      announced: announced.get(line.id) ?? 0, received: line.quantity_received ?? 0,
    })));
  }, [poId]);
  useEffect(() => { void load(); }, [load]);

  const latestReply = history.find(item => item.reply)?.reply;

  return <section aria-label="Supplier confirmations" className="mt-4 space-y-3 rounded-md border p-4">
    <h3 className="font-semibold">Supplier Confirmations</h3>
    {progressUnavailable && <p role="status" className="text-sm text-muted-foreground">PO progress is unavailable.</p>}
    {!!progress?.length && <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="pb-2 text-left text-muted-foreground">PO progress in stock units</caption>
        <thead><tr>{['SKU', 'Ordered', 'Latest Confirmed', 'Announced', 'Received', 'Open'].map(label => (
          <th key={label} scope="col" className="p-2 font-semibold">{label}</th>
        ))}</tr></thead>
        <tbody>{progress.map(line => <tr key={line.id} className="border-t">
          <th scope="row" className="p-2 font-medium">{line.sku}</th>
          <td className="p-2 tabular-nums">{line.ordered}</td>
          <td className="p-2 tabular-nums">{latestReply?.lines.find(item => item.id === line.id)?.quantity ?? '—'}</td>
          <td className="p-2 tabular-nums">{line.announced}</td>
          <td className="p-2 tabular-nums">{line.received}</td>
          <td className="p-2 tabular-nums">{Math.max(0, line.ordered - line.received)}</td>
        </tr>)}</tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Received includes usable and damaged units. Announced units come from shipment notices.</p>
    </div>}
    {canCreate && <>
      <p className="text-sm text-muted-foreground">Share a 14-day link with your supplier. Creating a new link invalidates the previous unanswered link.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
          const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
          const { error } = await createClient().rpc('create_supplier_confirmation', { p_po: poId, p_hash: hash });
          if (error) { toast.error(error.message); return; }
          setShareLink(`${window.location.origin}/supplier-confirmation#${token}`);
          await load();
        } catch {
          toast.error('Could not create a supplier link.');
        } finally { setBusy(false); }
      }}>{busy ? 'Creating…' : 'Create Supplier Link'}</Button>
    </>}
    {shareLink && <div className="flex flex-wrap gap-2">
      <input readOnly aria-label="Supplier confirmation link" value={shareLink} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 rounded border p-2 text-sm" />
      <Button type="button" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(shareLink); toast.success('Supplier link copied.'); }
        catch { toast.error('Select and copy the link from the field.'); }
      }}>Copy Link</Button>
    </div>}
    {history.map(item => <div key={item.id} className="space-y-1 border-t pt-2 text-sm">
      {item.reply ? <>
        <p className="font-medium">{item.reply.name} · {item.submitted_at?.slice(0, 10)}</p>
        <ul>{item.reply.lines.map(line => <li key={line.id}>
          {item.snapshot.items.find(source => source.id === line.id)?.sku ?? 'Item'} · {line.quantity} confirmed{line.delivery_date ? ` · ${line.delivery_date}` : ''}
        </li>)}</ul>
        {item.reply.note && <p className="whitespace-pre-wrap break-words">{item.reply.note}</p>}
      </> : <p>{item.revoked_at ? 'Superseded' : new Date(item.expires_at) <= new Date() ? 'Expired' : `Awaiting reply · expires ${item.expires_at.slice(0, 10)}`}</p>}
    </div>)}
  </section>;
}
