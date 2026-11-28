import Link from 'next/link';
import { AddOnCheckout } from '@/components/suite/add-on-checkout';
import { InvexiqsProductLogo } from '@/components/ui/invexiqs-product-logo';
import { PageHeader } from '@/components/ui/page-header';
import { addOnPriceId } from '@/lib/billing';
import { suiteProducts } from '@/lib/product-suite';
import { createClient } from '@/lib/supabase/server';

type Subscription = { product: string; status: string; enabled: boolean };

export default async function SuiteWorkspacePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const db = await createClient();
  const [subscriptions, role, params] = await Promise.all([
    db.rpc('list_suite_subscriptions'), db.rpc('get_user_role'), searchParams,
  ]);
  const status = new Map((subscriptions.data as Subscription[] | null)?.map(item => [item.product, item]));
  const admin = role.data === 'admin';
  return <div className="space-y-5">
    <PageHeader title="Invexiqs Suite" description="Open your warehouse workflows and optional add-ons." />
    {params.checkout === 'success' && <p className="rounded-lg border bg-card p-4 text-sm" role="status">
      Stripe is confirming your subscription. Refresh this page in a moment to check access.
    </p>}
    {subscriptions.error && <p className="text-sm text-destructive" role="alert">Add-on status is temporarily unavailable.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {suiteProducts.map(product => {
        const subscription = status.get(product.slug);
        const canSubscribe = !subscription || ['checkout', 'cancelled', 'canceled', 'incomplete_expired'].includes(subscription.status);
        return <section key={product.slug} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <h2 className="text-lg"><InvexiqsProductLogo className="dark:text-foreground" product={product.slug} /></h2>
          <p className="text-sm text-muted-foreground">{product.description}</p>
          <ul className="flex-1 list-inside list-disc space-y-1 text-sm">{product.expansion.map(feature => <li key={feature}>{feature}</li>)}</ul>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {subscription?.enabled && <Link className="font-semibold text-primary underline" href={`/suite-workspace/${product.slug}`}>Open {product.name} Add-on</Link>}
            <Link href={product.href} className="text-sm font-medium text-primary underline">Open WMS Workflow</Link>
            {admin && !subscriptions.error && canSubscribe && addOnPriceId(product.slug) && <AddOnCheckout product={product.slug} />}
            {admin && subscription && !canSubscribe && <AddOnCheckout />}
          </div>
          {!subscription?.enabled && !subscriptions.error && <p className="text-xs text-muted-foreground">
            {canSubscribe && !addOnPriceId(product.slug) ? 'Add-on pricing will be posted at launch.' : 'An active add-on subscription unlocks this workspace.'}
          </p>}
        </section>;
      })}
    </div>
  </div>;
}
