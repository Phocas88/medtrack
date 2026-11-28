import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { ProductSuiteGrid } from '@/components/layout/product-suite-grid';

export const metadata = { title: 'Invexiqs Product Suite', description: 'Explore Purchasing, Analytics, Commerce, POS, Shipping, and Manufacturing workflows powered by Invexiqs WMS.' };

export default function SuitePage() {
  return <><PublicHeader currentPath="/suite" /><main>
    <section className="bg-brand-lavender px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-brand-deep-plum sm:text-5xl">Invexiqs Product Suite</h1>
        <p className="max-w-2xl text-lg text-brand-muted-gray">See what’s included in Invexiqs WMS and which features are still in development for each paid add-on.</p>
      </div>
    </section>
    <section aria-label="Products" className="mx-auto max-w-6xl px-5 py-10">
      <ProductSuiteGrid headingLevel="h2" />
    </section>
  </main><PublicFooter /></>;
}
