'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { InvexiqsProductLogo } from './invexiqs-product-logo';
import type { SuiteProductId } from '@/lib/product-suite';
import { InvexiqsLogo, InvexiqsNavigationLogo } from './invexiqs-logo';

export function WorkspaceLogo({ navigation = false, product }: { navigation?: boolean; product?: SuiteProductId }) {
  const { tenantName, tenantLogoUrl } = useAuth();
  const [failedLogo, setFailedLogo] = useState<string>();
  if (!tenantLogoUrl || failedLogo === tenantLogoUrl) {
    if (product) return <InvexiqsProductLogo product={product} className="text-sm text-white" />;
    return navigation ? <InvexiqsNavigationLogo /> : <InvexiqsLogo theme="dark" size="sm" />;
  }
  return (
    <span className="inline-flex min-w-0 flex-col items-center rounded bg-white px-2 py-1 text-brand-deep-plum">
      {/* Tenant-supplied image, loaded directly with no referrer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tenantLogoUrl} alt={tenantName ? `${tenantName} logo` : 'Workspace logo'} referrerPolicy="no-referrer"
        onError={() => setFailedLogo(tenantLogoUrl)} className="h-7 max-w-28 object-contain sm:max-w-36" />
      <span className="text-[10px] font-semibold">Powered by Invexiqs</span>
    </span>
  );
}
