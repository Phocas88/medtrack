import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { InvexiqsProductLogo } from '@/components/ui/invexiqs-product-logo';
import { suiteProducts } from '@/lib/product-suite';

export const metadata = { title: 'Invexiqs Product Suite', description: 'Explore Purchasing, Analytics, Commerce, POS, Shipping, and Manufacturing workflows powered by Invexiqs WMS.' };

export default function SuitePage() {
  return <><PublicHeader currentPath="/suite" /><main>
    <section className="bg-brand-lavender px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-brand-deep-plum sm:text-5xl">Invexiqs Product Suite</h1>
        <p className="max-w-2xl text-lg text-brand-muted-gray">Explore the tools your purchasing, warehouse, and sales teams can use with the same stock and order records.</p>
      </div>
    </section>
    <section aria-label="Products" className="mx-auto grid max-w-6xl gap-4 px-5 py-10 sm:grid-cols-2 lg:grid-cols-3">
      {suiteProducts.map(product => <article key={product.slug} className="flex flex-col gap-4 rounded-xl border border-brand-border-gray bg-white p-5">
        <h2 className="text-xl"><InvexiqsProductLogo product={product.slug} /></h2>
        <p className="flex-1 text-brand-muted-gray">{product.description}</p>
        <Link href={`/suite/${product.slug}`} className="inline-flex items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4">
          Explore {product.name} <ArrowRight aria-hidden size={15} />
        </Link>
      </article>)}
    </section>
  </main><PublicFooter /></>;
}
