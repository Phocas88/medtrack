'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { SuiteProductId } from '@/lib/product-suite';
import { postJson } from './workspace-controls';

export function AddOnCheckout({ product }: { product?: SuiteProductId }) {
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const session = await postJson<{ url: string }>(product ? '/api/stripe/add-on' : '/api/stripe/portal', product ? { product } : {});
      window.location.assign(session.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Billing is unavailable.');
      setBusy(false);
    }
  }}>{busy ? 'Opening Stripe…' : product ? 'See Price and Subscribe' : 'Manage Subscription'}</Button>;
}
