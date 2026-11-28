import { availableConnectors } from '@/lib/public-integration-directory';
import { FeatureComparison } from './plans/feature-comparison';
import { PublicFooter } from '@/components/layout/public-footer';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductTour } from './product-tour';
import { ArrowRight, Barcode, Boxes, ClipboardCheck, FileSpreadsheet, MapPin, PackageCheck, Play, Sparkles, Truck, Warehouse } from 'lucide-react';
import { BRAND_TAGLINE, PRODUCT_NAME } from '@/lib/brand';
import { publicSiteOrigin } from '@/lib/public-site';
import { WarehouseAiPreview } from './warehouse-ai-preview';
import { WarehouseStory } from './warehouse-story';
import { InquiryForm } from './inquiry-form';
import { PublicHeader } from '@/components/layout/public-header';

export const metadata: Metadata = {
  title: 'Invexiqs WMS | Warehouse management for growing distributors',
  description: 'Set stock targets by bin and across your workspace, choose FIFO, FEFO, or LIFO picking, and fulfill orders with Invexiqs WMS. Try the demo or explore free warehouse tools.',
  alternates: { canonical: '/' },
};

const workflows = [
  { icon: Boxes, title: 'Inventory management', description: 'Track SKUs, lots, and stock movements in one place.' },
  { icon: MapPin, title: 'Bin-level visibility', description: 'Find inventory by warehouse location and bin.' },
  { icon: PackageCheck, title: 'Receiving and putaway', description: 'Record inbound stock and direct it to warehouse bins.' },
  { icon: ClipboardCheck, title: 'Cycle counts', description: 'Record physical counts and review inventory differences.' },
  { icon: Truck, title: 'Picking and shipping', description: 'Move orders from the pick list to the shipping desk.' },
  { icon: Barcode, title: 'Mobile barcode workflows', description: 'Use a mobile device for barcode lookups and warehouse tasks.' },
];

const setupSteps = [
  { icon: Warehouse, title: 'Set up a warehouse', detail: 'Name your workspace and choose a time zone. Invexiqs creates a receiving area and starter bin you can edit.' },
  { icon: FileSpreadsheet, title: 'Add products and balances', detail: 'Add a SKU or review a CSV import. Bring in opening quantities by SKU, bin, and lot, or start with an empty warehouse.' },
  { icon: PackageCheck, title: 'Receive and find your first item', detail: 'Record a receipt into a bin, print the lot label, and check that the quantity appears in Bin Management.' },
];

const primary = 'brand-cta px-5 py-3';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-brand-control-border bg-brand-white px-5 py-3 font-semibold text-brand-deep-plum hover:bg-brand-lavender';

