import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { InvexiqsProductLogo } from '@/components/ui/invexiqs-product-logo';
import { getSuiteProduct, suiteProducts } from '@/lib/product-suite';

type Props = { params: Promise<{ product: string }> };

export function generateStaticParams() {
  return suiteProducts.map(product => ({ product: product.slug }));
}

export async function generateMetadata({ params }: Props) {
  const product = getSuiteProduct((await params).product);
  return product ? { title: `Invexiqs ${product.name}`, description: product.description } : {};
}

export default async function SuiteProductPage({ params }: Props) {
  const product = getSuiteProduct((await params).product);
  if (!product) notFound();
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-8 px-5 py-12">
    <Link href="/suite" className="font-semibold text-brand-royal-plum underline">All Invexiqs Products</Link>
    <section className="space-y-4 rounded-2xl bg-brand-lavender p-6 sm:p-9">
      <h1 className="text-3xl sm:text-4xl"><InvexiqsProductLogo product={product.slug} /></h1>
      <p className="max-w-2xl text-lg text-brand-muted-gray">{product.description}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Link href={product.href} className="brand-cta px-4 py-2">Open Workspace</Link>
        <Link href="/#contact" className="font-semibold text-brand-royal-plum underline">Ask About {product.name}</Link>
      </div>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">WMS Workflows</h2>
        <ul className="list-inside list-disc space-y-2">{product.included.map(feature => <li key={feature}>{feature}</li>)}</ul>
      </section>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">Add-on Roadmap</h2>
        <ul className="list-inside list-disc space-y-2">{product.expansion.map(feature => <li key={feature}>{feature}</li>)}</ul>
      </section>
    </div>
  </main><PublicFooter /></>;
}
