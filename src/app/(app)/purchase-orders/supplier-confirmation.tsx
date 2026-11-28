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

export function SupplierConfirmationPanel({ poId, canCreate }: { poId: string; canCreate: boolean }) {
  const [history, setHistory] = useState<History[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc('list_supplier_confirmations', { p_po: poId });
    if (error) toast.error('Could not load supplier confirmations.');
    else setHistory(data ?? []);
  }, [poId]);
  useEffect(() => { void load(); }, [load]);

  return <section aria-label="Supplier confirmations" className="mt-4 space-y-3 rounded-md border p-4">
    <h3 className="font-semibold">Supplier Confirmations</h3>
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
