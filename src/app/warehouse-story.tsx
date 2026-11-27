'use client';

import { useState } from 'react';
import { Barcode, MapPin, PackageCheck, Truck } from 'lucide-react';

const stages = [
  { label: 'Receive', Icon: PackageCheck, title: 'Start at the receiving dock', detail: 'Check the delivery against its purchase order. Record the quantity and lot, then print a label for the received stock.', status: 'Received', location: 'Receiving dock', count: '24 received' },
  { label: 'Store', Icon: MapPin, title: 'Give the stock a place to go', detail: 'Put the cases away and record the destination bin. The next person can find that lot from the bin view or a barcode lookup.', status: 'Put away', location: 'Bin A-03-02', count: '24 in bin' },
  { label: 'Pick', Icon: Barcode, title: 'Find the right lot for the order', detail: 'Use the bin and lot details to find what the order needs. Confirm the pick so the shipping team knows what’s ready.', status: 'Picked', location: 'Packing station', count: '8 picked' },
  { label: 'Ship', Icon: Truck, title: 'Ship it and keep the history', detail: 'Verify the carton contents and post the shipment. The movement history shows what went out and the bin still shows what’s left.', status: 'Shipped', location: 'Outbound dock', count: '16 left in stock' },
] as const;

export function WarehouseStory() {
  const [step, setStep] = useState(0);
  const stage = stages[step];
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-brand-lilac/40 bg-brand-white text-brand-deep-plum shadow-2xl shadow-black/20">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-brand-border-gray px-4 py-3 sm:px-6">
      <h2 className="font-semibold">Follow a SKU through Invexiqs</h2>
      <span className="text-xs font-medium text-brand-muted-gray">Example workflow</span>
    </div>
    <div className="grid grid-cols-4 gap-1 border-b border-brand-border-gray bg-brand-lavender p-2 sm:gap-2" role="group" aria-label="Warehouse workflow stages">
      {stages.map(({ label, Icon }, index) => <button key={label} type="button" aria-pressed={step === index} onClick={() => setStep(index)}
        className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold text-brand-deep-plum hover:bg-brand-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-royal-plum aria-pressed:bg-brand-royal-plum aria-pressed:text-white sm:gap-2 sm:text-sm">
        <Icon aria-hidden size={16} className="hidden shrink-0 min-[400px]:block" />{label}
      </button>)}
    </div>
    <div aria-live="polite" className="space-y-5 p-4 sm:p-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{stage.title}</h3>
        <p className="mt-2 min-h-[4.5em] text-sm leading-relaxed text-brand-muted-gray">{stage.detail}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-brand-border-gray">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-warm-cream px-3 py-2">
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><Barcode aria-hidden size={18} /> CTN-240</p>
          <p className="text-xs font-semibold text-brand-coral-text">{stage.status}</p>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-brand-border-gray text-sm">
          <div className="min-w-0 p-3"><dt className="text-xs text-brand-muted-gray">Where</dt><dd className="mt-1 font-semibold">{stage.location}</dd></div>
          <div className="min-w-0 p-3"><dt className="text-xs text-brand-muted-gray">Quantity</dt><dd className="mt-1 font-semibold">{stage.count}</dd></div>
        </dl>
      </div>
    </div>
  </div>;
}