export default function HomePage() {
  return (
    <div className="bg-brand-white text-brand-charcoal [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-brand-white focus:p-3">Skip to content</a>
      <PublicHeader />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: PRODUCT_NAME,
        slogan: BRAND_TAGLINE,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web browser',
        url: publicSiteOrigin,
      }).replace(/</g, '\\u003c') }} />
      <p className="border-b border-brand-border-gray bg-brand-warm-cream px-5 py-2 text-center text-sm font-semibold text-brand-coral-text">
        Invexiqs launches <time dateTime="2027-06">June 2027</time>
      </p>
      <main id="main">
        <section className="border-b border-brand-border-gray bg-brand-deep-plum text-white [&_a:focus-visible]:outline-white">
          <div className="mx-auto grid max-w-7xl items-center gap-7 px-5 py-9 sm:py-14 lg:grid-cols-[.95fr_1.05fr] lg:gap-12 lg:px-8 lg:py-20">
            <div className="space-y-5">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-brand-lilac">
                <span aria-hidden className="h-px w-6 bg-brand-coral" />{BRAND_TAGLINE}
              </p>
              <h1 className="max-w-xl text-balance text-[clamp(2.2rem,5.25vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.055em]">Know what’s in stock <span className="text-brand-lilac">and where to find it.</span></h1>
              <p className="max-w-lg text-base leading-relaxed text-brand-lavender sm:text-lg">From the receiving dock to the last carton out, Invexiqs keeps your team on the same record of what arrived, where it went, and what’s ready to ship.</p>
              <div className="grid gap-3 min-[450px]:flex min-[450px]:flex-wrap">
                <Link href="/auth/signup" className={primary}>Create a prelaunch account <ArrowRight aria-hidden size={18} /></Link>
                <Link href="/demo/workspace" className={secondary}><Play aria-hidden size={16} /> Try the warehouse demo</Link>
              </div>
              <p className="text-sm text-brand-lavender">Try the demo without signing in, or <Link className="font-semibold text-white underline underline-offset-4" href="#contact">request a guided pilot</Link>.</p>
            </div>
            <WarehouseStory />
          </div>
        </section>


        <section id="features" className="mx-auto max-w-7xl border-t border-brand-border-gray px-5 py-14 lg:px-8 lg:py-16">
          <h2 className="text-3xl font-bold tracking-tight text-brand-royal-plum">Run the warehouse from receiving to shipping</h2>
          <p className="mt-3 max-w-2xl text-brand-muted-gray">See what arrived, where it was put away, and what still needs to ship.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-xl border border-brand-border-gray p-5">
                <Icon aria-hidden className="text-brand-royal-plum" />
                <h3 className="mt-3 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-brand-muted-gray">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="stock-controls" aria-labelledby="stock-controls-title" className="border-y border-brand-border-gray bg-brand-lavender">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-8 lg:py-16">
            <div>
              <h2 id="stock-controls-title" className="text-balance text-3xl font-bold tracking-tight text-brand-deep-plum sm:text-4xl">Know What to Restock and Which Lot to Pick</h2>
              <p className="mt-4 max-w-lg leading-relaxed text-brand-muted-gray">Set minimums and maximums for individual bins and total product stock. Give your team a clear replenishment target and choose how each product moves through outbound picking.</p>
              <Link href="/academy#stock-rotation" className="mt-5 inline-flex items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4">
                See How Stock Rotation Works <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
            <div className="rounded-xl border border-brand-border-gray bg-brand-white p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-brand-deep-plum">Choose a Picking Policy Per Product</h3>
              <dl className="mt-3 divide-y divide-brand-border-gray">
                {[
                  ['FIFO', 'Pick the oldest receipts first.'],
                  ['FEFO', 'Pick the lots with the earliest expiry first.'],
                  ['LIFO', 'Pick the newest receipts first.'],
                ].map(([policy, detail]) => (
                  <div key={policy} className="grid grid-cols-[4rem_1fr] gap-3 py-3">
                    <dt className="font-bold text-brand-royal-plum">{policy}</dt>
                    <dd className="text-brand-muted-gray">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="warehouse-ai" className="border-t border-brand-border-gray bg-brand-warm-cream">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-2 lg:px-8 lg:py-16">
            <div>
              <Sparkles aria-hidden className="mb-4 text-brand-royal-plum" />
              <h2 className="text-3xl font-bold tracking-tight text-brand-deep-plum">Ask your warehouse AI assistant</h2>
              <p className="mt-3 max-w-md leading-relaxed text-brand-muted-gray">Ask why an order is stuck, where to find stock, or what your shift should handle first. The read-only assistant uses warehouse records to surface quantities, bins, and the next thing to check.</p>
            </div>
            <WarehouseAiPreview />
          </div>
        </section>

        <section aria-label="Workspace branding and free tools" className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-2 lg:px-8">
          <article className="rounded-xl border border-brand-border-gray p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-brand-deep-plum">Make the Workspace Yours</h2>
            <p className="mt-2 text-brand-muted-gray">Add your company logo to the workspace, mobile scanner, and POS. Each displays your logo with “Powered by Invexiqs.”</p>
          </article>
          <article className="rounded-xl border border-brand-border-gray p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-brand-deep-plum">Try the Free Warehouse Tools</h2>
            <p className="mt-2 text-brand-muted-gray">Generate a SKU, a barcode label, or a printable purchase order without creating an account.</p>
            <Link href="/tools" className="mt-4 inline-flex items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4">
              Open Free Warehouse Tools <ArrowRight aria-hidden size={16} />
            </Link>
          </article>
        </section>

        <section id="integrations" className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
          <h2 className="text-3xl font-bold tracking-tight text-brand-deep-plum">Connect your systems at launch</h2>
          <p className="mt-3 max-w-2xl text-brand-muted-gray">Connect provider accounts for ecommerce, shipping, accounting, and workflow automation.</p>
          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableConnectors.map(([name, detail]) => (
              <li key={name} className="rounded-xl border border-brand-border-gray p-5">
                <h3 className="text-lg font-semibold text-brand-deep-plum">{name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-brand-muted-gray">{detail}</p>
              </li>
            ))}
          </ul>
          <Link href="/integrations-directory" className="mt-6 inline-block font-semibold text-brand-royal-plum underline">View the Integration Directory</Link>
          <Link href="/suite" className="mt-4 block w-fit font-semibold text-brand-royal-plum underline">Explore the Invexiqs Product Suite</Link>
          <p className="mt-3 text-sm text-brand-muted-gray">Setting up inventory today? Use CSV files from Excel or Google Sheets to import products and opening balances.</p>
        </section>

        <section aria-labelledby="product-tour" className="border-y border-brand-border-gray bg-brand-lavender">
          <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="product-tour" className="text-3xl font-bold tracking-tight text-brand-deep-plum sm:text-4xl">Explore the Invexiqs Workspace</h2>
                <p className="mt-2 text-brand-muted-gray">See how orders, inventory, receiving, and picking look in Invexiqs. These screens show a sample warehouse.</p>
              </div>
              <Link className="inline-flex items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4" href="/demo/workspace">
                Try the warehouse demo <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
            <ProductTour />
          </div>
        </section>

        <section id="setup" className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[.68fr_1.32fr] lg:gap-12 lg:px-8 lg:py-20">
          <div>
            <h2 className="max-w-md text-3xl font-bold tracking-tight text-brand-deep-plum sm:text-4xl">From signup to your first receipt</h2>
            <p className="mt-3 max-w-sm leading-relaxed text-brand-muted-gray">Start with one warehouse. A dashboard checklist helps you pick up where you left off.</p>
            <Link href="/auth/signup" className="mt-5 inline-flex items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4">Register for launch <ArrowRight aria-hidden size={16} /></Link>
          </div>
          <ol className="divide-y divide-brand-border-gray overflow-hidden rounded-2xl border border-brand-border-gray">
            {setupSteps.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex gap-4 p-4 sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-lavender text-brand-royal-plum"><Icon size={20} aria-hidden /></span>
                <div><h3 className="font-semibold text-brand-deep-plum">{title}</h3><p className="mt-1 text-sm leading-relaxed text-brand-muted-gray">{detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
        <section id="solutions" aria-labelledby="industries-title" className="bg-brand-deep-plum text-white">
          <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
            <h2 id="industries-title" className="text-3xl font-bold tracking-tight text-brand-white">Industries Invexiqs fits</h2>
            <p className="mt-3 max-w-2xl text-brand-lavender">For teams managing physical stock across shelves, bins, and shipping stations.</p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Wholesale distribution', 'Receive supplier orders, track open quantities, and fulfill orders across customer accounts.'],
                ['Packaging and shipping supplies', 'Keep similar SKUs straight and find cartons, labels, and consumables by bin.'],
                ['Industrial and maintenance supplies', 'Locate spare parts, check reorder levels, and investigate stock discrepancies.'],
                ['Ecommerce fulfillment', 'Pick, pack, and track shipments from one order desk. Connect online stores at launch.'],
                ['Retail stockrooms', 'Count stock, look up barcodes, and track movements between storage locations.'],
                ['Manufacturing inventory teams', 'Track materials and finished goods, and assemble stock kits from components.'],
              ].map(([name, detail]) => (
                <li key={name} className="rounded-xl border border-brand-lilac/40 px-4 py-4">
                  <h3 className="font-semibold text-brand-white">{name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-brand-lavender">{detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-7xl space-y-5 px-5 py-16 lg:px-8">
          <h2 id="pricing-title" className="text-3xl font-bold tracking-tight text-brand-royal-plum">Compare pricing and features</h2>
          <p className="text-brand-muted-gray">Proposed launch pricing in USD per organization. Compare what’s included in Starter, Growth, and Scale.</p>
          <FeatureComparison />
        </section>

        <section id="contact" className="border-y border-brand-border-gray bg-brand-lavender">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-brand-royal-plum">Request a walkthrough or pilot</h2>
              <p className="mt-4 max-w-md text-brand-muted-gray">Tell us what you stock, how your team works today, and what you want to improve. We’ll use that context to discuss whether Invexiqs fits your operation.</p>
              <p className="mt-5 text-sm">Already using Invexiqs? <Link className="font-medium text-brand-royal-plum underline" href="/support">Visit support</Link>.</p>
            </div>
            <InquiryForm />
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-brand-royal-plum">Common questions</h2>
          <dl className="mt-7 grid gap-6 md:grid-cols-2">
            <div><dt className="font-semibold">Can I look around before contacting you?</dt><dd className="mt-2 text-brand-muted-gray">Yes. Open the live demo for the interactive order desk and role walkthroughs with sample data.</dd></div>
            <div><dt className="font-semibold">Can I bring over my existing inventory?</dt><dd className="mt-2 text-brand-muted-gray">Yes. Import products by CSV, then add opening balances for active bins. You can preview rows before they are saved.</dd></div>
            <div><dt className="font-semibold">Can I set up an account on my own?</dt><dd className="mt-2 text-brand-muted-gray">Yes. Register now and sign in before launch. Self-serve warehouse setup opens at launch. If your team wants an early walkthrough, request a guided pilot.</dd></div>
          </dl>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
