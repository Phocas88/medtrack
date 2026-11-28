'use client';

import Image from 'next/image';
import { Maximize2, X } from 'lucide-react';
import { useRef, useState } from 'react';

const views = [
  { id: 'order-desk', title: 'Order Desk', detail: 'Check which orders are ready to pick, then open an order to review its items and remaining quantities.', alt: 'Order Desk with status filters, a list of sample orders, and the selected order’s details.' },
  { id: 'products', title: 'Product Catalog', detail: 'Find a SKU and check how much stock is on hand, what it costs, and when the next lot expires.', alt: 'Product catalog showing sample SKUs, categories, on-hand quantities, and expiration dates.' },
  { id: 'bins', title: 'Bin Management', detail: 'See your warehouse’s bins and which pick faces need attention.', alt: 'Bin Management showing bin addresses, warehouse and zone names, and replenishment summary counts.' },
  { id: 'receiving', title: 'Receiving', detail: 'Receive a lot into a bin and see how many stock units an inbound case adds.', alt: 'Receive Inventory form showing a sample valve receipt, case conversion, and receiving bin.' },
  { id: 'shipping', title: 'Shipping', detail: 'Prepare a shipment and review the suggested lot and quantity before posting it.', alt: 'Shipping screen with a Pick Suggestions dialog displaying a sample product, lot, and quantity.' },
  { id: 'scanner', title: 'Mobile Scanner', detail: 'Operators can open assigned picks, putaway, replenishment, and cycle counts from their phones.', alt: 'Mobile scanner showing the task menu and counts for assigned warehouse work.' },
] as const;

export function ProductTour() {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const view = views[index];
  const mobile = view.id === 'scanner';
  const src = `/product/tour-${view.id}.webp`;
  const dimensions = mobile ? { width: 585, height: 1080 } : { width: 2040, height: 1050 };

  return (
    <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
      <div role="group" aria-label="Choose a product screen" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {views.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={itemIndex === index}
            aria-controls="product-tour-view"
            onClick={() => setIndex(itemIndex)}
            className="min-h-11 rounded-lg border border-brand-border-gray bg-white px-3 py-2 text-left text-sm font-semibold text-brand-deep-plum hover:border-brand-royal-plum focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-royal-plum aria-pressed:border-brand-royal-plum aria-pressed:bg-brand-royal-plum aria-pressed:text-white sm:px-4"
          >
            {item.title}
          </button>
        ))}
      </div>

      <figure id="product-tour-view" className="min-w-0 overflow-hidden rounded-xl border border-brand-border-gray bg-white shadow-sm">
        <div className="flex justify-center bg-brand-lavender">
          <button
            type="button"
            aria-label={`Enlarge ${view.title} screenshot`}
            onClick={() => dialog.current?.showModal()}
            className={`group relative block focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-royal-plum ${mobile ? 'w-full max-w-[16rem]' : 'w-full'}`}
          >
            <Image src={src} alt={view.alt} {...dimensions} sizes={mobile ? '256px' : '(max-width: 1023px) 95vw, 1024px'} className="block h-auto w-full" />
            <span aria-hidden className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border border-brand-border-gray bg-white px-3 py-2 text-xs font-semibold text-brand-deep-plum shadow-sm group-hover:bg-brand-warm-cream">
              <Maximize2 size={14} /> Enlarge
            </span>
          </button>
        </div>
        <figcaption aria-live="polite" className="border-t border-brand-border-gray px-4 py-3 sm:px-5">
          <h3 className="font-semibold text-brand-deep-plum">{view.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-brand-muted-gray">{view.detail}</p>
        </figcaption>
      </figure>

      <dialog ref={dialog} aria-labelledby="product-screenshot-title" className="m-auto max-h-[92dvh] w-[94vw] max-w-[90rem] overflow-auto rounded-xl bg-white p-0 text-brand-deep-plum shadow-xl backdrop:bg-brand-deep-plum/75">
        <form method="dialog" className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-brand-border-gray bg-white px-4 py-2">
          <h3 id="product-screenshot-title" className="font-semibold">{view.title}</h3>
          <button aria-label="Close screenshot" className="grid size-11 place-items-center rounded-lg hover:bg-brand-lavender"><X aria-hidden size={20} /></button>
        </form>
        <div className="overflow-auto">
          <Image src={src} alt={view.alt} {...dimensions} sizes={mobile ? '390px' : '(max-width: 767px) 960px, 1440px'} className={`mx-auto block h-auto ${mobile ? 'w-full max-w-[390px]' : 'w-full min-w-[960px]'}`} />
        </div>
      </dialog>
    </div>
  );
}
