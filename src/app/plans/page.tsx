import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { FeatureComparison } from './feature-comparison';

export const metadata = { title: 'Warehouse pricing and features | Invexiqs', description: 'Compare Invexiqs WMS tiers, included features, and monthly or annual launch pricing.' };

export default function PlansPage() {
  return <><PublicHeader /><main className="mx-auto max-w-6xl space-y-8 px-5 py-12">
    <div className="space-y-3">
      <h1 className="text-4xl font-bold text-brand-deep-plum">Compare pricing and features</h1>
      <p>Proposed launch pricing in USD per organization. Compare features and capacity across Starter, Growth, and Scale.</p>
    </div>
    <FeatureComparison />
    <p>See the <Link className="font-semibold underline" href="/integrations-directory">launch integration directory</Link> for connector details. <Link className="font-semibold underline" href="/#contact">Request a pilot</Link> if you’d like to discuss your warehouse setup.</p>
    <section className="space-y-4 rounded-xl bg-brand-warm-cream p-5">
      <h2 className="text-xl font-semibold">Opening in June 2027</h2>
      <p>Prelaunch registration is free. We’ll announce the exact launch date closer to June.</p>
      <Link className="brand-cta px-4 py-2" href="/auth/signup">Create a prelaunch account</Link>
    </section>
  </main><PublicFooter /></>;
}
