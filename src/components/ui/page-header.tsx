import type { SuiteProductId } from '@/lib/product-suite';
import { InvexiqsProductLogo } from './invexiqs-product-logo';

interface PageHeaderProps {
  title: string;
  product?: SuiteProductId;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions, product }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        {product && <InvexiqsProductLogo product={product} className="mb-2 text-sm dark:text-foreground" />}
        <h1 className="text-xl font-semibold tracking-tight text-heading break-words">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
