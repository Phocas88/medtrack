import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Barcode, Boxes, ClipboardCheck, MapPin, PackageCheck, Truck } from 'lucide-react';
import { BRAND_TAGLINE, PRODUCT_NAME } from '@/lib/brand';
import { publicSiteOrigin } from '@/lib/public-site';
import { InquiryForm } from './inquiry-form';
import { PublicHeader } from '@/components/layout/public-header';

export const metadata: Metadata = {
  title: 'Invexiqs WMS | Warehouse management for growing distributors',
  description: 'Manage inventory, receiving, bin locations, cycle counts, and order fulfillment with Invexiqs WMS.',
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

const primary = 'brand-cta px-5 py-3';
const secondary = 'inline-flex items-center justify-center rounded-lg border border-brand-control-border bg-brand-white px-5 py-3 font-semibold text-brand-deep-plum hover:bg-brand-lavender';

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
        <section className="border-b border-brand-border-gray bg-brand-lavender">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1.12fr_1fr] lg:items-center md:py-20 lg:py-24 lg:px-8">
            <div className="space-y-6">
              <p className="font-semibold text-brand-royal-plum">{BRAND_TAGLINE}</p>
              <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-brand-royal-plum sm:text-5xl lg:text-6xl">Know what’s in stock and where to find it.</h1>
              <p className="max-w-xl text-lg leading-relaxed text-brand-muted-gray">Warehouse management software for growing distributors. Manage inventory, receiving, bin locations, and order fulfillment in one workspace.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/demo" className={primary}>Explore live demo <ArrowRight aria-hidden size={18} /></Link>
                <Link href="#contact" className={secondary}>Request a pilot</Link>
              </div>
            </div>
            <figure className="overflow-hidden rounded-2xl border border-brand-border-gray bg-brand-white shadow-xl shadow-brand-deep-plum/10">
              <Image src="/product/dashboard.webp" width={1280} height={593}
                sizes="(max-width: 1023px) 95vw, 46vw" priority
                alt="Invexiqs dashboard showing inventory totals and shortcuts for warehouse and fulfillment tasks" />
              <figcaption className="border-t border-brand-border-gray px-4 py-3 text-sm text-brand-muted-gray">Warehouse dashboard detail with sample data</figcaption>
            </figure>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-brand-royal-plum">Tools for your daily warehouse work</h2>
          <p className="mt-3 max-w-2xl text-brand-muted-gray">Give managers and floor teams a shared view of inventory, activity, and fulfillment.</p>
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

        <section aria-labelledby="product-tour" className="border-y border-brand-border-gray bg-brand-lavender">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <h2 id="product-tour" className="text-3xl font-bold tracking-tight text-brand-royal-plum">Inside Invexiqs</h2>
            <p className="mt-3 text-brand-muted-gray">Workflow details from a sample warehouse.</p>
            <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1fr_1fr_0.58fr]">
              <figure className="overflow-hidden rounded-xl border border-brand-border-gray bg-brand-white">
                <Image src="/product/inventory.webp" width={1280} height={423} sizes="(max-width: 1023px) 95vw, 36vw"
                  alt="Product catalog showing SKUs, stock on hand, and a low-stock indicator" />
                <figcaption className="border-t border-brand-border-gray p-4 text-sm font-semibold">Product catalog and stock on hand</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border border-brand-border-gray bg-brand-white">
                <Image src="/product/bins.webp" width={1280} height={673} sizes="(max-width: 1023px) 95vw, 36vw"
                  alt="Bin management showing pick bins, reserve bins, and receiving staging" />
                <figcaption className="border-t border-brand-border-gray p-4 text-sm font-semibold">Bin management</figcaption>
              </figure>
              <figure className="max-w-xs overflow-hidden rounded-xl border border-brand-border-gray bg-brand-white">
                <Image src="/product/scanner.webp" width={390} height={523} sizes="(max-width: 1023px) 320px, 22vw"
                  alt="Mobile scanner menu showing pick, putaway, replenishment, and cycle count tasks" />
                <figcaption className="border-t border-brand-border-gray p-4 text-sm font-semibold">Mobile scanner</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="solutions" className="bg-brand-deep-plum text-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-2 lg:px-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-brand-white">Built around the way a warehouse works</h2>
              <p className="mt-4 max-w-xl text-brand-lavender">Invexiqs draws on firsthand warehouse and inventory management experience, from checking inbound stock and counting bins to reporting inventory discrepancies.</p>
            </div>
            <ul className="grid content-start gap-3 text-brand-lavender">
              <li className="rounded-lg border border-brand-lilac/50 p-4">Independent distributors and wholesalers</li>
              <li className="rounded-lg border border-brand-lilac/50 p-4">Industrial and maintenance supply distributors</li>
              <li className="rounded-lg border border-brand-lilac/50 p-4">Retail stockrooms and manufacturing inventory teams</li>
            </ul>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-brand-royal-plum">Planned pricing</h2>
          <p className="mt-3 text-brand-muted-gray">Rates will be announced closer to launch. Request a pilot to discuss your warehouse locations and order volume.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ['Per warehouse', 'A monthly subscription based on the number of warehouse locations.'],
              ['Order-volume tiers', 'Choose a tier based on the number of orders you fulfill each month.'],
              ['Team seats included', 'Give managers, floor staff, and seasonal workers their own logins.'],
            ].map(([title, detail]) => (
              <article key={title} className="space-y-3 rounded-xl border border-brand-border-gray p-6">
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="text-brand-muted-gray">{detail}</p>
              </article>
            ))}
          </div>
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
            <div><dt className="font-semibold">Can I evaluate my own workflow?</dt><dd className="mt-2 text-brand-muted-gray">Request a walkthrough or pilot and tell us which receiving, inventory, or fulfillment process you want to evaluate.</dd></div>
          </dl>
        </section>
      </main>

      <footer className="border-t border-brand-border-gray bg-brand-lavender">
        <nav aria-label="Footer navigation" className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-3 px-5 py-8 text-sm text-brand-muted-gray lg:px-8">
          {[
            ['Contact', '/#contact'],
            ['Features', '/#features'],
            ['Live demo', '/demo'],
            ['Pricing', '/#pricing'],
            ['Privacy Policy', '/legal/privacy'],
            ['Solutions', '/#solutions'],
            ['Support', '/support'],
            ['Terms of Service', '/legal/terms'],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="hover:underline">{label}</Link>
          ))}
        </nav>
        <p className="mx-auto max-w-7xl px-5 pb-8 text-sm text-brand-muted-gray lg:px-8">© {new Date().getFullYear()} {PRODUCT_NAME}.</p>
      </footer>
    </div>
  );
}
