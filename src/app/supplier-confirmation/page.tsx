'use client';

import { useEffect, useState } from 'react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';

type Confirmation = {
  company: string;
  order_number: string;
  submitted: boolean;
  items: { id: string; sku: string; name: string; open_quantity: number }[];
};

async function requestConfirmation(token: string, reply?: unknown) {
  const response = await fetch('/api/po/supplier-confirmation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, reply }),
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
          await requestConfirmation(token, { name: String(form.get('name')), note: String(form.get('note')), lines });
          setOrder({ ...order, submitted: true });
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
  </main>;
}
