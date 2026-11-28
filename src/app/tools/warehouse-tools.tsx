'use client';

import { useState } from 'react';
import { generateBarcodeSVG } from '@/lib/barcode';

export function WarehouseTools() {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState<{ value: string; svg: string }>();
  const [error, setError] = useState('');
  const [point, setPoint] = useState<number>();
  return <div className="grid items-start gap-5 md:grid-cols-2">
    <section id="barcode" className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Barcode and Bin Label Generator</h2>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const value = code.trim();
        setLabel(undefined);
        if (!/^[ -~]{1,32}$/.test(value)) { setError('Enter 1–32 standard letters, numbers, or punctuation characters.'); return; }
        try {
          setLabel({ value, svg: generateBarcodeSVG(value, { width: 1, barsOnly: true }) });
          setError('');
        } catch { setError('Could not generate that barcode.'); }
      }}>
        <label className="block">Bin code or SKU<input className="mt-1 block w-full rounded border p-2" value={code} maxLength={32} required onChange={event => setCode(event.target.value)} placeholder="A-01-03" /></label>
        <button className="brand-cta px-4 py-2">Generate Code 128</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {label && <div className="space-y-3">
        <figure className="rounded border bg-white p-3 text-black">
          <p className="break-all text-center font-semibold">{label.value}</p>
          <div className="flex justify-center [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: label.svg }} />
        </figure>
        <a className="underline" download="invexiqs-barcode.svg" href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(label.svg)}`}>Download barcode for printing</a>
      </div>}
    </section>
    <section id="reorder" className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Reorder Point Calculator</h2>
      <p>Estimate the reorder point from daily demand, supplier lead time, and safety stock.</p>
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const demand = Number(form.get('demand')), lead = Number(form.get('lead')), safety = Number(form.get('safety'));
        setPoint(Math.ceil(demand * lead + safety));
      }}>
        {([['demand','Average daily demand (units)','0.01'],['lead','Supplier lead time (days)','0.01'],['safety','Safety stock (units)','1']] as const).map(([name,label,step]) =>
          <label className="block" key={name}>{label}<input name={name} defaultValue={name === 'safety' ? 0 : undefined} required type="number" min="0" max="1000000" step={step} className="block w-full rounded border p-2" /></label>)}
        <button className="brand-cta px-4 py-2">Calculate reorder point</button>
      </form>
      {point !== undefined && <output className="block font-semibold">Reorder at {point.toLocaleString()} units.</output>}
    </section>
  </div>;
}
