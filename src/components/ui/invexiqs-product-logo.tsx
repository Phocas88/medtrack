import Image from 'next/image';
import { BRAND_ICON_PATH, BRAND_NAME } from '@/lib/brand';
import { getSuiteProduct, type SuiteProductId } from '@/lib/product-suite';
import { cn } from '@/lib/utils';

export function InvexiqsProductLogo({ product, className }: { product: SuiteProductId; className?: string }) {
  const item = getSuiteProduct(product);
  if (!item) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-brand-deep-plum', className)}>
      <Image src={BRAND_ICON_PATH} alt="" width={34} height={34} className="size-8 shrink-0 object-contain" unoptimized />
      <span className="leading-tight tracking-tight">
        <span className="font-bold">{BRAND_NAME}</span>{' '}
        <span className="font-medium">{item.name}</span>
      </span>
    </span>
  );
}
