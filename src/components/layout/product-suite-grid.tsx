import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { InvexiqsProductLogo } from '@/components/ui/invexiqs-product-logo';
import { suiteProducts } from '@/lib/product-suite';
import { cn } from '@/lib/utils';

export function ProductSuiteGrid({ className, headingLevel = 'h3' }: {
  className?: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
    {suiteProducts.map(product => (
      <article key={product.slug} className="flex min-w-0 flex-col gap-4 rounded-xl border border-brand-border-gray bg-brand-white p-5">
        <Heading className="text-xl"><InvexiqsProductLogo product={product.slug} /></Heading>
        <p className="flex-1 leading-relaxed text-brand-muted-gray">{product.description}</p>
        <Link href={`/suite/${product.slug}`} className="inline-flex w-fit items-center gap-2 font-semibold text-brand-royal-plum underline underline-offset-4">
          Explore {product.name} <ArrowRight aria-hidden size={15} />
        </Link>
      </article>
    ))}
  </div>;
}
