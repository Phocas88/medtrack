import Link from 'next/link';
import { InvexiqsProductLogo } from '@/components/ui/invexiqs-product-logo';
import { PageHeader } from '@/components/ui/page-header';
import { suiteProducts } from '@/lib/product-suite';

export default function SuiteWorkspacePage() {
  return <div className="space-y-5">
    <PageHeader title="Invexiqs Suite" description="Open the operational tools in your workspace." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {suiteProducts.map(product => <section key={product.slug} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg"><InvexiqsProductLogo className="dark:text-foreground" product={product.slug} /></h2>
        <p className="flex-1 text-sm text-muted-foreground">{product.description}</p>
        <Link href={product.href} className="w-fit text-sm font-semibold text-primary underline">Open {product.name}</Link>
      </section>)}
    </div>
  </div>;
}
