'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type InboundNotice = {
  id: string;
  reference: string;
  tracking: string | null;
  expected_date: string;
  cancelled_at: string | null;
  lines: { po_line_id: string; expected_quantity: number; delivered_quantity: number }[];
};

export function InboundNoticePanel({ poId, tenantId, lines, selected, onSelect, canReceive }: {
  poId: string;
  tenantId: string;
  lines: { po_line_id: string; sku: string; remaining: number }[];
  selected: InboundNotice | null;
  onSelect: (notice: InboundNotice | null) => void;
  canReceive: boolean;
}) {
  const [notices, setNotices] = useState<InboundNotice[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from('inbound_notices')
      .select('id,reference,expected_date,tracking,cancelled_at,lines:inbound_notice_lines(po_line_id,expected_quantity,delivered_quantity)')
      .eq('tenant_id', tenantId).eq('po_id', poId).order('expected_date', { ascending: false }).limit(100);
    if (error) setError('Could not load shipment notices.');
    else { setNotices(data ?? []); setError(''); }
  }, [poId, tenantId]);

  useEffect(() => { void load(); }, [load]);

  const openNotices = notices?.filter(notice => !notice.cancelled_at && notice.lines.some(line => line.delivered_quantity < line.expected_quantity)) ?? [];
  return <section aria-label="Advance shipment notices" className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">Advance Shipment Notices</h3>
    {error && <p role="alert">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
    {!notices && !error && <p role="status" className="text-sm">Loading shipment notices…</p>}
    {canReceive && openNotices.length > 0 && <label className="block text-sm">
      Receive Against Notice
      <select className="block min-h-10 w-full rounded border bg-background px-2" value={selected?.id ?? ''} onChange={event => {
        onSelect(openNotices.find(notice => notice.id === event.target.value) ?? null);
      }}>
        <option value="">Receive against PO only</option>
        {openNotices.map(notice => <option key={notice.id} value={notice.id}>{notice.reference} · {notice.expected_date}</option>)}
      </select>
    </label>}
    {!!notices?.length && <ul className="space-y-1 text-sm">
      {notices.map(notice => {
        const expected = notice.lines.reduce((sum, line) => sum + line.expected_quantity, 0);
        const delivered = notice.lines.reduce((sum, line) => sum + line.delivered_quantity, 0);
        return <li key={notice.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-1">
          <span className="break-all"><strong>{notice.reference}</strong> · {notice.expected_date} · {delivered}/{expected} delivered{notice.tracking ? ` · Tracking ${notice.tracking}` : ''}{notice.cancelled_at ? ' · Cancelled' : ''}</span>
          {canReceive && !notice.cancelled_at && delivered < expected && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => {
            if (!window.confirm('Cancel the remaining expected quantities on this shipment notice?')) return;
            setBusy(true);
            try {
              const { error } = await createClient().rpc('cancel_inbound_notice', { p_notice: notice.id });
              if (error) { toast.error(error.message); return; }
              if (selected?.id === notice.id) onSelect(null);
              await load();
            } finally { setBusy(false); }
          }}>Cancel Remainder</Button>}
        </li>;
      })}
    </ul>}
    {canReceive && !!lines.some(line => line.remaining > 0) && <details>
      <summary className="cursor-pointer text-sm font-medium">Record a Supplier Shipment Notice</summary>
      <form className="mt-3 space-y-3" onSubmit={async event => {
        event.preventDefault();
        const target = event.currentTarget;
        const fields = new FormData(target);
        const expected = lines.map(line => ({ po_line_id: line.po_line_id, quantity: Number(fields.get(line.po_line_id)) })).filter(line => line.quantity > 0);
        if (!expected.length) { toast.error('Enter an expected quantity for at least one PO line.'); return; }
        setBusy(true);
        try {
          const { error } = await createClient().rpc('create_inbound_notice', {
            p_po: poId, p_reference: fields.get('reference'), p_arrival: fields.get('arrival'),
            p_tracking: fields.get('tracking'), p_lines: expected,
          });
          if (error) { toast.error(error.message); return; }
          target.reset();
          toast.success('Shipment notice recorded. Select it when the delivery arrives.');
          await load();
        } finally { setBusy(false); }
      }}>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm">Supplier Reference<Input name="reference" maxLength={120} required /></label>
          <label className="text-sm">Expected Arrival<Input name="arrival" type="date" required /></label>
          <label className="text-sm">Tracking Number<Input name="tracking" maxLength={200} /></label>
        </div>
        {lines.filter(line => line.remaining > 0).map(line => <label key={line.po_line_id} className="flex items-center justify-between gap-2 text-sm">
          Expected Units · {line.sku}<Input className="w-28" name={line.po_line_id} type="number" min={0} max={line.remaining} step={1} />
        </label>)}
        <Button size="sm" type="submit" disabled={busy}>Save Shipment Notice</Button>
      </form>
    </details>}
  </section>;
}
