'use client';

import { useEffect, useState } from 'react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';

type Confirmation = {
  company: string;
  order_number: string;
  submitted: boolean;
  shipment_items?: { id: string; available: number }[];
  items: { id: string; sku: string; name: string; open_quantity: number }[];
};

async function requestConfirmation(token: string, action: { reply?: unknown; shipment?: unknown } = {}) {
  const response = await fetch('/api/po/supplier-confirmation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...action }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to open this confirmation.');
  return data.confirmation;
}

export default function SupplierConfirmationPage() {
  const [token, setToken] = useState('');
  const [order, setOrder] = useState<Confirmation>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shipmentSaved, setShipmentSaved] = useState(false);

  useEffect(() => {
    const key = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(key)) { setError('Open the confirmation link provided by your buyer.'); return; }
    setToken(key);
    void requestConfirmation(key).then(setOrder).catch(error => setError(error.message));
  }, []);

  return <main className="mx-auto max-w-3xl space-y-5 p-5 sm:p-9">
    <InvexiqsLogo />
    <h1 className="text-3xl font-bold text-brand-deep-plum">Confirm Purchase Order</h1>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!order && !error && <p role="status">Loading purchase order…</p>}
    {order && <p>{order.company} · {order.order_number}</p>}
    {order?.submitted ? <p role="status" className="rounded-lg border p-4 font-semibold">Your confirmation was sent to the buyer.</p> : order && (
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const lines = order.items.map(item => ({
          id: item.id, quantity: Number(form.get(`quantity-${item.id}`)),
          delivery_date: String(form.get(`date-${item.id}`) ?? ''),
        }));
        if (lines.some(line => line.quantity > 0 && !line.delivery_date)) { setError('Enter a delivery date for every confirmed quantity.'); return; }
        setBusy(true);
        setError('');
        try {
          await requestConfirmation(token, { reply: { name: String(form.get('name')), note: String(form.get('note')), lines } });
          setOrder({ ...order, submitted: true });
          setOrder(await requestConfirmation(token));
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Could not send the confirmation.');
        } finally { setBusy(false); }
      }}>
        <p>Enter how many units you can deliver and the expected delivery date. Use zero for items you cannot supply.</p>
        {order.items.map(item => <fieldset key={item.id} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 font-semibold">{item.sku} · {item.name}</legend>
          <p className="text-sm text-muted-foreground">{item.open_quantity} units requested</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>Confirmed Units<input name={`quantity-${item.id}`} type="number" min={0} max={item.open_quantity} step={1} required className="block w-full rounded border p-2" /></label>
            <label>Expected Delivery<input name={`date-${item.id}`} type="date" className="block w-full rounded border p-2" /></label>
          </div>
        </fieldset>)}
        <label className="block">Your Name<input name="name" maxLength={120} required className="block w-full rounded border p-2" /></label>
        <label className="block">Note to the Buyer<textarea name="note" maxLength={2000} className="block w-full rounded border p-2" /></label>
        <button disabled={busy} className="brand-cta px-4 py-2">{busy ? 'Sending…' : 'Send Confirmation'}</button>
      </form>
    )}
    {shipmentSaved && <p role="status" className="rounded-lg border p-4 font-semibold">Shipment notice recorded.</p>}
    {order?.submitted && !!order.shipment_items?.length && <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">Send Shipment Notice</h2>
      <p className="text-sm text-muted-foreground">Tell the buyer what is on this shipment and when it should arrive.</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        const target = event.currentTarget;
        const fields = new FormData(target);
        const lines = (order.shipment_items ?? []).map(item => ({
          po_line_id: item.id, quantity: Number(fields.get(`shipment-${item.id}`)),
        })).filter(item => item.quantity > 0);
        if (!lines.length) { setError('Enter the quantity shipped for at least one item.'); return; }
        setBusy(true);
        setError('');
        setShipmentSaved(false);
        try {
          await requestConfirmation(token, { shipment: {
            reference: String(fields.get('reference')), arrival: String(fields.get('arrival')),
            tracking: String(fields.get('tracking')), lines,
          } });
          setShipmentSaved(true);
          target.reset();
          setOrder(await requestConfirmation(token));
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Could not record the shipment notice.');
        } finally { setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Shipment Reference<input name="reference" maxLength={120} required className="block w-full rounded border p-2" /></label>
          <label>Expected Arrival<input name="arrival" type="date" required className="block w-full rounded border p-2" /></label>
          <label>Tracking Number<input name="tracking" maxLength={200} className="block w-full rounded border p-2" /></label>
        </div>
        {order.shipment_items.map(item => <label key={item.id} className="flex flex-wrap items-center justify-between gap-2">
          {order.items.find(line => line.id === item.id)?.sku} · {item.available} units available to ship
          <input name={`shipment-${item.id}`} aria-label={`Shipped units for ${order.items.find(line => line.id === item.id)?.sku}`}
            type="number" min={0} max={item.available} step={1} className="w-28 rounded border p-2" />
        </label>)}
        <button disabled={busy} className="brand-cta px-4 py-2">{busy ? 'Sending…' : 'Send Shipment Notice'}</button>
      </form>
    </section>}
  </main>;
}
