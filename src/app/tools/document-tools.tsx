'use client';

import { useState } from 'react';

function skuPart(value: FormDataEntryValue | null) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function SkuGenerator() {
  const [sku, setSku] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  return <section id="sku" className="space-y-4 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">SKU Generator</h2>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const item = skuPart(fields.get('item'));
      setCopied(false);
      if (!item) {
        setSku('');
        setError('Enter an item code with at least one letter or number.');
        return;
      }
      setError('');
      setSku([skuPart(fields.get('prefix')), item, skuPart(fields.get('variant'))].filter(Boolean).join('-'));
    }}>
      {([['prefix', 'Category or Brand', false], ['item', 'Item Code', true], ['variant', 'Variant', false]] as const).map(([name, label, required]) =>
        <label key={name} className="block">{label}<input name={name} required={required} maxLength={18} className="mt-1 block w-full rounded border p-2" /></label>
      )}
      <button className="brand-cta px-4 py-2">Generate SKU</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {sku && <div className="space-y-2">
      <output className="block break-all font-semibold">{sku}</output>
      <button type="button" className="underline" onClick={async () => {
        try { await navigator.clipboard.writeText(sku); setCopied(true); } catch { setError('Select the SKU to copy it.'); }
      }}>Copy SKU</button>
      {copied && <p role="status">Copied.</p>}
      <p className="text-sm text-muted-foreground">Check this code against your catalog before assigning it.</p>
    </div>}
  </section>;
}

type PurchaseOrder = { number: string; buyer: string; supplier: string; date: string; currency: string; notes: string; lines: { description: string; quantity: number; cost: number }[] };

export function PurchaseOrderGenerator() {
  const [lineIds, setLineIds] = useState([0]);
  const [nextId, setNextId] = useState(1);
  const [order, setOrder] = useState<PurchaseOrder>();
  const format = order ? new Intl.NumberFormat('en', { style: 'currency', currency: order.currency }) : null;
  return <section id="purchase-order" className="space-y-4 rounded-xl border p-5 md:col-span-2">
    <h2 className="text-xl font-semibold">Purchase Order Generator</h2>
    <p className="text-sm text-muted-foreground">Prepare a printable purchase order in this browser. The form does not send or save it.</p>
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const value = (key: string) => String(fields.get(key) ?? '').trim();
      setOrder({
        number: value('number'), buyer: value('buyer'), supplier: value('supplier'), date: value('date'),
        currency: value('currency'), notes: value('notes'),
        lines: lineIds.map(id => ({
          description: value(`description-${id}`),
          quantity: Number(value(`quantity-${id}`)),
          cost: Number(value(`cost-${id}`)),
        })),
      });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>PO Number<input name="number" maxLength={80} required className="block w-full rounded border p-2" /></label>
        <label>Order Date<input name="date" type="date" required className="block w-full rounded border p-2" /></label>
        <label>Buyer and Address<textarea name="buyer" maxLength={500} required className="block w-full rounded border p-2" /></label>
        <label>Supplier and Address<textarea name="supplier" maxLength={500} required className="block w-full rounded border p-2" /></label>
      </div>
      {lineIds.map((id, index) => <fieldset key={id} className="grid gap-3 rounded border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <legend className="px-1 text-sm">Line {index + 1}</legend>
        <label>Item Description<input name={`description-${id}`} maxLength={160} required className="block w-full rounded border p-2" /></label>
        <label>Quantity<input type="number" name={`quantity-${id}`} min={1} max={1000000} step={1} required className="block w-full rounded border p-2" /></label>
        <label>Unit Price<input type="number" name={`cost-${id}`} min={0} max={1000000} step=".01" required className="block w-full rounded border p-2" /></label>
        {lineIds.length > 1 && <button type="button" className="self-end p-2 underline" onClick={() => setLineIds(lineIds.filter(lineId => lineId !== id))} aria-label={`Remove line ${index + 1}`}>Remove</button>}
      </fieldset>)}
      <button type="button" className="underline" disabled={lineIds.length >= 20} onClick={() => { setLineIds([...lineIds, nextId]); setNextId(nextId + 1); }}>Add Line</button>
      <label className="block">Currency<select name="currency" className="block rounded border p-2"><option>USD</option><option>CAD</option><option>GBP</option><option>EUR</option><option>AUD</option></select></label>
      <label className="block">Terms or Delivery Instructions<textarea name="notes" maxLength={1000} className="block w-full rounded border p-2" /></label>
      <button className="brand-cta px-4 py-2">Preview Purchase Order</button>
    </form>
    {order && format && <>
      <article id="public-po-print" className="space-y-3 rounded border bg-white p-5 text-black">
        <h3 className="text-2xl font-bold">Purchase Order {order.number}</h3>
        <p>{order.date} · {order.currency}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h4 className="font-semibold">Buyer</h4><p className="whitespace-pre-wrap break-words">{order.buyer}</p></div>
          <div><h4 className="font-semibold">Supplier</h4><p className="whitespace-pre-wrap break-words">{order.supplier}</p></div>
        </div>
        <table className="w-full text-sm">
          <thead><tr><th scope="col" className="text-left">Item</th><th scope="col">Qty</th><th scope="col">Unit Price</th><th scope="col" className="text-right">Amount</th></tr></thead>
          <tbody>{order.lines.map((line, index) => <tr key={index} className="border-t">
            <td className="break-words py-1">{line.description}</td><td className="text-center">{line.quantity}</td><td className="text-center">{format.format(line.cost)}</td><td className="text-right">{format.format(line.quantity * line.cost)}</td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t font-semibold"><th scope="row" colSpan={3} className="text-right">Subtotal</th><td className="text-right">{format.format(order.lines.reduce((sum, line) => sum + line.quantity * Math.round(line.cost * 100), 0) / 100)}</td></tr></tfoot>
        </table>
        {order.notes && <p className="whitespace-pre-wrap break-words">{order.notes}</p>}
      </article>
      <button type="button" className="brand-cta px-4 py-2" onClick={() => window.print()}>Print or Save as PDF</button>
    </>}
  </section>;
}
